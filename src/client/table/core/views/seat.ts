import type Phaser from 'phaser';
import { pulse } from '../fx';
import type { Theme } from '../theme';
import type { TableSeat } from '../types';

function toColor(hex: string): number {
  return Number.parseInt(hex.replace('#', ''), 16);
}

function shortName(name: string): string {
  const trimmed = name.trim() || '玩家';
  return trimmed.length > 8 ? `${trimmed.slice(0, 7)}…` : trimmed;
}

/** 座位：头像盘、昵称、手牌数、分数、角标与回合金环。 */
export class SeatView {
  private readonly scene: Phaser.Scene;
  private readonly theme: Theme;
  private readonly container: Phaser.GameObjects.Container;
  private readonly shape: Phaser.GameObjects.Graphics;
  private readonly ring: Phaser.GameObjects.Graphics;
  private readonly initial: Phaser.GameObjects.Text;
  private readonly nameText: Phaser.GameObjects.Text;
  private readonly countText: Phaser.GameObjects.Text;
  private readonly scoreText: Phaser.GameObjects.Text;
  private readonly badgeText: Phaser.GameObjects.Text;
  private reducedMotion = false;
  private ringPulse: Phaser.Tweens.Tween | null = null;

  constructor(scene: Phaser.Scene, theme: Theme) {
    this.scene = scene;
    this.theme = theme;
    this.container = scene.add.container(0, 0).setDepth(20);
    this.shape = scene.add.graphics();
    this.ring = scene.add.graphics();
    this.initial = scene.add
      .text(0, 0, '', {
        fontFamily: theme.font.body,
        fontSize: '16px',
        fontStyle: 'bold',
        color: theme.color.ivory,
      })
      .setOrigin(0.5);
    this.nameText = scene.add
      .text(0, 0, '', {
        fontFamily: theme.font.body,
        fontSize: `${theme.size.seatName}px`,
        color: theme.color.cream,
        align: 'center',
      })
      .setOrigin(0.5, 0);
    this.countText = scene.add
      .text(0, 0, '', {
        fontFamily: theme.font.num,
        fontSize: `${theme.size.handCount}px`,
        color: theme.color.gold.light,
        align: 'center',
      })
      .setOrigin(0.5);
    this.scoreText = scene.add
      .text(0, 0, '', {
        fontFamily: theme.font.num,
        fontSize: `${theme.size.caption}px`,
        color: theme.color.mint,
        align: 'center',
      })
      .setOrigin(0.5);
    this.badgeText = scene.add
      .text(0, 0, '', {
        fontFamily: theme.font.body,
        fontSize: '11px',
        fontStyle: 'bold',
        color: theme.color.ink,
        align: 'center',
      })
      .setOrigin(0.5);

    this.container.add([
      this.shape,
      this.ring,
      this.initial,
      this.nameText,
      this.countText,
      this.scoreText,
      this.badgeText,
    ]);
  }

  setReducedMotion(value: boolean): void {
    this.reducedMotion = value;
  }

  update(
    seat: TableSeat,
    anchor: { x: number; y: number },
    turn: boolean,
    compact = false,
  ): void {
    this.container.setPosition(anchor.x, anchor.y);
    this.container.setScale(seat.position === 'self' && !compact ? 1.1 : 1);
    this.container.setAlpha(seat.online ? 1 : 0.55);
    this.container.setDepth(turn ? 22 : 20);
    this.shape.clear();
    this.ring.clear();
    this.scene.tweens?.killTweensOf(this.ring);
    this.ring.setAlpha(1);

    const radius = compact ? 16 : this.theme.radius.seat;

    this.shape.fillStyle(toColor(this.theme.color.felt.edge), 1);
    this.shape.fillCircle(0, 0, radius);
    this.shape.lineStyle(2, toColor(this.theme.color.gold.base), seat.online ? 0.75 : 0.35);
    this.shape.strokeCircle(0, 0, radius);

    if (turn) {
      this.ring.lineStyle(3, toColor(this.theme.color.gold.light), 0.9);
      this.ring.strokeCircle(0, 0, radius + (compact ? 4 : 6));
      this.ringPulse?.remove();
      this.ringPulse = pulse(this.scene, this.ring, this.reducedMotion);
    } else {
      this.ringPulse?.remove();
      this.ringPulse = null;
    }

    this.initial
      .setFontSize(compact ? 13 : 16)
      .setText(shortName(seat.name).slice(0, 1));

    if (compact && seat.position === 'self') {
      this.renderDock(seat, radius);
      return;
    }

    if (compact) {
      this.renderCompact(seat, radius);
      return;
    }

    this.renderFull(seat, radius);
  }

