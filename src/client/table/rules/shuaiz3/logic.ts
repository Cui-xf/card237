import { SUIT_SYMBOL, type Card, type StandardSuit } from '../../../../shared/cards';
import type { Shuaiz3TrickView, SuitGroup } from '../../../../shared/rules/shuaiz3';
import type { ActionSlot, ChromeSpec, SelectionResult, TableCard } from '../../core/types';
import type { Shuaiz3TableModel } from './adapter';

/**
 * 客户端侧的出牌提示校验。
 *
 * 只用于决定按钮是否可点、显示什么提示；最终合法性由服务端规则裁定。
 */
export function isTrumpCard(card: Card, trumpSuit: StandardSuit): boolean {
  return card.suit === 'joker' || card.rank === '2' || card.suit === trumpSuit;
}

export function cardGroup(card: Card, trumpSuit: StandardSuit): SuitGroup {
  return isTrumpCard(card, trumpSuit) ? 'trump' : (card.suit as StandardSuit);
}

export function isPointCard(card: Card): boolean {
  return card.rank === '5' || card.rank === '10' || card.rank === 'K';
}

export function isLeadValid(cards: Card[], trumpSuit: StandardSuit): boolean {
  if (cards.length === 0) return false;
  const group = cardGroup(cards[0], trumpSuit);
  return cards.every((card) => cardGroup(card, trumpSuit) === group);
}

export function isFollowValid(
  hand: Card[],
  selected: Card[],
  trick: Shuaiz3TrickView,
  trumpSuit: StandardSuit,
): boolean {
  if (selected.length !== trick.count) return false;

  const selectedIds = new Set(selected.map((card) => card.id));
  const suitCards = hand.filter((card) => cardGroup(card, trumpSuit) === trick.leadSuit);

  if (suitCards.length >= trick.count) {
    return selected.every((card) => cardGroup(card, trumpSuit) === trick.leadSuit);
  }
  return suitCards.every((card) => selectedIds.has(card.id));
}

export function buildShuaiz3Chrome(model: Shuaiz3TableModel): ChromeSpec[] {
  const center = model.center;
  const specs: ChromeSpec[] = [];

  // 只保留主牌信息：庄家与阵营已经由座位角标和结算面板承载，桌面上不再重复。
  specs.push({
    label: center.trumpSuit ? `主牌 ${SUIT_SYMBOL[center.trumpSuit]}` : '主牌 未定',
    tone: 'muted',
    placement: 'table',
  });

  return specs;
}

const BOTTOM_COUNT = 6;

export function validateShuaiz3Selection(
  model: Shuaiz3TableModel,
  selected: TableCard[],
): SelectionResult {
  const center = model.center;
  const count = selected.length;

  if (center.kind === 'returning') {
    if (!center.mustReturnBottom) {
      return { ok: false, hint: '等待庄家还底…' };
    }
    if (count !== BOTTOM_COUNT) {
      return { ok: false, hint: '请选择 6 张非 5 / 10 / K 的牌' };
    }
    if (selected.some((card) => isPointCard(card))) {
      return { ok: false, hint: '请选择 6 张非 5 / 10 / K 的牌' };
    }
    return { ok: true, hint: '还底后进入出牌阶段' };
  }

  if (center.kind !== 'trick') {
    return { ok: false, hint: '' };
  }

  if (count === 0) {
    return { ok: false, hint: '请选择要出的牌' };
  }

  const trumpSuit: StandardSuit | null = center.trumpSuit;
  if (!trumpSuit) {
    return { ok: false, hint: '等待主牌确定' };
  }

  if (!center.trick) {
    if (!isLeadValid(selected as Card[], trumpSuit)) {
      return { ok: false, hint: '领出的牌必须同花色（所有主牌算同一花色）' };
    }
    return { ok: true, hint: '选择同花色的牌领出，可一次出多张' };
  }

  if (count !== center.trick.count) {
    return { ok: false, hint: `本轮需要出 ${center.trick.count} 张` };
  }

  const trick = {
    leadSeat: model.turnSeat ?? 0,
    leadSuit: center.trick.leadSuit,
    count: center.trick.count,
    reduced: false,
    plays: [],
  };

  if (!isFollowValid(model.hand as Card[], selected as Card[], trick, trumpSuit)) {
    return { ok: false, hint: '必须先出光手里的该花色牌，再补其他牌' };
  }

  return { ok: true, hint: '张数与跟牌规则已满足，确认出牌' };
}

export function buildShuaiz3Actions(
  model: Shuaiz3TableModel,
  selected: TableCard[],
): ActionSlot[] {
  const center = model.center;
  const actions: ActionSlot[] = [];

  if (center.kind === 'returning' && center.mustReturnBottom) {
    const enabled =
      selected.length === BOTTOM_COUNT && selected.every((card) => !isPointCard(card));
    actions.push({
      key: 'primary',
      label: selected.length > 0 ? `还底 · ${selected.length}/${BOTTOM_COUNT}` : '还底',
      enabled,
      hint: '选择 6 张非 5 / 10 / K 的牌',
      action: { type: 'returnBottom', cardIds: selected.map((card) => card.id) },
    });
  }

  const isMyTurn =
    model.roomStatus === 'playing' &&
    model.selfSeat !== null &&
    model.turnSeat === model.selfSeat;

  if (center.kind === 'trick' && isMyTurn) {
    const verdict = validateShuaiz3Selection(model, selected);
    actions.push({
      key: 'primary',
      label: selected.length > 0 ? `出牌 · ${selected.length}` : '出牌',
      enabled: verdict.ok,
      hint: verdict.hint,
      action: { type: 'play', cardIds: selected.map((card) => card.id) },
    });
  }

  if (center.canDeclareNow) {
    for (const card of center.threes) {
      const suit = card.suit as StandardSuit;
      actions.push({
        key: 'quickDeclare',
        label: `${SUIT_SYMBOL[suit]}3`,
        enabled: true,
        hint: `甩出 ${SUIT_SYMBOL[suit]}3`,
        action: { type: 'declareTrump', cardId: card.id },
        suit,
        rank: '3',
      });
    }
  }

  if (center.kind === 'declaring' && center.canDeclareNow) {
    actions.push({
      key: 'secondary',
      label: '取消甩牌',
      enabled: true,
      hint: '取消甩牌',
      action: { type: 'declineTrump' },
    });
  }

  return actions;
}

export const SHUAIZ3_SEAT_COUNT = 4;

/** 还底阶段只允许庄家选非点牌；出牌阶段允许选牌。 */
export function canSelectShuaiz3(model: Shuaiz3TableModel, card: TableCard): boolean {
  if (model.roomStatus === 'finished' || model.selfSeat === null) return false;
  const center = model.center;

  switch (center.kind) {
    case 'returning':
      return center.mustReturnBottom && !isPointCard(card);
    case 'trick':
      return true;
    default:
      return false;
  }
}
