import Phaser from 'phaser';
import type { GameAction, RuleId } from '../../../shared/rules/types';
import { getMetrics } from './layout';
import { computeSeatAnchors, type SeatAnchors } from './layout';
import type { CenterView, Metrics, RuleBoard } from './types';
import { THEME } from './theme';
import { registerCardTextures } from './textures';
import type {
  ActionSlot,
  TableCard,
  TableDebugSnapshot,
  TableInput,
  TableModel,
} from './types';
import { ActionBarView } from './views/hud';
import { ChromeView } from './views/table';
import { FeltView } from './views/table';
import { HandView } from './views/hand';
import { PlayedView } from './views/table';
import { ResultOverlayView } from './views/hud';
import { SeatView } from './views/seat';

export interface TableSceneData {
  resolveBoard(ruleId: RuleId): RuleBoard | null;
  onAction(action: GameAction): void;
  onRestart(): void;
  onLeave(): void;
  onStatus(text: string): void;
  reducedMotion: boolean;
  /** 设备像素比：场景坐标仍是 CSS 像素，由相机统一放大到物理像素。 */
  pixelRatio: number;
}

/** 牌桌主场景：图层容器、布局与状态协调。 */
export class TableScene extends Phaser.Scene {
  private readonly sceneData: TableSceneData;
  private readonly pixelRatio: number;
  private latestInput: TableInput | null = null;
  private pending: TableInput | null = null;
  private created = false;
  private connected = true;
  private reducedMotionFlag: boolean;

  private felt: FeltView | null = null;
  private chrome: ChromeView | null = null;
  private resultView: ResultOverlayView | null = null;
  private hand: HandView | null = null;
  private actionBar: ActionBarView | null = null;
  private playedView: PlayedView | null = null;
  private statusView: Phaser.GameObjects.Text | null = null;
  private readonly seatViews = new Map<number, SeatView>();

  private selected = new Set<string>();
  private actions: ActionSlot[] = [];
  private selectionHint = '';

  private board: RuleBoard | null = null;
  private boardRuleId: RuleId | null = null;
  private center: CenterView | null = null;
  private model: TableModel | null = null;

  private metrics: Metrics = getMetrics(1024, 768);
  private anchors: SeatAnchors = computeSeatAnchors(1024, 768, 4, this.metrics);
  private lastRenderAt = 0;
  private lastStatus = '';
  private resultSignature = '';
  private reconnectShade: Phaser.GameObjects.Rectangle | null = null;
  private reconnectText: Phaser.GameObjects.Text | null = null;

  constructor(data: TableSceneData) {
    super({ key: 'TableScene' });
    this.sceneData = data;
    this.pixelRatio = data.pixelRatio;
    this.reducedMotionFlag = data.reducedMotion;
  }

  /** 画布后备缓冲是物理像素，布局统一换算回 CSS 像素。 */
  private cssWidth(): number {
    return Math.max(1, this.scale.width / this.pixelRatio);
  }

  private cssHeight(): number {
    return Math.max(1, this.scale.height / this.pixelRatio);
  }

  create(): void {
    this.created = true;
    registerCardTextures(this);

    // 相机以左上角为原点放大到物理像素，场景内坐标保持 CSS 像素。
    this.cameras.main.setOrigin(0, 0);
    this.cameras.main.setZoom(this.pixelRatio);
    this.installTextResolution();

    const width = Math.max(320, this.cssWidth());
    const height = Math.max(240, this.cssHeight());
    this.metrics = getMetrics(width, height);
    this.anchors = computeSeatAnchors(width, height, 4, this.metrics);

    this.felt = new FeltView(this, THEME);
    this.felt.layout(width, height, this.pixelRatio);
    this.chrome = new ChromeView(this, THEME);
    this.resultView = new ResultOverlayView(
      this,
      THEME,
      {
        onRestart: () => this.sceneData.onRestart(),
        onLeave: () => this.sceneData.onLeave(),
      },
      this.pixelRatio,
    );
    this.hand = new HandView(this, THEME, this.metrics, {
      onToggle: (card) => this.toggleCard(card),
    });
    this.actionBar = new ActionBarView(this, THEME, (action) => {
      if (action.type === 'declareTrump' && typeof action.cardId === 'string') {
        this.hand?.flashCard(action.cardId);
      }
      this.sceneData.onAction(action);
    });
    this.playedView = new PlayedView(this, THEME);
    this.playedView.setReducedMotion(this.reducedMotionFlag);
    this.resultView.setReducedMotion(this.reducedMotionFlag);
    this.hand.setReducedMotion(this.reducedMotionFlag);
    this.statusView = this.add
      .text(0, 0, '', {
        fontFamily: THEME.font.body,
        fontSize: `${THEME.size.body}px`,
        color: THEME.color.mint,
        align: 'center',
        wordWrap: { width: width * 0.6 },
      })
      .setOrigin(0.5, 1)
      .setDepth(31);

    this.input.keyboard?.on('keydown-ESC', this.handleEscape, this);
    this.input.keyboard?.on('keydown-ENTER', this.handleEnter, this);

    this.scale.on('resize', this.handleResize, this);
    this.updateConnectionOverlay();

    if (this.pending) {
      const next = this.pending;
      this.pending = null;
      this.push(next);
    }
  }

