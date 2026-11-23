import type { Card, StandardSuit, Suit } from '../../../../shared/cards';
import type { Shuaiz3TrickResultView } from '../../../../shared/rules/shuaiz3';
import { isTrump, pointOf, suitGroup, trickCardValue, trumpValue } from './rank';
import { addLog, formatCards } from './log';
import { computeResult } from './score';
import type { Shuaiz3State, Shuaiz3Trick } from './state';

const SEAT_COUNT = 4;

const SUIT_ORDER: Record<Suit, number> = {
  spade: 0,
  heart: 1,
  club: 2,
  diamond: 3,
  joker: 4,
};

function compareCardValue(a: Card, b: Card, trumpSuit: StandardSuit): number {
  const diff = trickCardValue(a, trumpSuit) - trickCardValue(b, trumpSuit);
  return diff !== 0 ? diff : SUIT_ORDER[a.suit] - SUIT_ORDER[b.suit];
}

function smallestCard(cards: Card[], trumpSuit: StandardSuit): Card {
  return [...cards].sort((a, b) => compareCardValue(a, b, trumpSuit))[0];
}

function removeCards(hand: Card[], cards: Card[]): void {
  const ids = new Set(cards.map((card) => card.id));
  for (let index = hand.length - 1; index >= 0; index -= 1) {
    if (ids.has(hand[index].id)) hand.splice(index, 1);
  }
}

/**
 * 打小判定：全场是否存在同花色、牌力大于领出最小牌的牌。
 *
 * 检查范围包括领出者自己的剩余手牌（去掉本次准备打出的牌）。
 */
export function shouldReduce(
  state: Shuaiz3State,
  leadCards: Card[],
  leaderSeat: number,
  trumpSuit: StandardSuit,
): boolean {
  const leadGroup = suitGroup(leadCards[0], trumpSuit);
  const minValue = Math.min(...leadCards.map((card) => trickCardValue(card, trumpSuit)));
  const leadIds = new Set(leadCards.map((card) => card.id));

  for (let seat = 0; seat < SEAT_COUNT; seat += 1) {
    const hand =
      seat === leaderSeat
        ? state.hands[seat].filter((card) => !leadIds.has(card.id))
        : state.hands[seat];

    for (const card of hand) {
      if (suitGroup(card, trumpSuit) !== leadGroup) continue;
      if (trickCardValue(card, trumpSuit) > minValue) return true;
    }
  }

  return false;
}

/** 一轮结束后的胜负判定；并列时以先出者为大。 */
export function resolveTrick(
  state: Shuaiz3State,
  trick: Shuaiz3Trick,
): Shuaiz3TrickResultView {
  const trumpSuit = state.trumpSuit;
  if (!trumpSuit) throw new Error('尚未确定主牌花色');

  const points = trick.plays.reduce(
    (sum, play) => sum + play.cards.reduce((cardSum, card) => cardSum + pointOf(card), 0),
    0,
  );
  const cards = trick.plays.flatMap((play) => play.cards);
  // 逐家保存一份出牌：本轮结束后客户端要把整轮牌留在桌上，并高亮赢家的那一手。
  const plays = trick.plays.map((play) => ({ seat: play.seat, cards: [...play.cards] }));
  const leadIsTrump = trick.leadSuit === 'trump';

  // 1) 杀牌：领出不是主牌，且整手全是主牌。
  const kills = trick.plays.filter(
    (play) => !leadIsTrump && play.cards.every((card) => isTrump(card, trumpSuit)),
  );
  if (kills.length > 0) {
    let best = kills[0];
    for (const play of kills.slice(1)) {
      const value = Math.max(...play.cards.map((card) => trumpValue(card, trumpSuit)));
      const bestValue = Math.max(...best.cards.map((card) => trumpValue(card, trumpSuit)));
      if (value > bestValue) best = play;
    }
    return { winnerSeat: best.seat, points, cards, plays };
  }

  // 2) 多张领出未被杀：打小机制已保证同花色无人更大，领出者赢。
  if (trick.count > 1) {
    return { winnerSeat: trick.leadSeat, points, cards, plays };
  }

  // 3) 单张领出：同花色里最大者赢。
  const candidates = trick.plays.filter(
    (play) => suitGroup(play.cards[0], trumpSuit) === trick.leadSuit,
  );
  let best = candidates[0];
  for (const play of candidates.slice(1)) {
    if (trickCardValue(play.cards[0], trumpSuit) > trickCardValue(best.cards[0], trumpSuit)) {
      best = play;
    }
  }
  return { winnerSeat: best.seat, points, cards, plays };
}

