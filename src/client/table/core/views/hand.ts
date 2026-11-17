import type Phaser from 'phaser';
import { tweenTo } from '../fx';
import { layoutHand } from '../layout';
import type { Metrics } from '../types';
import { cardTextureKey } from '../textures';
import { THEME, type Theme } from '../theme';
import type { DebugCardRect, TableCard } from '../types';

export interface HandViewOptions {
  onToggle(card: TableCard): void;
}

interface Entry {
  card: TableCard;
  container: Phaser.GameObjects.Container;
  face: Phaser.GameObjects.Image;
  shadow: Phaser.GameObjects.Image;
  mark: Phaser.GameObjects.Graphics;
  hit: Phaser.GameObjects.Rectangle;
  baseX: number;
  baseY: number;
  angle: number;
  selected: boolean;
  hovered: boolean;
  selectable: boolean;
  targetX: number;
  targetY: number;
}

function toColor(hex: string): number {
  return Number.parseInt(hex.replace('#', ''), 16);
}

/** 我的手牌：按 id 增量复用对象，选中/悬停只改变位置和层级。 */
export class HandView {
  private readonly scene: Phaser.Scene;
  private readonly theme: Theme;
  private readonly options: HandViewOptions;
  private metrics: Metrics;
  private width = 1024;
  private height = 768;
  private readonly entries = new Map<string, Entry>();
  private order: string[] = [];
  private reducedMotion = false;

  constructor(
    scene: Phaser.Scene,
    theme: Theme,
    metrics: Metrics,
    options: HandViewOptions,
  ) {
    this.scene = scene;
    this.theme = theme;
    this.metrics = metrics;
    this.options = options;
  }

  setCards(
    cards: TableCard[],
    selected: ReadonlySet<string>,
    marks: ReadonlySet<string>,
    canSelect: (card: TableCard) => boolean,
  ): void {
    const active = new Set(cards.map((card) => card.id));
    // 只有「部分牌不可选」时才需要压暗；整手都不能选（发牌/甩 3）时保持正常亮度。
    const anySelectable = cards.some((card) => canSelect(card));

    for (const card of cards) {
      let entry = this.entries.get(card.id);
      if (!entry) {
        entry = this.createEntry(card);
        this.entries.set(card.id, entry);
      }
      entry.card = card;
      entry.selected = selected.has(card.id);
      entry.selectable = canSelect(card);
      // 不能选的牌用灰度压暗，而不是半透明——透明牌叠在绿毡上会像渲染故障。
      if (anySelectable && !entry.selectable) {
        entry.face.setTint(0x8b8f8c);
      } else {
        entry.face.clearTint();
      }
      entry.container.setAlpha(1);
      if (!entry.selectable) entry.hovered = false;
      this.drawMark(entry, marks.has(card.id));
    }

    for (const [id, entry] of this.entries) {
      if (active.has(id)) continue;
      entry.container.destroy(true);
      this.entries.delete(id);
    }

    this.order = cards.map((card) => card.id);
    this.applyPositions();
  }

  setReducedMotion(value: boolean): void {
    this.reducedMotion = value;
  }

  flashCard(cardId: string): void {
    const entry = this.entries.get(cardId);
    if (!entry || this.reducedMotion) return;
    this.scene.tweens.add({
      targets: entry.container,
      scaleX: 1.12,
      scaleY: 1.12,
      duration: 120,
      yoyo: true,
      ease: 'Sine.easeInOut',
    });
  }

  setSelected(selected: ReadonlySet<string>): void {
    for (const [id, entry] of this.entries) {
      entry.selected = selected.has(id);
    }
    this.applyPositions();
  }

  /** 自动化测试：返回每张手牌在场景坐标系里的中心点。 */
  debugRects(): DebugCardRect[] {
    const rects: DebugCardRect[] = [];
    for (const id of this.order) {
      const entry = this.entries.get(id);
      if (!entry) continue;
      rects.push({
        id,
        x: entry.container.x,
        y: entry.container.y,
        w: this.metrics.cardW,
        h: this.metrics.cardH,
        selected: entry.selected,
        selectable: entry.selectable,
      });
    }
    return rects;
  }

