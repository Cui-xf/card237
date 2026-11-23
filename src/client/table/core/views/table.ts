import type Phaser from 'phaser';
import { tweenTo } from '../fx';
import { cardTextureKey, registerTableTexture } from '../textures';
import { THEME, type Theme } from '../theme';
import type {
  ChromeSpec,
  Metrics,
  PlayedGroup,
  SeatPosition,
  TableCard,
  TableSeat,
} from '../types';

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
    width: number,
    height: number,
    compact = false,
  ): void {
    const signature = `${JSON.stringify(specs)}|${JSON.stringify(anchors)}|${width}x${height}|${compact}`;
    if (signature === this.signature) return;
    this.signature = signature;
    this.clear();
    const tableSpecs = specs.filter((spec) => spec.placement === 'table');
    const selfSpecs = specs.filter((spec) => spec.placement === 'self');

    if (compact) {
      // 紧凑横屏左侧被座位和自己挂件占满，再放徽标一定压到桌沿；
      // 改放右侧空白区，右缘留出「桌沿 28 + 10」的安全边距。
      this.placeColumn(
        [...tableSpecs, ...selfSpecs],
        width - 38,
        height * 0.58 + 12,
        'right',
      );
      return;
    }

    this.placeRow(tableSpecs, anchors.self.x, 48);
    this.placeRow(selfSpecs, anchors.self.x, anchors.self.y - 96);
  }

  /** 紧凑布局用：同一列自下而上叠放，最后一张贴着 bottomY；x 为对齐边。 */
  private placeColumn(
    specs: ChromeSpec[],
    x: number,
    bottomY: number,
    align: 'left' | 'right' = 'left',
  ): void {
    if (specs.length === 0) return;
    const chipHeight = 24;
    const gap = 4;
    let cursor = bottomY;

    for (let index = specs.length - 1; index >= 0; index -= 1) {
      const spec = specs[index];
      if (!spec) continue;
      const chip = this.createChip(spec);
      const centerX = align === 'left' ? x + chip.width / 2 : x - chip.width / 2;
      chip.container.setPosition(centerX, cursor - chipHeight / 2);
      cursor -= chipHeight + gap;
      this.container.add(chip.container);
      this.chips.push(chip);
    }
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

/** 打小亮牌时，多余大牌飞回座位的时长。 */
const COLLECT_MS = 420;

interface AttemptState {
  /** 本次尝试的牌 id 串，用来识别「同一次甩牌」。 */
  key: string;
  startedAt: number;
  holdMs: number;
  cards: TableCard[];
}

interface BuiltGroup {
  container: Phaser.GameObjects.Container;
  border: Phaser.GameObjects.Graphics;
  frame: { width: number; height: number } | null;
  images: Map<string, Phaser.GameObjects.Image>;
  banner: Phaser.GameObjects.Container | null;
}

interface GroupEntry extends BuiltGroup {
  signature: string;
  /** 赢家金边；显隐单独更新，避免同一手牌被重建而重复飞入。 */
  winner: boolean;
  /** 正在亮出的打小尝试；收起后清空。 */
  attempt: AttemptState | null;
  /** 已经收起过的尝试，避免服务端状态重复下发时重新展开。 */
  collapsedAttempt: string | null;
  /** 收起动画进行中：期间不再跟随新的牌面状态。 */
  collapsing: boolean;
}

/** 紧凑横屏的出牌缩略尺寸：比手牌小一档，但要能看清牌面。 */
const COMPACT_PLAYED_SCALE = 0.72;
const COMPACT_PLAYED_MAX_SHOWN = 6;
const PLAYED_MAX_SHOWN = 8;

/** 出牌组的牌面尺寸：落位宽度和实际绘制必须同源，否则贴边会算错。 */
function playedCardMetrics(metrics: Metrics): {
  cardW: number;
  cardH: number;
  gap: number;
  maxShown: number;
} {
  const cardW = Math.round(
    metrics.cardW * (metrics.compact ? COMPACT_PLAYED_SCALE : 0.62),
  );
  return {
    cardW,
    cardH: Math.round(cardW * 1.5),
    gap: Math.round(cardW * 0.45),
    maxShown: metrics.compact ? COMPACT_PLAYED_MAX_SHOWN : PLAYED_MAX_SHOWN,
  };
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
    const now = Date.now();

    for (const group of groups) {
      const seat = seats.find((item) => item.index === group.seat);
      if (!seat) continue;
      active.add(group.seat);

      const existing = this.groups.get(group.seat);
      // 收起动画播放期间以动画为准，避免新状态把正在飞回的牌重建掉。
      if (existing?.collapsing) continue;

      const target = metrics.compact
        ? this.compactSeatTarget(group, seat, anchors, metrics, width, height)
        : this.placeGroup(seat, anchors, metrics);
      const origin = metrics.compact
        ? anchors[seat.position]
        : this.originFor(seat, anchors, metrics);

      // 已经完整亮出的打小尝试：保持到时长结束再收起大牌。
      if (existing?.attempt) {
        if (now - existing.attempt.startedAt >= existing.attempt.holdMs) {
          this.collapseAttempt(existing, group, seat, anchors, metrics, target);
        }
        continue;
      }

      const attempt = group.attempted;
      const attemptKey =
        attempt && attempt.cards.length > group.cards.length
          ? attempt.cards.map((card) => card.id).join(',')
          : null;
      const showAttempt =
        attemptKey !== null && existing?.collapsedAttempt !== attemptKey;

      const displayCards = showAttempt && attempt ? attempt.cards : group.cards;
      const signature = `${group.seat}:${showAttempt ? 'attempt' : 'play'}:${displayCards
        .map((card) => card.id)
        .join(',')}`;

      if (!existing || existing.signature !== signature) {
        existing?.container.destroy(true);
        const built = this.buildGroup(
          displayCards,
          new Set(group.cards.map((card) => card.id)),
          showAttempt,
          metrics,
        );
        built.container.setPosition(origin.x, origin.y);
        const entry: GroupEntry = {
          signature,
          ...built,
          winner: group.winner === true,
          attempt:
            showAttempt && attempt
              ? {
                  key: attemptKey ?? '',
                  startedAt: now,
                  holdMs: attempt.holdMs,
                  cards: attempt.cards,
                }
              : null,
          collapsedAttempt: existing?.collapsedAttempt ?? null,
          collapsing: false,
        };
        this.paintWinner(entry);
        this.groups.set(group.seat, entry);
        tweenTo(
          this.scene,
          entry.container,
          { x: target.x, y: target.y },
          THEME.motion.play,
          this.reducedMotion,
          'Cubic.easeOut',
        );
        if (entry.attempt) this.presentAttempt(entry);
        continue;
      }

      if (existing.winner !== (group.winner === true)) {
        existing.winner = group.winner === true;
        this.paintWinner(existing);
      }

      if (this.scene.tweens.isTweening(existing.container)) continue;

      if (
        Math.abs(existing.container.x - target.x) > 0.5 ||
        Math.abs(existing.container.y - target.y) > 0.5
      ) {
        this.scene.tweens.killTweensOf(existing.container);
        tweenTo(
          this.scene,
          existing.container,
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

      if (winnerAnchor && !this.reducedMotion && !entry.collapsing) {
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
        this.destroyEntry(entry);
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
    for (const entry of this.groups.values()) this.destroyEntry(entry);
    this.groups.clear();
  }

  /**
   * 紧凑横屏：出牌贴在出牌者座位旁边，谁出的牌就在谁跟前。
   *
   * 中央留给「对家 + 自己」这一对对位：对家的牌偏左上、自己的牌偏右下，
   * 对角错开，中间不再空一大块；左右两家的牌贴着各自头像放大展示。
   */
  private compactSeatTarget(
    group: PlayedGroup,
    seat: TableSeat,
    anchors: Record<SeatPosition, { x: number; y: number }>,
    metrics: Metrics,
    width: number,
    height: number,
  ): { x: number; y: number } {
    const anchor = anchors[seat.position];
    const { cardW, cardH, gap, maxShown } = playedCardMetrics(metrics);
    const shown = Math.min(group.cards.length, maxShown);
    const total = cardW + gap * Math.max(0, shown - 1);
    // 与 SeatView 紧凑头像半径、桌沿内缩保持一致。
    const radius = 16;
    const pad = 12;
    const rim = 28;
    // 左右两家的牌下移到头像文字之下，别和昵称挤在一行。
    const sideY = anchor.y + 44;

    switch (seat.position) {
      case 'top':
        // 对家偏左、略靠上，避开顶部的昵称与张数。
        return {
          x: Math.min(
            Math.max(width * 0.38, rim + total / 2),
            width / 2 - 62 - total / 2,
          ),
          y: height * 0.32,
        };
      case 'left':
        return { x: anchor.x + radius + pad + total / 2, y: sideY };
      case 'right':
        return { x: anchor.x - radius - pad - total / 2, y: sideY };
      case 'self':
        // 自己的牌偏右，落在出牌按钮右上方：按钮与牌面完全错开。
        return {
          x: Math.min(
            width * 0.65,
            width - rim - total / 2,
          ),
          // 不超过手牌上沿，避免小屏上压到手牌。
          y: Math.min(
            height * 0.54,
            height - metrics.cardH - 22 - cardH / 2 - 6,
          ),
        };
    }
  }

  /**
   * 构建一手牌。
   *
   * `showAttempt` 为真时展示的是打小前尝试打出的全部牌：
   * 最终会被收回的大牌标红，并在牌组上方挂「甩牌被打小」横幅。
   */
  private buildGroup(
    cards: TableCard[],
    keepIds: Set<string>,
    showAttempt: boolean,
    metrics: Metrics,
  ): BuiltGroup {
    const { cardW, cardH, gap, maxShown } = playedCardMetrics(metrics);
    const shown = cards.slice(0, maxShown);
    const total = cardW + gap * Math.max(0, shown.length - 1);
    const container = this.scene.add.container(0, 0).setDepth(26);
    // 金边垫在牌下面，显隐由 paintWinner 控制。
    const border = this.scene.add.graphics();
    container.add(border);

    const images = new Map<string, Phaser.GameObjects.Image>();
    shown.forEach((card, index) => {
      const image = this.scene.add
        .image(-total / 2 + cardW / 2 + index * gap, 0, cardTextureKey(card.id))
        .setDisplaySize(cardW, cardH);
      if (showAttempt && !keepIds.has(card.id)) {
        // 打小后会被退回手牌的大牌：标红，围观时一眼能看出它们留不住。
        image.setTint(toColor(this.theme.color.danger));
      }
      images.set(card.id, image);
      container.add(image);
    });

    if (cards.length > shown.length) {
      const more = this.scene.add
        .text(total / 2 + 14, 0, `+${cards.length - shown.length}`, {
          fontFamily: this.theme.font.num,
          fontSize: '13px',
          color: this.theme.color.gold.light,
        })
        .setOrigin(0.5);
      container.add(more);
    }

    const banner = showAttempt
      ? this.buildReduceBanner(cards.length - keepIds.size, cardH)
      : null;
    if (banner) container.add(banner);

    return {
      container,
      border,
      frame: shown.length > 0 ? { width: total, height: cardH } : null,
      images,
      banner,
    };
  }

  private buildReduceBanner(
    recallCount: number,
    cardH: number,
  ): Phaser.GameObjects.Container {
    const label = this.scene.add
      .text(0, 0, `甩牌被打小 · 收回 ${recallCount} 张`, {
        fontFamily: this.theme.font.body,
        fontSize: `${this.theme.size.caption}px`,
        color: this.theme.color.ivory,
      })
      .setOrigin(0.5);

    const width = label.width + 20;
    const height = 24;
    const background = this.scene.add.graphics();
    background.fillStyle(toColor(this.theme.color.danger), 0.92);
    background.fillRoundedRect(-width / 2, -height / 2, width, height, height / 2);
    background.lineStyle(1.5, toColor(this.theme.color.gold.light), 0.9);
    background.strokeRoundedRect(-width / 2, -height / 2, width, height, height / 2);

    return this.scene.add
      .container(0, -cardH / 2 - 18, [background, label])
      .setScale(0.6)
      .setAlpha(0);
  }

  /** 横幅弹入并持续脉动，保证其他玩家的视线被拉过去。 */
  private presentAttempt(entry: GroupEntry): void {
    const banner = entry.banner;
    if (!banner) return;

    if (this.reducedMotion) {
      banner.setScale(1).setAlpha(1);
      return;
    }

    this.scene.tweens.add({
      targets: banner,
      scaleX: 1,
      scaleY: 1,
      alpha: 1,
      duration: 240,
      ease: 'Back.easeOut',
    });
    this.scene.tweens.add({
      targets: banner,
      scaleX: 1.07,
      scaleY: 1.07,
      duration: 620,
      yoyo: true,
      repeat: -1,
      delay: 240,
      ease: 'Sine.easeInOut',
    });
  }

  /**
   * 亮牌结束：多余的大牌飞回出牌者座位并淡出，桌上只留下真正打出的小牌。
   */
  private collapseAttempt(
    entry: GroupEntry,
    group: PlayedGroup,
    seat: TableSeat,
    anchors: Record<SeatPosition, { x: number; y: number }>,
    metrics: Metrics,
    target: { x: number; y: number },
  ): void {
    const attempt = entry.attempt;
    if (!attempt) return;
    entry.collapsing = true;

    const finish = () => {
      if (this.groups.get(group.seat) !== entry) return;

      const keepIds = new Set(group.cards.map((card) => card.id));
      const built = this.buildGroup(group.cards, keepIds, false, metrics);
      built.container.setPosition(target.x, target.y);
      const next: GroupEntry = {
        signature: `${group.seat}:play:${group.cards.map((card) => card.id).join(',')}`,
        ...built,
        winner: group.winner === true,
        attempt: null,
        collapsedAttempt: attempt.key,
        collapsing: false,
      };

      this.destroyEntry(entry);
      this.paintWinner(next);
      next.container.setAlpha(0);
      tweenTo(
        this.scene,
        next.container,
        { alpha: 1 },
        200,
        this.reducedMotion,
        'Sine.easeOut',
      );
      this.groups.set(group.seat, next);
    };

    if (this.reducedMotion) {
      finish();
      return;
    }

    if (entry.banner) {
      this.scene.tweens.killTweensOf(entry.banner);
      this.scene.tweens.add({
        targets: entry.banner,
        alpha: 0,
        scaleX: 0.7,
        scaleY: 0.7,
        duration: 220,
        ease: 'Cubic.easeIn',
      });
    }

    const anchor = anchors[seat.position];
    const origin = metrics.compact
      ? { x: anchor.x, y: anchor.y }
      : this.originFor(seat, anchors, metrics);
    const keepIds = new Set(group.cards.map((card) => card.id));

    for (const card of attempt.cards) {
      if (keepIds.has(card.id)) continue;
      const image = entry.images.get(card.id);
      if (!image) continue;
      this.scene.tweens.add({
        targets: image,
        x: origin.x - entry.container.x,
        y: origin.y - entry.container.y,
        scaleX: 0.2,
        scaleY: 0.2,
        alpha: 0,
        duration: COLLECT_MS,
        ease: 'Cubic.easeIn',
      });
    }

    this.scene.time.delayedCall(COLLECT_MS + 20, finish);
  }

  private destroyEntry(entry: GroupEntry): void {
    this.scene.tweens.killTweensOf(entry.container);
    for (const image of entry.images.values()) {
      this.scene.tweens.killTweensOf(image);
    }
    if (entry.banner) this.scene.tweens.killTweensOf(entry.banner);
    entry.container.destroy(true);
  }

  /** 本轮最大的一手：整组牌描一圈金边并垫一层淡金底。 */
  private paintWinner(entry: GroupEntry): void {
    entry.border.clear();
    if (!entry.winner || !entry.frame) return;

    const pad = 5;
    const left = -entry.frame.width / 2 - pad;
    const top = -entry.frame.height / 2 - pad;
    const width = entry.frame.width + pad * 2;
    const height = entry.frame.height + pad * 2;

    entry.border.fillStyle(toColor(this.theme.color.gold.base), 0.16);
    entry.border.fillRoundedRect(left, top, width, height, 8);
    entry.border.lineStyle(5, toColor(this.theme.color.gold.base), 0.22);
    entry.border.strokeRoundedRect(left, top, width, height, 8);
    entry.border.lineStyle(2, toColor(this.theme.color.gold.light), 0.95);
    entry.border.strokeRoundedRect(left, top, width, height, 8);
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
