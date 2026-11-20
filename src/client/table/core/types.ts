import type { Rank, Suit } from '../../../shared/cards';
import type { PublicSeat, RoomStatus } from '../../../shared/protocol';
import type Phaser from 'phaser';
import type { GameAction, PublicGameView, RuleId } from '../../../shared/rules/types';
import type { Theme } from './theme';

export type SeatPosition = 'self' | 'left' | 'top' | 'right';

export interface TableCard {
  id: string;
  rank: Rank;
  suit: Suit;
}

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

export interface PlayedGroup {
  seat: number;
  cards: TableCard[];
  /** 本轮最大的一手：整组牌描金边，兼作「下一轮由他领出」的提示。 */
  winner?: boolean;
}

export interface SelectionResult {
  ok: boolean;
  hint: string;
}

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
  /** 上一墩/上一手的赢家，用于收牌动画；无则为 null。 */
  lastWinnerSeat: number | null;
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

/** 牌桌按断点计算出的尺寸；视图层共用这一份，避免各自算一套。 */
export interface Metrics {
  compact: boolean;
  cardW: number;
  cardH: number;
  handOverlap: number;
  seatRadius: number;
  gutter: number;
}

/**
 * 自动化测试用的牌桌快照。
 *
 * 只在 URL 带 `?e2e=1` 时由 `PhaserTable` 挂到 `window.__card237`，
 * 供 Playwright 读取当前阶段、手牌坐标与按钮坐标；正常游玩不会产生任何影响。
 */
export interface DebugCardRect {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  selected: boolean;
  selectable: boolean;
}

export interface DebugButtonRect {
  key: ActionKey;
  label: string;
  enabled: boolean;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 结算面板上的按钮；供自动化验收点「再来一局」。 */
export interface DebugOverlayButton {
  key: 'restart' | 'leave';
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface TableDebugSnapshot {
  ready: boolean;
  ruleId: RuleId;
  phase: string;
  roomStatus: RoomStatus;
  selfSeat: number | null;
  turnSeat: number | null;
  statusText: string;
  selected: string[];
  hand: TableCard[];
  cards: DebugCardRect[];
  buttons: DebugButtonRect[];
  /** 当前桌面上的出牌分组，供自动化验收断言「谁出的牌在哪」。 */
  played: PlayedGroup[];
  /** 结算面板按钮；未显示结算时为 0 个。 */
  overlayButtons: DebugOverlayButton[];
  center: unknown;
  width: number;
  height: number;
  seatCount: number;
}

export interface CenterContext {
  scene: Phaser.Scene;
  width: number;
  height: number;
  anchors: Record<SeatPosition, { x: number; y: number }>;
  metrics: Metrics;
  reducedMotion: boolean;
}

/** 玩法专属的桌面中央区；核心场景只通过这个接口驱动它。 */
export interface CenterView {
  update(model: TableModel, now: number, ctx: CenterContext): void;
  destroy(): void;
}

/**
 * 玩法插件契约。
 *
 * 核心场景不认识具体玩法：所有规则差异都收敛在 `toModel` / `actions` /
 * `canSelect` / `validateSelection` 与玩法自己的 `CenterView` 里。
 */
export interface RuleBoard<
  TView extends PublicGameView = PublicGameView,
  TCenter = unknown,
> {
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
