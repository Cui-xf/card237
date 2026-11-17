import type { Metrics, SeatPosition } from './types';

export type SeatAnchors = Record<SeatPosition, { x: number; y: number }>;


/** 三种尺度：紧凑（手机横屏）、标准、宽屏。 */
export function getMetrics(width: number, height: number): Metrics {
  // 手机横屏高度只有 330～400，必须按「矮」而不是「窄」进入紧凑布局。
  const compact = width < 720 || height < 520;
  const portrait = height > width;
  const cardW = portrait ? 52 : compact ? 56 : width < 1200 ? 78 : 92;
  const cardH = Math.round(cardW * 1.5);

  return {
    compact,
    cardW,
    cardH,
    handOverlap: portrait ? 22 : compact ? 26 : 34,
    seatRadius: portrait ? 18 : compact ? 20 : 26,
    gutter: compact ? 10 : 18,
  };
}


/** 自己固定在底部中央；其余按人数对称分布。 */
export function computeSeatAnchors(
  width: number,
  height: number,
  seatCount: number,
  metrics: Metrics,
): SeatAnchors {
  if (metrics.compact) {
    // 紧凑布局：对手贴顶部/两侧，自己缩成左下角的小挂件，把中间整块让给牌局。
    const top = { x: width / 2, y: 28 };
    // 左右座位略高一点，把左下角留给「自己信息 + 规则徽标」这一组。
    const left = { x: 56, y: height * 0.3 };
    const right = { x: width - 56, y: height * 0.3 };
    const self = {
      x: 34,
      y: height - metrics.cardH - metrics.gutter - 34,
    };
    return {
      self,
      left,
      right,
      top: seatCount === 4 ? top : left,
    };
  }

  const self = {
    x: width / 2,
    y: height - metrics.cardH * 1.75 - metrics.gutter,
  };

  const left = {
    x: width * (seatCount === 4 ? 0.1 : 0.12) + metrics.gutter * 0.5,
    y: height * (seatCount === 4 ? 0.4 : 0.42),
  };
  const right = {
    x: width * (seatCount === 4 ? 0.9 : 0.88) - metrics.gutter * 0.5,
    y: height * (seatCount === 4 ? 0.4 : 0.42),
  };
  const top = {
    x: width * 0.5,
    y: height * 0.1 + metrics.gutter,
  };

  return {
    self,
    left,
    right,
    top: seatCount === 4 ? top : left,
  };
}


export interface HandSlot {
  x: number;
  y: number;
  angle: number;
}

/** 手牌沿底部牌架排列；牌多时自动加大重叠，永不超出画布。 */
export function layoutHand(
  count: number,
  width: number,
  height: number,
  metrics: Metrics,
): HandSlot[] {
  if (count <= 0) return [];

  const maxStep = metrics.cardW - 8;
  // 紧凑横屏手牌最多 18 张，左右各留 24px，避免贴到桌沿和画布边缘。
  const side = metrics.compact ? 24 : metrics.gutter;
  const available = width - side * 2 - metrics.cardW;
  const rawStep = count > 1 ? available / (count - 1) : maxStep;
  const minStep = metrics.compact ? 14 : 18;
  const step = Math.max(minStep, Math.min(maxStep, rawStep));
  const total = metrics.cardW + step * (count - 1);
  const startX = width / 2 - total / 2 + metrics.cardW / 2;
  const y = height - metrics.cardH / 2 - (metrics.compact ? 22 : metrics.gutter);

  return Array.from({ length: count }, (_, index) => ({
    x: startX + index * step,
    y,
    angle: (((index - (count - 1) / 2) / Math.max(1, count)) * 4),
  }));
}
