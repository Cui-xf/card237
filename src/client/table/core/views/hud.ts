import type Phaser from 'phaser';
import type { GameAction } from '../../../../shared/rules/types';
import { tweenTo } from '../fx';
import { THEME, type Theme } from '../theme';
import type {
  ActionSlot,
  DebugButtonRect,
  DebugOverlayButton,
  Metrics,
  ResultModel,
} from '../types';

function toColor(hex: string): number {
  return Number.parseInt(hex.replace('#', ''), 16);
}

/** 主/次操作与快捷甩牌按钮。 */
export class ActionBarView {
  private readonly scene: Phaser.Scene;
  private readonly theme: Theme;
  private readonly onAction: (action: GameAction) => void;
  private readonly container: Phaser.GameObjects.Container;
  private items: Phaser.GameObjects.Container[] = [];
  private signature = '';

  constructor(
    scene: Phaser.Scene,
    theme: Theme,
    onAction: (action: GameAction) => void,
  ) {
    this.scene = scene;
    this.theme = theme;
    this.onAction = onAction;
    this.container = scene.add.container(0, 0).setDepth(70);
  }

  update(actions: ActionSlot[], width: number, height: number, metrics: Metrics): void {
    const signature = actions
      .map(
        (slot) =>
          `${slot.key}|${slot.label}|${slot.enabled}|${slot.suit ?? ''}|${slot.rank ?? ''}|${JSON.stringify(slot.action)}`,
      )
      .join('||');

    if (signature !== this.signature) {
      this.rebuild(actions);
      this.signature = signature;
    }

    this.layoutActions(actions, width, height, metrics);
  }

  /** 自动化测试：返回当前可见按钮在场景坐标系里的中心点。 */
  debugRects(actions: ActionSlot[]): DebugButtonRect[] {
    const rects: DebugButtonRect[] = [];
    this.items.forEach((item, index) => {
      const slot = actions[index];
      if (!slot || !item.visible) return;
      rects.push({
        key: slot.key,
        label: slot.label,
        enabled: slot.enabled,
        x: item.x,
        y: item.y,
        w: (item.getData('width') as number) ?? 44,
        h: 44,
      });
    });
    return rects;
  }

  destroy(): void {
    this.clear();
    this.container.destroy(true);
  }

  private rebuild(actions: ActionSlot[]): void {
    this.clear();
    for (const slot of actions) {
      const item =
        slot.key === 'quickDeclare'
          ? this.createQuickButton(slot)
          : this.createPillButton(slot);
      item.setVisible(false);
      this.container.add(item);
      this.items.push(item);
    }
  }

  private layoutActions(
    actions: ActionSlot[],
    width: number,
    height: number,
    metrics: Metrics,
  ): void {
    const handTop = height - metrics.cardH - (metrics.compact ? 22 : metrics.gutter);
    const gutter = metrics.gutter;
    const gap = 10;

    if (metrics.compact) {
      // 紧凑横屏：所有按钮排成一行，压在手牌正上方，不侵占中央牌局区。
      const entries: { item: Phaser.GameObjects.Container; width: number }[] = [];
      this.items.forEach((item, index) => {
        const slot = actions[index];
        if (!slot) return;
        entries.push({ item, width: item.getData('width') as number });
      });

      const total =
        entries.reduce((sum, entry) => sum + entry.width, 0) +
        gap * Math.max(0, entries.length - 1);
      let cursor = width / 2 - total / 2;
      for (const entry of entries) {
        entry.item.setPosition(cursor + entry.width / 2, handTop - 28).setVisible(true);
        cursor += entry.width + gap;
      }
      return;
    }

    const pills: { item: Phaser.GameObjects.Container; width: number }[] = [];
    const quicks: { item: Phaser.GameObjects.Container; width: number }[] = [];

    this.items.forEach((item, index) => {
      const slot = actions[index];
      if (!slot) return;
      if (slot.key === 'quickDeclare') quicks.push({ item, width: 44 });
      else pills.push({ item, width: item.getData('width') as number });
    });

    // 宽屏：贴右手牌架上方，从右往左排。
    let cursorX = width - gutter;
    for (let index = pills.length - 1; index >= 0; index -= 1) {
      const pill = pills[index];
      if (!pill) continue;
      pill.item.setPosition(cursorX - pill.width / 2, handTop - 26).setVisible(true);
      cursorX -= pill.width + gap;
    }

    if (quicks.length > 0) {
      const rowWidth = quicks.reduce((sum, quick) => sum + quick.width, 0) + gap * (quicks.length - 1);
      let x = width / 2 - rowWidth / 2 + quicks[0]!.width / 2;
      const y = pills.length > 0 ? handTop - 74 : handTop - 30;
      for (const quick of quicks) {
        quick.item.setPosition(x, y).setVisible(true);
        x += quick.width + gap;
      }
    }
  }

