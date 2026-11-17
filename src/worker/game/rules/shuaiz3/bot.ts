import type { Card, StandardSuit } from '../../../../shared/cards';
import type { GameAction } from '../../../../shared/rules/types';
import { isPointCard, suitGroup, trickCardValue } from './rank';
import { pickAutoReturnCards } from './score';
import type { Shuaiz3State } from './state';

function lowest(cards: Card[], trumpSuit: StandardSuit): Card[] {
  return [...cards].sort(
    (a, b) => trickCardValue(a, trumpSuit) - trickCardValue(b, trumpSuit),
  );
}

/** 出牌阶段：领出最小的单张；跟牌时优先出光领出花色，不足再补其他牌。 */
function choosePlay(state: Shuaiz3State, seat: number): GameAction | null {
  const trumpSuit = state.trumpSuit;
  if (!trumpSuit) return null;

  const hand = state.hands[seat];
  if (hand.length === 0) return null;

  const trick = state.trick;
  if (!trick) {
    // 领出：优先出最小的非计分牌；整手都是计分牌时出最小的一张。
    const sorted = lowest(hand, trumpSuit);
    const card = sorted.find((item) => !isPointCard(item)) ?? sorted[0];
    return { type: 'play', cardIds: [card.id] };
  }

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
 * - 发牌阶段不动作（不抢着甩 3）。
 * - 人机不允许甩 3：发牌结束后的等待阶段，持 3 的机器人直接发送「取消甩牌」。
 * - 庄家是机器人时（正常流程下不会发生），按「最小的非计分牌」自动还底。
 * - 出牌阶段只做合法且保守的选择，保证整局能走完。
 */
export function botAction(state: Shuaiz3State, seat: number): GameAction | null {
  switch (state.phase) {
    case 'declaring': {
      if (state.dealerSeat !== null) return null;
      if (state.declined[seat]) return null;
      const three = state.hands[seat].find((card) => card.rank === '3');
      return three ? { type: 'declineTrump' } : null;
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
