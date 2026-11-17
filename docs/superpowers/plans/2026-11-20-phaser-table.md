# Phaser 牌桌重构实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用 Phaser 4 替换 React DOM 牌桌，保留现有协议与房间外壳，交付甩 3 与斗地主两套可水平扩展的 canvas 牌桌。

**Architecture:** React 继续负责连接、路由、顶栏与侧栏；`src/client/table/` 内分 `core/`（通用场景、布局、纹理、动效）与 `rules/<id>/`（玩法插件）。核心通过 `RuleBoard` 接口消费玩法，玩法之间互不引用，新增玩法只需新增目录并在 `registry.ts` 注册。

**Tech Stack:** React 19、TypeScript（strict）、Vite、Phaser `4.2.1`、Tailwind v4（仅外围页面）。

**Spec:** `docs/superpowers/specs/2026-11-20-phaser-table-design.md`

## Global Constraints

- Phaser 固定 `4.2.1`，用 `import Phaser from 'phaser'`。
- 项目规则优先于 TDD：**不新增/修改测试文件，不主动运行测试**；每个任务的验证是 `npm run typecheck` + 用户手动验收。
- **不自行启动 dev server / preview / wrangler**；**不执行 git commit / push**。
- `table/core/**` 不得 import `table/rules/**` 或 `table/registry.ts`；玩法之间不得互相 import。
- 只用系统字体，不加载 Web Font；不引入图片/音频资源。
- 只做暗色主题；颜色、字号、时长一律取自 `core/theme.ts`。
- 所有动效必须支持 `prefers-reduced-motion: reduce`，降级为瞬时终态。
- 触控目标 ≥ 44×44px；画布不能横向溢出。
- 中文文案保持与现有牌桌一致。

## Review Focus

1. **同一 Game 内换相位/换规则**：重开新局或规则从 `shuaiz3` 切到 `landlord` 时，旧中央视图、旧出牌、旧选中必须被销毁，不能叠加残留（Task 3、8、10 手动验收）。
2. **断线重连后的状态重放**：同一 `RoomView` 重复推送不能生成重复牌对象，已选牌必须按 id 保留或清理（Task 5、11）。
3. **窄屏 17 张手牌**：手机横屏下斗地主手牌不能超出画布，重叠后每张牌仍可点中（Task 5）。
4. **旁观者与房主身份**：`mySeat === null` 时不出现可操作按钮；只有房主看到「重开」，其他人看到「等待房主」（Task 8、10）。
5. **无 WebGL / reduced-motion**：Canvas 2D 降级下功能完整；关闭动效后所有牌直接落在终态（Task 2、7、11）。
6. **中文字体度量**：长昵称、状态提示在 canvas 中不能溢出面板或被截断成乱码（Task 4、11）。

---

### Task 1: 安装 Phaser 与核心类型骨架

**Files:**
- Modify: `package.json`
- Create: `src/client/table/core/types.ts`
- Create: `src/client/table/core/theme.ts`
- Create: `src/client/table/core/RuleBoard.ts`

**Interfaces:**
- Consumes: `Card` / `Rank` / `Suit`（`src/shared/cards.ts`）、`PublicSeat` / `RoomStatus`（`src/shared/protocol.ts`）、`GameAction` / `PublicGameView` / `RuleId`（`src/shared/rules/types.ts`）。
- Produces: `TableCard`、`TableSeat`、`ChromeSpec`、`ActionSlot`、`ResultModel`、`SelectionResult`、`TableModel<T>`、`TableInput`、`BoardContext`、`Theme`、`RuleBoard`、`CenterView`、`CenterContext`。

- [ ] **Step 1: 安装精确版本**

Run: `npm install phaser@4.2.1`
Expected: `package.json` 的 `dependencies` 出现 `"phaser": "^4.2.1"` 或精确版本，`npm ls phaser` 显示 4.2.1。

- [ ] **Step 2: 写 `core/types.ts`**

```ts
import type { Rank, Suit } from '../../../../shared/cards';
import type { PublicSeat, RoomStatus } from '../../../../shared/protocol';
import type { GameAction, PublicGameView, RuleId } from '../../../../shared/rules/types';

export type SeatPosition = 'self' | 'left' | 'top' | 'right';

export interface TableCard { id: string; rank: Rank; suit: Suit }

export interface TableSeat {
  index: number;
  position: SeatPosition;
  name: string;
  isSelf: boolean;
  isHost: boolean;
  online: boolean;
  ready: boolean;
  handCount: number;
  score?: number;
  badge?: string;
}

export interface ChromeSpec {
  label: string;
  tone: 'gold' | 'muted' | 'danger';
  seat?: number;
  placement: 'table' | 'seat' | 'self';
}

export type ActionKey = 'primary' | 'secondary' | 'quickDeclare';

export interface ActionSlot {
  key: ActionKey;
  label: string;
  enabled: boolean;
  hint: string;
  action: GameAction;
  suit?: Suit;
  rank?: Rank;
}

export interface PlayedGroup { seat: number; cards: TableCard[] }

export interface SelectionResult { ok: boolean; hint: string }

export interface ResultModel {
  title: string;
  lines: string[];
  scores?: { name: string; score: number }[];
  winnerSeat: number | null;
}

export interface TableModel<TCenter = unknown> {
  ruleId: RuleId;
  phase: string;
  seatCount: number;
  seats: TableSeat[];
  selfSeat: number | null;
  hand: TableCard[];
  handMarks: string[];
  played: PlayedGroup[];
  chrome: ChromeSpec[];
  statusText: string;
  statusTone: 'muted' | 'strong';
  actions: ActionSlot[];
  result: ResultModel | null;
  turnSeat: number | null;
  roomStatus: RoomStatus;
  reducedMotion: boolean;
  center: TCenter;
}

export interface BoardContext {
  now: number;
  reducedMotion: boolean;
  isHost: boolean;
  roomStatus: RoomStatus;
}

export interface TableInput {
  game: PublicGameView;
  seats: (PublicSeat | null)[];
  mySeat: number | null;
  isHost: boolean;
  roomStatus: RoomStatus;
}
```

- [ ] **Step 3: 写 `core/theme.ts`**

导出 `THEME` 常量与 `export type Theme = typeof THEME`。必须包含 spec 4.1 的全部颜色令牌（`bg.abyss`、`felt.center`、`felt.mid`、`felt.edge`、`rim.wood.from/to`、`gold.base/light/deep`、`ivory`、`ink`、`suit.red`、`cream`、`mint`、`danger`、`turn.glow`），以及：