function finishTrick(
  state: Shuaiz3State,
  trick: Shuaiz3Trick,
  now: number,
  threshold: number,
): void {
  const result = resolveTrick(state, trick);
  state.scores[result.winnerSeat] += result.points;
  state.lastTrick = result;
  state.trick = null;

  addLog(
    state,
    'score',
    `${state.names[result.winnerSeat]} 赢下本轮${result.points > 0 ? `，获得 ${result.points} 分` : ''}`,
    now,
    result.winnerSeat,
  );

  if (state.hands.every((hand) => hand.length === 0)) {
    state.phase = 'finished';
    state.currentSeat = null;
    state.result = computeResult(state, threshold);

    const { zhuangScore, outcome } = state.result;
    const outcomeText =
      outcome === 'zhuang' ? '庄队获胜' : outcome === 'xian' ? '闲队获胜' : '平局';
    addLog(state, 'win', `牌局结束：庄队 ${zhuangScore} 分，${outcomeText}`, now);
    return;
  }

  state.currentSeat = result.winnerSeat;
  state.turnStartedAt = now;
}

/** 领出。返回错误文案，成功返回 null。 */
export function leadTrick(
  state: Shuaiz3State,
  seat: number,
  cards: Card[],
  now: number,
): string | null {
  if (state.trick) return '本轮已经有人领出';
  if (state.currentSeat !== seat) return '还没轮到你出牌';
  if (cards.length === 0) return '请先选择要出的牌';

  const trumpSuit = state.trumpSuit;
  if (!trumpSuit) return '尚未确定主牌花色';

  const leadGroup = suitGroup(cards[0], trumpSuit);
  if (cards.some((card) => suitGroup(card, trumpSuit) !== leadGroup)) {
    return '领出的牌必须同花色（所有主牌算同一花色）';
  }

  let played = [...cards];
  let reduced = false;
  if (cards.length >= 2 && shouldReduce(state, cards, seat, trumpSuit)) {
    reduced = true;
    played = [smallestCard(cards, trumpSuit)];
  }

  removeCards(state.hands[seat], played);
  state.playedCards.push(...played);
  state.trick = {
    leadSeat: seat,
    leadSuit: leadGroup,
    count: played.length,
    reduced,
    plays: [{ seat, cards: played }],
  };
  state.currentSeat = (seat + 1) % SEAT_COUNT;
  state.turnStartedAt = now;

  if (reduced) {
    addLog(
      state,
      'trick',
      `${state.names[seat]} 甩牌被打小，只出 ${formatCards(played)}`,
      now,
      seat,
    );
  } else {
    addLog(state, 'play', `${state.names[seat]} 领出 ${formatCards(played)}`, now, seat);
  }

  return null;
}

/** 跟牌。返回错误文案，成功返回 null。 */
export function followTrick(
  state: Shuaiz3State,
  seat: number,
  cards: Card[],
  now: number,
  threshold: number,
): string | null {
  const trick = state.trick;
  if (!trick) return '本轮还没有人领出';
  if (state.currentSeat !== seat) return '还没轮到你出牌';

  const trumpSuit = state.trumpSuit;
  if (!trumpSuit) return '尚未确定主牌花色';
  if (cards.length !== trick.count) return `本轮每家需要出 ${trick.count} 张牌`;

  const hand = state.hands[seat];
  const suitCards = hand.filter((card) => suitGroup(card, trumpSuit) === trick.leadSuit);
  const selectedIds = new Set(cards.map((card) => card.id));

  if (suitCards.length >= trick.count) {
    if (cards.some((card) => suitGroup(card, trumpSuit) !== trick.leadSuit)) {
      return '手里有该花色，必须跟同花色';
    }
  } else if (suitCards.some((card) => !selectedIds.has(card.id))) {
    return '必须先出光手里的该花色牌，差额再用其他牌补足';
  }

  removeCards(hand, cards);
  state.playedCards.push(...cards);
  trick.plays.push({ seat, cards });
  addLog(state, 'play', `${state.names[seat]} 出牌 ${formatCards(cards)}`, now, seat);

  if (trick.plays.length === SEAT_COUNT) {
    finishTrick(state, trick, now, threshold);
  } else {
    state.currentSeat = (seat + 1) % SEAT_COUNT;
    state.turnStartedAt = now;
  }

  return null;
}
