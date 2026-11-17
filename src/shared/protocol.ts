import type { GameAction, PublicGameView, RuleId } from './rules/types';

export const ROOM_CODE_LENGTH = 6;

export type RoomStatus = 'waiting' | 'playing' | 'finished';

export interface RoomMeta {
  id: string;
  name: string;
  ruleId: RuleId;
  status: RoomStatus;
  players: number;
  capacity: number;
  createdAt: number;
  updatedAt: number;
}

export interface PublicSeat {
  playerId: string;
  name: string;
  seat: number;
  ready: boolean;
  online: boolean;
  isHost: boolean;
  joinedAt: number;
}

export interface ChatMessage {
  id: number;
  playerId: string;
  name: string;
  text: string;
  at: number;
}

/** 牌局日志分类，保持规则无关，供各规则复用。 */
export type GameLogKind =
  | 'system'
  | 'landlord'
  | 'play'
  | 'pass'
  | 'win'
  | 'deal'
  | 'trump'
  | 'trick'
  | 'score';

export interface GameLogEntry {
  id: number;
  at: number;
  kind: GameLogKind;
  text: string;
  seat?: number;
}

export interface RoomView {
  id: string;
  name: string;
  ruleId: RuleId;
  status: RoomStatus;
  hostId: string | null;
  seats: (PublicSeat | null)[];
  /** 规则无关的信封；具体字段由 `ruleId` 决定。 */
  game: PublicGameView | null;
  chat: ChatMessage[];
  version: number;
  serverTime: number;
  you: {
    playerId: string;
    seat: number | null;
    isHost: boolean;
  };
}

export type ClientMessage =
  | { type: 'ready'; ready: boolean }
  | { type: 'start' }
  | { type: 'game'; action: GameAction }
  | { type: 'chat'; text: string }
  | { type: 'leave' }
  | { type: 'restart' }
  | { type: 'ping'; t: number };

export type ServerMessage =
  | { type: 'state'; state: RoomView }
  | { type: 'error'; code: string; message: string }
  | { type: 'pong'; t: number };

export function isRoomStatus(value: unknown): value is RoomStatus {
  return value === 'waiting' || value === 'playing' || value === 'finished';
}

export function statusLabel(status: RoomStatus): string {
  switch (status) {
    case 'waiting':
      return '等待中';
    case 'playing':
      return '游戏中';
    case 'finished':
      return '已结束';
  }
}