```ts
export const FONT_BODY = '"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif';
export const FONT_NUM = 'ui-rounded, "Arial Rounded MT Bold", "PingFang SC", sans-serif';

export const THEME = {
  color: { /* 上述令牌 */ },
  font: { body: FONT_BODY, num: FONT_NUM },
  size: { title: 21, seatName: 14, handCount: 13, rank: 22, countdown: 34, button: 16, body: 14, caption: 12 },
  motion: { fast: 140, play: 320, collect: 280, dealCard: 260, dealGap: 40, result: 420, turnPulse: 1600 },
  radius: { card: 10, button: 999, seat: 26 },
} as const;
export type Theme = typeof THEME;
```

- [ ] **Step 4: 写 `core/RuleBoard.ts`**

```ts
export interface CenterContext {
  scene: Phaser.Scene;
  width: number;
  height: number;
  anchors: Record<SeatPosition, { x: number; y: number }>;
  metrics: Metrics;
  reducedMotion: boolean;
}

export interface CenterView {
  update(model: TableModel, now: number, ctx: CenterContext): void;
  destroy(): void;
}

export interface RuleBoard<TView extends PublicGameView = PublicGameView, TCenter = unknown> {
  readonly ruleId: RuleId;
  readonly seatCount: number;
  toModel(
    view: TView,
    ctx: BoardContext,
    seats: (PublicSeat | null)[],
    mySeat: number | null,
  ): TableModel<TCenter>;
  createCenter(scene: Phaser.Scene, theme: Theme): CenterView;
  chrome(model: TableModel<TCenter>): ChromeSpec[];
  actions(model: TableModel<TCenter>, selected: TableCard[]): ActionSlot[];
  canSelect(model: TableModel<TCenter>, card: TableCard): boolean;
  validateSelection(model: TableModel<TCenter>, selected: TableCard[]): SelectionResult;
}
```

`Metrics` 在 Task 4 定义；本步骤先 `import type { Metrics } from './layout/responsive'` 会失败。改为在本文件先声明最小占位：

```ts
export interface Metrics {
  compact: boolean;
  cardW: number;
  cardH: number;
  handOverlap: number;
  seatRadius: number;
  gutter: number;
}
```

Task 4 的 `responsive.ts` 必须从这个接口实现，不得另起一套。

- [ ] **Step 5: 验证类型**

Run: `npm run typecheck`
Expected: 退出码 0。

---

### Task 2: 程序化牌面与桌面纹理

**Files:**
- Create: `src/client/table/core/textures/cards.ts`
- Create: `src/client/table/core/textures/table.ts`

**Interfaces:**
- Consumes: `THEME`、`TableCard`。
- Produces:
  - `CARD_TEX_W = 168`、`CARD_TEX_H = 252`
  - `cardTextureKey(cardId: string): string`
  - `registerCardTextures(scene: Phaser.Scene): void`
  - `registerTableTexture(scene: Phaser.Scene, width: number, height: number): string`

- [ ] **Step 1: 写 `textures/cards.ts`**

规则：
- 纹理键：`card-face-${card.id}`、`card-back`、`card-shadow`。
- 所有纹理用 `scene.textures.createCanvas(key, w, h)` 生成，画完调用 `texture.refresh()`；已存在同键则直接返回。
- 牌面：象牙白圆角矩形（半径 12）+ `1px` 深色内描边；左上角与右下角写「点数 + 花色」，中央写大点数，红桃/方块用 `suit.red`。
- 大小王：中央写 `小王` / `大王`，花色位置写 `★`；红王用红字，黑王用墨色。
- 牌背：`felt.edge → felt.mid` 渐变 + 金色细回纹 + 中心菱形。
- `card-shadow`：160×232 透明画布，画一个带 `ctx.shadowBlur = 18`、`shadowColor = rgba(0,0,0,.45)` 的圆角矩形，偏移 `(0, 6)`。
- 点数/花色使用 `THEME.font.num`，字号按纹理尺寸取 `44px`（角标）与 `96px`（中央）。

- [ ] **Step 2: 写 `textures/table.ts`**

`registerTableTexture(scene, width, height)`：
- 键 `table-surface-${Math.round(width)}x${Math.round(height)}`。
- 同键已存在直接返回该键。
- 画布尺寸即画布逻辑尺寸；按顺序绘制：
  1. 外圈木纹：圆角矩形填充 `rim.wood.from → rim.wood.to` 线性渐变，圆角 `height * 0.08`。
  2. 内圈 28px 处缩进，填 `felt.center → felt.mid → felt.edge` 径向渐变（中心偏上 `0.5, 0.42`）。
  3. 金色 hairline：`rgba(216,166,76,.55)`、2px 描边。
  4. 噪点：用 `mulberry32(20261120)` 生成 18000 个 1px 点，`rgba(255,255,255,.035)`，只铺在内圈。
  5. 四角暗角：四个径向渐变叠加到内圈。
- 返回键，供 `FeltView` 使用。

- [ ] **Step 3: 验证类型**

Run: `npm run typecheck`
Expected: 退出码 0。

---

### Task 3: Phaser 场景骨架与 React 桥

**Files:**
- Create: `src/client/table/core/TableScene.ts`
- Create: `src/client/table/core/TableBridge.ts`
- Create: `src/client/table/createTable.ts`
- Create: `src/client/table/registry.ts`
- Create: `src/client/components/game/PhaserTable.tsx`
- Modify: `src/client/components/game/GameBoard.tsx`

**Interfaces:**
- Consumes: `TableInput`、`TableSceneData`、`registerTableTexture`。
- Produces:
```ts
// TableScene.ts
export interface TableSceneData {
  resolveBoard(ruleId: RuleId): RuleBoard | null;
  onAction(action: GameAction): void;
  onRestart(): void;
  onLeave(): void;
  onStatus(text: string): void;
  reducedMotion: boolean;
}

// TableBridge.ts
export type TableBridgeOptions = TableSceneData;
export interface TableController {
  update(input: TableInput): void;
  setConnected(connected: boolean): void;
  setReducedMotion(value: boolean): void;
  destroy(): void;
}
export function createTableBridge(parent: HTMLElement, options: TableBridgeOptions): TableController;

// createTable.ts
export function createTable(
  parent: HTMLElement,
  options: Omit<TableBridgeOptions, 'resolveBoard'>,
): TableController;

// registry.ts
export type RuleBoardFactory = () => RuleBoard;
export function resolveRuleBoard(ruleId: RuleId): RuleBoard | null;
export function hasRuleBoard(ruleId: RuleId): boolean;
```

