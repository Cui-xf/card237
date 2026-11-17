import type Phaser from 'phaser';
import {
  STANDARD_RANKS,
  SUITS,
  SUIT_SYMBOL,
  type Rank,
  type Suit,
} from '../../../shared/cards';
import { THEME } from './theme';
import type { TableCard } from './types';

export const CARD_TEX_W = 168;
export const CARD_TEX_H = 252;

const SHADOW_TEX_W = 160;
const SHADOW_TEX_H = 232;
const CORNER_RADIUS = 12;

export function cardTextureKey(cardId: string): string {
  return `card-face-${cardId}`;
}

function rankLabel(rank: Rank): string {
  if (rank === 'SJ') return '小王';
  if (rank === 'BJ') return '大王';
  return rank;
}

function isRedCard(card: TableCard): boolean {
  if (card.rank === 'BJ') return true;
  return card.suit === 'heart' || card.suit === 'diamond';
}

function drawCardFace(
  ctx: CanvasRenderingContext2D,
  card: TableCard,
  width: number,
  height: number,
): void {
  const color = isRedCard(card) ? THEME.color.suit.red : THEME.color.suit.black;
  const joker = card.suit === 'joker';
  const corner = joker ? '★' : SUIT_SYMBOL[card.suit as Suit];
  const label = rankLabel(card.rank);

  roundRect(ctx, 1, 1, width - 2, height - 2, CORNER_RADIUS);
  ctx.fillStyle = THEME.color.ivory;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(27,36,48,0.18)';
  ctx.stroke();

  ctx.fillStyle = color;
  ctx.textBaseline = 'top';

  if (joker) {
    ctx.textAlign = 'center';
    ctx.font = `700 42px ${THEME.font.num}`;
    ctx.fillText(corner, width / 2, 24);
    ctx.font = `700 46px ${THEME.font.body}`;
    const vertical = label.split('');
    vertical.forEach((char, index) => {
      ctx.fillText(char, width / 2, 84 + index * 50);
    });
    return;
  }

  ctx.textAlign = 'left';
  ctx.font = `700 44px ${THEME.font.num}`;
  ctx.fillText(label, 14, 12);
  ctx.font = `400 34px ${THEME.font.num}`;
  ctx.fillText(corner, 15, 58);

  ctx.save();
  ctx.translate(width - 14, height - 12);
  ctx.rotate(Math.PI);
  ctx.textAlign = 'left';
  ctx.font = `700 44px ${THEME.font.num}`;
  ctx.fillText(label, 0, 0);
  ctx.font = `400 34px ${THEME.font.num}`;
  ctx.fillText(corner, 1, 46);
  ctx.restore();

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `700 96px ${THEME.font.num}`;
  ctx.fillText(label, width / 2, height / 2 - 14);
  ctx.font = `400 54px ${THEME.font.num}`;
  ctx.fillText(corner, width / 2, height / 2 + 56);
}

function drawCardBack(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
): void {
  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, THEME.color.felt.edge);
  gradient.addColorStop(0.55, THEME.color.felt.mid);
  gradient.addColorStop(1, THEME.color.felt.edge);

  roundRect(ctx, 1, 1, width - 2, height - 2, CORNER_RADIUS);
  ctx.fillStyle = gradient;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(216,166,76,0.55)';
  ctx.stroke();

  ctx.save();
  roundRect(ctx, 10, 10, width - 20, height - 20, 8);
  ctx.clip();
  ctx.strokeStyle = 'rgba(216,166,76,0.16)';
  ctx.lineWidth = 1;
  for (let x = -height; x < width + height; x += 14) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + height, height);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x + height, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }
  ctx.restore();

  ctx.strokeStyle = 'rgba(242,214,154,0.65)';
  ctx.lineWidth = 1.5;
  roundRect(ctx, 16, 16, width - 32, height - 32, 6);
  ctx.stroke();

  ctx.save();
  ctx.translate(width / 2, height / 2);
  ctx.rotate(Math.PI / 4);
  ctx.fillStyle = 'rgba(216,166,76,0.28)';
  ctx.fillRect(-24, -24, 48, 48);
  ctx.strokeStyle = 'rgba(242,214,154,0.8)';
  ctx.lineWidth = 2;
  ctx.strokeRect(-24, -24, 48, 48);
  ctx.restore();
}

function drawCardShadow(ctx: CanvasRenderingContext2D): void {
  ctx.clearRect(0, 0, SHADOW_TEX_W, SHADOW_TEX_H);
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.45)';
  ctx.shadowBlur = 18;
  ctx.shadowOffsetY = 6;
  ctx.fillStyle = 'rgba(0,0,0,0.9)';
  roundRect(ctx, 10, 10, SHADOW_TEX_W - 20, SHADOW_TEX_H - 20, CORNER_RADIUS);
  ctx.fill();
  ctx.restore();
}

function withTexture(
  scene: Phaser.Scene,
  key: string,
  width: number,
  height: number,
  draw: (ctx: CanvasRenderingContext2D) => void,
): void {
  if (scene.textures.exists(key)) return;
  const texture = scene.textures.createCanvas(key, width, height);
  if (!texture) return;
  const ctx = texture.getContext();
  ctx.clearRect(0, 0, width, height);
  draw(ctx);
  texture.refresh();
}