  /** 紧凑布局：头像下只留两行——昵称、张数·分数，避免三行文字互相压住。 */
  private renderCompact(seat: TableSeat, radius: number): void {
    this.nameText
      .setFontSize(11)
      .setOrigin(0.5, 0)
      .setText(shortName(seat.name))
      .setPosition(0, radius + 5);

    const meta = seat.score === undefined
      ? `${seat.handCount} 张`
      : `${seat.handCount} 张 · ${seat.score} 分`;
    this.countText
      .setFontSize(10)
      .setOrigin(0.5, 0)
      .setText(meta)
      .setPosition(0, radius + 21);
    this.scoreText.setVisible(false);

    this.layoutBadge(seat, radius * 0.55, -radius - 8, 18);
  }

  /** 自己：左下角横排挂件，避免和手牌、中央区抢位置。 */
  private renderDock(seat: TableSeat, radius: number): void {
    this.nameText
      .setFontSize(12)
      .setOrigin(0, 0.5)
      .setText(shortName(seat.name))
      .setPosition(radius + 7, -8);

    const meta = seat.score === undefined
      ? `${seat.handCount} 张`
      : `${seat.handCount} 张 · ${seat.score} 分`;
    this.countText
      .setFontSize(11)
      .setOrigin(0, 0.5)
      .setText(seat.badge ? `${seat.badge} · ${meta}` : meta)
      .setPosition(radius + 7, 8);
    this.scoreText.setVisible(false);
    // 挂件没有空间放独立角标，直接并进第二行文字。
    this.badgeText.setVisible(false);
  }

  private renderFull(seat: TableSeat, radius: number): void {
    this.nameText
      .setFontSize(this.theme.size.seatName)
      .setOrigin(0.5, 0)
      .setText(shortName(seat.name))
      .setPosition(0, radius + 8);

    this.countText
      .setFontSize(this.theme.size.handCount)
      .setOrigin(0.5)
      .setText(`${seat.handCount} 张`);
    const countWidth = this.countText.width + 16;
    const countY = radius + 30;
    this.shape.fillStyle(toColor(this.theme.color.felt.mid), 0.92);
    this.shape.fillRoundedRect(-countWidth / 2, countY, countWidth, 20, 10);
    this.shape.lineStyle(1, toColor(this.theme.color.gold.base), 0.35);
    this.shape.strokeRoundedRect(-countWidth / 2, countY, countWidth, 20, 10);
    this.countText.setPosition(0, countY + 10);

    if (seat.score !== undefined) {
      this.scoreText
        .setVisible(true)
        .setFontSize(this.theme.size.caption)
        .setText(`分数 ${seat.score}`)
        .setPosition(0, countY + 30);
    } else {
      this.scoreText.setVisible(false);
    }

    this.layoutBadge(seat, radius * 0.55, -radius - 12, 20);
  }

  private layoutBadge(
    seat: TableSeat,
    x: number,
    y: number,
    height: number,
  ): void {
    if (!seat.badge) {
      this.badgeText.setVisible(false);
      return;
    }

    this.badgeText.setFontSize(height <= 18 ? 10 : 11);
    const badgeWidth = this.badgeText.setText(seat.badge).width + 14;
    this.shape.fillStyle(toColor(this.theme.color.gold.base), 1);
    this.shape.fillRoundedRect(x - badgeWidth / 2, y, badgeWidth, height, height / 2);
    this.badgeText.setVisible(true).setPosition(x, y + height / 2);
  }

  destroy(): void {
    this.container.destroy(true);
  }
}