  private createPillButton(slot: ActionSlot): Phaser.GameObjects.Container {
    const primary = slot.key === 'primary';
    const text = this.scene.add
      .text(0, 0, slot.label, {
        fontFamily: this.theme.font.body,
        fontSize: `${this.theme.size.button}px`,
        color: primary ? this.theme.color.ink : this.theme.color.cream,
      })
      .setOrigin(0.5);

    const width = Math.max(96, text.width + 32);
    const height = 44;
    const background = this.scene.add.graphics();
    background.fillStyle(
      toColor(primary ? this.theme.color.gold.base : this.theme.color.felt.edge),
      primary ? 1 : 0.92,
    );
    background.fillRoundedRect(-width / 2, -height / 2, width, height, height / 2);
    background.lineStyle(
      1.5,
      toColor(this.theme.color.gold.base),
      primary ? 0 : 0.7,
    );
    background.strokeRoundedRect(-width / 2, -height / 2, width, height, height / 2);

    const hit = this.scene.add
      .rectangle(0, 0, width, height, 0x000000, 0.001)
      .setInteractive({ useHandCursor: true });
    hit.on('pointerdown', () => {
      if (slot.enabled) this.onAction(slot.action);
    });

    const container = this.scene.add.container(0, 0, [background, text, hit]);
    container.setData('width', width);
    if (!slot.enabled) container.setAlpha(0.55);
    return container;
  }

  private createQuickButton(slot: ActionSlot): Phaser.GameObjects.Container {
    const red =
      slot.suit === 'heart' || slot.suit === 'diamond';
    const color = red ? this.theme.color.suit.red : this.theme.color.suit.black;

    const background = this.scene.add.graphics();
    background.fillStyle(toColor(this.theme.color.ivory), 0.96);
    background.fillRoundedRect(-22, -22, 44, 44, 10);
    background.lineStyle(1.5, toColor(this.theme.color.gold.base), 0.8);
    background.strokeRoundedRect(-22, -22, 44, 44, 10);

    const rank = this.scene.add
      .text(0, 4, slot.rank ?? '3', {
        fontFamily: this.theme.font.num,
        fontSize: '22px',
        fontStyle: 'bold',
        color,
      })
      .setOrigin(0.5);
    const suit = this.scene.add
      .text(0, -12, slot.suit === 'heart' ? '♥' : slot.suit === 'diamond' ? '♦' : slot.suit === 'club' ? '♣' : '♠', {
        fontFamily: this.theme.font.num,
        fontSize: '14px',
        color,
      })
      .setOrigin(0.5);

    const hit = this.scene.add
      .rectangle(0, 0, 44, 44, 0x000000, 0.001)
      .setInteractive({ useHandCursor: true });
    hit.on('pointerdown', () => {
      if (slot.enabled) this.onAction(slot.action);
    });

    const container = this.scene.add.container(0, 0, [background, suit, rank, hit]);
    container.setData('width', 44);
    if (!slot.enabled) container.setAlpha(0.55);
    return container;
  }

  private clear(): void {
    for (const item of this.items) item.destroy(true);
    this.items = [];
    this.signature = '';
  }
}

interface Handlers {
  onRestart(): void;
  onLeave(): void;
}