  push(input: TableInput): void {
    this.latestInput = input;
    if (!this.created) {
      this.pending = input;
      return;
    }
    this.render();
  }

  setConnected(connected: boolean): void {
    this.connected = connected;
    this.updateConnectionOverlay();
  }

  setReducedMotion(value: boolean): void {
    this.reducedMotionFlag = value;
    this.tweens.killAll();
    this.hand?.setReducedMotion(value);
    this.playedView?.setReducedMotion(value);
    this.resultView?.setReducedMotion(value);
    for (const view of this.seatViews.values()) view.setReducedMotion(value);
    this.render();
  }

  isConnected(): boolean {
    return this.connected;
  }

  isReducedMotion(): boolean {
    return this.reducedMotionFlag;
  }

  currentInput(): TableInput | null {
    return this.latestInput;
  }

  options(): TableSceneData {
    return this.sceneData;
  }

  /** 文字按物理像素渲染，避免相机放大后发虚。 */
  private installTextResolution(): void {
    const factory = this.add;
    const original = factory.text.bind(factory);
    factory.text = ((x, y, text, style) =>
      original(x, y, text, {
        ...(style ?? {}),
        resolution: this.pixelRatio,
      })) as typeof factory.text;
  }

  /** 自动化测试快照：阶段、手牌坐标、按钮坐标，供 Playwright 驱动与断言。 */
  debugSnapshot(): TableDebugSnapshot | null {
    if (!this.created || !this.model) return null;
    const model = this.model;
    return {
      ready: true,
      ruleId: model.ruleId,
      phase: model.phase,
      roomStatus: model.roomStatus,
      selfSeat: model.selfSeat,
      turnSeat: model.turnSeat,
      statusText: model.statusText,
      selected: [...this.selected],
      hand: model.hand.map((card) => ({ ...card })),
      cards: this.hand?.debugRects() ?? [],
      buttons: this.actionBar?.debugRects(this.actions) ?? [],
      center: model.center,
      width: this.cssWidth(),
      height: this.cssHeight(),
      seatCount: model.seatCount,
    };
  }

  update(): void {
    if (!this.latestInput || !this.model) return;
    if (Date.now() - this.lastRenderAt < 250) return;
    this.render();
  }

  private handleResize(): void {
    if (!this.created) return;
    const width = Math.max(320, this.cssWidth());
    const height = Math.max(240, this.cssHeight());
    this.metrics = getMetrics(width, height);
    this.anchors = computeSeatAnchors(width, height, this.model?.seatCount ?? 4, this.metrics);
    this.felt?.layout(width, height, this.pixelRatio);
    this.hand?.layout(width, height, this.metrics);
    this.updateConnectionOverlay();
    this.render();
  }

  private resolveBoard(ruleId: RuleId): boolean {
    if (this.boardRuleId === ruleId && this.board) return true;

    this.center?.destroy();
    this.center = null;
    this.selected.clear();
    this.selectionHint = '';
    this.actions = [];
    this.boardRuleId = ruleId;
    this.board = this.sceneData.resolveBoard(ruleId);

    if (this.board) {
      this.center = this.board.createCenter(this, THEME);
      return true;
    }

    this.model = null;
    this.lastStatus = '';
    this.resultSignature = '';
    this.resultView?.hide();
    for (const view of this.seatViews.values()) view.destroy();
    this.seatViews.clear();
    this.chrome?.setSpecs([], this.anchors);
    return false;
  }

  private render(): void {
    const input = this.latestInput;
    if (!this.created || !input) return;

    if (!this.resolveBoard(input.game.ruleId)) return;

    const width = Math.max(320, this.cssWidth());
    const height = Math.max(240, this.cssHeight());
    this.metrics = getMetrics(width, height);

    const board = this.board;
    const center = this.center;
    if (!board || !center) return;

    const now = Date.now();
    const model = board.toModel(
      input.game,
      {
        now,
        reducedMotion: this.reducedMotionFlag,
        isHost: input.isHost,
        roomStatus: input.roomStatus,
      },
      input.seats,
      input.mySeat,
    );
    this.model = model;

    const handIds = new Set(model.hand.map((card) => card.id));
    for (const id of [...this.selected]) {
      if (!handIds.has(id)) this.selected.delete(id);
    }

    this.refreshActions(model);

    this.anchors = computeSeatAnchors(width, height, model.seatCount, this.metrics);
    this.felt?.layout(width, height, this.pixelRatio);
    this.hand?.layout(width, height, this.metrics);
    this.hand?.setCards(
      model.hand,
      this.selected,
      new Set(model.handMarks),
      (card) => board.canSelect(model, card),
    );

    const active = new Set<number>();
    for (const seat of model.seats) {
      active.add(seat.index);
      let view = this.seatViews.get(seat.index);
      if (!view) {
        view = new SeatView(this, THEME);
        view.setReducedMotion(this.reducedMotionFlag);
        this.seatViews.set(seat.index, view);
      }
      view.update(
        seat,
        this.anchors[seat.position],
        model.turnSeat === seat.index,
        this.metrics.compact,
      );
    }
    for (const [index, view] of this.seatViews) {
      if (active.has(index)) continue;
      view.destroy();
      this.seatViews.delete(index);
    }

    this.chrome?.setSpecs(model.chrome, this.anchors, this.metrics.compact);
    this.playedView?.update(
      model.played,
      model.seats,
      this.anchors,
      this.metrics,
      model.lastWinnerSeat,
      width,
      height,
    );
    this.actionBar?.update(this.actions, width, height, this.metrics);

    const resultSignature = model.result ? JSON.stringify(model.result) : '';
    if (resultSignature !== this.resultSignature) {
      this.resultSignature = resultSignature;
      if (model.result) this.resultView?.show(model.result, input.isHost);
      else this.resultView?.hide();
    }

    this.updateStatus(model);

    center.update(model, now, {
      scene: this,
      width,
      height,
      anchors: this.anchors,
      metrics: this.metrics,
      reducedMotion: this.reducedMotionFlag,
    });

    this.lastRenderAt = Date.now();
  }

