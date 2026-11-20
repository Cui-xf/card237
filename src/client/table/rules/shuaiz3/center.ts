import type Phaser from 'phaser';
import { DealQueue, pulse } from '../../core/fx';
import { THEME, type Theme } from '../../core/theme';
import type { CenterContext, CenterView, SeatPosition, TableModel } from '../../core/types';
import type { Shuaiz3TableModel } from './adapter';

const POSITIONS: SeatPosition[] = ['self', 'left', 'top', 'right'];

/** 发牌阶段的中央提示与飞牌。 */
export class DealingView {
  private readonly scene: Phaser.Scene;
  private readonly title: Phaser.GameObjects.Text;
  private readonly subtitle: Phaser.GameObjects.Text;
  private deck: Phaser.GameObjects.Image[] = [];
  private flights: Phaser.GameObjects.Image[] = [];
  private queue: DealQueue | null = null;
  private lastRevealed = 0;
  private dealing = false;
  private reducedMotion = false;

  constructor(scene: Phaser.Scene, theme: Theme) {
    this.scene = scene;
    this.title = scene.add
      .text(0, 0, '', {
        fontFamily: theme.font.body,
        fontSize: `${theme.size.title}px`,
        color: theme.color.gold.light,
        align: 'center',
      })
      .setOrigin(0.5)
      .setDepth(15);
    this.subtitle = scene.add
      .text(0, 0, '', {
        fontFamily: theme.font.body,
        fontSize: `${theme.size.body}px`,
        color: theme.color.mint,
        align: 'center',
      })
      .setOrigin(0.5)
      .setDepth(15);
  }

  update(model: Shuaiz3TableModel, _now: number, ctx: CenterContext): void {
    const center = model.center;
    const visible = center.kind === 'dealing';
    const compact = ctx.metrics.compact;
    this.reducedMotion = ctx.reducedMotion;

    if (!visible) {
      if (this.dealing) this.clearDeal();
      this.title.setVisible(false);
      this.subtitle.setVisible(false);
      return;
    }

    this.title
      .setVisible(true)
      .setPosition(ctx.width / 2, ctx.height * (compact ? 0.35 : 0.38));
    this.subtitle
      .setVisible(!compact && Boolean(center.declaredName))
      .setText(center.declaredName ? `${center.declaredName} 已甩 3` : '')
      .setPosition(ctx.width / 2, ctx.height * 0.38 + 34);

    if (!this.dealing) {
      this.dealing = true;
      this.lastRevealed = center.revealed;
      if (!compact) this.buildDeck(ctx);
    }

    if (!compact && center.revealed > this.lastRevealed) {
      this.flyCards(center.revealed - this.lastRevealed, ctx);
      this.lastRevealed = center.revealed;
    }

    this.title.setText(`发牌中 ${center.revealed}/${center.total}`);

    if (!compact && center.revealed >= center.total && this.deck.length > 0) {
      this.fadeDeck();
    }
  }

  destroy(): void {
    this.clearDeal();
    this.title.destroy();
    this.subtitle.destroy();
  }

  private buildDeck(ctx: CenterContext): void {
    if (this.reducedMotion) return;
    const { cardW, cardH } = ctx.metrics;

    for (let index = 0; index < 8; index += 1) {
      const image = this.scene.add
        .image(ctx.width / 2 + (index - 4) * 1.5, ctx.height * 0.52, 'card-back')
        .setDisplaySize(cardW * 0.55, cardH * 0.55)
        .setDepth(14)
        .setAlpha(0.9);
      this.deck.push(image);
    }
  }

  private flyCards(count: number, ctx: CenterContext): void {
    if (this.reducedMotion) return;

    const { cardW, cardH } = ctx.metrics;
    const sprites: Phaser.GameObjects.Image[] = [];
    const targets: { x: number; y: number }[] = [];

    for (let index = 0; index < count; index += 1) {
      const oracle = this.lastRevealed + index;
      const position = POSITIONS[oracle % POSITIONS.length] ?? 'self';
      const anchor = ctx.anchors[position];
      const sprite = this.scene.add
        .image(ctx.width / 2, ctx.height * 0.52, 'card-back')
        .setDisplaySize(cardW * 0.55, cardH * 0.55)
        .setDepth(16);
      this.flights.push(sprite);
      sprites.push(sprite);
      targets.push({ x: anchor.x, y: anchor.y });
    }

    this.queue?.destroy();
    this.queue = new DealQueue(this.scene, this.reducedMotion);
    this.queue.deal(
      sprites,
      targets,
      THEME.motion.dealGap,
      THEME.motion.dealCard,
      (index) => {
        const sprite = sprites[index];
        if (!sprite) return;
        sprite.destroy();
        this.flights = this.flights.filter((item) => item !== sprite);
      },
    );
  }

  private fadeDeck(): void {
    if (this.deck.length === 0) return;
    const images = this.deck;
    this.deck = [];

    if (this.reducedMotion) {
      for (const image of images) image.destroy();
      return;
    }

    this.scene.tweens.add({
      targets: images,
      alpha: 0,
      duration: 240,
      onComplete: () => {
        for (const image of images) image.destroy();
      },
    });
  }