  layout(width: number, height: number, metrics: Metrics): void {
    this.width = width;
    this.height = height;
    this.metrics = metrics;
    for (const entry of this.entries.values()) {
      entry.shadow.setDisplaySize(metrics.cardW, metrics.cardH);
      entry.face.setDisplaySize(metrics.cardW, metrics.cardH);
      entry.hit.setSize(metrics.cardW, metrics.cardH);
    }
    this.applyPositions();
  }

  destroy(): void {
    for (const entry of this.entries.values()) entry.container.destroy(true);
    this.entries.clear();
    this.order = [];
  }

  private createEntry(card: TableCard): Entry {
    const { cardW, cardH } = this.metrics;
    const shadow = this.scene.add
      .image(0, 6, 'card-shadow')
      .setDisplaySize(cardW, cardH)
      .setAlpha(0.75);
    const face = this.scene.add
      .image(0, 0, cardTextureKey(card.id))
      .setDisplaySize(cardW, cardH);
    const mark = this.scene.add.graphics();
    const hit = this.scene.add
      .rectangle(0, 0, cardW, cardH, 0x000000, 0.001)
      .setInteractive({ useHandCursor: true });

    const container = this.scene.add.container(0, 0, [shadow, face, mark, hit]);
    container.setDepth(40);

    const entry: Entry = {
      card,
      container,
      face,
      shadow,
      mark,
      hit,
      baseX: 0,
      baseY: 0,
      angle: 0,
      selected: false,
      hovered: false,
      selectable: true,
      targetX: Number.NaN,
      targetY: Number.NaN,
    };

    hit.on('pointerdown', () => {
      if (!entry.selectable) return;
      this.options.onToggle(entry.card);
    });
    hit.on('pointerover', () => {
      if (!entry.selectable) return;
      entry.hovered = true;
      this.applyPosition(entry, this.order.indexOf(entry.card.id));
    });
    hit.on('pointerout', () => {
      entry.hovered = false;
      this.applyPosition(entry, this.order.indexOf(entry.card.id));
    });

    return entry;
  }

  private drawMark(entry: Entry, marked: boolean): void {
    entry.mark.clear();
    if (!marked) return;
    entry.mark.fillStyle(toColor(this.theme.color.gold.base), 1);
    entry.mark.fillCircle(0, this.metrics.cardH / 2 - 10, 5);
    entry.mark.lineStyle(1.5, toColor(this.theme.color.gold.light), 0.9);
    entry.mark.strokeCircle(0, this.metrics.cardH / 2 - 10, 7);
  }

  private applyPositions(): void {
    const slots = layoutHand(this.order.length, this.width, this.height, this.metrics);
    this.order.forEach((id, index) => {
      const entry = this.entries.get(id);
      const slot = slots[index];
      if (!entry || !slot) return;
      entry.baseX = slot.x;
      entry.baseY = slot.y;
      entry.angle = slot.angle;
      this.applyPosition(entry, index);
    });
  }

  private applyPosition(entry: Entry, index: number): void {
    const lift = entry.selected ? 14 : entry.hovered ? 8 : 0;
    const targetY = entry.baseY - lift;
    entry.container.setAngle(entry.angle);
    entry.container.setDepth(entry.selected ? 60 + Math.max(0, index) : 40 + Math.max(0, index));

    if (this.reducedMotion) {
      entry.container.setPosition(entry.baseX, targetY);
      return;
    }

    // 新摸到的牌直接出现在牌位，避免从画布左上角 (0,0) 飞过来。
    if (Number.isNaN(entry.targetX)) {
      entry.container.setPosition(entry.baseX, targetY);
      entry.targetX = entry.baseX;
      entry.targetY = targetY;
      return;
    }

    if (entry.targetX === entry.baseX && entry.targetY === targetY) return;
    entry.targetX = entry.baseX;
    entry.targetY = targetY;

    this.scene.tweens.killTweensOf(entry.container);
    tweenTo(
      this.scene,
      entry.container,
      { x: entry.baseX, y: targetY },
      THEME.motion.fast,
      this.reducedMotion,
    );
  }
}
