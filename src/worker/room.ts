import type {
  ChatMessage,
  PublicSeat,
  RoomMeta,
  RoomStatus,
  RoomView,
  ServerMessage,
} from '../shared/protocol';
import { isRuleId, RULE_META } from '../shared/rules';
import type { GameAction, RuleId } from '../shared/rules/types';
import { BOT_ACTION_DELAY_MS, nextBotMessage, type BotMessage, type BotRoomSnapshot } from './bots';
import type { Env } from './env';
import { ruleRuntime } from './game/rules';
import type { RuleActionContext } from './game/rules/types';
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

/** 测试模式：房间名为 test 时用机器人补满座位，机器人只发送与真人等效的指令。 */
const TEST_ROOM_NAME = 'test';
const BOT_NAMES = ['人机 A', '人机 B', '人机 C'];

/** 规则通用配置；后续接后台时改成从 env / 配置服务读取。 */
const RULE_CONFIG = { scoreThreshold: 60 };

interface SeatState {
  playerId: string;
  name: string;
  ready: boolean;
  joinedAt: number;
  disconnectedAt: number | null;
  /** 机器人座位：没有 WebSocket，在线状态由 `onlinePlayerIds` 补上。 */
  bot?: boolean;
}

/** 规则状态对房间层是不透明的，房间层只知道它属于哪套规则。 */
interface StoredGame {
  ruleId: RuleId;
  state: unknown;
}

