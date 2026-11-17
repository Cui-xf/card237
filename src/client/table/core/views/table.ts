import type Phaser from 'phaser';
import { tweenTo } from '../fx';
import { cardTextureKey, registerTableTexture } from '../textures';
import { THEME, type Theme } from '../theme';
import type { ChromeSpec, Metrics, PlayedGroup, SeatPosition, TableSeat } from '../types';

/** 毡布与桌沿；整张桌面由一张程序化纹理承载。 */
export class FeltView {
  private readonly scene: Phaser.Scene;
  private image: Phaser.GameObjects.Image | null = null;
  private key: string | null = null;

  constructor(scene: Phaser.Scene, _theme: Theme) {
    this.scene = scene;
  }

  layout(width: number, height: number, pixelRatio = 1): void {
    const w = Math.max(320, Math.round(width));
    const h = Math.max(240, Math.round(height));
    // 纹理按物理像素生成，再缩回 CSS 尺寸，桌面渐变和噪点在高 DPR 屏幕上才清晰。
    const key = registerTableTexture(
      this.scene,
      Math.round(w * pixelRatio),
      Math.round(h * pixelRatio),
    );
    const previous = this.key;
    this.key = key;

    if (!this.image) {
      this.image = this.scene.add
        .image(w / 2, h / 2, key)
        .setDisplaySize(w, h)
        .setDepth(0);
    } else {
      this.image.setTexture(key).setPosition(w / 2, h / 2).setDisplaySize(w, h);
    }

    if (previous && previous !== key && this.scene.textures.exists(previous)) {
      this.scene.textures.remove(previous);
    }
  }

  destroy(): void {
    this.image?.destroy();
    this.image = null;
    if (this.key && this.scene.textures.exists(this.key)) {
      this.scene.textures.remove(this.key);
    }
    this.key = null;
  }
}

function toColor(hex: string): number {
  return Number.parseInt(hex.replace('#', ''), 16);
}

interface Chip {
  container: Phaser.GameObjects.Container;
  width: number;
}

/** 桌面上方的规则徽标；具体文案由玩法插件提供。 */
export class ChromeView {
  private readonly scene: Phaser.Scene;
  private readonly theme: Theme;
  private readonly container: Phaser.GameObjects.Container;
  private chips: Chip[] = [];
  private signature = '';

  constructor(scene: Phaser.Scene, theme: Theme) {
    this.scene = scene;
    this.theme = theme;
    this.container = scene.add.container(0, 0).setDepth(30);
  }

  setSpecs(
    specs: ChromeSpec[],
    anchors: Record<SeatPosition, { x: number; y: number }>,
    compact = false,
  ): void {
    const signature = `${JSON.stringify(specs)}|${JSON.stringify(anchors)}|${compact}`;
    if (signature === this.signature) return;
    this.signature = signature;
    this.clear();
    const tableSpecs = specs.filter((spec) => spec.placement === 'table');
    const selfSpecs = specs.filter((spec) => spec.placement === 'self');

    if (compact) {
      // 紧凑横屏：规则信息不再压在桌面左上角，收到左下角与自己座位挂件叠成一组。
      // 自己头像半径固定 16；徽标行贴在头像上方，与昵称/张数同一列。
      const dockTop = anchors.self.y - 16;
      this.placeRow([...tableSpecs, ...selfSpecs], 10, dockTop - 20, 'left');
      return;
    }

    this.placeRow(tableSpecs, anchors.self.x, 48);
    this.placeRow(selfSpecs, anchors.self.x, anchors.self.y - 96);
  }

  private placeRow(
    specs: ChromeSpec[],
    centerX: number,
    y: number,
    align: 'center' | 'left' = 'center',
  ): void {
    if (specs.length === 0) return;
    const gap = 10;
    const chips = specs.map((spec) => this.createChip(spec));
    const total =
      chips.reduce((sum, chip) => sum + chip.width, 0) + gap * (chips.length - 1);
    let cursor = align === 'left' ? centerX : centerX - total / 2;

    for (const chip of chips) {
      chip.container.setPosition(cursor + chip.width / 2, y);
      cursor += chip.width + gap;
      this.container.add(chip.container);
      this.chips.push(chip);
    }
  }

  private createChip(spec: ChromeSpec): Chip {
    const palette =
      spec.tone === 'gold'
        ? { fill: this.theme.color.gold.base, text: this.theme.color.ink, alpha: 0.95 }
        : spec.tone === 'danger'
          ? { fill: this.theme.color.danger, text: '#FFFFFF', alpha: 0.9 }
          : { fill: this.theme.color.felt.mid, text: this.theme.color.mint, alpha: 0.85 };

    const text = this.scene.add
      .text(0, 0, spec.label, {
        fontFamily: this.theme.font.body,
        fontSize: `${this.theme.size.caption}px`,
        color: palette.text,
      })
      .setOrigin(0.5);

    const width = text.width + 22;
    const background = this.scene.add.graphics();
    background.fillStyle(toColor(palette.fill), palette.alpha);
    background.fillRoundedRect(-width / 2, -12, width, 24, 12);
    background.lineStyle(1, toColor(this.theme.color.gold.base), 0.35);
    background.strokeRoundedRect(-width / 2, -12, width, 24, 12);

    const container = this.scene.add.container(0, 0, [background, text]);
    return { container, width };
  }

  private clear(): void {
    for (const chip of this.chips) chip.container.destroy(true);
    this.chips = [];
  }

  destroy(): void {
    this.clear();
    this.container.destroy(true);
    this.signature = '';
  }
}

interface GroupEntry {
  signature: string;
  container: Phaser.GameObjects.Container;
}

function signatureOf(group: PlayedGroup): string {
  return `${group.seat}:${group.cards.map((card) => card.id).join(',')}`;
}