  private clearDeal(): void {
    this.queue?.destroy();
    this.queue = null;
    for (const image of this.deck) image.destroy();
    for (const image of this.flights) image.destroy();
    this.deck = [];
    this.flights = [];
    this.dealing = false;
    this.lastRevealed = 0;
  }
}

/** 甩 3 阶段的中央倒计时。 */
export class DeclareView {
  private readonly scene: Phaser.Scene;
  private readonly theme: Theme;
  private readonly ring: Phaser.GameObjects.Graphics;
  private readonly title: Phaser.GameObjects.Text;
  private readonly seconds: Phaser.GameObjects.Text;
  private readonly hint: Phaser.GameObjects.Text;

  private initialSeconds = 0;
  private ringPulse: Phaser.Tweens.Tween | null = null;
  private danger = false;

  constructor(scene: Phaser.Scene, theme: Theme) {
    this.scene = scene;
    this.theme = theme;
    this.ring = scene.add.graphics().setDepth(14);
    this.title = scene.add
      .text(0, 0, '等待甩 3', {
        fontFamily: theme.font.body,
        fontSize: `${theme.size.title}px`,
        color: theme.color.cream,
        align: 'center',
      })
      .setOrigin(0.5)
      .setDepth(15);
    this.seconds = scene.add
      .text(0, 0, '', {
        fontFamily: theme.font.num,
        fontSize: `${theme.size.countdown}px`,
        fontStyle: 'bold',
        color: theme.color.gold.light,
        align: 'center',
      })
      .setOrigin(0.5)
      .setDepth(15);
    this.hint = scene.add
      .text(0, 0, '', {
        fontFamily: theme.font.body,
        fontSize: `${theme.size.caption}px`,
        color: theme.color.mint,
        align: 'center',
      })
      .setOrigin(0.5)
      .setDepth(15);
  }

  update(model: Shuaiz3TableModel, _now: number, ctx: CenterContext): void {
    const center = model.center;
    const visible = center.kind === 'declaring';
    this.title.setVisible(visible);
    this.seconds.setVisible(visible);
    this.hint.setVisible(visible);
    this.ring.setVisible(visible);

    if (!visible) {
      this.ring.clear();
      this.initialSeconds = 0;
      this.stopPulse();
      return;
    }

    if (this.initialSeconds === 0) {
      this.initialSeconds = Math.max(1, center.remainingSeconds);
    }

    const danger = center.remainingSeconds <= 5;
    const compact = ctx.metrics.compact;
    const centerX = ctx.width / 2;

    if (compact) {
      // 紧凑横屏：倒计时环和阶段文字并成一行，中央不再上下堆四条信息。
      const y = ctx.height * 0.35;
      const ringRadius = 17;
      const gap = 12;
      this.title
        .setFontSize(14)
        .setOrigin(0, 0.5)
        .setText(
          center.declaredName
            ? `${center.declaredName} 已甩 3`
            : center.declined
              ? '你已取消甩牌'
              : '等待甩 3',
        );
      const total = ringRadius * 2 + gap + this.title.width;
      const ringX = centerX - total / 2 + ringRadius;
      this.drawRing(ringX, y, center.remainingSeconds, danger, ctx.reducedMotion, ringRadius);
      this.seconds
        .setFontSize(18)
        .setText(String(center.remainingSeconds))
        .setColor(danger ? this.theme.color.danger : this.theme.color.gold.light)
        .setPosition(ringX, y);
      this.title.setPosition(ringX + ringRadius + gap, y);
      this.hint.setVisible(false);
      return;
    }

    const titleY = ctx.height * 0.34;
    const centerY = ctx.height * 0.34 + 46;
    this.title
      .setFontSize(this.theme.size.title)
      .setOrigin(0.5)
      .setText(
        center.declaredName
          ? `${center.declaredName} 已甩 3`
          : center.declined
            ? '你已取消甩牌'
            : '等待甩 3',
      )
      .setPosition(centerX, titleY);
    this.drawRing(centerX, centerY, center.remainingSeconds, danger, ctx.reducedMotion, 44);
    this.seconds
      .setFontSize(this.theme.size.countdown)
      .setText(String(center.remainingSeconds))
      .setColor(danger ? this.theme.color.danger : this.theme.color.gold.light)
      .setPosition(centerX, centerY);
    this.hint
      .setVisible(Boolean(center.canDeclareNow))
      .setText(center.canDeclareNow ? '点上方按钮甩出你的 3' : '')
      .setPosition(ctx.width / 2, ctx.height * 0.34 + 92);
  }

  destroy(): void {
    this.stopPulse();
    this.ring.destroy();
    this.title.destroy();
    this.seconds.destroy();
    this.hint.destroy();
  }