interface StoredRoom {
  id: string;
  name: string;
  ruleId: RuleId;
  createdAt: number;
  updatedAt: number;
  hostId: string | null;
  status: RoomStatus;
  seats: (SeatState | null)[];
  game: StoredGame | null;
  chat: ChatMessage[];
  nextChatId: number;
  version: number;
  /** 机器人动作失败时暂停，避免同一个失败动作反复触发 alarm。 */
  botPaused?: boolean;
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

function isTestRoomName(name: string): boolean {
  return name.trim().toLowerCase() === TEST_ROOM_NAME;
}

/**
 * 一个房间 = 一个 Durable Object 实例。
 *
 * - 房间之间的状态完全隔离，互不阻塞；
 * - WebSocket 使用 Hibernation API，空闲时 DO 可以休眠，适合免费套餐；
 * - 每个连接只收到自己的手牌，其他玩家只下发手牌数量；
 * - 房间层不包含任何规则逻辑，只通过 `RuleRuntime` 接口与规则交互。
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
      const stored = (await ctx.storage.get<StoredRoom>('room')) ?? null;
      this.room = stored && isRuleId(stored.ruleId) ? stored : null;
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

    const playerId = attachmentOf(ws)?.playerId;
    if (!playerId) return;

    await this.dispatchMessage(
      playerId,
      payload as Record<string, unknown> & { type?: unknown },
      ws,
    );
  }

  /**
   * 处理一条玩家消息。
   *
   * 真人通过 WebSocket 进入；机器人由 BotDriver 用同一个入口注入等效消息，
   * 因此座位、准备、开局、动作校验、持久化与真人完全一致。
   * 返回 false 只表示游戏动作被规则拒绝（机器人据此暂停）。
   */
  private async dispatchMessage(
    playerId: string,
    message: Record<string, unknown> & { type?: unknown },
    ws: WebSocket | null,
  ): Promise<boolean> {
    const room = this.room;
    if (!room) return true;

    if (message.type === 'ping') {
      if (ws) this.send(ws, { type: 'pong', t: Date.now() });
      return true;
    }

    const seatIndex = this.findSeat(room, playerId);

    switch (message.type) {
      case 'ready': {
        if (seatIndex === null) return this.fail(ws, '你不在牌桌座位上');
        if (room.status !== 'waiting') return this.fail(ws, '牌局已经开始');
        if (typeof message.ready !== 'boolean') return this.fail(ws, '无效的准备状态');
        room.seats[seatIndex]!.ready = message.ready;
        await this.commit();
        return true;
      }

      case 'start': {
        if (room.hostId !== playerId) return this.fail(ws, '只有房主可以开始游戏');
        if (room.status !== 'waiting') return this.fail(ws, '牌局已经开始');

        const runtime = ruleRuntime(room.ruleId);
        if (!runtime) return this.fail(ws, '该游戏规则暂未开放');

        const capacity = runtime.meta.capacity;
        if (room.seats.length !== capacity || room.seats.some((seat) => seat === null)) {
          return this.fail(ws, `需要 ${capacity} 名玩家才能开始`);
        }
        if (!room.seats.every((seat) => seat?.ready)) {
          return this.fail(ws, '所有玩家准备后才能开始');
        }
        const online = this.onlinePlayerIds();
        if (room.seats.some((seat) => seat && !online.has(seat.playerId))) {
          return this.fail(ws, '有玩家掉线，请等待重连');
        }

        const names = room.seats.map((seat) => seat?.name ?? '玩家');
        room.status = 'playing';
        room.botPaused = false;
        room.game = {
          ruleId: room.ruleId,
          state: runtime.create({
            names,
            now: Date.now(),
            random: Math.random,
            config: RULE_CONFIG,
          }),
        };
        await this.commit();
        return true;
      }

      case 'game': {
        if (seatIndex === null) return this.fail(ws, '你不在牌桌座位上');
        if (room.status !== 'playing' || !room.game) {
          return this.fail(ws, '牌局尚未开始');
        }

        const action = message.action as GameAction | undefined;
        if (!action || typeof action !== 'object' || typeof action.type !== 'string') {
          return this.fail(ws, '动作数据无效');
        }

        const runtime = ruleRuntime(room.game.ruleId);
        if (!runtime) return this.fail(ws, '该游戏规则暂未开放');

        const ctx = this.ruleCtx();

        // 先把状态推进到当前时间，避免玩家在已经过期的阶段上操作。
        const ticked = runtime.tick(room.game.state, ctx.now, ctx);
        if (ticked.state !== undefined) room.game.state = ticked.state;

        const applied = runtime.apply(room.game.state, seatIndex, action, ctx);
        if (applied.state !== undefined) room.game.state = applied.state;

        if (ticked.result.finished || applied.result.finished) {
          room.status = 'finished';
        }

        await this.commit();
        if (!applied.result.ok) {
          this.sendError(ws, applied.result.error ?? '操作失败');
          return false;
        }
        return true;
      }

      case 'chat': {
        if (seatIndex === null) return this.fail(ws, '你不在牌桌座位上');
        const text = sanitizeChat(message.text);
        if (!text) return true;

        const now = Date.now();
        if (now - (this.lastChatAt.get(playerId) ?? 0) < CHAT_COOLDOWN_MS) return true;
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
        return true;
      }

      case 'leave': {
        if (seatIndex === null) {
          ws?.close(1000, 'left');
          return true;
        }
        if (room.status === 'playing') {
          return this.fail(ws, '牌局进行中，暂时不能退出房间');
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
        ws?.close(1000, 'left');
        return true;
      }

      case 'restart': {
        if (room.hostId !== playerId) return this.fail(ws, '只有房主可以开启新一局');
        if (room.status !== 'finished') return this.fail(ws, '牌局尚未结束');
        if (room.seats.some((seat) => seat === null)) {
          return this.fail(ws, '有玩家离开，等待满员后再开始');
        }

        room.status = 'waiting';
        room.game = null;
        for (const seat of room.seats) {
          if (seat) seat.ready = false;
        }
        await this.commit();
        return true;
      }

      default:
        return true;
    }
  }

  private fail(ws: WebSocket | null, message: string, code = 'BAD_REQUEST'): false {
    this.sendError(ws, message, code);
    return false;
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
    await this.scheduleAlarm();
  }

  /** 统一处理规则定时器（发牌结束、甩3 超时…）与等待阶段的掉线回收。 */
  async alarm(): Promise<void> {
    const room = this.room;
    if (!room) return;

    const now = Date.now();
    let changed = false;

    if (room.game) {
      const runtime = ruleRuntime(room.game.ruleId);
      if (runtime) {
        const ticked = runtime.tick(room.game.state, now, this.ruleCtx());
        if (ticked.state !== undefined) {
          room.game.state = ticked.state;
          changed = true;
        }
        if (ticked.result.finished && room.status === 'playing') {
          room.status = 'finished';
          changed = true;
        }
      }
    }

    // 如果本次 tick 刚推进了阶段（例如发牌结束），先让状态落地并广播，
    // 机器人等到下一次 alarm 再行动，给真人留出抢甩 3 的时间。
    if (!changed && (await this.runPendingBot())) return;

    if (room.status === 'waiting') {
      changed = this.reapDisconnectedSeats(room, now) || changed;
    }

    if (changed) {
      await this.commit();
      return;
    }

    await this.scheduleAlarm();
  }

  private async handleInit(request: Request): Promise<Response> {
    const body = (await request.json().catch(() => null)) as
      | { id?: unknown; name?: unknown; ruleId?: unknown }
      | null;
    const id = typeof body?.id === 'string' ? body.id.toUpperCase() : '';
    if (!normalizeRoomCode(id)) {
      return json({ error: 'invalid room id' }, 400);
    }
    if (!isRuleId(body?.ruleId)) {
      return json({ error: 'invalid rule id' }, 400);
    }

    if (this.room && this.room.id !== id) {
      return json({ error: 'room id mismatch' }, 409);
    }

    if (!this.room) {
      const ruleId: RuleId = body.ruleId;
      const capacity = RULE_META[ruleId].capacity;
      const now = Date.now();
      this.room = {
        id,
        name: sanitizeRoomName(body?.name),
        ruleId,
        createdAt: now,
        updatedAt: now,
        hostId: null,
        status: 'waiting',
        seats: Array.from({ length: capacity }, () => null),
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
        const capacity = room.seats.length;
        return this.rejectSocket(`房间已满（${capacity}/${capacity}），请换一个房间`);
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
      // 测试房间：第一位真人入座后，用机器人补满其余座位。
      if (isTestRoomName(room.name)) this.seedBots(room);
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

    // 机器人可能还需要发送 ready / start，统一让 alarm 调度。
    await this.scheduleAlarm();
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

  private ruleCtx(): RuleActionContext {
    return {
      now: Date.now(),
      random: Math.random,
      config: RULE_CONFIG,
    };
  }

  /**
   * 测试模式：房间名为 test 时，用机器人补满其余空座。
   *
   * 只有实现了 `botAction` 的规则才会获得机器人，避免建出「有人机但没人行动」的房间。
   * 机器人同样从「未准备」开始，由 BotDriver 发送 ready 消息自动准备。
   */
  private seedBots(room: StoredRoom): void {
    if (!isTestRoomName(room.name)) return;
    if (!ruleRuntime(room.ruleId)?.botAction) return;

    const now = Date.now();
    let botIndex = 0;

    for (let index = 0; index < room.seats.length; index += 1) {
      if (room.seats[index]) continue;

      room.seats[index] = {
        playerId: `bot-${room.id}-${index}`,
        name: BOT_NAMES[botIndex % BOT_NAMES.length],
        ready: false,
        joinedAt: now,
        disconnectedAt: null,
        bot: true,
      };
      botIndex += 1;
    }
  }

  private botSnapshot(room: StoredRoom): BotRoomSnapshot {
    return {
      status: room.status,
      hostId: room.hostId,
      seats: room.seats.map((seat) =>
        seat
          ? { playerId: seat.playerId, ready: seat.ready, bot: seat.bot === true }
          : null,
      ),
      game: room.game,
    };
  }

  /** 机器人下一条要发送的等效消息；null 表示没有机器人需要行动。 */
  private pendingBotMessage(): BotMessage | null {
    const room = this.room;
    if (!room || room.botPaused) return null;
    return nextBotMessage(this.botSnapshot(room), this.ruleCtx());
  }

  /**
   * 让机器人通过和真人相同的消息入口行动一条。
   *
   * 消息处理内部会完成 commit（持久化 / alarm / 广播）；
   * 动作被拒绝时暂停机器人，避免同一个失败动作反复触发 alarm。
   */
  private async runPendingBot(): Promise<boolean> {
    const pending = this.pendingBotMessage();
    if (!pending) return false;

    const ok = await this.dispatchMessage(
      pending.playerId,
      pending.message as unknown as Record<string, unknown> & { type?: unknown },
      null,
    );
    if (!ok) {
      console.warn('bot message rejected', pending.message.type);
      if (this.room) this.room.botPaused = true;
    }
    return true;
  }

  private async commit(): Promise<void> {
    const room = this.room;
    if (!room) return;

    room.version += 1;
    room.updatedAt = Date.now();
    await this.ctx.storage.put('room', room);
    await this.scheduleAlarm();
    this.broadcast();
    this.syncLobby();
  }

  /** DO 同时只有一个 alarm，因此只取所有待办时间点的最早一个。 */
  private async scheduleAlarm(): Promise<void> {
    const room = this.room;
    if (!room) return;

    const deadlines: number[] = [];

    if (room.game) {
      const runtime = ruleRuntime(room.game.ruleId);
      const deadline = runtime?.nextDeadline(room.game.state) ?? null;
      if (deadline !== null) deadlines.push(deadline);
    }

    // 机器人动作也走 alarm：到点后一次只走一条等效消息。
    if (this.pendingBotMessage()) {
      deadlines.push(Date.now() + BOT_ACTION_DELAY_MS);
    }

    if (room.status === 'waiting') {
      const online = this.onlinePlayerIds();
      for (const seat of room.seats) {
        if (seat?.disconnectedAt && !online.has(seat.playerId)) {
          deadlines.push(seat.disconnectedAt + DISCONNECT_GRACE_MS);
        }
      }
    }

    if (deadlines.length === 0) return;
    await this.ctx.storage.setAlarm(Math.min(...deadlines) + 20);
  }

  private reapDisconnectedSeats(room: StoredRoom, now: number): boolean {
    const online = this.onlinePlayerIds();
    let changed = false;

    for (let index = 0; index < room.seats.length; index += 1) {
      const seat = room.seats[index];
      if (!seat || !seat.disconnectedAt) continue;
      if (online.has(seat.playerId)) continue;
      if (now - seat.disconnectedAt < DISCONNECT_GRACE_MS) continue;

      room.seats[index] = null;
      changed = true;
    }

    if (changed && room.hostId && !room.seats.some((seat) => seat?.playerId === room.hostId)) {
      room.hostId = this.firstOccupiedPlayerId(room);
    }

    return changed;
  }

  private broadcast(exclude?: Set<WebSocket>): void {
    const room = this.room;
    if (!room) return;

    const sockets = this.ctx
      .getWebSockets()
      .filter((socket) => !exclude?.has(socket));
    const online = this.onlinePlayerIds(exclude);

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

    const names = room.seats.map((seat) => seat?.name ?? '玩家');
    const game = room.game
      ? (ruleRuntime(room.game.ruleId)?.view(room.game.state, seatIndex, names) ?? null)
      : null;

    return {
      id: room.id,
      name: room.name,
      ruleId: room.ruleId,
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
    // 机器人没有 WebSocket，但对房间来说始终在线。
    for (const seat of this.room?.seats ?? []) {
      if (seat?.bot) online.add(seat.playerId);
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
      ruleId: room.ruleId,
      status: room.status,
      players: room.seats.filter((seat) => seat !== null).length,
      capacity: RULE_META[room.ruleId].capacity,
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

  private send(ws: WebSocket | null, message: ServerMessage): void {
    if (!ws) return;
    try {
      ws.send(JSON.stringify(message));
    } catch {
      // 连接可能已断开，忽略发送失败。
    }
  }

  private sendError(ws: WebSocket | null, message: string, code = 'BAD_REQUEST'): void {
    this.send(ws, { type: 'error', code, message });
  }
}
