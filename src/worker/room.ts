import type {
  ChatMessage,
  PublicGame,
  PublicSeat,
  RoomMeta,
  RoomStatus,
  RoomView,
  ServerMessage,
} from '../shared/protocol';
import { ROOM_CAPACITY } from '../shared/protocol';
import type { Env } from './env';
import { createGame, passTurn, playCards, type GameState } from './game/engine';
import {
  json,
  normalizeRoomCode,
  sanitizeChat,
  sanitizeNickname,
  sanitizeRoomName,
} from './util';

const DISCONNECT_GRACE_MS = 60_000;
const MAX_CHAT_MESSAGES = 60;
const CHAT_COOLDOWN_MS = 700;

interface SeatState {
  playerId: string;
  name: string;
  ready: boolean;
  joinedAt: number;
  disconnectedAt: number | null;
}

interface StoredRoom {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  hostId: string | null;
  status: RoomStatus;
  seats: (SeatState | null)[];
  game: GameState | null;
  chat: ChatMessage[];
  nextChatId: number;
  version: number;
}

interface SocketAttachment {
  playerId?: string | null;
}

function attachmentOf(ws: WebSocket): SocketAttachment | null {
  try {
    return (ws.deserializeAttachment() as SocketAttachment | null) ?? null;
  } catch {
    return null;
  }
}

function normalizePlayerId(value: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return /^[A-Za-z0-9_-]{8,64}$/.test(trimmed) ? trimmed : null;
}

/**
 * 一个房间 = 一个 Durable Object 实例。
 *
 * - 房间之间的状态完全隔离，互不阻塞；
 * - WebSocket 使用 Hibernation API，空闲时 DO 可以休眠，适合免费套餐；
 * - 每个连接只收到自己的手牌，其他玩家只下发手牌数量。
 */
export class RoomDO {
  private readonly ctx: DurableObjectState;
  private readonly env: Env;
  private room: StoredRoom | null = null;
  private readonly lastChatAt = new Map<string, number>();

  constructor(ctx: DurableObjectState, env: Env) {
    this.ctx = ctx;
    this.env = env;
    ctx.blockConcurrencyWhile(async () => {
      this.room = (await ctx.storage.get<StoredRoom>('room')) ?? null;
    });
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'POST' && url.pathname === '/internal/init') {
      return this.handleInit(request);
    }
    if (request.method === 'GET' && url.pathname === '/internal/meta') {
      return this.handleMeta();
    }
    if (url.pathname.endsWith('/ws')) {
      return this.handleWebSocket(request, url);
    }

    return json({ error: 'Not found' }, 404);
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    if (typeof raw !== 'string') return;

    let payload: unknown;
    try {
      payload = JSON.parse(raw);
    } catch {
      return;
    }
    if (!payload || typeof payload !== 'object') return;

    const message = payload as Record<string, unknown> & { type?: unknown };
    const playerId = attachmentOf(ws)?.playerId;
    const room = this.room;
    if (!playerId || !room) return;

    if (message.type === 'ping') {
      this.send(ws, { type: 'pong', t: Date.now() });
      return;
    }

    const seatIndex = this.findSeat(room, playerId);

