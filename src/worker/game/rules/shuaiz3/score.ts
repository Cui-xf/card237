import type { Card, Rank, StandardSuit } from '../../../../shared/cards';
import type { Shuaiz3Result } from '../../../../shared/rules/shuaiz3';
import { isPointCard, trickCardValue } from './rank';
import type { Shuaiz3State } from './state';

export const TOTAL_POINTS = 100;

/** 主 2 / 主 7 的持有者；庄家按发牌 18 张判定，其他玩家按当前手牌。 */
function findHolder(
  state: Shuaiz3State,
  trumpSuit: StandardSuit,
  rank: Rank,
): number | null {
  for (let seat = 0; seat < state.hands.length; seat += 1) {
    const hand =
      seat === state.dealerSeat && state.dealerOriginalHand
        ? state.dealerOriginalHand
        : state.hands[seat];
    if (hand.some((card) => card.rank === rank && card.suit === trumpSuit)) {
      return seat;
    }
  }
  return null;
}

/**
 * 主 2 / 主 7 的持有者组成一队，其余人另一队；甩 3 玩家所在的一队为庄队。
 *
 * 庄家还出去的主 2 / 主 7 仍算庄家持有，所以用还底前的 18 张判定。
 */
export function computeTeams(state: Shuaiz3State): { zhuang: number[]; xian: number[] } {
  if (state.trumpSuit === null || state.dealerSeat === null) {
    throw new Error('尚未确定庄家与主牌花色');
  }

  const special = new Set<number>();
  const holder2 = findHolder(state, state.trumpSuit, '2');
  const holder7 = findHolder(state, state.trumpSuit, '7');
  if (holder2 !== null) special.add(holder2);
  if (holder7 !== null) special.add(holder7);

  const seats = state.hands.map((_, index) => index);
  const others = seats.filter((seat) => !special.has(seat));
  const specialSeats = [...special].sort((a, b) => a - b);

  return special.has(state.dealerSeat)
    ? { zhuang: specialSeats, xian: others }
    : { zhuang: others, xian: specialSeats };
}

export function computeResult(state: Shuaiz3State, threshold: number): Shuaiz3Result {
  const teams = state.teams ?? computeTeams(state);
  const zhuangScore = teams.zhuang.reduce((sum, seat) => sum + (state.scores[seat] ?? 0), 0);
  const xianScore = TOTAL_POINTS - zhuangScore;

  const outcome: Shuaiz3Result['outcome'] =
    zhuangScore > threshold ? 'zhuang' : zhuangScore === threshold ? 'draw' : 'xian';

  return {
    zhuangScore,
    xianScore,
    threshold,
    outcome,
    teams,
  };
}

/** 还底超时兜底：从手牌里挑 6 张最小的非计分牌还出。 */
export function pickAutoReturnCards(hand: Card[], trumpSuit: StandardSuit): Card[] {
  return [...hand]
    .filter((card) => !isPointCard(card))
    .sort((a, b) => trickCardValue(a, trumpSuit) - trickCardValue(b, trumpSuit))
    .slice(0, 6);
}
