export const SUITS = ['spade', 'heart', 'club', 'diamond'] as const;

export type StandardSuit = (typeof SUITS)[number];
export type Suit = StandardSuit | 'joker';

/** 斗地主点数顺序，从 3 到 2，最后是小王、大王。 */
export const RANKS = [
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
  '10',
  'J',
  'Q',
  'K',
  'A',
  '2',
  'SJ',
  'BJ',
] as const;

export type Rank = (typeof RANKS)[number];

export const STANDARD_RANKS = RANKS.filter(
  (rank): rank is Exclude<Rank, 'SJ' | 'BJ'> => rank !== 'SJ' && rank !== 'BJ',
);

export interface Card {
  /** 稳定且唯一，例如 `spade-3`、`joker-BJ`。 */
  id: string;
  rank: Rank;
  suit: Suit;
}

export const RANK_VALUE: Record<Rank, number> = {
  '3': 3,
  '4': 4,
  '5': 5,
  '6': 6,
  '7': 7,
  '8': 8,
  '9': 9,
  '10': 10,
  J: 11,
  Q: 12,
  K: 13,
  A: 14,
  '2': 15,
  SJ: 16,
  BJ: 17,
};

const SUIT_ORDER: Record<Suit, number> = {
  spade: 0,
  heart: 1,
  club: 2,
  diamond: 3,
  joker: 4,
};

export const SUIT_SYMBOL: Record<Suit, string> = {
  spade: '♠',
  heart: '♥',
  club: '♣',
  diamond: '♦',
  joker: '★',
};

export function isRedSuit(suit: Suit): boolean {
  return suit === 'heart' || suit === 'diamond';
}

export function isJoker(card: Card): boolean {
  return card.suit === 'joker';
}

export function cardLabel(card: Card): string {
  if (card.rank === 'SJ') return '小王';
  if (card.rank === 'BJ') return '大王';
  return `${SUIT_SYMBOL[card.suit]}${card.rank}`;
}

/** 手牌从大到小排序，同点数按花色排序，便于阅读。 */
export function sortCards(cards: Card[]): Card[] {
  return [...cards].sort(
    (a, b) => RANK_VALUE[b.rank] - RANK_VALUE[a.rank] || SUIT_ORDER[a.suit] - SUIT_ORDER[b.suit],
  );
}

export function findCard(cards: Card[], id: string): Card | undefined {
  return cards.find((card) => card.id === id);
}