- [ ] **Step 1: 写 `TableScene.ts`**

`export class TableScene extends Phaser.Scene`：
- `constructor(data: TableSceneData)`（不要在场景里 import registry）；构造函数先调用 `super({ key: 'TableScene' })` 再保存 `data`。
- `create()`：`registerTableTexture`、生成背景 Image、监听 `this.scale.on('resize', ...)`。
- `push(input: TableInput): void`：保存最新输入；本任务只绘制桌面，不消费规则。
- `setConnected(connected: boolean): void`：保存状态，暂不改变渲染。
- `setReducedMotion(value: boolean): void`：保存到场景字段，Task 7 起由各视图读取。
- 场景尺寸变化时重新生成桌面纹理并移除旧键；用 `this.textures.remove(oldKey)`。
- 首帧之前（`create` 未调用）收到的 `push` 要缓存，`create` 结束后回放一次。

- [ ] **Step 2: 写 `TableBridge.ts`**

- `createTableBridge` 创建 `new Phaser.Game({ type: Phaser.AUTO, parent, scale: { mode: Phaser.Scale.RESIZE, width: '100%', height: '100%' }, render: { antialias: true }, scene: sceneInstance })`。
- `update()` 直接转给场景 `push`；`setConnected()`、`setReducedMotion()` 转给场景同名方法。
- `destroy()` 调用 `game.destroy(true)`。
- 不在此文件 import 任何玩法。

- [ ] **Step 3: 写 `createTable.ts` 与 `registry.ts`**

`registry.ts` 本任务先返回 `null`：

```ts
const BOARDS: Partial<Record<RuleId, RuleBoardFactory>> = {};
export function resolveRuleBoard(ruleId: RuleId): RuleBoard | null {
  return BOARDS[ruleId]?.() ?? null;
}
export function hasRuleBoard(ruleId: RuleId): boolean {
  return ruleId in BOARDS;
}
```

`createTable.ts` 调用 `createTableBridge(parent, { ...options, resolveBoard: resolveRuleBoard })`。

- [ ] **Step 4: 写 `PhaserTable.tsx`**

- Props 复用 `GameBoardProps<PublicGameView>`。
- 用 `useRef<HTMLDivElement>` 作为父容器，`useEffect` 创建控制器（依赖数组为空），卸载时 `destroy()`。
- 回调与 `reducedMotion` 放在 ref 里；每次渲染更新 ref，避免重建 Game。
- 第二个 `useEffect` 在 `game/seats/mySeat/isHost/roomStatus` 变化时调用 `controller.update(...)`。
- 渲染 `<div ref={hostRef} className="phaser-table" />` + `<div className="sr-only" aria-live="polite">{status}</div>`；`status` 由 `onStatus` 更新。
- 在 `src/client/styles.css` 补：`.phaser-table { position: relative; width: 100%; height: 100%; min-height: 320px; overflow: hidden; }` 与 `.phaser-table canvas { display: block; }`；父容器 `.table-column` 已有高度。
- `reducedMotion` 用 `window.matchMedia('(prefers-reduced-motion: reduce)').matches` 初始化，并监听变化重新创建？本任务只做初始值，Task 11 补监听。

- [ ] **Step 5: 修改 `GameBoard.tsx`**

```tsx
import { hasRuleBoard } from '../../table/registry';
import { PhaserTable } from './PhaserTable';
...
if (hasRuleBoard(game.ruleId)) return <PhaserTable game={game} {...rest} />;
switch (game.ruleId) { /* 旧牌桌保留 */ }
```

- [ ] **Step 6: 验证类型**

Run: `npm run typecheck`
Expected: 退出码 0；此时页面仍显示旧牌桌（registry 为空）。

---

### Task 4: 布局、毡布、座位、徽标、结算面板

**Files:**
- Create: `src/client/table/core/layout/responsive.ts`
- Create: `src/client/table/core/layout/seatLayout.ts`
- Create: `src/client/table/core/views/FeltView.ts`
- Create: `src/client/table/core/views/SeatView.ts`
- Create: `src/client/table/core/views/ChromeView.ts`
- Create: `src/client/table/core/views/ResultOverlayView.ts`
- Modify: `src/client/table/core/TableScene.ts`

**Interfaces:**
- Consumes: `THEME`、`registerTableTexture`、`TableSeat`、`ChromeSpec`、`ResultModel`。
- Produces:
```ts
// responsive.ts
export function getMetrics(width: number, height: number): Metrics;

// seatLayout.ts
export function computeSeatAnchors(
  width: number,
  height: number,
  seatCount: number,
  metrics: Metrics,
): Record<SeatPosition, { x: number; y: number }>;

// FeltView.ts
export class FeltView {
  constructor(scene: Phaser.Scene, theme: Theme);
  layout(width: number, height: number): void;
  destroy(): void;
}

// SeatView.ts
export class SeatView {
  constructor(scene: Phaser.Scene, theme: Theme);
  update(seat: TableSeat, anchor: { x: number; y: number }, turn: boolean): void;
  destroy(): void;
}

// ChromeView.ts
export class ChromeView {
  constructor(scene: Phaser.Scene, theme: Theme);
  setSpecs(specs: ChromeSpec[], anchors: Record<SeatPosition, { x: number; y: number }>): void;
  destroy(): void;
}

// ResultOverlayView.ts
export class ResultOverlayView {
  constructor(scene: Phaser.Scene, theme: Theme, handlers: { onRestart(): void; onLeave(): void });
  show(result: ResultModel, isHost: boolean): void;
  hide(): void;
  destroy(): void;
}
```

- [ ] **Step 1: 写 `responsive.ts`**

- `compact = width < 720`；`cardW = compact ? 58 : width < 1200 ? 78 : 92`；`cardH = Math.round(cardW * 1.5)`；`handOverlap = compact ? 26 : 34`；`seatRadius = compact ? 20 : 26`；`gutter = compact ? 10 : 18`。
- `Metrics` 从 `RuleBoard.ts` import，不重复定义。

- [ ] **Step 2: 写 `seatLayout.ts`**

- 底部自己：`x = width / 2`、`y = height - metrics.cardH * 1.75 - metrics.gutter`。
- 3 人：左侧 `(width * 0.12, height * 0.42)`、右侧 `(width * 0.88, height * 0.42)`；`top` 锚点复用左侧坐标（不渲染）。
- 4 人：左 `(0.10, 0.40)`、上 `(0.50, 0.10)`、右 `(0.90, 0.40)`。
- 全部加 `metrics.gutter` 的安全边距。

