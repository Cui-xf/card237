import type { Page } from '@playwright/test';

/** 与 `TableDebugSnapshot` 保持一致的测试侧结构。 */
export interface SnapshotCard {
  id: string;
  rank: string;
  suit: string;
}

export interface SnapshotCardRect extends SnapshotCard {
  x: number;
  y: number;
  w: number;
  h: number;
  selected: boolean;
  selectable: boolean;
}

export interface SnapshotButton {
  key: 'primary' | 'secondary' | 'quickDeclare';
  label: string;
  enabled: boolean;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface SnapshotCenter {
  kind?: string;
  trumpSuit?: string | null;
  mustReturnBottom?: boolean;
  trick?: { leadSuit: string; count: number } | null;
  canDeclareNow?: boolean;
  dealerSeat?: number | null;
  [key: string]: unknown;
}

export interface TableSnapshot {
  ready: boolean;
  ruleId: string;
  phase: string;
  roomStatus: string;
  selfSeat: number | null;
  turnSeat: number | null;
  statusText: string;
  selected: string[];
  hand: SnapshotCard[];
  cards: SnapshotCardRect[];
  buttons: SnapshotButton[];
  center: SnapshotCenter;
  width: number;
  height: number;
  seatCount: number;
}

declare global {
  interface Window {
    __card237?: {
      table: {
        debugSnapshot(): TableSnapshot | null;
        setConnected(connected: boolean): void;
      };
    };
  }
}

export async function snapshot(page: Page): Promise<TableSnapshot | null> {
  return page.evaluate(() => window.__card237?.table.debugSnapshot() ?? null);
}

interface WaitOptions {
  timeout?: number;
  label?: string;
}

/** 轮询牌桌快照，直到满足条件。 */
export async function waitForSnapshot(
  page: Page,
  predicate: (snap: TableSnapshot) => boolean,
  options: WaitOptions = {},
): Promise<TableSnapshot> {
  const timeout = options.timeout ?? 20_000;
  const started = Date.now();
  let last: TableSnapshot | null = null;

  while (Date.now() - started < timeout) {
    last = await snapshot(page);
    if (last && predicate(last)) return last;
    await page.waitForTimeout(120);
  }

  const brief = last
    ? {
        phase: last.phase,
        roomStatus: last.roomStatus,
        selected: last.selected,
        buttons: last.buttons.map((button) => `${button.key}:${button.label}:${button.enabled}`),
      }
    : null;
  throw new Error(
    `等待牌桌状态超时：${options.label ?? '未命名条件'}\n最后快照：${JSON.stringify(brief)}`,
  );
}

/** 把场景坐标换算成页面坐标后点击；坐标来自真实布局，等于在点真实 UI。 */
export async function clickScenePoint(
  page: Page,
  snap: TableSnapshot,
  x: number,
  y: number,
): Promise<void> {
  const canvas = page.locator('.phaser-table canvas').last();
  const box = await canvas.boundingBox();
  if (!box) throw new Error('牌桌 canvas 尚未渲染');

  const scaleX = box.width / snap.width;
  const scaleY = box.height / snap.height;
  await page.mouse.click(box.x + x * scaleX, box.y + y * scaleY);
}

/** 依次点选手牌；每次点击前重新取快照，避免牌位移动后点空。 */
export async function selectCards(page: Page, ids: string[]): Promise<TableSnapshot> {
  for (const id of ids) {
    const snap = await waitForSnapshot(
      page,
      (value) => value.cards.some((card) => card.id === id),
      { label: `等待手牌 ${id}` },
    );
    const card = snap.cards.find((item) => item.id === id);
    if (!card) continue;
    if (card.selected) continue;
    await clickScenePoint(page, snap, card.x, card.y);
    await page.waitForTimeout(60);
  }
  const after = await snapshot(page);
  if (!after) throw new Error('选牌后无法读取牌桌状态');
  return after;
}

export async function clickButton(
  page: Page,
  snap: TableSnapshot,
  key: SnapshotButton['key'],
): Promise<void> {
  const button = snap.buttons.find((item) => item.key === key && item.enabled);
  if (!button) {
    throw new Error(
      `按钮不可用：${key}（当前按钮 ${snap.buttons
        .map((item) => `${item.key}:${item.label}:${item.enabled}`)
        .join(', ')}）`,
    );
  }
  await clickScenePoint(page, snap, button.x, button.y);
}
