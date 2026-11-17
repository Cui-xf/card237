import {
  ArrowLeft,
  Check,
  Copy,
  LogOut,
  MessagesSquare,
  Play,
  Users,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import type { Card } from '../../shared/cards';
import type { ClientMessage } from '../../shared/protocol';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Hand } from '../components/Hand';
import { StaticCardRow } from '../components/PlayingCard';
import { SeatPanel } from '../components/SeatPanel';
import type { ToastTone } from '../components/Toast';
import { LoadingScreen, NameGate, RoomErrorScreen } from '../components/room/RoomScreens';
import { PlayZone } from '../components/room/PlayZone';
import { RoomSidebar } from '../components/room/RoomSidebar';
import { RotateHint } from '../components/room/RotateHint';
import { TurnMeter } from '../components/room/TurnMeter';
import { WinnerOverlay } from '../components/room/WinnerOverlay';
import { copyText } from '../lib/clipboard';
import { seatTextClass } from '../lib/format';
import { fetchRoom } from '../lib/api';
import { useMediaQuery } from '../lib/useMediaQuery';
import { useRoomSocket } from '../lib/useRoomSocket';

interface RoomPageProps {
  roomId: string;
  playerId: string;
  playerName: string;
  onPlayerNameChange: (name: string) => void;
  notify: (message: string, tone?: ToastTone) => void;
  onBack: () => void;
}

const EMPTY_CARDS: Card[] = [];

/** 手机横屏（矮窗口 + 触摸）走紧凑牌桌布局，桌面窄窗口不受影响。 */
const LANDSCAPE_QUERY =
  '(orientation: landscape) and (max-height: 600px) and (pointer: coarse)';
