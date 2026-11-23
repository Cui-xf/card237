import { Copy, LogOut, Maximize2, MessagesSquare } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import type { ClientMessage } from '../../shared/protocol';
import { RULE_META } from '../../shared/rules';
import type { GameAction } from '../../shared/rules/types';
import { ConfirmDialog } from '../components/ConfirmDialog';
import type { ToastTone } from '../components/Toast';
import { GameBoard } from '../components/game/GameBoard';
import { LoadingScreen, NameGate, RoomErrorScreen } from '../components/room/RoomScreens';
import { RoomSidebar } from '../components/room/RoomSidebar';
import { RotateHint } from '../components/room/RotateHint';
import { WaitingTable } from '../components/room/WaitingTable';
import { copyText } from '../lib/clipboard';
import { fetchRoom } from '../lib/api';
import { requestLandscapeMode } from '../lib/orientation';
import { usePhoneLayout } from '../lib/usePhoneLayout';
import { useRoomSocket } from '../lib/useRoomSocket';

interface RoomPageProps {
  roomId: string;
  playerId: string;
  playerName: string;
  onPlayerNameChange: (name: string) => void;
  notify: (message: string, tone?: ToastTone) => void;
  onBack: () => void;
}

const ROTATE_HINT_KEY = 'card237.rotate-hint-dismissed';

function readRotateHintDismissed(): boolean {
  try {
    return window.sessionStorage.getItem(ROTATE_HINT_KEY) === '1';
  } catch {
    return false;
  }
}

function rememberRotateHintDismissed(): void {
  try {
    window.sessionStorage.setItem(ROTATE_HINT_KEY, '1');
  } catch {
    // 隐私模式禁用存储时忽略，仅本次会话有效。
  }
}

