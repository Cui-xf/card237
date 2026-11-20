import type { Card, StandardSuit } from '../../../../shared/cards';
import { cardLabel, findCard, SUIT_SYMBOL } from '../../../../shared/cards';
import { RULE_META } from '../../../../shared/rules';
import {
  SHUAIZ3_DECLARE_TIMEOUT_MS,
  SHUAIZ3_RETURN_TIMEOUT_MS,
} from '../../../../shared/rules/shuaiz3';
import type { GameAction } from '../../../../shared/rules/types';
import type { RuleRuntime } from '../types';
import { botAction as decideBotAction } from './bot';
import { BOTTOM_COUNT, createGame, redeal, revealedForSeat, revealedTotal, SEAT_COUNT } from './deal';
import { addLog } from './log';
import { isPointCard } from './rank';
import { computeTeams, pickAutoReturnCards } from './score';
import type { Shuaiz3State } from './state';
import { followTrick, leadTrick } from './trick';
import { buildView } from './view';

function cloneState(state: Shuaiz3State): Shuaiz3State {
  return structuredClone(state);
}

/** 独立的判定函数，避免 TS 在 case 分支里把 `next.phase` 收窄成不包含 finished。 */
function isFinishedState(state: Shuaiz3State): boolean {
  return state.phase === 'finished';
}

function selectedCards(
  state: Shuaiz3State,
  seat: number,
  cardIds: unknown,
): Card[] | string {
  if (!Array.isArray(cardIds) || cardIds.some((id) => typeof id !== 'string')) {
    return '出牌数据无效';
  }
  if (cardIds.length === 0) return '请先选择要出的牌';
  if (new Set(cardIds).size !== cardIds.length) return '不能重复选择同一张牌';

  const hand = state.hands[seat];
  const cards: Card[] = [];
  for (const id of cardIds as string[]) {
    const card = findCard(hand, id);
    if (!card) return '所选卡牌不在你的手牌中';
    cards.push(card);
  }
  return cards;
}

/** 是否还有「持 3 且未放弃」的玩家；这里的 3 指完整手牌里的 3。 */
function hasUndeclinedHolder(state: Shuaiz3State): boolean {
  return state.hands.some(
    (hand, seat) => !state.declined[seat] && hand.some((card) => card.rank === '3'),
  );
}

function pickRandomTrump(
  state: Shuaiz3State,
  random: () => number,
): { seat: number; card: Card } | null {
  const candidates: { seat: number; cards: Card[] }[] = [];

  for (let seat = 0; seat < SEAT_COUNT; seat += 1) {
    if (state.declined[seat]) continue;
    const threes = state.hands[seat].filter((card) => card.rank === '3');
    if (threes.length > 0) candidates.push({ seat, cards: threes });
  }
  if (candidates.length === 0) return null;

  const chosenSeat = candidates[Math.floor(random() * candidates.length) % candidates.length];
  const card = chosenSeat.cards[Math.floor(random() * chosenSeat.cards.length) % chosenSeat.cards.length];
  return { seat: chosenSeat.seat, card };
}

/** 庄家拿底牌（12 → 18），进入还底阶段。 */
function beginReturning(state: Shuaiz3State, now: number): void {
  if (state.dealerSeat === null) return;

  const dealer = state.dealerSeat;
  state.phase = 'returning';
  state.declareDeadline = null;
  state.hands[dealer] = [...state.hands[dealer], ...state.bottomCards];
  state.dealerOriginalHand = [...state.hands[dealer]];
  state.returnDeadline = now + SHUAIZ3_RETURN_TIMEOUT_MS;

  addLog(state, 'trump', `${state.names[dealer]} 成为庄家，拿到底牌，等待还底`, now, dealer);
}

function declareTrump(
  state: Shuaiz3State,
  seat: number,
  card: Card,
  now: number,
  automatic = false,
): void {
  const suit = card.suit as StandardSuit;
  state.dealerSeat = seat;
  state.trumpSuit = suit;
  state.declaredCardId = card.id;

  const prefix = automatic ? '20 秒内无人甩 3，系统随机为' : '';
  addLog(
    state,
    'trump',
    `${prefix}${state.names[seat]} 甩出 ${cardLabel(card)}，主牌花色为 ${SUIT_SYMBOL[suit]}`,
    now,
    seat,
  );

  if (state.phase === 'declaring') beginReturning(state, now);
}

/** 还底完成：手牌 18 → 12，计算阵营，进入出牌阶段。 */
function completeReturn(state: Shuaiz3State, cards: Card[], now: number): void {
  const dealer = state.dealerSeat;
  if (dealer === null) return;

  const ids = new Set(cards.map((card) => card.id));
  state.hands[dealer] = state.hands[dealer].filter((card) => !ids.has(card.id));
  state.returnedCards = cards;
  state.returnDeadline = null;
  state.teams = computeTeams(state);
  state.phase = 'playing';
  state.currentSeat = dealer;
  state.trick = null;
  state.turnStartedAt = now;

  addLog(state, 'trick', `庄家已还底，牌局开始`, now, dealer);
}

function error(message: string): { result: { ok: false; error: string } } {
  return { result: { ok: false, error: message } };
}