- [ ] **Step 3: 写 `FeltView.ts`**

- 用 `scene.add.image(width/2, height/2, key)`，`setDisplaySize(width, height)`，`setDepth(0)`。
- `layout` 时若尺寸变化超过 1px，注册新纹理、切图、移除旧键。
- `destroy` 移除 image 与自身纹理。

- [ ] **Step 4: 写 `SeatView.ts`**

用 `Container` 组合：
- 圆形头像盘：`Graphics` 画圆 + 首字 `Text`（`THEME.font.body`，14px）。
- 昵称 `Text`，最长 8 个字符，超出截断为 `前7字…`，`setOrigin(0.5, 0)`。
- 手牌数徽章：胶囊背景 + `Text`。
- 分数胶囊：仅当 `seat.score !== undefined`。
- `seat.badge` 金色角标。
- 回合环：`Graphics` 圆环 + `pulse` 呼吸（Task 7 接入，本任务先静态显示）。
- 离线：整体 `setAlpha(0.55)`。
- 自身座位（`position === 'self'`）尺寸放大 1.1 倍。

- [ ] **Step 5: 写 `ChromeView.ts` 与 `ResultOverlayView.ts`**

- `ChromeView`：处理 `placement === 'table'` 的徽标，横向居中排列在桌面顶部；`placement === 'self'` 放在自己座位上方的标签行；`placement === 'seat'` 由 `SeatView.badge` 消费，ChromeView 忽略。
- `ResultOverlayView`：全屏半透明压暗层 + 居中面板（圆角、金线、标题、明细、可选分数表）；按钮「再来一局」（仅 isHost 显示）与「离开牌桌」；点击调用 handlers。

- [ ] **Step 6: 在 `TableScene` 接线**

- `create()` 实例化 `FeltView`、`ChromeView`、`ResultOverlayView`，维护 `Map<number, SeatView>`（key 为 seat index）。
- `push()` 后调用私有 `render()`：若 `resolveBoard` 为 null 直接返回；否则 `board.toModel(...)`（本任务还没有插件，正常不会被调用）。
- 场景持有 `board: RuleBoard | null` 与当前 `boardRuleId`；仅当 `input.game.ruleId` 变化时重新 `resolveBoard`，并销毁旧 `CenterView`、创建 `board.createCenter(this, THEME)`。同一规则内重复推送不得重建插件。
- `ResultOverlayView.show/hide` 依据 `model.result`。
- 座位按 `model.seats` 更新；多余的 SeatView 销毁。
- resize 时重新计算 anchors 并重排所有视图。
- 覆盖 `update(time)`：距上次渲染超过 250ms 且当前存在倒计时/发牌阶段时重新 `render()`，用于本地推进倒计时与揭示张数；无动态内容时不重渲染。

- [ ] **Step 7: 验证类型**

Run: `npm run typecheck`
Expected: 退出码 0。

---

### Task 5: 手牌布局、选牌与键盘

**Files:**
- Create: `src/client/table/core/layout/handLayout.ts`
- Create: `src/client/table/core/views/HandView.ts`
- Modify: `src/client/table/core/TableScene.ts`

**Interfaces:**
- Consumes: `getMetrics`、`cardTextureKey`、`RuleBoard.canSelect`、`Theme`。
- Produces:
```ts
// handLayout.ts
export interface HandSlot { x: number; y: number; angle: number }
export function layoutHand(
  count: number,
  width: number,
  height: number,
  metrics: Metrics,
): HandSlot[];

// HandView.ts
export interface HandViewOptions {
  onToggle(card: TableCard): void;
}
export class HandView {
  constructor(scene: Phaser.Scene, theme: Theme, metrics: Metrics, options: HandViewOptions);
  setCards(
    cards: TableCard[],
    selected: ReadonlySet<string>,
    marks: ReadonlySet<string>,
    canSelect: (card: TableCard) => boolean,
  ): void;
  setSelected(selected: ReadonlySet<string>): void;
  layout(width: number, height: number, metrics: Metrics): void;
  destroy(): void;
}
```

- [ ] **Step 1: 写 `handLayout.ts`**

- 手牌在底部、以画布中心对称。
- 间距 `step = Math.min(metrics.cardW - 8, (width - 2 * metrics.gutter - metrics.cardW) / Math.max(1, count - 1))`，且不小于 18px（紧凑屏 14px）。
- 每张牌 `y` 相同；`angle` 为 `((i - (count - 1) / 2) / count) * 4` 度。
- 总数 1 张时居中。

- [ ] **Step 2: 写 `HandView.ts`**

- 为每张牌创建一个 `Container`：阴影 `Image('card-shadow')` + 牌面 `Image(cardTextureKey(card.id))`，`setDisplaySize(metrics.cardW, metrics.cardH)`。
- 交互：`container.setSize(cardW, cardH).setInteractive()`；`pointerdown` 调 `onToggle(card)`；`pointerover` 抬升 8px；`pointerout` 回位。
- 选中：`y -= 14`、`setDepth(10 + index)`。
- 底牌标记（`marks`）：牌下方画一个小金点或金色描边。
- 不可选（`canSelect` 返回 false）：整体 `setAlpha(0.55)`、不绑 hover。
- 按 `id` diff：新 id 创建、消失 id 销毁、位置变化用 tween 迁移；**不得整组重建**。
- 选中状态只改 `y`/depth，不改对象身份。

- [ ] **Step 3: 在 `TableScene` 接线**

- 场景持有 `selected: Set<string>`；`board` 切换时清空。
- 点牌：若 `board.canSelect(model, card)` 为 false 直接返回；否则 toggle，再调用 `refreshActions()`。
- `refreshActions()`：`board.actions(model, selectedCards)` 的结果交给 ActionBarView（Task 6）；同时用 `board.validateSelection` 的 hint 覆盖状态提示。
- 键盘：`this.input.keyboard?.on('keydown-ESC', ...)` 清空选中；`keydown-ENTER` 触发第一个 `enabled` 的 `primary` action。
- 手牌变化时按 id 清理不在手牌里的选中项。
- `render()` 中调用 `HandView.setCards`。

- [ ] **Step 4: 验证类型**

Run: `npm run typecheck`
Expected: 退出码 0。

- [ ] **Step 5: 交付给用户手动验收**

请用户确认：选牌抬升/悬停回位正常；选中牌在服务端 state 重放后不闪断；手机横屏 17 张牌（斗地主）不超出画布且每张可点中。

---

### Task 6: 操作栏、状态提示与已出牌区

