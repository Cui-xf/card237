import { useEffect, useRef, useState } from 'react';
import type { PublicGameView } from '../../../shared/rules/types';
import { createTable } from '../../table/createTable';
import type { TableController } from '../../table/createTable';
import type { GameBoardProps } from './types';

function prefersReducedMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

/** React ⇄ Phaser 的边界组件：只负责生命周期与状态转发。 */
export function PhaserTable({
  game,
  seats,
  mySeat,
  isHost,
  roomStatus,
  connected = true,
  onAction,
  onRestart,
  onLeave,
}: GameBoardProps<PublicGameView>) {
  const hostRef = useRef<HTMLDivElement>(null);
  const controllerRef = useRef<TableController | null>(null);
  const callbacksRef = useRef({ onAction, onRestart, onLeave });
  const connectedRef = useRef(connected);
  const [status, setStatus] = useState('');

  callbacksRef.current = { onAction, onRestart, onLeave };
  connectedRef.current = connected;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    host.replaceChildren();

    const controller = createTable(host, {
      onAction: (action) => callbacksRef.current.onAction(action),
      onRestart: () => callbacksRef.current.onRestart(),
      onLeave: () => callbacksRef.current.onLeave(),
      onStatus: setStatus,
      reducedMotion: prefersReducedMotion(),
    });
    controllerRef.current = controller;
    controller.setConnected(connectedRef.current);

    // 自动化测试挂钩：只在显式带 ?e2e=1 时暴露，正常游玩不受影响。
    const debugScope = window as unknown as {
      __card237?: { table: TableController };
    };
    if (new URLSearchParams(window.location.search).has('e2e')) {
      debugScope.__card237 = { table: controller };
    }

    return () => {
      if (debugScope.__card237?.table === controller) delete debugScope.__card237;
      controller.destroy();
      host.replaceChildren();
      controllerRef.current = null;
    };
  }, []);

  useEffect(() => {
    controllerRef.current?.update({ game, seats, mySeat, isHost, roomStatus });
  }, [game, seats, mySeat, isHost, roomStatus]);

  useEffect(() => {
    controllerRef.current?.setConnected(connected);
  }, [connected]);

  useEffect(() => {
    const media = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!media) return;

    const onChange = (event: MediaQueryListEvent) => {
      controllerRef.current?.setReducedMotion(event.matches);
    };
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  return (
    <>
      <div
        ref={hostRef}
        className="phaser-table"
        role="application"
        aria-label="牌桌"
        tabIndex={0}
      />
      <div className="sr-only" aria-live="polite">
        {status}
      </div>
    </>
  );
}