  private drawRing(
    x: number,
    y: number,
    remaining: number,
    danger: boolean,
    reducedMotion: boolean,
    radius = 44,
  ): void {
    const ratio = Math.max(0, Math.min(1, remaining / Math.max(1, this.initialSeconds)));
    const start = -Math.PI / 2;
    const end = start + Math.PI * 2 * ratio;

    this.ring.clear();
    this.ring.lineStyle(3, 0x000000, 0.25);
    this.ring.strokeCircle(x, y, radius);
    this.ring.lineStyle(
      4,
      Number.parseInt(
        (danger ? this.theme.color.danger : this.theme.color.gold.base).replace('#', ''),
        16,
      ),
      0.95,
    );
    this.ring.beginPath();
    this.ring.arc(x, y, radius, start, end, false);
    this.ring.strokePath();

    if (danger && !this.danger && !reducedMotion) {
      this.danger = true;
      this.ringPulse = pulse(this.scene, this.ring, false);
    } else if (!danger && this.danger) {
      this.danger = false;
      this.stopPulse();
    }
  }

  private stopPulse(): void {
    this.ringPulse?.remove();
    this.ringPulse = null;
    this.ring.setAlpha(1);
    this.danger = false;
  }
}

/** 还底阶段的倒计时：只保留环与秒数，操作说明交给按钮。 */
export class ReturnView {
  private readonly scene: Phaser.Scene;
  private readonly theme: Theme;
  private readonly ring: Phaser.GameObjects.Graphics;
  private readonly seconds: Phaser.GameObjects.Text;

  private initialSeconds = 0;
  private ringPulse: Phaser.Tweens.Tween | null = null;
  private danger = false;

  constructor(scene: Phaser.Scene, theme: Theme) {
    this.scene = scene;
    this.theme = theme;
    this.ring = scene.add.graphics().setDepth(14);
    this.seconds = scene.add
      .text(0, 0, '', {
        fontFamily: theme.font.num,
        fontSize: `${theme.size.countdown}px`,
        fontStyle: 'bold',
        color: theme.color.gold.light,
        align: 'center',
      })
      .setOrigin(0.5)
      .setDepth(15);
  }

  update(model: Shuaiz3TableModel, _now: number, ctx: CenterContext): void {
    const center = model.center;
    const visible = center.kind === 'returning';
    this.seconds.setVisible(visible);
    this.ring.setVisible(visible);

    if (!visible) {
      this.ring.clear();
      this.initialSeconds = 0;
      this.stopPulse();
      return;
    }

    if (this.initialSeconds === 0) {
      this.initialSeconds = Math.max(1, center.remainingSeconds);
    }

    const danger = center.remainingSeconds <= 5;
    const compact = ctx.metrics.compact;
    const centerX = ctx.width / 2;
    const y = compact ? ctx.height * 0.35 : ctx.height * 0.34 + 60;
    const ringRadius = compact ? 17 : 44;

    this.drawRing(centerX, y, center.remainingSeconds, danger, ctx.reducedMotion, ringRadius);
    this.seconds
      .setFontSize(compact ? 18 : this.theme.size.countdown)
      .setText(String(center.remainingSeconds))
      .setColor(danger ? this.theme.color.danger : this.theme.color.gold.light)
      .setPosition(centerX, y);
  }

  destroy(): void {
    this.stopPulse();
    this.ring.destroy();
    this.seconds.destroy();
  }

  private drawRing(
    x: number,
    y: number,
    remaining: number,
    danger: boolean,
    reducedMotion: boolean,
    radius = 44,
  ): void {
    const ratio = Math.max(0, Math.min(1, remaining / Math.max(1, this.initialSeconds)));
    const start = -Math.PI / 2;
    const end = start + Math.PI * 2 * ratio;

    this.ring.clear();
    this.ring.lineStyle(3, 0x000000, 0.25);
    this.ring.strokeCircle(x, y, radius);
    this.ring.lineStyle(
      4,
      Number.parseInt(
        (danger ? this.theme.color.danger : this.theme.color.gold.base).replace('#', ''),
        16,
      ),
      0.95,
    );
    this.ring.beginPath();
    this.ring.arc(x, y, radius, start, end, false);
    this.ring.strokePath();

    if (danger && !this.danger && !reducedMotion) {
      this.danger = true;
      this.ringPulse = pulse(this.scene, this.ring, false);
    } else if (!danger && this.danger) {
      this.danger = false;
      this.stopPulse();
    }
  }

  private stopPulse(): void {
    this.ringPulse?.remove();
    this.ringPulse = null;
    this.ring.setAlpha(1);
    this.danger = false;
  }
}

interface SubView {
  update(model: Shuaiz3TableModel, now: number, ctx: CenterContext): void;
  destroy(): void;
}

/** 甩 3 的中央阶段区：发牌 / 甩 3 / 还底；出牌阶段中央留空，只留出牌区。 */
export class Shuaiz3CenterView implements CenterView {
  private readonly views: SubView[];

  constructor(scene: Phaser.Scene, theme: Theme) {
    this.views = [
      new DealingView(scene, theme),
      new DeclareView(scene, theme),
      new ReturnView(scene, theme),
    ];
  }

  update(model: TableModel, now: number, ctx: CenterContext): void {
    const typed = model as Shuaiz3TableModel;
    for (const view of this.views) view.update(typed, now, ctx);
  }

  destroy(): void {
    for (const view of this.views) view.destroy();
  }
}