**Files:**
- Create: `src/client/table/core/views/ActionBarView.ts`
- Create: `src/client/table/core/views/PlayedView.ts`
- Modify: `src/client/table/core/TableScene.ts`

**Interfaces:**
- Produces:
```ts
export class ActionBarView {
  constructor(scene: Phaser.Scene, theme: Theme, onAction: (action: GameAction) => void);
  update(actions: ActionSlot[], width: number, height: number, metrics: Metrics): void;
  destroy(): void;
}

export class PlayedView {
  constructor(scene: Phaser.Scene, theme: Theme);
  update(
    played: PlayedGroup[],
    seats: TableSeat[],
    anchors: Record<SeatPosition, { x: number; y: number }>,
    metrics: Metrics,
  ): void;
  destroy(): void;
}
```

- [ ] **Step 1: 写 `ActionBarView.ts`**

- 主/次按钮在手牌右上方：胶囊形，宽度按文字测量 + 32px，最小高度 44px。
- 主按钮金色渐变；次按钮深绿描边；禁用去饱和 40%、不发光。
- `quickDeclare` 槽位并排成一行，显示 `♠3` 这类「花色 + 3」，使用 `slot.suit`；红桃/方块用红色。
- 点击只发送 `slot.action`（即使 disabled 也不发送）。
- 按 key 复用对象，避免每帧重建。

- [ ] **Step 2: 写 `PlayedView.ts`**

- 每个座位方向有一组小牌：先按 `seats` 找到 `PlayedGroup.seat` 对应的 `TableSeat.position`，再取该位置的锚点，牌组紧贴座位内侧。
- 小牌尺寸为手牌的 0.62 倍，最多显示 8 张，超出显示 `+N`。
- 自己打出的牌显示在桌沿内侧、手牌上方。
- 用 id 签名 diff，变化时重建该座位的牌组即可（数量小）。

- [ ] **Step 3: 在 `TableScene` 接线**

- `create()` 实例化两者；`render()` 中调用。
- 状态提示：`Text` 位于手牌上方居中，最大宽度 `width * 0.6`，`wordWrap`；`statusTone === 'strong'` 用金色，其余薄荷色。
- 状态文本变化时调用 `options.onStatus(text)` 通知 React `aria-live`。

- [ ] **Step 4: 验证类型**

Run: `npm run typecheck`
Expected: 退出码 0。

---

### Task 7: 动效基础设施

**Files:**
- Create: `src/client/table/core/fx/tweens.ts`
- Create: `src/client/table/core/fx/dealQueue.ts`
- Modify: `HandView.ts`、`PlayedView.ts`、`SeatView.ts`、`ResultOverlayView.ts`

**Interfaces:**
- Produces:
```ts
export function tweenTo(
  scene: Phaser.Scene,
  targets: Phaser.GameObjects.GameObject | Phaser.GameObjects.GameObject[],
  props: Record<string, number>,
  duration: number,
  reducedMotion: boolean,
  ease?: string,
): Phaser.Tweens.Tween | null;

export function pulse(
  scene: Phaser.Scene,
  target: Phaser.GameObjects.GameObject,
  reducedMotion: boolean,
): Phaser.Tweens.Tween | null;

export function flyCard(
  scene: Phaser.Scene,
  image: Phaser.GameObjects.Image,
  from: { x: number; y: number },
  to: { x: number; y: number },
  duration: number,
  reducedMotion: boolean,
): Phaser.Tweens.Tween | null;

export class DealQueue {
  constructor(scene: Phaser.Scene, reducedMotion: boolean);
  deal(
    sprites: Phaser.GameObjects.Image[],
    targets: { x: number; y: number }[],
    gap: number,
    duration: number,
    onLand?: (index: number) => void,
  ): void;
}
```

- [ ] **Step 1: 写 `tweens.ts`**

- `reducedMotion === true` 时直接设置终值并返回 `null`。
- `tweenTo` 使用 `scene.tweens.add`，默认 `ease: 'Cubic.easeOut'`。
- `pulse`：alpha 或 scale 的 `yoyo: true, repeat: -1, duration: THEME.motion.turnPulse`。
- `flyCard`：沿二次贝塞尔（控制点 = 中点上方 60px）用 `counter: { t: 0 }` 驱动 `image.x/y`；`onUpdate` 里计算。

- [ ] **Step 2: 写 `dealQueue.ts`**

- 依次延迟 `gap` 毫秒启动每张牌的 `flyCard`，每张到达时调用 `onLand(index)`。

- [ ] **Step 3: 接入通用视图**

- `HandView` 选中/悬停/回位用 `tweenTo`（140ms）。
- `SeatView` 回合环用 `pulse`。
- `ResultOverlayView` 面板从 `scale 0.92 / alpha 0` 到 `1 / 1`，420ms `Back.easeOut`；分数文本用对象计数 tween 从 0 滚到目标值（reducedMotion 时直接显示终值）。
- 所有方法接收 `reducedMotion`，由场景当前值传入。

- [ ] **Step 4: 验证类型**

Run: `npm run typecheck`
Expected: 退出码 0。

---

### Task 8: 甩 3 插件（数据、操作与阶段视图）

**Files:**
- Create: `src/client/table/rules/shuaiz3/rules.ts`（从 `src/client/components/game/shuaiz3/rules.ts` 迁移，逻辑不变）
- Create: `src/client/table/rules/shuaiz3/adapter.ts`
- Create: `src/client/table/rules/shuaiz3/actions.ts`
- Create: `src/client/table/rules/shuaiz3/chrome.ts`
- Create: `src/client/table/rules/shuaiz3/layout.ts`
- Create: `src/client/table/rules/shuaiz3/center/{DealingView,DeclareView,ReturnView,TrickView}.ts`
- Create: `src/client/table/rules/shuaiz3/index.ts`
- Modify: `src/client/table/registry.ts`

**Interfaces:**
- Consumes: `Shuaiz3View`、`Shuaiz3PublicData`、`RuleBoard`、核心类型。
- Produces: `createShuaiz3Board(): RuleBoard<Shuaiz3View, Shuaiz3Center>`；`Shuaiz3TableModel = TableModel<Shuaiz3Center>`。

```ts
export interface Shuaiz3Center {
  kind: 'none' | 'dealing' | 'declaring' | 'returning' | 'trick';
  revealed: number;
  total: number;
  declaredName: string | null;
  remainingSeconds: number;
  isDealer: boolean;
  mustReturnBottom: boolean;
  bottomCards: TableCard[];
  leadSuit: SuitGroup | null;
  count: number;
  lastTrick: { winnerSeat: number; points: number } | null;
  trumpSuit: StandardSuit | null;
  canDeclareNow: boolean;
  declined: boolean;
  dealerSeat: number | null;
  trick: { leadSuit: SuitGroup; count: number } | null;
  threes: TableCard[];
}
```