/** 各家已出的牌，贴向各自座位；数量小时按 id 签名重建。 */
export class PlayedView {
  private readonly scene: Phaser.Scene;
  private readonly theme: Theme;
  private readonly groups = new Map<number, GroupEntry>();
  private reducedMotion = false;

  constructor(scene: Phaser.Scene, theme: Theme) {
    this.scene = scene;
    this.theme = theme;
  }

  setReducedMotion(value: boolean): void {
    this.reducedMotion = value;
  }

  update(
    played: PlayedGroup[],
    seats: TableSeat[],
    anchors: Record<SeatPosition, { x: number; y: number }>,
    metrics: Metrics,
    lastWinnerSeat: number | null = null,
    width = 1024,
    height = 768,
  ): void {
    const active = new Set<number>();
    const groups = played.filter((group) => group.cards.length > 0);

    for (const [order, group] of groups.entries()) {
      const seat = seats.find((item) => item.index === group.seat);
      if (!seat) continue;
      active.add(group.seat);

      const signature = signatureOf(group);
      let entry = this.groups.get(group.seat);
      const target = metrics.compact
        ? this.compactTarget(width, height, order, groups.length)
        : this.placeGroup(seat, anchors, metrics);

      if (!entry || entry.signature !== signature) {
        entry?.container.destroy(true);
        const origin = metrics.compact
          ? anchors[seat.position]
          : this.originFor(seat, anchors, metrics);
        const container = this.buildGroup(group, metrics);
        container.setPosition(origin.x, origin.y);
        entry = { signature, container };
        this.groups.set(group.seat, entry);
        tweenTo(
          this.scene,
          container,
          { x: target.x, y: target.y },
          THEME.motion.play,
          this.reducedMotion,
          'Cubic.easeOut',
        );
        continue;
      }

      if (this.scene.tweens.isTweening(entry.container)) continue;

      if (
        Math.abs(entry.container.x - target.x) > 0.5 ||
        Math.abs(entry.container.y - target.y) > 0.5
      ) {
        this.scene.tweens.killTweensOf(entry.container);
        tweenTo(
          this.scene,
          entry.container,
          { x: target.x, y: target.y },
          160,
          this.reducedMotion,
        );
      }
    }

    const winnerSeat =
      lastWinnerSeat === null ? null : seats.find((seat) => seat.index === lastWinnerSeat);
    const winnerAnchor = winnerSeat ? anchors[winnerSeat.position] : null;

    for (const [seat, entry] of this.groups) {
      if (active.has(seat)) continue;
      this.groups.delete(seat);

      if (winnerAnchor && !this.reducedMotion) {
        this.scene.tweens.add({
          targets: entry.container,
          x: winnerAnchor.x,
          y: winnerAnchor.y,
          scaleX: 0.2,
          scaleY: 0.2,
          alpha: 0,
          duration: THEME.motion.collect,
          ease: 'Cubic.easeIn',
          onComplete: () => entry.container.destroy(true),
        });
      } else {
        entry.container.destroy(true);
      }
    }
  }

  private originFor(
    seat: TableSeat,
    anchors: Record<SeatPosition, { x: number; y: number }>,
    metrics: Metrics,
  ): { x: number; y: number } {
    const anchor = anchors[seat.position];
    if (seat.position === 'self') {
      return { x: anchor.x, y: anchor.y - metrics.cardH * 0.9 };
    }
    return { x: anchor.x, y: anchor.y };
  }

  destroy(): void {
    for (const entry of this.groups.values()) entry.container.destroy(true);
    this.groups.clear();
  }

  /** 紧凑横屏：所有出牌按先后顺序排成中间一行，避免围着一圈互相压住。 */
  private compactTarget(
    width: number,
    height: number,
    index: number,
    count: number,
  ): { x: number; y: number } {
    const slot = Math.min(150, (width - 180) / Math.max(1, count));
    return {
      x: width / 2 + (index - (count - 1) / 2) * slot,
      y: height * 0.41,
    };
  }

  private buildGroup(group: PlayedGroup, metrics: Metrics): Phaser.GameObjects.Container {
    const cardW = Math.round(metrics.cardW * (metrics.compact ? 0.58 : 0.62));
    const cardH = Math.round(cardW * 1.5);
    const gap = Math.round(cardW * 0.45);
    const shown = group.cards.slice(0, 8);
    const total = cardW + gap * Math.max(0, shown.length - 1);
    const container = this.scene.add.container(0, 0).setDepth(26);

    shown.forEach((card, index) => {
      const image = this.scene.add
        .image(-total / 2 + cardW / 2 + index * gap, 0, cardTextureKey(card.id))
        .setDisplaySize(cardW, cardH);
      container.add(image);
    });

    if (group.cards.length > shown.length) {
      const more = this.scene.add
        .text(total / 2 + 14, 0, `+${group.cards.length - shown.length}`, {
          fontFamily: this.theme.font.num,
          fontSize: '13px',
          color: this.theme.color.gold.light,
        })
        .setOrigin(0.5);
      container.add(more);
    }

    return container;
  }

  private placeGroup(
    seat: TableSeat,
    anchors: Record<SeatPosition, { x: number; y: number }>,
    metrics: Metrics,
  ): { x: number; y: number } {
    const anchor = anchors[seat.position];
    const offset = metrics.seatRadius + metrics.cardW * 0.5;

    switch (seat.position) {
      case 'left':
        return { x: anchor.x + offset, y: anchor.y };
      case 'right':
        return { x: anchor.x - offset, y: anchor.y };
      case 'top':
        return { x: anchor.x, y: anchor.y + offset };
      case 'self':
        return { x: anchor.x, y: anchor.y - metrics.cardH * 1.15 };
    }
  }
}
