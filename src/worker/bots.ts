import type { ClientMessage, RoomStatus } from '../shared/protocol';
import type { RuleId } from '../shared/rules/types';
import { ruleRuntime } from './game/rules';
import type { RuleActionContext } from './game/rules/types';

/** 机器人两次动作之间的间隔，避免一次 alarm 里连续行动。 */
export const BOT_ACTION_DELAY_MS = 450;

export interface BotSeatSnapshot {
  playerId: string;
  ready: boolean;
  bot: boolean;
}

export interface BotRoomSnapshot {
  status: RoomStatus;
  hostId: string | null;
  seats: (BotSeatSnapshot | null)[];
  game: { ruleId: RuleId; state: unknown } | null;
}

export interface BotMessage {
  playerId: string;
  message: ClientMessage;
}

/**
 * 计算机器人下一条「等效指令」。
 *
 * 机器人不直接修改房间或牌局状态：它和真人一样发送 `ready` / `start` / `game` 消息，
 * 由房间正常的消息处理流程完成校验、持久化与广播。这样机器人只是「自动按按钮的玩家」，
 * 游戏本身的规则与流程不需要为机器人让步。
 *
 * 返回 null 表示当前没有机器人需要行动。
 */
export function nextBotMessage(
  room: BotRoomSnapshot,
  ctx: RuleActionContext,
): BotMessage | null {
  const bots = room.seats.filter(
    (seat): seat is BotSeatSnapshot => seat !== null && seat.bot,
  );
  if (bots.length === 0) return null;

  if (room.status === 'waiting') {
    // 1) 自动准备。
    const notReady = bots.find((seat) => !seat.ready);
    if (notReady) {
      return { playerId: notReady.playerId, message: { type: 'ready', ready: true } };
    }

    // 2) 房主是机器人时，所有人准备完后自动发送开始指令。
    if (!room.hostId || !bots.some((seat) => seat.playerId === room.hostId)) {
      return null;
    }
    const roomFull = room.seats.every((seat) => seat !== null);
    const everyoneReady = room.seats.every((seat) => seat === null || seat.ready);
    if (roomFull && everyoneReady) {
      return { playerId: room.hostId, message: { type: 'start' } };
    }
    return null;
  }

  if (room.status === 'playing' && room.game) {
    const runtime = ruleRuntime(room.game.ruleId);
    if (!runtime?.botAction) return null;

    for (let seat = 0; seat < room.seats.length; seat += 1) {
      if (!room.seats[seat]?.bot) continue;
      const action = runtime.botAction(room.game.state, seat, ctx);
      if (action) {
        return {
          playerId: room.seats[seat]!.playerId,
          message: { type: 'game', action },
        };
      }
    }
  }

  return null;
}