（`SuitGroup` 与 `StandardSuit` 分别从 `src/shared/rules/shuaiz3.ts`、`src/shared/cards.ts` import。）

- [ ] **Step 1: 迁移校验函数**

把 `isTrumpCard`、`cardGroup`、`isPointCard`、`isLeadValid`、`isFollowValid` 原样复制到 `table/rules/shuaiz3/rules.ts`，只改 import 路径。旧文件保留到 Task 12。

- [ ] **Step 2: 写 `adapter.ts`**

`toModel(view, ctx, seats, mySeat)`：
- 座位轮转：`mySeat === null` 时 left=1、top=2、right=3；否则 `left=(mySeat+1)%4`、`top=(mySeat+2)%4`、`right=(mySeat+3)%4`。`TableSeat.position` 按此赋值。
- `hand`：发牌阶段用 `view.hand.slice(0, revealed)`，其他阶段用 `view.hand`；`handMarks` 在 `phase === 'returning' && data.you.mustReturnBottom` 时取 `data.bottomCards` 的 id。
- `played` 来自 `data.trick?.plays ?? []`。
- `statusText`：完整复刻现有 `Shuaiz3Board.tsx:191-236` 的分支（旁观/庄家已定/已取消甩牌/可甩 3/等待甩 3/还底/出牌/等待/结束），文案保持一致。
- `result`：`phase === 'finished' && data.result` 时构造 `ResultModel`，`title = '本局结束'`，明细含庄/闲得分与阈值，`scores` 取 `data.scores` 与座位名。
- `center`：把 `Shuaiz3Center` 的全部字段填满；`remainingSeconds` 由 `deadline` 与 `ctx.now` 计算并 `Math.max(0, Math.ceil(...))`。把现有 `Shuaiz3Board.tsx` 里的 `localRevealed(data, mySeat, now)` 原样迁入 adapter，用它的结果作为 `revealed` 并截取手牌前缀；`threes` 取这个前缀里的 3；`canDeclareNow = dealerSeat === null && !you.declined && threes.length > 0`。
- `turnSeat`：`view.currentSeat`。

- [ ] **Step 3: 写 `actions.ts`**

```ts
export function buildShuaiz3Actions(
  model: Shuaiz3TableModel,
  selected: TableCard[],
): ActionSlot[];
```
复刻 `Shuaiz3Board` 的按钮条件：
- `returning` 且 `mustReturnBottom`：主按钮「还底 · n/6」，启用条件为选满 6 张且都不含 5/10/K；action `{ type: 'returnBottom', cardIds }`。
- `playing` 且轮到自己：主按钮「出牌」或「领出」，启用条件用 `validateSelection`；action `{ type: 'play', cardIds }`。
- `canDeclareNow`（`dealerSeat === null && !you.declined && 已揭示手牌里有 3`）：每个 3 生成一个 `quickDeclare` 槽，`suit`/`rank` 带上；action `{ type: 'declareTrump', cardId }`。
- `phase === 'declaring' && canDeclareNow`：次按钮「取消甩牌」，action `{ type: 'declineTrump' }`。

- [ ] **Step 4: 写 `chrome.ts` 与 `layout.ts`**

- `chrome`：主牌 `主牌 ♥`（`placement: 'table'`、`tone: 'muted'`）；庄家 `庄家 {name}`（`placement: 'table'`）；自己队伍「庄队/闲队」（`placement: 'self'`，庄队 `tone: 'gold'`）。庄家座位由 adapter 写进 `TableSeat.badge = '庄'`。
- `layout`：`seatCount = 4`；`canSelect` 复刻现有逻辑（还底阶段只允许庄家选非点牌；出牌阶段允许；其他阶段禁止）。

- [ ] **Step 5: 写 `validateSelection`**

- 还底：必须 6 张且全部非 5/10/K；hint 分别为「请选择 6 张非 5 / 10 / K 的牌」「还底后进入出牌阶段」。
- 领出：`isLeadValid`；失败 hint「领出的牌必须同花色（所有主牌算同一花色）」。
- 跟牌：张数必须等于 `trick.count`；否则 hint「本轮需要出 N 张」；`isFollowValid` 失败 hint「必须先出光手里的该花色牌，再补其他牌」。
- 成功 hint「张数与跟牌规则已满足，确认出牌」。

- [ ] **Step 6: 写四个 center 视图**

- `DealingView`：中央显示「发牌中 {revealed}/{total}」；若有 `declaredName` 显示「{name} 已甩 3」。
- `DeclareView`：中央显示「等待甩 3」+ 倒计时数字；`remainingSeconds <= 5` 用危险色。
- `ReturnView`：庄家显示「选择 6 张非点牌还底」；非庄家显示「等待庄家还底…」+ 倒计时。
- `TrickView`：显示「本轮 {count} 张 · 引领 {leadSuit ?? '—'}」；有 `lastTrick` 时追加「上一墩 {winner} 得 {points} 分」。
- 全部用 `createCenter` 创建，`update` 按 `model.center.kind` 切换显示/隐藏；`destroy` 清理对象。

- [ ] **Step 7: 写 `index.ts` 并注册**

```ts
export function createShuaiz3Board(): RuleBoard<Shuaiz3View, Shuaiz3Center> { ... }
```
在 `registry.ts` 的 `BOARDS` 中加入 `shuaiz3: createShuaiz3Board`。

- [ ] **Step 8: 验证类型**

Run: `npm run typecheck`
Expected: 退出码 0；页面中甩 3 房间改用 Phaser 牌桌，斗地主仍用旧牌桌。

- [ ] **Step 9: 交付给用户手动验收**

请用户确认：旁观者 `mySeat === null` 无操作按钮；非房主看不到「再来一局」；重开新局后旧出牌与旧选中被清空。

---

### Task 9: 甩 3 阶段动效

**Files:**
- Modify: `src/client/table/rules/shuaiz3/center/DealingView.ts`
- Modify: `src/client/table/rules/shuaiz3/center/DeclareView.ts`
- Modify: `src/client/table/rules/shuaiz3/center/ReturnView.ts`
- Modify: `src/client/table/core/views/PlayedView.ts`
- Modify: `src/client/table/core/TableScene.ts`

