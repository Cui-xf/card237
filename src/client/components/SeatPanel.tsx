import { Crown } from 'lucide-react';
import type { PublicSeat, RoomStatus } from '../../shared/protocol';
import { initials } from '../lib/format';

interface SeatPanelProps {
  seat: PublicSeat | null;
  seatIndex: number;
  position: 'left' | 'right' | 'self';
  isCurrent: boolean;
  status: RoomStatus;
  handCount: number;
  isYou?: boolean;
}

export function SeatPanel({
  seat,
  seatIndex,
  position,
  isCurrent,
  status,
  handCount,
  isYou = false,
}: SeatPanelProps) {
  const classes = [
    'seat-panel',
    `seat-panel--${position}`,
    isCurrent ? 'seat-turn' : '',
    seat && !seat.online ? 'seat-offline' : '',
  ]
    .filter(Boolean)
    .join(' ');

  if (!seat) {
    return (
      <div className={`${classes} seat-panel--empty`} aria-label={`座位 ${seatIndex + 1}，等待玩家`}>
        <span className="seat-empty-plus" aria-hidden="true">
          +
        </span>
        <span className="seat-empty-text">等待玩家</span>
        <span className="seat-empty-index">座位 {seatIndex + 1}</span>
      </div>
    );
  }

  return (
    <div className={classes}>
      <div className={`seat-avatar avatar-seat-${seatIndex}`} aria-hidden="true">
        {initials(seat.name)}
      </div>
      <span
        className={`presence-dot ${seat.online ? 'is-online' : 'is-offline'}`}
        aria-label={seat.online ? '在线' : '离线'}
      />

      <div className="seat-info">
        <div className="seat-name-row">
          <span className="seat-name">{seat.name}</span>
          {seat.isHost && <Crown className="seat-crown" size={14} aria-label="房主" />}
          {isYou && <span className="seat-you">你</span>}
        </div>

        <div className="seat-meta">
          {status === 'waiting' ? (
            seat.ready ? (
              <span className="text-emerald-300">已准备</span>
            ) : (
              <span>未准备</span>
            )
          ) : (
            <span>{handCount} 张牌</span>
          )}
          {isCurrent && status === 'playing' && <span className="turn-chip">出牌中</span>}
          {!seat.online && <span className="text-amber-300">离线</span>}
        </div>
      </div>

      {status !== 'waiting' && (
        <div className="seat-card-count" aria-label={`剩余 ${handCount} 张牌`}>
          <span className="mini-card-back" aria-hidden="true" />
          <span>{handCount}</span>
        </div>
      )}
    </div>
  );
}
