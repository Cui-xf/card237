import {
  ArrowRight,
  Layers,
  Loader2,
  LogIn,
  Plus,
  RefreshCw,
  UserRound,
  Users,
  Zap,
} from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { Card } from '../../shared/cards';
import type { RoomMeta } from '../../shared/protocol';
import { statusLabel } from '../../shared/protocol';
import { AVAILABLE_RULES, DEFAULT_RULE_ID, RULE_META } from '../../shared/rules';
import type { RuleId } from '../../shared/rules/types';
import { LobbyCard } from '../components/lobby/LobbyCard';
import { Logo } from '../components/Logo';
import type { ToastTone } from '../components/Toast';
import { createRoom, fetchRoom, fetchRooms } from '../lib/api';
import { goToRoom } from '../lib/hashRoute';
import { usePhoneLayout } from '../lib/usePhoneLayout';

interface LobbyPageProps {
  playerName: string;
  onPlayerNameChange: (name: string) => void;
  notify: (message: string, tone?: ToastTone) => void;
}

const HERO_CARDS: Card[] = [
  { id: 'hero-back', rank: 'A', suit: 'spade' },
  { id: 'hero-left', rank: 'K', suit: 'heart' },
  { id: 'hero-right', rank: 'BJ', suit: 'joker' },
];

function normalizeCode(value: string): string {
  return value
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 6);
}