/** 结算面板：通用，两套玩法共用。 */
export class ResultOverlayView {
  private readonly scene: Phaser.Scene;
  private readonly theme: Theme;
  private readonly handlers: Handlers;
  private readonly layer: Phaser.GameObjects.Container;
  private shade: Phaser.GameObjects.Rectangle | null = null;
  private panel: Phaser.GameObjects.Container | null = null;
  private result: ResultModel | null = null;
  private isHost = false;
  private reducedMotion = false;
  private tweens: Phaser.Tweens.Tween[] = [];
  private buttonRects: DebugOverlayButton[] = [];

  private readonly pixelRatio: number;

  constructor(
    scene: Phaser.Scene,
    theme: Theme,
    handlers: Handlers,
    pixelRatio = 1,
  ) {
    this.scene = scene;
    this.theme = theme;
    this.handlers = handlers;
    this.pixelRatio = pixelRatio;
    this.layer = scene.add.container(0, 0).setDepth(1000).setVisible(false);
    scene.scale.on('resize', this.handleResize, this);
  }

  setReducedMotion(value: boolean): void {
    this.reducedMotion = value;
  }

  show(result: ResultModel, isHost: boolean): void {
    this.result = result;
    this.isHost = isHost;
    this.layer.setVisible(true);
    this.rebuild();
  }

  hide(): void {
    this.result = null;
    this.layer.setVisible(false);
    this.shade?.destroy();
    this.shade = null;
    this.panel?.destroy(true);
    this.panel = null;
    this.buttonRects = [];
  }

  /** 自动化测试：结算面板按钮的场景坐标；面板未显示时为空。 */
  debugRects(): DebugOverlayButton[] {
    return this.result ? this.buttonRects.map((rect) => ({ ...rect })) : [];
  }

  destroy(): void {
    this.scene.scale.off('resize', this.handleResize, this);
    this.hide();
    this.layer.destroy(true);
  }

  private handleResize(): void {
    if (this.result) this.rebuild();
  }