  private toggleCard(card: TableCard): void {
    const model = this.model;
    const board = this.board;
    if (!model || !board || !board.canSelect(model, card)) return;

    if (this.selected.has(card.id)) this.selected.delete(card.id);
    else this.selected.add(card.id);

    this.hand?.setSelected(this.selected);
    this.refreshActions(model);
    this.updateStatus(model);
    this.updateActionBar();
  }

  private refreshActions(model: TableModel): void {
    const board = this.board;
    if (!board) {
      this.actions = [];
      this.selectionHint = '';
      return;
    }

    const selectedCards = model.hand.filter((card) => this.selected.has(card.id));
    this.actions = board.actions(model, selectedCards);
    const verdict = board.validateSelection(model, selectedCards);
    this.selectionHint = selectedCards.length > 0 && !verdict.ok ? verdict.hint : '';
  }

  private updateStatus(model: TableModel): void {
    const text = this.selectionHint || model.statusText;
    const strong = !this.selectionHint && model.statusTone === 'strong';

    if (this.statusView) {
      const width = this.cssWidth();
      const height = this.cssHeight();
      const handTop =
        height - this.metrics.cardH - (this.metrics.compact ? 22 : this.metrics.gutter);
      const hasQuick = this.actions.some((slot) => slot.key === 'quickDeclare');
      const offset = this.metrics.compact ? 52 : hasQuick ? 108 : 52;
      // 紧凑横屏的甩 3 / 还底阶段，中央已经用一行环+文字说明了状态，
      // 再挂一条同义状态就是堆提示；选牌校验提示仍然要显示。
      const centerCarriesPhase =
        this.metrics.compact &&
        !this.selectionHint &&
        (model.phase === 'declaring' || model.phase === 'returning');
      this.statusView
        .setVisible(!centerCarriesPhase)
        .setText(text)
        .setColor(strong ? THEME.color.gold.light : THEME.color.mint)
        .setWordWrapWidth(width * 0.6)
        .setPosition(width / 2, handTop - offset);
    }

    if (text === this.lastStatus) return;
    this.lastStatus = text;
    this.sceneData.onStatus(text);
  }

  private handleEscape(): void {
    if (this.selected.size === 0) return;
    this.selected.clear();
    this.hand?.setSelected(this.selected);
    if (this.model) {
      this.refreshActions(this.model);
      this.updateStatus(this.model);
      this.updateActionBar();
    }
  }

  private updateConnectionOverlay(): void {
    if (!this.created) return;
    const width = Math.max(1, this.cssWidth());
    const height = Math.max(1, this.cssHeight());

    if (this.connected) {
      this.reconnectShade?.destroy();
      this.reconnectShade = null;
      this.reconnectText?.destroy();
      this.reconnectText = null;
      return;
    }

    if (!this.reconnectShade) {
      this.reconnectShade = this.add
        .rectangle(0, 0, width, height, 0x000000, 0.42)
        .setOrigin(0)
        .setDepth(900)
        // 断线时挡住下方按钮，避免误触发送注定失败的动作。
        .setInteractive();
      this.reconnectText = this.add
        .text(width / 2, height / 2, '连接中断，正在重连…', {
          fontFamily: THEME.font.body,
          fontSize: `${THEME.size.body}px`,
          color: THEME.color.cream,
          backgroundColor: 'rgba(5,13,10,0.75)',
          padding: { x: 16, y: 8 },
        })
        .setOrigin(0.5)
        .setDepth(901);
    } else {
      this.reconnectShade.setSize(width, height);
      this.reconnectText?.setPosition(width / 2, height / 2);
    }
  }

  private updateActionBar(): void {
    this.actionBar?.update(
      this.actions,
      this.cssWidth(),
      this.cssHeight(),
      this.metrics,
    );
  }

  private handleEnter(): void {
    const slot = this.actions.find(
      (action) => action.key === 'primary' && action.enabled,
    );
    if (!slot) return;
    this.sceneData.onAction(slot.action);
  }
}
