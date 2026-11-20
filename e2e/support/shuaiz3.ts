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

const RANK_VALUE: Record<string, number> = {
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

/** 与 rank.ts 的 trickCardValue 对齐：主牌内部按「主7 > 大王 > 小王 > 主2 > 副2 > 其他」。 */
function trickValue(card: SnapshotCard, trumpSuit: string): number {
  if (!isTrumpCard(card, trumpSuit)) return RANK_VALUE[card.rank] ?? 0;
  if (card.suit === trumpSuit && card.rank === '7') return 100;
  if (card.rank === 'BJ') return 90;
  if (card.rank === 'SJ') return 80;
  if (card.suit === trumpSuit && card.rank === '2') return 70;
  if (card.rank === '2') return 60;
  return 50 + (RANK_VALUE[card.rank] ?? 0);
}

/** 领出时尝试甩出的张数，和机器人保持一致。 */
const LEAD_ATTEMPT = 3;

/**
 * 领出：从牌力最强的一组里挑最大的 2~3 张尝试甩牌。
 *
 * 甩牌不成立时服务端会自动打小，只留下最小的一张，所以可以放心尝试。
 */
function pickLeadIds(hand: SnapshotCard[], trumpSuit: string): string[] {
  const groups = new Map<string, SnapshotCard[]>();
  for (const card of hand) {
    const key = suitGroup(card, trumpSuit);
    const list = groups.get(key);
    if (list) list.push(card);
    else groups.set(key, [card]);
  }

  let chosen: SnapshotCard[] = [];
  let topValue = Number.NEGATIVE_INFINITY;
  for (const cards of groups.values()) {
    const sorted = [...cards].sort(
      (a, b) => trickValue(b, trumpSuit) - trickValue(a, trumpSuit),
    );
    const top = sorted[0];
    if (top && trickValue(top, trumpSuit) > topValue) {
      topValue = trickValue(top, trumpSuit);
      chosen = sorted;
    }
  }

  return chosen.slice(0, Math.min(LEAD_ATTEMPT, chosen.length)).map((card) => card.id);
}

/**
 * 还底：还掉牌力最小的 6 张非点牌（5 / 10 / K 不能还）。
 *
 * 与服务端机器人的还底策略一致：测试房间的固定牌序把「该还的 6 张」
 * 安排在整手最弱的非计分牌里，按牌力挑才能稳定还对。
 */
export function pickReturnIds(snap: TableSnapshot): string[] {
  const trumpSuit = snap.center.trumpSuit ?? null;
  return [...snap.hand]
    .filter((card) => !POINT_RANKS.has(card.rank))
    .sort((a, b) =>
      trumpSuit
        ? trickValue(a, trumpSuit) - trickValue(b, trumpSuit)
        : (RANK_VALUE[a.rank] ?? 0) - (RANK_VALUE[b.rank] ?? 0),
    )
    .slice(0, 6)
    .map((card) => card.id);
}

/**
 * 出牌策略（与真实玩家等价，只做合法选择）：
 * - 领出：尝试甩出最强花色的 2~3 张（打小后服务端只留一张）；
 * - 跟牌：先用光领出花色，不够再补其他花色。
 */
export function pickPlayIds(snap: TableSnapshot): string[] {
  const trumpSuit = snap.center.trumpSuit ?? null;
  if (!trumpSuit) return snap.hand.slice(0, 1).map((card) => card.id);

  const trick = snap.center.trick ?? null;
  if (!trick) return pickLeadIds(snap.hand, trumpSuit);

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
  // 不能把「选中已清空」当作提交完成：动作提交后客户端会立刻清空选中，
  // 但服务端的新状态还没回来，此时继续出牌会基于旧状态误判。
  await waitForSnapshot(
    page,
    (snap) =>
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

/**
 * 出牌阶段：轮到自己时出牌。
 *
 * `leadPlan` 是固定牌序配套的领出剧本（每组是一手牌的 cardId）。
 * 验收截图要按「先甩梅花、再甩方块被别家杀」的顺序走，才能稳定拍到
 * 「本轮出牌中 / 我赢下 / 别人赢下 / 别人先出轮到我」四个画面；
 * 剧本用完或手牌里凑不齐时，退回通用策略。
 */
export async function playIfMyTurn(page: Page, leadPlan: string[][] = []): Promise<boolean> {
  let snap = await snapshot(page);
  if (!snap || snap.phase !== 'playing') return false;
  if (snap.turnSeat !== snap.selfSeat) return false;

  let ids: string[];
  const planned = !snap.center.trick ? leadPlan[0] : undefined;
  if (planned) {
    const handIds = new Set(snap.hand.map((card) => card.id));
    if (planned.every((id) => handIds.has(id))) {
      leadPlan.shift();
      ids = planned;
    } else {
      ids = pickPlayIds(snap);
    }
  } else {
    ids = pickPlayIds(snap);
  }
  if (ids.length === 0) return false;

  snap = await selectCards(page, ids);
  await clickButton(page, snap, 'primary');
  await waitForSettled(page);
  return true;
}