    switch (message.type) {
      case 'ready': {
        if (seatIndex === null) return this.sendError(ws, '你不在牌桌座位上');
        if (room.status !== 'waiting') return this.sendError(ws, '牌局已经开始');
        if (typeof message.ready !== 'boolean') return this.sendError(ws, '无效的准备状态');
        room.seats[seatIndex]!.ready = message.ready;
        await this.commit();
        return;
      }

      case 'start': {
        if (room.hostId !== playerId) return this.sendError(ws, '只有房主可以开始游戏');
        if (room.status !== 'waiting') return this.sendError(ws, '牌局已经开始');
        if (room.seats.some((seat) => seat === null)) {
          return this.sendError(ws, '需要 3 名玩家才能开始');
        }
        if (!room.seats.every((seat) => seat?.ready)) {
          return this.sendError(ws, '所有玩家准备后才能开始');
        }
        const online = this.onlinePlayerIds();
        if (room.seats.some((seat) => seat && !online.has(seat.playerId))) {
          return this.sendError(ws, '有玩家掉线，请等待重连');
        }

        const names = room.seats.map((seat) => seat?.name ?? '玩家');
        room.status = 'playing';
        room.game = createGame(names);
        await this.commit();
        return;
      }

      case 'play': {
        if (seatIndex === null) return this.sendError(ws, '你不在牌桌座位上');
        if (room.status !== 'playing' || !room.game) {
          return this.sendError(ws, '牌局尚未开始');
        }
        if (
          !Array.isArray(message.cardIds) ||
          message.cardIds.some((id) => typeof id !== 'string')
        ) {
          return this.sendError(ws, '出牌数据无效');
        }

        const result = playCards(room.game, seatIndex, message.cardIds as string[]);
        if (!result.ok) return this.sendError(ws, result.error);

        room.game = result.state;
        if (room.game.phase === 'finished') {
          room.status = 'finished';
        }
        await this.commit();
        return;
      }

      case 'pass': {
        if (seatIndex === null) return this.sendError(ws, '你不在牌桌座位上');
        if (room.status !== 'playing' || !room.game) {
          return this.sendError(ws, '牌局尚未开始');
        }

        const result = passTurn(room.game, seatIndex);
        if (!result.ok) return this.sendError(ws, result.error);

        room.game = result.state;
        await this.commit();
        return;
      }

      case 'chat': {
        if (seatIndex === null) return this.sendError(ws, '你不在牌桌座位上');
        const text = sanitizeChat(message.text);
        if (!text) return;

        const now = Date.now();
        if (now - (this.lastChatAt.get(playerId) ?? 0) < CHAT_COOLDOWN_MS) return;
        this.lastChatAt.set(playerId, now);

        room.chat.push({
          id: room.nextChatId,
          playerId,
          name: room.seats[seatIndex]!.name,
          text,
          at: now,
        });
        room.nextChatId += 1;
        if (room.chat.length > MAX_CHAT_MESSAGES) {
          room.chat.splice(0, room.chat.length - MAX_CHAT_MESSAGES);
        }
        await this.commit();
        return;
      }

      case 'leave': {
        if (seatIndex === null) {
          ws.close(1000, 'left');
          return;
        }
        if (room.status === 'playing') {
          return this.sendError(ws, '牌局进行中，暂时不能退出房间');
        }

        room.seats[seatIndex] = null;
        if (room.hostId === playerId) {
          room.hostId = this.firstOccupiedPlayerId(room);
        }
        if (room.status === 'finished') {
          room.status = 'waiting';
          room.game = null;
          for (const seat of room.seats) {
            if (seat) seat.ready = false;
          }
        }
        await this.commit();
        ws.close(1000, 'left');
        return;
      }

      case 'restart': {
        if (room.hostId !== playerId) return this.sendError(ws, '只有房主可以开启新一局');
        if (room.status !== 'finished') return this.sendError(ws, '牌局尚未结束');
        if (room.seats.some((seat) => seat === null)) {
          return this.sendError(ws, '有玩家离开，等待满员后再开始');
        }

        room.status = 'waiting';
        room.game = null;
        for (const seat of room.seats) {
          if (seat) seat.ready = false;
        }
        await this.commit();
        return;
      }

      default:
        return;
    }
  }

  async webSocketClose(
    ws: WebSocket,
    _code: number,
    _reason: string,
    _wasClean: boolean,
  ): Promise<void> {
    const playerId = attachmentOf(ws)?.playerId;
    const room = this.room;
    if (!playerId || !room) return;

    const stillOnline = this.ctx
      .getWebSockets()
      .some((socket) => socket !== ws && attachmentOf(socket)?.playerId === playerId);
    if (stillOnline) {
      this.broadcast();
      return;
    }

    const seatIndex = this.findSeat(room, playerId);
    if (seatIndex === null) return;

    const seat = room.seats[seatIndex]!;
    seat.disconnectedAt = Date.now();
    seat.ready = false;
    room.version += 1;
    room.updatedAt = Date.now();
    await this.ctx.storage.put('room', room);

    this.broadcast(new Set([ws]));
    this.syncLobby();

    if (room.status === 'waiting') {
      await this.ctx.storage.setAlarm(Date.now() + DISCONNECT_GRACE_MS);
    }
  }

  /** 掉线玩家在等待阶段超过宽限期后释放座位，避免房间永久卡死。 */
  async alarm(): Promise<void> {
    const room = this.room;
    if (!room || room.status !== 'waiting') return;

    const online = this.onlinePlayerIds();
    const now = Date.now();
    let changed = false;

    for (let index = 0; index < room.seats.length; index += 1) {
      const seat = room.seats[index];
      if (!seat || !seat.disconnectedAt) continue;
      if (online.has(seat.playerId)) continue;
      if (now - seat.disconnectedAt < DISCONNECT_GRACE_MS) continue;

      room.seats[index] = null;
      changed = true;
    }

    if (changed) {
      if (room.hostId && !room.seats.some((seat) => seat?.playerId === room.hostId)) {
        room.hostId = this.firstOccupiedPlayerId(room);
      }
      await this.commit();
      return;
    }

    const nextDeadline = room.seats.reduce<number | null>((earliest, seat) => {
      if (!seat?.disconnectedAt || online.has(seat.playerId)) return earliest;
      const deadline = seat.disconnectedAt + DISCONNECT_GRACE_MS;
      return earliest === null ? deadline : Math.min(earliest, deadline);
    }, null);

    if (nextDeadline !== null) {
      await this.ctx.storage.setAlarm(nextDeadline + 50);
    }
  }

  private async handleInit(request: Request): Promise<Response> {
    const body = (await request.json().catch(() => null)) as
      | { id?: unknown; name?: unknown }
      | null;
    const id = typeof body?.id === 'string' ? body.id.toUpperCase() : '';
    if (!normalizeRoomCode(id)) {
      return json({ error: 'invalid room id' }, 400);
    }

    if (this.room && this.room.id !== id) {
      return json({ error: 'room id mismatch' }, 409);
    }

    if (!this.room) {
      const now = Date.now();
      this.room = {
        id,
        name: sanitizeRoomName(body?.name),
        createdAt: now,
        updatedAt: now,
        hostId: null,
        status: 'waiting',
        seats: [null, null, null],
        game: null,
        chat: [],
        nextChatId: 1,
        version: 0,
      };
      await this.ctx.storage.put('room', this.room);
      this.syncLobby();
    }

    return json({ room: this.roomMeta() });
  }

  private handleMeta(): Response {
    if (!this.room) return json({ error: '房间不存在' }, 404);
    return json({ room: this.roomMeta() });
  }

  private async handleWebSocket(request: Request, url: URL): Promise<Response> {
    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
      return json({ error: 'expected websocket upgrade' }, 426);
    }

    const room = this.room;
    if (!room) return json({ error: '房间不存在或已过期' }, 404);

    const playerId = normalizePlayerId(url.searchParams.get('playerId'));
    if (!playerId) return json({ error: 'invalid player id' }, 400);

    const providedName = sanitizeNickname(url.searchParams.get('name'));
    const existingSeat = this.findSeat(room, playerId);
    let changed = false;

    if (existingSeat === null) {
      if (room.status !== 'waiting') {
        return this.rejectSocket('牌局进行中，无法加入');
      }
      const emptySeat = room.seats.findIndex((seat) => seat === null);
      if (emptySeat === -1) {
        return this.rejectSocket('房间已满（3/3），请换一个房间');
      }
      if (!providedName) {
        return this.rejectSocket('请先填写昵称');
      }

      room.seats[emptySeat] = {
        playerId,
        name: providedName,
        ready: false,
        joinedAt: Date.now(),
        disconnectedAt: null,
      };
      room.hostId ??= playerId;
      changed = true;
    } else {
      const seat = room.seats[existingSeat]!;
      if (providedName && providedName !== seat.name) {
        seat.name = providedName;
        changed = true;
      }
      if (seat.disconnectedAt !== null) {
        seat.disconnectedAt = null;
        changed = true;
      }
    }

    if (changed) {
      room.version += 1;
      room.updatedAt = Date.now();
      await this.ctx.storage.put('room', room);
    }

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ playerId } satisfies SocketAttachment);

    this.broadcast();
    if (changed) this.syncLobby();

    return new Response(null, { status: 101, webSocket: client });
  }

  private rejectSocket(message: string): Response {
    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ playerId: null } satisfies SocketAttachment);
    this.send(server, { type: 'error', code: 'JOIN_REJECTED', message });
    server.close(4001, 'join rejected');
    return new Response(null, { status: 101, webSocket: client });
  }

  private async commit(): Promise<void> {
    const room = this.room;
    if (!room) return;

    room.version += 1;
    room.updatedAt = Date.now();
    await this.ctx.storage.put('room', room);
    this.broadcast();
    this.syncLobby();
  }

  private broadcast(exclude?: Set<WebSocket>): void {
    const room = this.room;
    if (!room) return;

    const sockets = this.ctx
      .getWebSockets()
      .filter((socket) => !exclude?.has(socket));
    const online = new Set<string>();

    for (const socket of sockets) {
      const playerId = attachmentOf(socket)?.playerId;
      if (playerId) online.add(playerId);
    }

    for (const socket of sockets) {
      const playerId = attachmentOf(socket)?.playerId;
      if (!playerId) continue;
      this.send(socket, {
        type: 'state',
        state: this.buildView(room, playerId, this.findSeat(room, playerId), online),
      });
    }
  }

  private buildView(
    room: StoredRoom,
    playerId: string,
    seatIndex: number | null,
    online: Set<string>,
  ): RoomView {
    const seats: (PublicSeat | null)[] = room.seats.map((seat, index) =>
      seat
        ? {
            playerId: seat.playerId,
            name: seat.name,
            seat: index,
            ready: seat.ready,
            online: online.has(seat.playerId),
            isHost: room.hostId === seat.playerId,
            joinedAt: seat.joinedAt,
          }
        : null,
    );

    let game: PublicGame | null = null;
    if (room.game) {
      game = {
        phase: room.game.phase,
        landlordSeat: room.game.landlordSeat,
        currentSeat: room.game.currentSeat,
        hand: seatIndex === null ? [] : (room.game.hands[seatIndex] ?? []),
        handCounts: room.game.hands.map((hand) => hand.length),
        bottomCards: room.game.bottomCards,
        lastPlay: room.game.lastPlay,
        passCount: room.game.passCount,
        winnerSeat: room.game.winnerSeat,
        turnStartedAt: room.game.turnStartedAt,
        log: room.game.log.slice(-40),
      };
    }

    return {
      id: room.id,
      name: room.name,
      status: room.status,
      hostId: room.hostId,
      seats,
      game,
      chat: room.chat.slice(-MAX_CHAT_MESSAGES),
      version: room.version,
      serverTime: Date.now(),
      you: {
        playerId,
        seat: seatIndex,
        isHost: room.hostId === playerId,
      },
    };
  }

  private onlinePlayerIds(exclude?: Set<WebSocket>): Set<string> {
    const online = new Set<string>();
    for (const socket of this.ctx.getWebSockets()) {
      if (exclude?.has(socket)) continue;
      const playerId = attachmentOf(socket)?.playerId;
      if (playerId) online.add(playerId);
    }
    return online;
  }

  private findSeat(room: StoredRoom, playerId: string): number | null {
    const index = room.seats.findIndex((seat) => seat?.playerId === playerId);
    return index === -1 ? null : index;
  }

  private firstOccupiedPlayerId(room: StoredRoom): string | null {
    return room.seats.find((seat) => seat !== null)?.playerId ?? null;
  }

  private roomMeta(): RoomMeta {
    const room = this.room;
    if (!room) throw new Error('room not initialized');
    return {
      id: room.id,
      name: room.name,
      status: room.status,
      players: room.seats.filter((seat) => seat !== null).length,
      capacity: ROOM_CAPACITY,
      createdAt: room.createdAt,
      updatedAt: room.updatedAt,
    };
  }

  private syncLobby(): void {
    const room = this.room;
    if (!room) return;

    const meta: RoomMeta = {
      ...this.roomMeta(),
      updatedAt: Date.now(),
    };

    const lobby = this.env.LOBBY.get(this.env.LOBBY.idFromName('global'));
    const task = lobby
      .fetch('https://lobby/rooms/upsert', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(meta),
      })
      .then(() => undefined)
      .catch((error: unknown) => {
        console.warn('lobby sync failed', error);
      });

    this.ctx.waitUntil(task);
  }

  private send(ws: WebSocket, message: ServerMessage): void {
    try {
      ws.send(JSON.stringify(message));
    } catch {
      // 连接可能已断开，忽略发送失败。
    }
  }

  private sendError(ws: WebSocket, message: string, code = 'BAD_REQUEST'): void {
    this.send(ws, { type: 'error', code, message });
  }
}