**Interfaces:**
- Consumes: `DealQueue`、`flyCard`、`tweenTo`、`CenterContext`。
- Produces: 无新公共签名；行为变化见步骤。

- [ ] **Step 1: 发牌飞行**

- `DealingView.update` 首次进入 `dealing` 时，在中央创建一叠牌背（54 张不需要全部显示，取 8 张错位即可），记录「上次 revealed」。
- `revealed` 增加时，按 `(revealed % 4)` 推断发给了哪个座位，用 `DealQueue` 从中央牌堆飞到该座位锚点；自己的牌飞到 `CenterContext` 提供的手牌位置（场景需在 `CenterContext` 增加 `handSlots` 字段？不需要：飞向手牌区域底部中央即可，具体手牌由 `HandView` 在数据更新时淡入）。
- 发牌结束（`revealed === total`）时牌堆淡出。
- `reducedMotion` 时不创建飞行牌，直接显示计数。

- [ ] **Step 2: 倒计时环**

- `DeclareView`/`ReturnView`：在数字外围画一圈 `Graphics` 弧线，按 `remainingSeconds / 初始秒数` 收缩；最后 5 秒颜色切到 `THEME.color.danger` 并 `pulse`。
- 初始秒数取第一次收到的 `remainingSeconds`，后续不重置。

- [ ] **Step 3: 出牌飞行与收墩**

- `PlayedView.update` 对比上一帧的 `played`：新增的牌组先创建在手牌位置（自己）或座位锚点（他人），再用 `flyCard` 飞到目标位置。
- 牌组消失时（新一墩开始）：若上一帧有 `lastTrick.winnerSeat`，用 280ms 缩小飞向赢家锚点；否则淡出。

- [ ] **Step 4: 快捷甩 3 反馈**

- 点击 `quickDeclare` 后，对应牌短暂金光脉冲（`HandView` 暴露 `flashCard(cardId)`），并立即发送 action。
- `HandView` 新增 `flashCard(cardId: string): void`。

- [ ] **Step 5: 验证类型**

Run: `npm run typecheck`
Expected: 退出码 0。

---

### Task 10: 斗地主插件

**Files:**
- Create: `src/client/table/rules/landlord/adapter.ts`
- Create: `src/client/table/rules/landlord/actions.ts`
- Create: `src/client/table/rules/landlord/chrome.ts`
- Create: `src/client/table/rules/landlord/layout.ts`
- Create: `src/client/table/rules/landlord/center/TrickView.ts`
- Create: `src/client/table/rules/landlord/index.ts`
- Modify: `src/client/table/registry.ts`

**Interfaces:**
- Consumes: `LandlordView`、`LandlordPublicData`、`RuleBoard`。
- Produces: `createLandlordBoard(): RuleBoard<LandlordView, LandlordCenter>`。

```ts
export type LandlordCenter = {
  kind: 'trick';
  lastPlaySeat: number | null;
  lastPlayCount: number;
  passCount: number;
  bottomCards: TableCard[];
};
```

- [ ] **Step 1: 写 `adapter.ts`**

- 座位轮转：`mySeat === null` 时 left=1、right=2；否则 `left=(mySeat+1)%3`、`right=(mySeat+2)%3`。
- `played`：仅当 `data.lastPlay` 存在时返回该组。
- `center`：`{ kind:'trick', lastPlaySeat, lastPlayCount, passCount }`。
- `chrome`：`地主 某某`（table）、自己身份「地主/农民」（self，地主 gold）、地主座位 `badge: '地主'`。
- `handMarks` 恒为空；底牌通过 chrome `placement: 'table'` 的独立标签展示「底牌 3 张」+ 小牌组（由 `LandlordTrickView` 或 `ChromeView` 渲染；本任务在 `center/TrickView` 中画底牌小牌组）。
- `statusText`：`playing` 时轮到自己「轮到你出牌」，否则「等待 {name} 出牌…」；`finished` 时「本局结束，等待房主开启下一局。」；旁观「你正在旁观这局牌。」。
- `result`：`phase === 'finished' && winnerSeat !== null` 时 `title = '本局结束'`，`lines = ['{winnerName} 获胜']`，无 scores。

- [ ] **Step 2: 写 `actions.ts`**

- `playing` 且轮到自己：次按钮「不出」，启用条件 `lastPlay !== null && lastPlay.seat !== mySeat`；主按钮「出牌 · n」，启用条件 `selected.length > 0`；action 分别为 `{type:'pass'}`、`{type:'play', cardIds}`。
- 其他情况返回空数组。

- [ ] **Step 3: 写 `chrome.ts` / `layout.ts` / `canSelect` / `validateSelection`**

- `seatCount = 3`。
- `canSelect`：`roomStatus === 'playing'` 且 `selfSeat !== null`。
- `validateSelection`：`selected.length > 0` 时 `{ ok: true, hint: '轮到你出牌' }`，否则 `{ ok: false, hint: '请选择要出的牌' }`；具体牌型由服务端裁定。

- [ ] **Step 4: 写 `center/TrickView.ts`**

- 中央显示「上一手：{name} 出 {n} 张」或「等待出牌」；`passCount > 0` 时显示「{n} 家不出」。
- 显示底牌 3 张小牌组，数据来自 `LandlordCenter.bottomCards`。
- `kind` 恒为 `trick`，无需切换。

- [ ] **Step 5: 注册**

`registry.ts` 加入 `landlord: createLandlordBoard`。

- [ ] **Step 6: 验证类型**

Run: `npm run typecheck`
Expected: 退出码 0；两种玩法都走 Phaser 牌桌。

- [ ] **Step 7: 交付给用户手动验收**

请用户确认：斗地主出牌/不出按钮可用条件与旧牌桌一致；地主标记与底牌正确；旁观者无操作按钮。

---

### Task 11: 无障碍、重连、reduced-motion 与竖屏收尾

**Files:**
- Modify: `src/client/components/game/PhaserTable.tsx`
- Modify: `src/client/table/core/TableScene.ts`
- Modify: `src/client/table/core/TableBridge.ts`
- Modify: `src/client/table/core/layout/responsive.ts`
- Modify: `src/client/table/core/views/ActionBarView.ts`
- Modify: `src/client/table/core/views/HandView.ts`

**Interfaces:**
- Consumes: `TableController.setConnected`、`onStatus`。
- Produces: 无新公共签名。

- [ ] **Step 1: `aria-live` 与键盘提示**

