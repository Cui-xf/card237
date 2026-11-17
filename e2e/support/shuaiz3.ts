import type { Page } from '@playwright/test';
import {
  clickButton,
  selectCards,
  snapshot,
  waitForSnapshot,
  type SnapshotCard,
  type TableSnapshot,
} from './snapshot';

const POINT_RANKS = new Set(['5', '10', 'K']);

function isTrumpCard(card: SnapshotCard, trumpSuit: string): boolean {
  return card.suit === 'joker' || card.rank === '2' || card.suit === trumpSuit;
}

function suitGroup(card: SnapshotCard, trumpSuit: string): string {
  return isTrumpCard(card, trumpSuit) ? 'trump' : card.suit;
}

/** 还底：优先还掉非点牌（5 / 10 / K 不能还）。 */
export function pickReturnIds(snap: TableSnapshot): string[] {
  return snap.hand
    .filter((card) => !POINT_RANKS.has(card.rank))
    .slice(0, 6)
    .map((card) => card.id);
}

/**
 * 出牌策略（与真实玩家等价，只做合法选择）：
 * - 领出：出单张，任何单张都合法；
 * - 跟牌：先用光领出花色，不够再补其他花色。
 */
export function pickPlayIds(snap: TableSnapshot): string[] {
  const trumpSuit = snap.center.trumpSuit ?? null;
  if (!trumpSuit) return snap.hand.slice(0, 1).map((card) => card.id);

  const trick = snap.center.trick ?? null;
  if (!trick) return snap.hand.slice(0, 1).map((card) => card.id);

  const matching = snap.hand.filter(
    (card) => suitGroup(card, trumpSuit) === trick.leadSuit,
  );
  if (matching.length >= trick.count) {
    return matching.slice(0, trick.count).map((card) => card.id);
  }

  const fillers = snap.hand.filter(
    (card) => suitGroup(card, trumpSuit) !== trick.leadSuit,
  );
  return [...matching, ...fillers.slice(0, trick.count - matching.length)].map(
    (card) => card.id,
  );
}

async function waitForSettled(page: Page): Promise<void> {
  await waitForSnapshot(
    page,
    (snap) =>
      snap.selected.length === 0 ||
      snap.phase !== 'playing' ||
      snap.roomStatus !== 'playing' ||
      snap.turnSeat !== snap.selfSeat,
    { timeout: 8_000, label: '动作提交' },
  ).catch(() => undefined);
}

/** 发牌/甩3阶段：手上有 3 就点快捷按钮甩出去。 */
export async function declareIfPossible(page: Page): Promise<boolean> {
  const snap = await snapshot(page);
  if (!snap) return false;
  const quick = snap.buttons.find(
    (button) => button.key === 'quickDeclare' && button.enabled,
  );
  if (!quick) return false;
  await clickButton(page, snap, 'quickDeclare');
  await page.waitForTimeout(200);
  return true;
}

/** 还底阶段：选 6 张非点牌并确认。 */
export async function returnBottomIfNeeded(page: Page): Promise<boolean> {
  let snap = await snapshot(page);
  if (!snap || snap.phase !== 'returning') return false;
  if (!snap.center.mustReturnBottom) return false;

  const ids = pickReturnIds(snap);
  if (ids.length !== 6) return false;

  snap = await selectCards(page, ids);
  await clickButton(page, snap, 'primary');
  await waitForSettled(page);
  return true;
}

/** 出牌阶段：轮到自己时按合法策略出牌。 */
export async function playIfMyTurn(page: Page): Promise<boolean> {
  let snap = await snapshot(page);
  if (!snap || snap.phase !== 'playing') return false;
  if (snap.turnSeat !== snap.selfSeat) return false;

  const ids = pickPlayIds(snap);
  if (ids.length === 0) return false;

  snap = await selectCards(page, ids);
  await clickButton(page, snap, 'primary');
  await waitForSettled(page);
  return true;
}
