import type { Card, StandardSuit } from '../../../../shared/cards';
import type { GameAction } from '../../../../shared/rules/types';
import { suitGroup, trickCardValue } from './rank';
import { pickAutoReturnCards } from './score';
import type { Shuaiz3State } from './state';

function lowest(cards: Card[], trumpSuit: StandardSuit): Card[] {
  return [...cards].sort(
    (a, b) => trickCardValue(a, trumpSuit) - trickCardValue(b, trumpSuit),
  );
}

/** 甩牌尝试张数：一次最多甩 3 张，再多被打小的损失也更大。 */
const LEAD_ATTEMPT = 3;

/**
 * 领出：从牌力最强的一组里挑最大的 2~3 张尝试甩牌。
 *
 * 甩牌是否成立由服务端「打小」判定：只要还有能压过最小一张的牌，
 * 就退回单张，所以这里可以放心尝试，不会产生非法出牌。
 */
function chooseLead(hand: Card[], trumpSuit: StandardSuit): GameAction | null {
  const groups = new Map<string, Card[]>();
  for (const card of hand) {
    const key = suitGroup(card, trumpSuit);
    const list = groups.get(key);
    if (list) list.push(card);
    else groups.set(key, [card]);
  }

  let chosen: Card[] = [];
  let chosenTop = Number.NEGATIVE_INFINITY;
  for (const cards of groups.values()) {
    const sorted = [...cards].sort(
      (a, b) => trickCardValue(b, trumpSuit) - trickCardValue(a, trumpSuit),
    );
    const top = sorted[0];
    if (top && trickCardValue(top, trumpSuit) > chosenTop) {
      chosenTop = trickCardValue(top, trumpSuit);
      chosen = sorted;
    }
  }

  if (chosen.length === 0) return null;
  const lead = chosen.slice(0, Math.min(LEAD_ATTEMPT, chosen.length));
  return { type: 'play', cardIds: lead.map((card) => card.id) };
}

/** 出牌阶段：领出尝试甩牌；跟牌时优先出光领出花色，不足再补其他牌。 */
function choosePlay(state: Shuaiz3State, seat: number): GameAction | null {
  const trumpSuit = state.trumpSuit;
  if (!trumpSuit) return null;

  const hand = state.hands[seat];
  if (hand.length === 0) return null;

  const trick = state.trick;
  if (!trick) return chooseLead(hand, trumpSuit);

  const suitCards = hand.filter((card) => suitGroup(card, trumpSuit) === trick.leadSuit);
  let cards: Card[];

  if (suitCards.length >= trick.count) {
    cards = lowest(suitCards, trumpSuit).slice(0, trick.count);
  } else {
    const fillers = lowest(
      hand.filter((card) => suitGroup(card, trumpSuit) !== trick.leadSuit),
      trumpSuit,
    );
    cards = [...suitCards, ...fillers.slice(0, trick.count - suitCards.length)];
  }

  if (cards.length !== trick.count) return null;
  return { type: 'play', cardIds: cards.map((card) => card.id) };
}

/**
 * 甩3 机器人。
 *
 * - 发牌阶段不动作（不抢着甩 3），真人可以先甩。
 * - 发牌结束后，持 3 的机器人会主动甩 3 当庄：否则测试房间里庄家永远是真人，
 *   验收流程覆盖不到「机器人当庄 / 我不是庄」的场景。
 * - 庄家是机器人时，按「最小的非计分牌」自动还底。
 * - 出牌阶段只做合法且保守的选择，保证整局能走完。
 */
export function botAction(state: Shuaiz3State, seat: number): GameAction | null {
  switch (state.phase) {
    case 'declaring': {
      if (state.dealerSeat !== null) return null;
      if (state.declined[seat]) return null;
      const three = state.hands[seat].find((card) => card.rank === '3');
      return three ? { type: 'declareTrump', cardId: three.id } : null;
    }

    case 'returning': {
      if (state.dealerSeat !== seat || state.returnedCards !== null) return null;
      if (!state.trumpSuit) return null;
      const cards = pickAutoReturnCards(state.hands[seat], state.trumpSuit);
      if (cards.length !== 6) return null;
      return { type: 'returnBottom', cardIds: cards.map((card) => card.id) };
    }

    case 'playing':
      if (state.currentSeat !== seat) return null;
      return choosePlay(state, seat);

    default:
      return null;
  }
}
