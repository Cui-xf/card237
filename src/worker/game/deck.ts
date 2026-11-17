import type { Card } from '../../shared/cards';
import { STANDARD_RANKS, SUITS } from '../../shared/cards';

/** 生成一副 54 张斗地主牌。 */
export function createDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of STANDARD_RANKS) {
      deck.push({ id: `${suit}-${rank}`, suit, rank });
    }
  }
  deck.push({ id: 'joker-SJ', suit: 'joker', rank: 'SJ' });
  deck.push({ id: 'joker-BJ', suit: 'joker', rank: 'BJ' });
  return deck;
}

/** Fisher–Yates 洗牌，可通过 random 注入确定性随机数用于测试。 */
export function shuffle<T>(items: readonly T[], random: () => number = Math.random): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}
