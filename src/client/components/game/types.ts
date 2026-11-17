import type { PublicSeat, RoomStatus } from '../../../shared/protocol';
import type { GameAction } from '../../../shared/rules/types';

/**
 * 每套规则的牌桌组件收到的通用属性。
 *
 * `TGame` 由 `GameBoard` 按 `ruleId` 收窄，各规则牌桌因此能拿到强类型的 `data`。
 */
export interface GameBoardProps<TGame> {
  game: TGame;
  seats: (PublicSeat | null)[];
  mySeat: number | null;
  isHost: boolean;
  roomStatus: RoomStatus;
  isLandscape: boolean;
  /** 牌桌是否处于已连接状态；未提供时按已连接处理。 */
  connected?: boolean;
  /** 统一走 `{ type: 'game', action }` 信封。 */
  onAction: (action: GameAction) => void;
  onRestart: () => void;
  onLeave: () => void;
}