export const shuaiz3Rule: RuleRuntime<Shuaiz3State> = {
  meta: RULE_META.shuaiz3,

  create({ names, now, random, deck }) {
    // deck 只由测试房间注入，普通房间为 undefined，照常洗牌。
    return createGame(names, now, random, deck);
  },

  apply(state, seat, action: GameAction, ctx) {
    if (state.phase === 'finished') return error('牌局已经结束');

    const next = cloneState(state);
    const now = ctx.now;

    switch (action.type) {
      case 'declareTrump': {
        if (next.phase !== 'dealing' && next.phase !== 'declaring') {
          return error('现在不是甩 3 的阶段');
        }
        if (next.dealerSeat !== null) return error('已经有人甩出 3 了');
        if (next.declined[seat]) return error('你已经放弃甩 3，不能反悔');

        const cardId = action.cardId;
        if (typeof cardId !== 'string') return error('甩 3 数据无效');
        const index = next.hands[seat].findIndex((card) => card.id === cardId);
        if (index === -1) return error('所选卡牌不在你的手牌中');

        const card = next.hands[seat][index];
        if (card.rank !== '3') return error('只能甩出手里的 3');

        const revealed = revealedForSeat(seat, revealedTotal(next.dealStartedAt, now));
        if (index >= revealed) return error('这张 3 还没有摸到');

        declareTrump(next, seat, card, now);
        return {
          result: { ok: true, finished: isFinishedState(next) },
          state: next,
        };
      }

      case 'declineTrump': {
        if (next.phase !== 'dealing' && next.phase !== 'declaring') {
          return error('现在不是甩 3 的阶段');
        }
        if (next.dealerSeat !== null) return error('已经有人甩出 3 了');
        if (next.declined[seat]) return error('你已经放弃过了');

        const revealed = revealedForSeat(seat, revealedTotal(next.dealStartedAt, now));
        const hasDrawnThree = next.hands[seat]
          .slice(0, revealed)
          .some((card) => card.rank === '3');
        if (!hasDrawnThree) return error('你还没有摸到 3');

        // 不写日志：放弃状态不公开，避免泄漏「谁手里有 3」。
        next.declined[seat] = true;

        // 发牌结束后所有持 3 玩家都放弃 → 立即重新发牌。
        if (next.phase === 'declaring' && !hasUndeclinedHolder(next)) {
          redeal(next, now, ctx.random);
        }

        return {
          result: { ok: true, finished: isFinishedState(next) },
          state: next,
        };
      }

      case 'returnBottom': {
        if (next.phase !== 'returning') return error('现在不是还底阶段');
        if (next.dealerSeat === null || seat !== next.dealerSeat) {
          return error('只有庄家可以还底');
        }
        if (next.returnedCards !== null) return error('已经还过底了');

        const cards = selectedCards(next, seat, action.cardIds);
        if (typeof cards === 'string') return error(cards);
        if (cards.length !== BOTTOM_COUNT) return error(`需要还 ${BOTTOM_COUNT} 张牌`);
        if (cards.some((card) => isPointCard(card))) return error('不能还 5 / 10 / K');

        completeReturn(next, cards, now);
        return {
          result: { ok: true, finished: isFinishedState(next) },
          state: next,
        };
      }

      case 'play': {
        if (next.phase !== 'playing') return error('牌局尚未进入出牌阶段');

        const cards = selectedCards(next, seat, action.cardIds);
        if (typeof cards === 'string') return error(cards);

        const failure = next.trick
          ? followTrick(next, seat, cards, now, ctx.config.scoreThreshold)
          : leadTrick(next, seat, cards, now);
        if (failure) return error(failure);

        return {
          result: { ok: true, finished: isFinishedState(next) },
          state: next,
        };
      }

      default:
        return error('不支持的操作');
    }
  },

  botAction(state, seat) {
    return decideBotAction(state, seat);
  },

  tick(state, now, ctx) {
    const next = cloneState(state);
    let changed = false;

    // 一次 tick 可能连续推进多个阶段（例如发牌结束后立即超时甩 3）。
    for (let guard = 0; guard < 6; guard += 1) {
      if (next.phase === 'dealing' && now >= next.dealEndsAt) {
        changed = true;

        if (next.dealerSeat !== null) {
          beginReturning(next, now);
        } else if (!hasUndeclinedHolder(next)) {
          redeal(next, now, ctx.random);
        } else {
          next.phase = 'declaring';
          next.declareDeadline = now + SHUAIZ3_DECLARE_TIMEOUT_MS;
          addLog(next, 'system', '发牌结束，等待有人甩 3（最长 20 秒）', now);
        }
        continue;
      }

      if (
        next.phase === 'declaring' &&
        next.declareDeadline !== null &&
        now >= next.declareDeadline
      ) {
        changed = true;
        const picked = pickRandomTrump(next, ctx.random);
        if (picked) {
          declareTrump(next, picked.seat, picked.card, now, true);
        } else {
          redeal(next, now, ctx.random);
        }
        continue;
      }

      if (
        next.phase === 'returning' &&
        next.returnedCards === null &&
        next.returnDeadline !== null &&
        now >= next.returnDeadline &&
        next.dealerSeat !== null &&
        next.trumpSuit !== null
      ) {
        changed = true;
        const cards = pickAutoReturnCards(next.hands[next.dealerSeat], next.trumpSuit);
        completeReturn(next, cards, now);
        continue;
      }

      break;
    }

    if (!changed) {
      return { result: { changed: false, finished: isFinishedState(next) } };
    }

    return {
      result: { changed: true, finished: isFinishedState(next) },
      state: next,
    };
  },

  nextDeadline(state) {
    switch (state.phase) {
      case 'dealing':
        return state.dealEndsAt;
      case 'declaring':
        return state.declareDeadline;
      case 'returning':
        return state.returnedCards === null ? state.returnDeadline : null;
      default:
        return null;
    }
  },

  view(state, viewerSeat) {
    return buildView(state, viewerSeat);
  },

  isFinished(state) {
    return state.phase === 'finished';
  },
};
