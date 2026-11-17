import type { Card, StandardSuit } from '../../../../shared/cards';
import { RANK_VALUE } from '../../../../shared/cards';
import type { SuitGroup } from '../../../../shared/rules/shuaiz3';

/**
 * 主牌判定：主花色的牌、大小王、全部 4 张 2。
 *
 * 这是「所有主牌算同一花色」规则的唯一判定点，领出、跟牌、打小、杀牌都复用它。
 */
export function isTrump(card: Card, trumpSuit: StandardSuit): boolean {
  return card.suit === 'joker' || card.rank === '2' || card.suit === trumpSuit;
}

export function suitGroup(card: Card, trumpSuit: StandardSuit): SuitGroup {
  return isTrump(card, trumpSuit) ? 'trump' : (card.suit as StandardSuit);
}

/** 主牌内部牌力：主7 > 大王 > 小王 > 主2 > 副2 > 其他主牌。 */
export function trumpValue(card: Card, trumpSuit: StandardSuit): number {
  if (card.suit === trumpSuit && card.rank === '7') return 100;
  if (card.rank === 'BJ') return 90;
  if (card.rank === 'SJ') return 80;
  if (card.suit === trumpSuit && card.rank === '2') return 70;
  if (card.rank === '2') return 60;
  return 50 + RANK_VALUE[card.rank];
}

/** 本轮内的牌力：主牌用主牌序，副牌直接用点数。 */
export function trickCardValue(card: Card, trumpSuit: StandardSuit): number {
  return isTrump(card, trumpSuit) ? trumpValue(card, trumpSuit) : RANK_VALUE[card.rank];
}

/** 计分牌：5 = 5 分，10 / K = 10 分，其余 0 分。 */
export function pointOf(card: Card): number {
  if (card.rank === '5') return 5;
  if (card.rank === '10' || card.rank === 'K') return 10;
  return 0;
}

export function isPointCard(card: Card): boolean {
  return pointOf(card) > 0;
}

const SUIT_GROUP_ORDER: Record<SuitGroup, number> = {
  trump: 0,
  spade: 1,
  heart: 2,
  club: 3,
  diamond: 4,
};

/**
 * 展示用手牌顺序：主牌在前，其余按花色分组，组内按牌力从大到小。
 *
 * 只在 `playing` 阶段使用；发牌阶段必须保持发牌顺序，客户端据此逐张揭示。
 */
export function sortHandForPlay(cards: Card[], trumpSuit: StandardSuit): Card[] {
  return [...cards].sort((a, b) => {
    const groupDiff =
      SUIT_GROUP_ORDER[suitGroup(a, trumpSuit)] - SUIT_GROUP_ORDER[suitGroup(b, trumpSuit)];
    if (groupDiff !== 0) return groupDiff;
    return trickCardValue(b, trumpSuit) - trickCardValue(a, trumpSuit);
  });
}