function relativeTime(timestamp: number): string {
  const diff = Math.max(0, Date.now() - timestamp);
  if (diff < 60_000) return '刚刚';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`;
  return `${Math.floor(diff / 86_400_000)} 天前`;
}

function joinLabel(room: RoomMeta): string {
  if (room.status === 'waiting') {
    return room.players >= room.capacity ? '已满员' : '进入';
  }
  if (room.status === 'playing') return '进行中';
  return '已结束';
}

export function LobbyPage({ playerName, onPlayerNameChange, notify }: LobbyPageProps) {
  const { isLandscape } = usePhoneLayout();
  const [rooms, setRooms] = useState<RoomMeta[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [refreshNonce, setRefreshNonce] = useState(0);

  const [roomName, setRoomName] = useState('');
  const [ruleId, setRuleId] = useState<RuleId>(DEFAULT_RULE_ID);
  const [joinCode, setJoinCode] = useState('');
  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState(false);

  const nicknameRef = useRef<HTMLInputElement>(null);
  const joinRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let alive = true;

    const load = async (showLoading: boolean) => {
      if (document.visibilityState === 'hidden') return;
      if (showLoading) setLoading(true);
      try {
        const payload = await fetchRooms();
        if (!alive) return;
        setRooms(payload.rooms);
        setListError(null);
      } catch (error) {
        if (!alive) return;
        setListError(error instanceof Error ? error.message : '房间列表加载失败');
      } finally {
        if (alive && showLoading) setLoading(false);
      }
    };

    void load(true);
    const timer = window.setInterval(() => void load(false), 8_000);
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') void load(false);
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      alive = false;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [refreshNonce]);

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nickname = playerName.trim();
    if (!nickname) {
      notify('先给自己取个昵称吧', 'error');
      nicknameRef.current?.focus();
      return;
    }

    setCreating(true);
    try {
      const { room } = await createRoom(
        roomName.trim() || `${nickname} 的牌桌`,
        ruleId,
      );
      goToRoom(room.id);
    } catch (error) {
      notify(error instanceof Error ? error.message : '创建房间失败', 'error');
    } finally {
      setCreating(false);
    }
  };

  const handleJoin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const code = normalizeCode(joinCode);
    if (code.length !== 6) {
      notify('请输入 6 位房间号', 'error');
      joinRef.current?.focus();
      return;
    }

    setJoining(true);
    try {
      await fetchRoom(code);
      goToRoom(code);
    } catch (error) {
      notify(error instanceof Error ? error.message : '房间不存在或已过期', 'error');
    } finally {
      setJoining(false);
    }
  };

  const retryList = () => setRefreshNonce((value) => value + 1);

  return (
    <div className={`page-shell lobby-page${isLandscape ? ' is-landscape' : ''}`}>
      <header className="lobby-nav">
        <Logo />
        <div className="nav-right">
          <span className="nav-pill">
            <span className="live-dot" aria-hidden="true" />
            实时对战
          </span>
          <span className="nav-user">
            <UserRound size={14} aria-hidden="true" />
            {playerName.trim() || '未设置昵称'}
          </span>
        </div>
      </header>

      <main className="lobby-main">
        <section className="lobby-hero" aria-labelledby="hero-title">
          <div className="hero-copy">
            <p className="eyebrow">WORKERS × DURABLE OBJECTS</p>
            <h1 id="hero-title" className="hero-title">
              三缺一，
              <br />
              <span>来一局。</span>
            </h1>
            <p className="hero-sub">
              打开浏览器就能开桌。每间房独立隔离，实时同步、断线重连，把房间号发给朋友即可入座。
            </p>

            <div className="feature-chips">
              <span>
                <Users size={14} aria-hidden="true" />
                多人对战
              </span>
              <span>
                <Zap size={14} aria-hidden="true" />
                实时同步
              </span>
              <span>
                <Layers size={14} aria-hidden="true" />
                房间隔离
              </span>
            </div>

            <form className="join-panel glass" onSubmit={handleJoin}>
              <label className="field-label" htmlFor="join-code">
                有房间号？直接加入
              </label>
              <div className="join-row">
                <input
                  id="join-code"
                  ref={joinRef}
                  className="field code-input"
                  value={joinCode}
                  onChange={(event) => setJoinCode(normalizeCode(event.target.value))}
                  placeholder="ABC123"
                  inputMode="text"
                  autoCapitalize="characters"
                  autoComplete="off"
                  spellCheck={false}
                  maxLength={6}
                  aria-describedby="join-hint"
                />
                <button type="submit" className="btn btn-primary" disabled={joining}>
                  {joining ? (
                    <Loader2 size={17} className="animate-spin" aria-hidden="true" />
                  ) : (
                    <LogIn size={17} aria-hidden="true" />
                  )}
                  加入
                </button>
              </div>
              <p id="join-hint" className="form-hint">
                房间号为 6 位字母数字，不区分大小写。
              </p>
            </form>
          </div>

          <div className="hero-side">
            <div className="hero-deck" aria-hidden="true">
              <div className="hero-orbit" />
              <div className="hero-card hero-card--back">
                <LobbyCard card={HERO_CARDS[0]} faceDown />
              </div>
              <div className="hero-card hero-card--left">
                <LobbyCard card={HERO_CARDS[1]} />
              </div>
              <div className="hero-card hero-card--right">
                <LobbyCard card={HERO_CARDS[2]} />
              </div>
            </div>

            <form className="create-panel glass" onSubmit={handleCreate}>
              <div className="panel-heading">
                <div>
                  <p className="eyebrow">开新桌</p>
                  <h2 className="panel-title">创建房间</h2>
                </div>
                <span className="panel-icon" aria-hidden="true">
                  <Plus size={18} />
                </span>
              </div>

              <div className="create-fields">
                <div className="create-field">
                  <label className="field-label" htmlFor="nickname">
                    你的昵称
                  </label>
                  <input
                    id="nickname"
                    ref={nicknameRef}
                    className="field"
                    value={playerName}
                    onChange={(event) =>
                      onPlayerNameChange(event.target.value.slice(0, 12))
                    }
                    placeholder="例如：阿七"
                    maxLength={12}
                    autoComplete="nickname"
                  />
                </div>

                <div className="create-field">
                  <label className="field-label" htmlFor="rule-id">
                    游戏规则
                  </label>
                  <select
                    id="rule-id"
                    className="field"
                    value={ruleId}
                    onChange={(event) => setRuleId(event.target.value as RuleId)}
                  >
                    {AVAILABLE_RULES.map((rule) => (
                      <option key={rule.id} value={rule.id}>
                        {rule.name}（{rule.capacity} 人）
                      </option>
                    ))}
                  </select>
                </div>

                <div className="create-field">
                  <label className="field-label" htmlFor="room-name">
                    房间名 <span className="optional">可选</span>
                  </label>
                  <input
                    id="room-name"
                    className="field"
                    value={roomName}
                    onChange={(event) => setRoomName(event.target.value.slice(0, 24))}
                    placeholder="例如：周五牌局"
                    maxLength={24}
                  />
                </div>
              </div>

              <button type="submit" className="btn btn-gold w-full" disabled={creating}>
                {creating ? (
                  <Loader2 size={17} className="animate-spin" aria-hidden="true" />
                ) : (
                  <Plus size={17} aria-hidden="true" />
                )}
                创建并进入
              </button>
              <p className="form-hint">创建后生成 6 位房间号，分享链接即可邀请朋友。</p>
            </form>
          </div>
        </section>

        <section className="rooms-section" aria-labelledby="rooms-title">
          <div className="section-head">
            <div>
              <p className="eyebrow">LOBBY</p>
              <h2 id="rooms-title" className="section-title">
                公开牌桌
              </h2>
            </div>
            <div className="section-actions">
              <span className="room-count">{rooms?.length ?? 0} 桌</span>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={retryList}
                aria-label="刷新房间列表"
              >
                <RefreshCw
                  size={16}
                  className={loading ? 'animate-spin' : ''}
                  aria-hidden="true"
                />
                刷新
              </button>
            </div>
          </div>

          {rooms === null && loading ? (
            <div className="rooms-grid" aria-label="正在加载房间">
              {[0, 1, 2].map((index) => (
                <div key={index} className="room-tile room-skeleton" aria-hidden="true">
                  <div className="skeleton-line skeleton-line--wide" />
                  <div className="skeleton-line" />
                  <div className="skeleton-line skeleton-line--short" />
                </div>
              ))}
            </div>
          ) : rooms === null && listError ? (
            <div className="state-card glass">
              <p>{listError}</p>
              <button type="button" className="btn btn-ghost" onClick={retryList}>
                重新加载
              </button>
            </div>
          ) : rooms && rooms.length === 0 ? (
            <div className="state-card glass">
              <span className="state-icon" aria-hidden="true">
                ♠
              </span>
              <h3>还没有牌桌</h3>
              <p>创建第一张牌桌，把房间号发给朋友。</p>
              <button
                type="button"
                className="btn btn-gold"
                onClick={() => nicknameRef.current?.focus()}
              >
                <Plus size={17} aria-hidden="true" />
                去创建
              </button>
            </div>
          ) : (
            <div className="rooms-grid">
              {rooms?.map((room) => {
                const canJoin = room.status === 'waiting' && room.players < room.capacity;
                return (
                  <article key={room.id} className="room-tile glass">
                    <div className="room-tile-top">
                      <div className="room-tile-title-wrap">
                        <h3 className="room-tile-name">{room.name}</h3>
                        <p className="room-code">{room.id}</p>
                      </div>
                      <span className={`status-chip status-${room.status}`}>
                        {statusLabel(room.status)}
                      </span>
                    </div>

                    <div className="room-tile-meta">
                      <span className="room-players">
                        <Layers size={14} aria-hidden="true" />
                        {RULE_META[room.ruleId].name}
                      </span>
                      <span className="room-players">
                        <Users size={14} aria-hidden="true" />
                        {room.players}/{room.capacity}
                      </span>
                      <span>{relativeTime(room.createdAt)}</span>
                    </div>

                    <div className="room-tile-foot">
                      <div className="room-dots" aria-hidden="true">
                        {Array.from({ length: room.capacity }, (_, index) => (
                          <span
                            key={index}
                            className={`room-dot ${index < room.players ? 'is-filled' : ''}`}
                          />
                        ))}
                      </div>
                      <button
                        type="button"
                        className={`btn ${canJoin ? 'btn-ghost' : 'btn-ghost room-btn-muted'}`}
                        disabled={!canJoin}
                        onClick={() => goToRoom(room.id)}
                      >
                        {joinLabel(room)}
                        {canJoin && <ArrowRight size={15} aria-hidden="true" />}
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}

          {listError && rooms && <p className="inline-error">{listError}</p>}
        </section>

        <footer className="lobby-footer">
          <span>Card237 · 骨架版本</span>
          <span>发牌 / 出牌 / 回合已打通，斗地主牌型规则等待接入</span>
        </footer>
      </main>
    </div>
  );
}