export function RoomPage({
  roomId,
  playerId,
  playerName,
  onPlayerNameChange,
  notify,
  onBack,
}: RoomPageProps) {
  const [preflight, setPreflight] = useState<'loading' | 'ok' | 'missing'>('loading');
  const [preflightAttempt, setPreflightAttempt] = useState(0);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [rotateHintDismissed, setRotateHintDismissed] = useState(
    readRotateHintDismissed,
  );
  const { isLandscape, isPortraitPhone } = usePhoneLayout();

  const dismissRotateHint = useCallback(() => {
    rememberRotateHintDismissed();
    setRotateHintDismissed(true);
  }, []);

  // 用户已经把手机横过来时，记住提示已处理，避免转回竖屏又弹一次。
  useEffect(() => {
    if (isLandscape && !rotateHintDismissed) {
      rememberRotateHintDismissed();
      setRotateHintDismissed(true);
    }
  }, [isLandscape, rotateHintDismissed]);

  useEffect(() => {
    if (!isLandscape) setSidebarOpen(false);
  }, [isLandscape]);

  useEffect(() => {
    if (!sidebarOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSidebarOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [sidebarOpen]);

  useEffect(() => {
    let alive = true;
    setPreflight('loading');

    fetchRoom(roomId)
      .then(() => {
        if (alive) setPreflight('ok');
      })
      .catch(() => {
        if (alive) setPreflight('missing');
      });

    return () => {
      alive = false;
    };
  }, [roomId, preflightAttempt]);

  const trimmedName = playerName.trim();
  const socketEnabled = preflight === 'ok' && trimmedName.length > 0;
  const { state, status, fatalMessage, notice, send } = useRoomSocket({
    roomId,
    playerId,
    name: trimmedName,
    enabled: socketEnabled,
  });

  useEffect(() => {
    if (notice) notify(notice.message, 'error');
  }, [notice, notify]);

  const sendChecked = useCallback(
    (message: ClientMessage): boolean => {
      if (send(message)) return true;
      notify('连接已断开，正在尝试重连…', 'error');
      return false;
    },
    [send, notify],
  );

  /** 规则动作统一走 `{ type: 'game', action }` 信封，房间层不需要认识具体规则。 */
  const sendGameAction = useCallback(
    (action: GameAction) => {
      sendChecked({ type: 'game', action });
    },
    [sendChecked],
  );

  const leaveNow = useCallback(() => {
    send({ type: 'leave' });
    window.setTimeout(onBack, 120);
  }, [send, onBack]);

  const requestBack = useCallback(() => {
    if (state?.status === 'playing' && state.you.seat !== null) {
      setLeaveOpen(true);
      return;
    }
    leaveNow();
  }, [state?.status, state?.you.seat, leaveNow]);

  const confirmLeave = useCallback(() => {
    setLeaveOpen(false);
    if (state?.status === 'playing') {
      onBack();
      return;
    }
    leaveNow();
  }, [state?.status, leaveNow, onBack]);

  const copyInvite = async () => {
    const url = `${window.location.origin}${window.location.pathname}#/room/${roomId}`;
    const ok = await copyText(url);
    notify(ok ? '邀请链接已复制' : '复制失败，请手动复制地址栏链接', ok ? 'info' : 'error');
  };

  const enterLandscape = async () => {
    const result = await requestLandscapeMode();
    if (result === 'manual') {
      notify('请把手机横过来，牌桌会自动切换为横屏布局', 'info');
      return;
    }
    if (result === 'fullscreen') {
      notify('已进入全屏，把手机横过来即可开牌', 'info');
      return;
    }
    dismissRotateHint();
  };

  if (preflight === 'loading') {
    return <LoadingScreen label="正在查找牌桌…" onBack={onBack} />;
  }

  if (preflight === 'missing') {
    return (
      <RoomErrorScreen
        title="房间不存在"
        description="房间可能已经过期，或者房间号有误。回到大厅创建一张新牌桌吧。"
        primaryLabel="返回大厅"
        onPrimary={onBack}
        secondaryLabel="重新检查"
        onSecondary={() => setPreflightAttempt((value) => value + 1)}
      />
    );
  }

  if (!trimmedName) {
    return (
      <NameGate
        roomId={roomId}
        playerName={playerName}
        onJoin={onPlayerNameChange}
        onBack={onBack}
      />
    );
  }

  if (fatalMessage) {
    return (
      <RoomErrorScreen
        title="无法进入牌桌"
        description={fatalMessage}
        primaryLabel="返回大厅"
        onPrimary={onBack}
        secondaryLabel="重新连接"
        onSecondary={() => window.location.reload()}
      />
    );
  }

  if (!state) {
    return (
      <LoadingScreen
        label={status === 'reconnecting' ? '连接中断，正在重连…' : '正在连接牌桌…'}
        onBack={onBack}
      />
    );
  }

  const seats = state.seats;
  const game = state.game;
  const mySeat = state.you.seat;
  const capacity = seats.length;
  const occupied = seats.filter((seat) => seat !== null).length;
  const readyCount = seats.filter((seat) => seat?.ready).length;
  const allOnline = seats.every((seat) => seat === null || seat.online);
  const canStart =
    state.you.isHost && occupied === capacity && readyCount === capacity && allOnline;

  let waitingHint = '';
  if (occupied < capacity) {
    waitingHint = `还差 ${capacity - occupied} 位玩家${
      state.you.isHost ? '，可添加机器人补位' : ''
    }`;
  }
  else if (readyCount < capacity) waitingHint = `还有 ${capacity - readyCount} 人未准备`;
  else if (!allOnline) waitingHint = '有玩家离线，等待重连';
  else if (!state.you.isHost) waitingHint = '全员已准备，等待房主开始';
  else waitingHint = '可以开始了';

  return (
    <div
      className={`room-page${isLandscape ? ' is-landscape' : ''}${game ? ' has-game' : ''}`}
    >
      <header className="room-topbar">
        <div className="page-shell room-topbar-inner">
          <div className="room-heading">
            <h1 className="room-heading-title">{state.name}</h1>
            <div className="room-heading-meta">
              <span className="room-code room-code--small">{state.id}</span>
              <span className="table-label">{RULE_META[state.ruleId].name}</span>
              <span className={`conn-status conn-${status}`}>
                <span className="conn-dot" aria-hidden="true" />
                {status === 'open'
                  ? '已连接'
                  : status === 'reconnecting'
                    ? '重连中'
                    : '连接中'}
              </span>
            </div>
          </div>

          <div className="topbar-actions">
            {isPortraitPhone && (
              <button
                type="button"
                className="icon-btn"
                onClick={() => void enterLandscape()}
                aria-label="横屏游玩"
                title="横屏游玩"
              >
                <Maximize2 size={18} aria-hidden="true" />
              </button>
            )}
            {isLandscape && (
              <button
                type="button"
                className="icon-btn chat-toggle"
                onClick={() => setSidebarOpen((open) => !open)}
                aria-label={sidebarOpen ? '关闭聊天与记录' : '打开聊天与记录'}
                aria-expanded={sidebarOpen}
              >
                <MessagesSquare size={18} aria-hidden="true" />
              </button>
            )}
            <button
              type="button"
              className="btn btn-ghost topbar-btn"
              onClick={() => void copyInvite()}
            >
              <Copy size={16} aria-hidden="true" />
              <span className="hide-sm">邀请</span>
            </button>
            <button type="button" className="btn btn-danger topbar-btn" onClick={requestBack}>
              <LogOut size={16} aria-hidden="true" />
              <span className="hide-sm">离开</span>
            </button>
          </div>
        </div>
      </header>

      {status === 'reconnecting' && (
        <div className="reconnect-banner" role="status">
          连接中断，正在重连…你的座位会被保留。
        </div>
      )}

      <main className="page-shell room-main">
        <div className="room-grid">
          <section className="table-column" aria-label="牌桌">
            {game ? (
              <GameBoard
                game={game}
                seats={seats}
                mySeat={mySeat}
                isHost={state.you.isHost}
                roomStatus={state.status}
                isLandscape={isLandscape}
                connected={status === 'open'}
                onAction={sendGameAction}
                onRestart={() => sendChecked({ type: 'restart' })}
                onLeave={leaveNow}
              />
            ) : (
              <WaitingTable
                roomId={state.id}
                seats={seats}
                mySeat={mySeat}
                roomStatus={state.status}
                waitingHint={waitingHint}
                canStart={canStart}
                isHost={state.you.isHost}
                onReady={(ready) => sendChecked({ type: 'ready', ready })}
                onStart={() => sendChecked({ type: 'start' })}
                onAddBot={() => sendChecked({ type: 'addBot' })}
                onRemoveBot={(seat) => sendChecked({ type: 'removeBot', seat })}
              />
            )}
          </section>

          <RoomSidebar
            roomId={state.id}
            status={state.status}
            seats={seats}
            chat={state.chat}
            log={game?.log ?? []}
            canChat={mySeat !== null}
            onSend={(text) => sendChecked({ type: 'chat', text })}
            isDrawer={isLandscape}
            isOpen={sidebarOpen}
            onClose={() => setSidebarOpen(false)}
          />
        </div>
      </main>

      {isLandscape && sidebarOpen && (
        <button
          type="button"
          className="sidebar-scrim"
          onClick={() => setSidebarOpen(false)}
          aria-label="关闭聊天与记录"
        />
      )}

      {isPortraitPhone && !rotateHintDismissed && (
        <RotateHint onDismiss={dismissRotateHint} />
      )}

      <ConfirmDialog
        open={leaveOpen}
        title="暂时离开牌桌？"
        description="牌局仍在进行。返回大厅会保留你的座位，之后可通过房间号或邀请链接重新进入。"
        confirmLabel="返回大厅"
        cancelLabel="继续留在此桌"
        tone="danger"
        onConfirm={confirmLeave}
        onCancel={() => setLeaveOpen(false)}
      />
    </div>
  );
}