function allCards(): TableCard[] {
  const cards: TableCard[] = [];
  for (const suit of SUITS) {
    for (const rank of STANDARD_RANKS) {
      cards.push({ id: `${suit}-${rank}`, rank, suit });
    }
  }
  cards.push({ id: 'joker-SJ', rank: 'SJ', suit: 'joker' });
  cards.push({ id: 'joker-BJ', rank: 'BJ', suit: 'joker' });
  return cards;
}

/** 一次性生成整副牌、牌背与投影；场景切换规则时不必重复生成。 */
export function registerCardTextures(scene: Phaser.Scene): void {
  for (const card of allCards()) {
    withTexture(scene, cardTextureKey(card.id), CARD_TEX_W, CARD_TEX_H, (ctx) =>
      drawCardFace(ctx, card, CARD_TEX_W, CARD_TEX_H),
    );
  }
  withTexture(scene, 'card-back', CARD_TEX_W, CARD_TEX_H, (ctx) =>
    drawCardBack(ctx, CARD_TEX_W, CARD_TEX_H),
  );
  withTexture(scene, 'card-shadow', SHADOW_TEX_W, SHADOW_TEX_H, drawCardShadow);
}

export { SHADOW_TEX_W, SHADOW_TEX_H };


const RIM_INSET = 28;

function mulberry32(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value = (value + 0x6d2b79f5) >>> 0;
    let next = Math.imul(value ^ (value >>> 15), 1 | value);
    next = (next + Math.imul(next ^ (next >>> 7), 61 | next)) ^ next;
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
  };
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const radius = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

export function tableTextureKey(width: number, height: number): string {
  return `table-surface-${Math.round(width)}x${Math.round(height)}`;
}

/**
 * 生成整张桌面纹理：木纹外圈 + 毡布径向受光 + 金色 hairline + 噪点 + 暗角。
 * 只在尺寸变化时重建。
 */
export function registerTableTexture(
  scene: Phaser.Scene,
  width: number,
  height: number,
): string {
  const w = Math.max(320, Math.round(width));
  const h = Math.max(240, Math.round(height));
  const key = tableTextureKey(w, h);
  if (scene.textures.exists(key)) return key;

  const texture = scene.textures.createCanvas(key, w, h);
  if (!texture) return key;
  const ctx = texture.getContext();
  ctx.clearRect(0, 0, w, h);

  const outerRadius = Math.min(w, h) * 0.08;
  const rim = ctx.createLinearGradient(0, 0, w, h);
  rim.addColorStop(0, THEME.color.rim.from);
  rim.addColorStop(0.5, THEME.color.rim.to);
  rim.addColorStop(1, THEME.color.rim.from);
  roundRect(ctx, 0, 0, w, h, outerRadius);
  ctx.fillStyle = rim;
  ctx.fill();

  const innerX = RIM_INSET;
  const innerY = RIM_INSET;
  const innerW = w - RIM_INSET * 2;
  const innerH = h - RIM_INSET * 2;
  const innerRadius = Math.max(0, outerRadius - RIM_INSET * 0.5);

  const felt = ctx.createRadialGradient(
    w * 0.5,
    h * 0.42,
    Math.min(w, h) * 0.05,
    w * 0.5,
    h * 0.42,
    Math.max(w, h) * 0.72,
  );
  felt.addColorStop(0, THEME.color.felt.center);
  felt.addColorStop(0.55, THEME.color.felt.mid);
  felt.addColorStop(1, THEME.color.felt.edge);
  roundRect(ctx, innerX, innerY, innerW, innerH, innerRadius);
  ctx.fillStyle = felt;
  ctx.fill();

  ctx.save();
  roundRect(ctx, innerX, innerY, innerW, innerH, innerRadius);
  ctx.clip();

  const random = mulberry32(20261120);
  ctx.fillStyle = 'rgba(255,255,255,0.035)';
  for (let index = 0; index < 18000; index += 1) {
    const x = innerX + random() * innerW;
    const y = innerY + random() * innerH;
    ctx.fillRect(x, y, 1, 1);
  }

  const vignette = ctx.createRadialGradient(
    w * 0.5,
    h * 0.45,
    Math.min(w, h) * 0.28,
    w * 0.5,
    h * 0.5,
    Math.max(w, h) * 0.78,
  );
  vignette.addColorStop(0, 'rgba(0,0,0,0)');
  vignette.addColorStop(1, 'rgba(0,0,0,0.55)');
  ctx.fillStyle = vignette;
  ctx.fillRect(innerX, innerY, innerW, innerH);
  ctx.restore();

  ctx.strokeStyle = 'rgba(216,166,76,0.55)';
  ctx.lineWidth = 2;
  roundRect(ctx, innerX, innerY, innerW, innerH, innerRadius);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 6;
  roundRect(ctx, 3, 3, w - 6, h - 6, outerRadius);
  ctx.stroke();

  texture.refresh();
  return key;
}
