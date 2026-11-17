import type Phaser from 'phaser';
import { THEME } from './theme';

type Target = Phaser.GameObjects.GameObject;

function applyProps(target: Target, props: Record<string, number>): void {
  const record = target as unknown as Record<string, unknown>;
  for (const [key, value] of Object.entries(props)) record[key] = value;
}

/** reduced-motion 时直接落到终态。 */
export function tweenTo(
  scene: Phaser.Scene,
  targets: Target | Target[],
  props: Record<string, number>,
  duration: number,
  reducedMotion: boolean,
  ease = 'Cubic.easeOut',
): Phaser.Tweens.Tween | null {
  const list = Array.isArray(targets) ? targets : [targets];
  if (reducedMotion) {
    for (const target of list) applyProps(target, props);
    return null;
  }
  return scene.tweens.add({ targets: list, ...props, duration, ease });
}

export function pulse(
  scene: Phaser.Scene,
  target: Target,
  reducedMotion: boolean,
): Phaser.Tweens.Tween | null {
  if (reducedMotion) return null;
  return scene.tweens.add({
    targets: target,
    alpha: { from: 1, to: 0.45 },
    duration: THEME.motion.turnPulse / 2,
    yoyo: true,
    repeat: -1,
    ease: 'Sine.easeInOut',
  });
}

/** 沿二次贝塞尔弧线把一张牌从 from 飞到 to。 */
export function flyCard(
  scene: Phaser.Scene,
  image: Phaser.GameObjects.Image,
  from: { x: number; y: number },
  to: { x: number; y: number },
  duration: number,
  reducedMotion: boolean,
): Phaser.Tweens.Tween | null {
  if (reducedMotion) {
    image.setPosition(to.x, to.y);
    return null;
  }

  const control = {
    x: (from.x + to.x) / 2,
    y: Math.min(from.y, to.y) - 60,
  };
  const counter = { t: 0 };
  image.setPosition(from.x, from.y);

  return scene.tweens.add({
    targets: counter,
    t: 1,
    duration,
    ease: 'Sine.easeInOut',
    onUpdate: () => {
      const t = counter.t;
      const inv = 1 - t;
      image.setPosition(
        inv * inv * from.x + 2 * inv * t * control.x + t * t * to.x,
        inv * inv * from.y + 2 * inv * t * control.y + t * t * to.y,
      );
    },
    onComplete: () => image.setPosition(to.x, to.y),
  });
}


/** 逐张延迟发牌；每张落地后回调。 */
export class DealQueue {
  private readonly scene: Phaser.Scene;
  private readonly reducedMotion: boolean;
  private timers: Phaser.Time.TimerEvent[] = [];

  constructor(scene: Phaser.Scene, reducedMotion: boolean) {
    this.scene = scene;
    this.reducedMotion = reducedMotion;
  }

  deal(
    sprites: Phaser.GameObjects.Image[],
    targets: { x: number; y: number }[],
    gap: number,
    duration: number,
    onLand?: (index: number) => void,
  ): void {
    const count = Math.min(sprites.length, targets.length);

    for (let index = 0; index < count; index += 1) {
      const timer = this.scene.time.delayedCall(index * gap, () => {
        const sprite = sprites[index];
        const target = targets[index];
        if (!sprite || !target) return;

        flyCard(
          this.scene,
          sprite,
          { x: sprite.x, y: sprite.y },
          target,
          duration,
          this.reducedMotion,
        );

        if (this.reducedMotion) {
          onLand?.(index);
        } else {
          this.scene.time.delayedCall(duration, () => onLand?.(index));
        }
      });
      this.timers.push(timer);
    }
  }

  destroy(): void {
    for (const timer of this.timers) timer.remove(false);
    this.timers = [];
  }
}
