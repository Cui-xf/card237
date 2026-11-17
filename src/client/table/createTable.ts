import Phaser from 'phaser';
import { TableScene, type TableSceneData } from './core/TableScene';
import type { TableDebugSnapshot, TableInput } from './core/types';
import { resolveRuleBoard } from './registry';

export interface TableController {
  update(input: TableInput): void;
  setConnected(connected: boolean): void;
  setReducedMotion(value: boolean): void;
  /** 仅用于自动化测试；正常游玩不会调用。 */
  debugSnapshot(): TableDebugSnapshot | null;
  destroy(): void;
}

/** 组合根：把全部玩法注册表注入通用牌桌，并接管 Phaser.Game 生命周期。 */
export function createTable(
  parent: HTMLElement,
  options: Omit<TableSceneData, 'resolveBoard' | 'pixelRatio'>,
): TableController {
  // 手机 DPR 通常是 2～3。canvas 后备缓冲按物理像素渲染，CSS 尺寸仍按逻辑像素，
  // 否则文字和细线会被浏览器放大，看起来发虚。
  const pixelRatio = Math.min(3, Math.max(1, window.devicePixelRatio || 1));
  const scene = new TableScene({
    ...options,
    pixelRatio,
    resolveBoard: resolveRuleBoard,
  });
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    scale: {
      mode: Phaser.Scale.NONE,
      width: Math.max(1, Math.round(parent.clientWidth * pixelRatio)),
      height: Math.max(1, Math.round(parent.clientHeight * pixelRatio)),
      zoom: 1 / pixelRatio,
    },
    render: {
      antialias: true,
    },
    scene,
  });

  const resize = (): void => {
    const width = Math.max(1, Math.round(parent.clientWidth * pixelRatio));
    const height = Math.max(1, Math.round(parent.clientHeight * pixelRatio));
    if (game.scale.width === width && game.scale.height === height) return;
    game.scale.resize(width, height);
  };
  resize();

  const observer = new ResizeObserver(() => resize());
  observer.observe(parent);

  return {
    update(input: TableInput): void {
      scene.push(input);
    },
    setConnected(connected: boolean): void {
      scene.setConnected(connected);
    },
    setReducedMotion(value: boolean): void {
      scene.setReducedMotion(value);
    },
    debugSnapshot(): TableDebugSnapshot | null {
      return scene.debugSnapshot();
    },
    destroy(): void {
      observer.disconnect();
      const canvas = game.canvas;
      game.destroy(true);
      // React StrictMode 会在创建尚未完成时立刻销毁；补一次显式移除，避免残留第二个 canvas。
      canvas?.remove();
    },
  };
}
