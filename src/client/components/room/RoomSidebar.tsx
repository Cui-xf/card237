import { Crown, X } from 'lucide-react';
import type {
  ChatMessage,
  GameLogEntry,
  PublicSeat,
  RoomStatus,
} from '../../../shared/protocol';
import { initials } from '../../lib/format';
import { ChatPanel } from '../ChatPanel';

interface RoomSidebarProps {
  roomId: string;
  status: RoomStatus;
  seats: (PublicSeat | null)[];
  chat: ChatMessage[];
  log: GameLogEntry[];
  canChat: boolean;
  onSend: (text: string) => boolean;
  /** 横屏时侧栏收进抽屉，默认不占牌桌空间。 */
  isDrawer?: boolean;
  isOpen?: boolean;
  onClose?: () => void;
}

export function RoomSidebar({
  roomId,
  status,
  seats,
  chat,
  log,
  canChat,
  onSend,
  isDrawer = false,
  isOpen = false,
  onClose,
}: RoomSidebarProps) {
  const occupied = seats.filter((seat) => seat !== null).length;
  const classes = [
    'room-sidebar',
    'glass',
    isDrawer ? 'is-drawer' : '',
    isDrawer && isOpen ? 'is-open' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <aside
      className={classes}
      aria-label="牌桌信息与聊天"
      inert={isDrawer && !isOpen}
    >
      <div className="sidebar-head">
        <div>
          <p className="eyebrow">牌桌</p>
          <h2 className="sidebar-title">{occupied}/3 玩家</h2>
        </div>
        <div className="sidebar-head-tools">
          <span className="room-code room-code--small">{roomId}</span>
          {isDrawer && onClose && (
            <button
              type="button"
              className="icon-btn sidebar-close"
              onClick={onClose}
              aria-label="关闭聊天与记录"
            >
              <X size={17} aria-hidden="true" />
            </button>
          )}
        </div>
      </div>

      <ul className="sidebar-players">
        {seats.map((seat, index) => (
          <li key={index} className="sidebar-player">
            <span className={`mini-avatar avatar-seat-${index}`} aria-hidden="true">
              {seat ? initials(seat.name) : '+'}
            </span>
            <span className="sidebar-player-name">
              {seat ? seat.name : '空位'}
              {seat?.isHost && <Crown size={13} className="text-gold-300" aria-label="房主" />}
            </span>
            {seat ? (
              <span
                className={`presence-dot ${seat.online ? 'is-online' : 'is-offline'}`}
                aria-label={seat.online ? '在线' : '离线'}
              />
            ) : (
              <span className="sidebar-empty-chip">空</span>
            )}
          </li>
        ))}
      </ul>

      <div className="sidebar-status-line">
        <span className={`status-chip status-${status}`}>
          {status === 'waiting' ? '准备中' : status === 'playing' ? '对局中' : '已结束'}
        </span>
      </div>

      <ChatPanel chat={chat} log={log} seats={seats} canChat={canChat} onSend={onSend} />
    </aside>
  );
}