  private rebuild(): void {
    const result = this.result;
    if (!result) return;

    for (const tween of this.tweens) tween.remove();
    this.tweens = [];
    this.shade?.destroy();
    this.panel?.destroy(true);
    this.buttonRects = [];

    const width = this.scene.scale.width / this.pixelRatio;
    const height = this.scene.scale.height / this.pixelRatio;

    this.shade = this.scene.add
      .rectangle(0, 0, Math.max(1, width), Math.max(1, height), 0x000000, 0.62)
      .setOrigin(0)
      .setInteractive();
    this.layer.add(this.shade);

    const compact = height < 520;
    const panelWidth = Math.min(compact ? 430 : 420, width - 32);
    const lineHeight = compact ? 20 : 22;
    const scoreRow = compact ? 22 : 24;
    const scoreRows = result.scores?.length ?? 0;
    const panelHeight = Math.min(
      height - (compact ? 24 : 40),
      (compact ? 132 : 150) +
        result.lines.length * lineHeight +
        scoreRows * scoreRow +
        56,
    );

    const panel = this.scene.add.container(width / 2, height / 2);
    const background = this.scene.add.graphics();
    background.fillStyle(toColor(this.theme.color.felt.mid), 0.97);
    background.fillRoundedRect(-panelWidth / 2, -panelHeight / 2, panelWidth, panelHeight, 18);
    background.lineStyle(2, toColor(this.theme.color.gold.base), 0.7);
    background.strokeRoundedRect(-panelWidth / 2, -panelHeight / 2, panelWidth, panelHeight, 18);
    panel.add(background);

    const title = this.scene.add
      .text(0, -panelHeight / 2 + (compact ? 26 : 30), result.title, {
        fontFamily: this.theme.font.body,
        fontSize: `${this.theme.size.title}px`,
        fontStyle: 'bold',
        color: this.theme.color.gold.light,
      })
      .setOrigin(0.5);
    panel.add(title);

    let cursor = -panelHeight / 2 + (compact ? 62 : 68);
    for (const line of result.lines) {
      const text = this.scene.add
        .text(0, cursor, line, {
          fontFamily: this.theme.font.body,
          fontSize: `${this.theme.size.body}px`,
          color: this.theme.color.cream,
          align: 'center',
          wordWrap: { width: panelWidth - 48 },
        })
        .setOrigin(0.5);
      panel.add(text);
      cursor += lineHeight;
    }

    for (const row of result.scores ?? []) {
      const label = `${row.name}    `;
      const text = this.scene.add
        .text(0, cursor, this.reducedMotion ? `${label}${row.score}` : `${label}0`, {
          fontFamily: this.theme.font.num,
          fontSize: `${this.theme.size.body}px`,
          color: this.theme.color.gold.base,
        })
        .setOrigin(0.5);
      panel.add(text);
      cursor += scoreRow;

      if (!this.reducedMotion) {
        const counter = { value: 0 };
        const tween = this.scene.tweens.add({
          targets: counter,
          value: row.score,
          duration: THEME.motion.result,
          ease: 'Cubic.easeOut',
          onUpdate: () => text.setText(`${label}${Math.round(counter.value)}`),
        });
        this.tweens.push(tween);
      }
    }

    const buttonY = panelHeight / 2 - (compact ? 32 : 36);
    const buttons: {
      key: DebugOverlayButton['key'];
      label: string;
      onClick: () => void;
      primary: boolean;
    }[] = [];
    if (this.isHost) {
      buttons.push({
        key: 'restart',
        label: '再来一局',
        onClick: () => this.handlers.onRestart(),
        primary: true,
      });
    }
    buttons.push({
      key: 'leave',
      label: '离开牌桌',
      onClick: () => this.handlers.onLeave(),
      primary: false,
    });

    const buttonWidth = 128;
    const gap = 14;
    const totalWidth = buttons.length * buttonWidth + (buttons.length - 1) * gap;
    let x = -totalWidth / 2 + buttonWidth / 2;

    for (const item of buttons) {
      const button = this.createButton(item.label, item.onClick, item.primary, buttonWidth);
      button.setPosition(x, buttonY);
      panel.add(button);
      this.buttonRects.push({
        key: item.key,
        label: item.label,
        x: width / 2 + x,
        y: height / 2 + buttonY,
        w: buttonWidth,
        h: 44,
      });
      x += buttonWidth + gap;
    }

    this.panel = panel;
    this.layer.add(panel);

    if (this.reducedMotion) {
      panel.setAlpha(1).setScale(1);
    } else {
      panel.setAlpha(0).setScale(0.92);
      const tween = tweenTo(
        this.scene,
        panel,
        { alpha: 1, scaleX: 1, scaleY: 1 },
        THEME.motion.result,
        false,
        'Back.easeOut',
      );
      if (tween) this.tweens.push(tween);
    }
  }

  private createButton(
    label: string,
    onClick: () => void,
    primary: boolean,
    width: number,
  ): Phaser.GameObjects.Container {
    const height = 44;
    const background = this.scene.add.graphics();
    background.fillStyle(
      toColor(primary ? this.theme.color.gold.base : this.theme.color.felt.edge),
      1,
    );
    background.fillRoundedRect(-width / 2, -height / 2, width, height, height / 2);
    background.lineStyle(1.5, toColor(this.theme.color.gold.base), primary ? 0 : 0.6);
    background.strokeRoundedRect(-width / 2, -height / 2, width, height, height / 2);

    const text = this.scene.add
      .text(0, 0, label, {
        fontFamily: this.theme.font.body,
        fontSize: `${this.theme.size.button}px`,
        color: primary ? this.theme.color.ink : this.theme.color.cream,
      })
      .setOrigin(0.5);

    const hit = this.scene.add
      .rectangle(0, 0, width, height, 0x000000, 0.001)
      .setInteractive({ useHandCursor: true });
    hit.on('pointerdown', onClick);

    return this.scene.add.container(0, 0, [background, text, hit]);
  }
}