const PORTRAIT_PHONE_QUERY =
  '(orientation: portrait) and (max-width: 900px) and (pointer: coarse)';
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
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [rotateHintDismissed, setRotateHintDismissed] = useState(
    readRotateHintDismissed,
  );
  const isLandscape = useMediaQuery(LANDSCAPE_QUERY);
  const isPortraitPhone = useMediaQuery(PORTRAIT_PHONE_QUERY);

  useEffect(() => {
    if (!isLandscape) setSidebarOpen(false);
  }, [isLandscape]);

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

  const myHand = state?.game?.hand ?? EMPTY_CARDS;
  const handSignature = myHand.map((card) => card.id).join('|');
  const viewStatus = state?.status;

  useEffect(() => {
    if (notice) notify(notice.message, 'error');
  }, [notice, notify]);

  useEffect(() => {
    const available = new Set(myHand.map((card) => card.id));
    setSelected((previous) => {
      const next = new Set([...previous].filter((id) => available.has(id)));
      return next.size === previous.size ? previous : next;
    });
  }, [handSignature]);

  useEffect(() => {
    if (viewStatus !== 'playing') {
      setSelected((previous) => (previous.size === 0 ? previous : new Set()));
    }
  }, [viewStatus]);

  const sendChecked = useCallback(
    (message: ClientMessage): boolean => {
      if (send(message)) return true;
      notify('连接已断开，正在尝试重连…', 'error');
      return false;
    },
    [send, notify],
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

  const toggleCard = useCallback((cardId: string) => {
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(cardId)) next.delete(cardId);
      else next.add(cardId);
      return next;
    });
  }, []);

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
  const mySelf = mySeat !== null ? seats[mySeat] : null;
  const occupied = seats.filter((seat) => seat !== null).length;
  const readyCount = seats.filter((seat) => seat?.ready).length;
  const allOnline = seats.every((seat) => seat === null || seat.online);
  const leftIndex = mySeat === null ? 0 : (mySeat + 1) % 3;
  const rightIndex = mySeat === null ? 1 : (mySeat + 2) % 3;
  const isMyTurn =
    state.status === 'playing' &&
    game !== null &&
    mySeat !== null &&
    game.currentSeat === mySeat;
  const currentName = game ? (seats[game.currentSeat]?.name ?? '玩家') : '';
  const canStart =
    state.you.isHost && occupied === 3 && readyCount === 3 && allOnline;
  const canPass = Boolean(game?.lastPlay) && game?.lastPlay?.seat !== mySeat;
  const winnerSeat = game?.phase === 'finished' ? game.winnerSeat : null;
  const winnerName =
    winnerSeat !== null && winnerSeat !== undefined
      ? (seats[winnerSeat]?.name ?? '玩家')
      : null;

  let waitingHint = '';
  if (occupied < 3) waitingHint = `还差 ${3 - occupied} 位玩家`;
  else if (readyCount < 3) waitingHint = `还有 ${3 - readyCount} 人未准备`;
  else if (!allOnline) waitingHint = '有玩家离线，等待重连';
  else if (!state.you.isHost) waitingHint = '全员已准备，等待房主开始';
  else waitingHint = '可以开始了';

  return (
    <div className={`room-page${isLandscape ? ' is-landscape' : ''}`}>
      <header className="room-topbar">
        <div className="page-shell room-topbar-inner">
          <button type="button" className="icon-btn" onClick={requestBack} aria-label="返回大厅">
            <ArrowLeft size={19} aria-hidden="true" />
          </button>

          <div className="room-heading">
            <h1 className="room-heading-title">{state.name}</h1>
            <div className="room-heading-meta">
              <span className="room-code room-code--small">{state.id}</span>
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
            <div className="felt-wrap">
              <div className="felt-table">
                <div className="table-topline">
                  <span className="table-label">房间 {state.id}</span>
                  {game && (
                    <span className="table-label">
                      地主 ·{' '}
                      <span className={seatTextClass(game.landlordSeat)}>
                        {seats[game.landlordSeat]?.name ?? '玩家'}
                      </span>
                    </span>
                  )}
                </div>

                <div className="bottom-cards" aria-label="底牌">
                  <span className="bottom-cards-label">底牌</span>
                  {game ? (
                    <StaticCardRow cards={game.bottomCards} size="sm" />
                  ) : (
                    <span className="bottom-cards-placeholder">开局揭晓</span>
                  )}
                </div>

                <div className="seat-anchor seat-anchor--left">
                  <SeatPanel
                    seat={seats[leftIndex]}
                    seatIndex={leftIndex}
                    position="left"
                    isCurrent={state.status === 'playing' && game?.currentSeat === leftIndex}
                    status={state.status}
                    handCount={game?.handCounts[leftIndex] ?? 0}
                  />
                </div>

                <div className="seat-anchor seat-anchor--right">
                  <SeatPanel
                    seat={seats[rightIndex]}
                    seatIndex={rightIndex}
                    position="right"
                    isCurrent={state.status === 'playing' && game?.currentSeat === rightIndex}
                    status={state.status}
                    handCount={game?.handCounts[rightIndex] ?? 0}
                  />
                </div>

                <div className="table-center">
                  {game ? (
                    <PlayZone game={game} seats={seats} />
                  ) : (
                    <div className="waiting-center">
                      <span className="waiting-icon" aria-hidden="true">
                        <Users size={22} />
                      </span>
                      <p className="waiting-title">
                        {occupied < 3 ? `还差 ${3 - occupied} 位玩家` : '人齐了'}
                      </p>
                      <p className="waiting-copy">
                        邀请朋友输入房间号{' '}
                        <span className="room-code room-code--inline">{state.id}</span>
                      </p>
                    </div>
                  )}

                  {game && (
                    <TurnMeter
                      turnStartedAt={game.turnStartedAt}
                      active={state.status === 'playing'}
                    />
                  )}
                </div>

                {winnerName && (
                  <WinnerOverlay
                    winnerName={winnerName}
                    isHost={state.you.isHost}
                    onRestart={() => sendChecked({ type: 'restart' })}
                    onLeave={leaveNow}
                  />
                )}
              </div>
            </div>

            <section className="self-dock" aria-label="我的区域">
              <div className="self-head">
                <SeatPanel
                  seat={mySelf}
                  seatIndex={mySeat ?? 0}
                  position="self"
                  isCurrent={isMyTurn}
                  status={state.status}
                  handCount={mySeat !== null ? (game?.handCounts[mySeat] ?? 0) : 0}
                  isYou
                />

                {game && mySeat !== null && (
                  <span
                    className={`role-chip ${
                      game.landlordSeat === mySeat ? 'role-chip--landlord' : ''
                    }`}
                  >
                    {game.landlordSeat === mySeat ? '地主' : '农民'}
                  </span>
                )}

                {state.status === 'playing' && (
                  <span className="selected-counter" aria-live="polite">
                    已选 {selected.size} 张
                  </span>
                )}
              </div>

              {game ? (
                <Hand
                  cards={myHand}
                  selected={selected}
                  onToggle={toggleCard}
                  disabled={state.status === 'finished' || mySeat === null}
                />
              ) : (
                <div className="hand-waiting">
                  <span className="hand-waiting-cards" aria-hidden="true">
                    ♠ ♥ ♣
                  </span>
                  <span>{mySeat === null ? '正在入座…' : '坐稳了，等房主开始'}</span>
                </div>
              )}

              <div className="action-bar">
                {state.status === 'waiting' && mySeat !== null && (
                  <>
                    <button
                      type="button"
                      className={`btn ${mySelf?.ready ? 'btn-ghost' : 'btn-gold'}`}
                      onClick={() =>
                        sendChecked({ type: 'ready', ready: !mySelf?.ready })
                      }
                    >
                      {mySelf?.ready ? (
                        <X size={17} aria-hidden="true" />
                      ) : (
                        <Check size={17} aria-hidden="true" />
                      )}
                      {mySelf?.ready ? '取消准备' : '准备'}
                    </button>

                    {state.you.isHost && (
                      <button
                        type="button"
                        className="btn btn-primary"
                        disabled={!canStart}
                        onClick={() => sendChecked({ type: 'start' })}
                      >
                        <Play size={17} aria-hidden="true" />
                        开始游戏
                      </button>
                    )}

                    <p className="action-note">{waitingHint}</p>
                  </>
                )}

                {state.status === 'playing' &&
                  (isMyTurn ? (
                    <>
                      <button
                        type="button"
                        className="btn btn-ghost"
                        disabled={!canPass}
                        onClick={() => sendChecked({ type: 'pass' })}
                      >
                        不出
                      </button>
                      <button
                        type="button"
                        className="btn btn-gold"
                        disabled={selected.size === 0}
                        onClick={() =>
                          sendChecked({ type: 'play', cardIds: [...selected] })
                        }
                      >
                        <Play size={17} aria-hidden="true" />
                        出牌{selected.size > 0 ? ` · ${selected.size}` : ''}
                      </button>
                      <p className="action-note">轮到你出牌</p>
                    </>
                  ) : (
                    <p className="action-note action-note--strong">
                      等待 {currentName} 出牌…
                    </p>
                  ))}

                {state.status === 'finished' && (
                  <p className="action-note">本局结束，等待房主开启下一局。</p>
                )}

                {mySeat === null && <p className="action-note">你正在旁观这局牌。</p>}
              </div>
            </section>
          </section>

          <RoomSidebar
            roomId={state.id}
            status={state.status}
            seats={seats}
            chat={state.chat}
            log={game?.log ?? []}
            canChat={mySeat !== null}
            onSend={(text) => sendChecked({ type: 'chat', text })}
          />
        </div>
      </main>

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