- `PhaserTable` 的 `aria-live` 容器接收场景状态文本（Task 6 已接）。
- 画布容器 `role="application"`、`aria-label="牌桌"`、`tabIndex={0}`；获得焦点时用主题色描边（CSS）。
- 在手牌区域补一行视觉隐藏的操作说明：「点击选牌，回车出牌，Esc 取消」。

- [ ] **Step 2: 重连态**

- `PhaserTable` 根据 `RoomSidebar` 同源的连接状态？`GameBoardProps` 没有 `status`；由 `RoomPage` 在 `status === 'reconnecting'` 时给牌桌容器加 `is-reconnecting` class 即可，不新增 prop。
- `TableScene.setConnected(false)`：在牌桌层上方加一层 `rgba(0,0,0,.25)` 遮罩（`Graphics`），`true` 时移除。

- [ ] **Step 3: reduced-motion 动态响应**

- `PhaserTable` 监听 `matchMedia('(prefers-reduced-motion: reduce)')` 的 `change`，通过 `controller.update` 之外的 `controller.setReducedMotion(value)` 传递；`TableController` 增加该方法，场景据此更新所有视图，并立即把进行中的 tween 设为终态（`scene.tweens.killAll()` + 重渲染一次）。

- [ ] **Step 4: 竖屏与紧凑布局**

- `getMetrics` 在 `height > width` 时进一步缩小：`cardW = 52`、`handOverlap = 22`、`seatRadius = 18`。
- `ActionBarView` 在紧凑布局下把按钮移到手牌右侧、竖排，避免遮挡手牌。
- `HandView` 在紧凑布局下重叠最小 14px，确保 17 张牌不超出 `width - 2 * gutter`。

- [ ] **Step 5: 验证类型**

Run: `npm run typecheck`
Expected: 退出码 0。

- [ ] **Step 6: 交付给用户手动验收**

请用户确认：开启 `prefers-reduced-motion` 后无动画但流程完整；断线重连时牌桌压暗、恢复后牌面不重复；竖屏与横屏均无横向溢出。

---

### Task 12: 删除旧牌桌并清理样式

**Files:**
- Delete: `src/client/components/game/shuaiz3/Shuaiz3Board.tsx`
- Delete: `src/client/components/game/shuaiz3/BottomReturnPanel.tsx`
- Delete: `src/client/components/game/shuaiz3/DealingOverlay.tsx`
- Delete: `src/client/components/game/shuaiz3/DeclarePanel.tsx`
- Delete: `src/client/components/game/shuaiz3/ResultOverlay.tsx`
- Delete: `src/client/components/game/shuaiz3/TrickTable.tsx`
- Delete: `src/client/components/game/shuaiz3/rules.ts`
- Delete: `src/client/components/game/landlord/LandlordBoard.tsx`
- Delete: `src/client/components/game/landlord/PlayZone.tsx`
- Delete: `src/client/components/Hand.tsx`
- Delete: `src/client/components/SeatPanel.tsx`
- Delete: `src/client/components/PlayingCard.tsx`
- Delete: `src/client/components/room/TurnMeter.tsx`
- Delete: `src/client/components/room/WinnerOverlay.tsx`
- Create: `src/client/components/lobby/LobbyCard.tsx`
- Modify: `src/client/pages/LobbyPage.tsx`
- Modify: `src/client/components/game/GameBoard.tsx`
- Modify: `src/client/styles/room.css`
- Modify: `src/client/styles.css`

**Interfaces:**
- Consumes: `Card`、`SUIT_SYMBOL`、`isRedSuit`。
- Produces: `LobbyCard({ card, faceDown, size })`，只服务大厅 hero 展示。

- [ ] **Step 1: 新建 `LobbyCard.tsx`**

- 复用现有 `PlayingCard` 的标记结构（`card-face` / `card-back` / `card-corner` / `card-center`），但只保留 `lg` 与 `faceDown` 两种形态；不带点击、选中、尺寸枚举。
- `LobbyPage` 中 `HERO_CARDS` 的渲染改为 `<LobbyCard ... />`。

- [ ] **Step 2: 简化 `GameBoard.tsx`**

- 删除 `switch` 中的旧牌桌分支，只保留：
```tsx
if (hasRuleBoard(game.ruleId)) return <PhaserTable game={game} {...rest} />;
return null;
```
- 删除对 `LandlordBoard` / `Shuaiz3Board` 的 import。

- [ ] **Step 3: 清理 CSS**

- 删除 `room.css` 中仅被旧牌桌使用的段落：`.felt-wrap`、`.felt-table`、`.seat-anchor`、`.self-dock`、`.self-side`、`.self-main`、`.hand-*`、`.action-bar`、`.quick-declare*`、`.role-chip*`、`.play-status*`、`.selected-counter`、`.table-center`、`.table-topline`、`.bottom-cards*`、`.trick-*`、`.overlay-*`、`.winner-*`、`.turn-meter*`、`.mini-card*`、`.card-button`、`.card-xs`、`.card-sm` 等。
- 保留大厅所需：`.card-face`、`.card-back`、`.card-lg`、`.card-corner*`、`.card-center`、`.card-suit`、`.card-face.is-red`、`.card-face.is-joker`、`.hero-card*`。
- 保留聊天、侧栏、顶栏、等待桌、弹窗、Toast 的样式。
- 不确定是否仍被引用的类，先用 `grep -rn "class-name" src/client` 确认再删。

- [ ] **Step 4: 全量类型检查**

Run: `npm run typecheck`
Expected: 退出码 0，无未使用 import/变量错误。

- [ ] **Step 5: 自查隔离**

Run: `grep -rn "shuaiz3\|landlord" src/client/table/core || true`
Expected: 除注释外无输出。

Run: `grep -rn "rules/shuaiz3" src/client/table/rules/landlord || true`
Expected: 无输出。

- [ ] **Step 6: 汇总交付说明**

在回复中列出：已删除文件、保留的大厅样式、需要用户手动验收的 6 条 Review Focus。

---

## 手动验收清单（交付时附给用户）

1. 甩 3：发牌逐张飞入、快捷甩 3、庄家还底（选 6 张非点牌）、领出同花色、跟牌张数校验、收墩、结算面板、房主重开。
2. 斗地主：出牌、不出、底牌展示、结算、房主重开。
3. 桌面宽屏、手机横屏、竖屏三种尺寸无溢出、无遮挡、按钮可点。
4. 断线重连：牌面恢复、选中清理、不重复发牌。
5. `prefers-reduced-motion: reduce`：无动画但可完整操作。
6. 旁观者与房主：旁观无可操作按钮；非房主看不到「再来一局」。
