import { describe, expect, it } from 'vitest';
import { createDeck, shuffle } from './deck';

describe('createDeck', () => {
  it('生成 54 张互不重复的牌', () => {
    const deck = createDeck();
    expect(deck).toHaveLength(54);
    expect(new Set(deck.map((card) => card.id)).size).toBe(54);
  });

  it('包含大小王与四种花色', () => {
    const deck = createDeck();
    expect(deck.filter((card) => card.suit === 'joker')).toHaveLength(2);
    expect(deck.filter((card) => card.suit === 'spade')).toHaveLength(13);
    expect(deck.filter((card) => card.suit === 'heart')).toHaveLength(13);
    expect(deck.filter((card) => card.suit === 'club')).toHaveLength(13);
    expect(deck.filter((card) => card.suit === 'diamond')).toHaveLength(13);
  });
});

describe('shuffle', () => {
  it('不修改原数组且保留全部元素', () => {
    const deck = createDeck();
    const shuffled = shuffle(deck, () => 0.5);
    expect(deck[0].id).toBe('spade-3');
    expect(shuffled).toHaveLength(54);
    expect(new Set(shuffled.map((card) => card.id)).size).toBe(54);
  });
});
