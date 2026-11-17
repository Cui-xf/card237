import { Check, Play, X } from 'lucide-react';
import type { CSSProperties } from 'react';
import type { PublicSeat, RoomStatus } from '../../../shared/protocol';
import { initials } from '../../lib/format';

interface WaitingTableProps {
  roomId: string;
  seats: (PublicSeat | null)[];
  mySeat: number | null;
  roomStatus: RoomStatus;
  waitingHint: string;
  canStart: boolean;
  isHost: boolean;
  onReady: (ready: boolean) => void;
  onStart: () => void;
}

/**
 * 未开局时的等待面板。
 *
 * 牌桌本身由 Phaser 绘制；这里只负责座位状态与准备/开始操作，
 * 不再复用任何旧的 React 牌桌结构。
 */
export function WaitingTable({
  roomId,
  seats,
  mySeat,
  waitingHint,
  canStart,
  isHost,
  onReady,
  onStart,
}: WaitingTableProps) {
  const capacity = seats.length;
  const occupied = seats.filter((seat) => seat !== null).length;
  const mySelf = mySeat !== null ? seats[mySeat] : null;

  return (
    <section className="waiting-panel" aria-label="等待开局">
      <header className="waiting-head">
        <div>
          <p className="waiting-eyebrow">房间号</p>
          <p className="waiting-code">{roomId}</p>
        </div>
        <span className="waiting-count">
          {occupied}/{capacity} 人
        </span>
      </header>

      <div
        className="waiting-seat-grid"
        style={{ '--seat-count': capacity } as CSSProperties}
      >
        {seats.map((seat, index) => (
          <div
            key={index}
            className={[
              'waiting-seat',
              seat ? '' : 'is-empty',
              index === mySeat ? 'is-self' : '',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            <span className="waiting-avatar" aria-hidden="true">
              {seat ? initials(seat.name) : '+'}
            </span>
            <span className="waiting-name">{seat?.name ?? '等待玩家'}</span>
            <span className="waiting-tags">
              {seat?.isHost && <span className="waiting-tag">房主</span>}
              {index === mySeat && <span className="waiting-tag">你</span>}
              {seat &&
                (seat.online ? (
                  <span className={`waiting-tag${seat.ready ? ' is-ready' : ''}`}>
                    {seat.ready ? '已准备' : '未准备'}
                  </span>
                ) : (
                  <span className="waiting-tag is-offline">离线</span>
                ))}
            </span>
          </div>
        ))}
      </div>

      <footer className="waiting-actions">
        <p className="waiting-hint">{waitingHint}</p>

        {mySeat !== null ? (
          <>
            <button
              type="button"
              className={`btn ${mySelf?.ready ? 'btn-ghost' : 'btn-gold'}`}
              onClick={() => onReady(!mySelf?.ready)}
            >
              {mySelf?.ready ? (
                <X size={17} aria-hidden="true" />
              ) : (
                <Check size={17} aria-hidden="true" />
              )}
              {mySelf?.ready ? '取消准备' : '准备'}
            </button>

            {isHost && (
              <button
                type="button"
                className="btn btn-primary"
                disabled={!canStart}
                onClick={onStart}
              >
                <Play size={17} aria-hidden="true" />
                开始游戏
              </button>
            )}
          </>
        ) : (
          <span className="waiting-hint">正在入座，稍候…</span>
        )}
      </footer>
    </section>
  );
}
