import type { Card } from './cards';

export const ROOM_CAPACITY = 3;
export const ROOM_CODE_LENGTH = 6;

export type RoomStatus = 'waiting' | 'playing' | 'finished';
export type GamePhase = 'playing' | 'finished';

export interface RoomMeta {
  id: string;
  name: string;
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

export type GameLogKind = 'system' | 'landlord' | 'play' | 'pass' | 'win';

export interface GameLogEntry {
  id: number;
  at: number;
  kind: GameLogKind;
  text: string;
  seat?: number;
}

export interface LastPlay {
  seat: number;
  cards: Card[];
  at: number;
}

export interface PublicGame {
  phase: GamePhase;
  landlordSeat: number;
  currentSeat: number;
  /** 只包含当前连接玩家自己的手牌，其他玩家手牌永远不会下发。 */
  hand: Card[];
  handCounts: number[];
  bottomCards: Card[];
  lastPlay: LastPlay | null;
  passCount: number;
  winnerSeat: number | null;
  turnStartedAt: number;
  log: GameLogEntry[];
}

export interface RoomView {
  id: string;
  name: string;
  status: RoomStatus;
  hostId: string | null;
  seats: (PublicSeat | null)[];
  game: PublicGame | null;
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
  | { type: 'play'; cardIds: string[] }
  | { type: 'pass' }
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
