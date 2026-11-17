import type { RoomMeta, RoomStatus } from '../shared/protocol';
import { isRoomStatus, ROOM_CAPACITY } from '../shared/protocol';
import type { Env } from './env';
import { generateRoomCode, json, sanitizeRoomName } from './util';

interface LobbyStore {
  rooms: Record<string, RoomMeta>;
}

const STALE_AFTER_MS = 30 * 60_000;
const MAX_ROOMS = 500;

/**
 * 全局房间目录。
 *
 * 只保存房间摘要，真正的牌局状态在各自的 RoomDO 中，天然隔离。
 * 单实例 DO 天然串行处理创建请求，因此房间号不会冲突。
 */
export class LobbyDO {
  private readonly ctx: DurableObjectState;
  private store: LobbyStore = { rooms: {} };

  constructor(ctx: DurableObjectState, _env: Env) {
    this.ctx = ctx;
    ctx.blockConcurrencyWhile(async () => {
      this.store = (await ctx.storage.get<LobbyStore>('rooms')) ?? { rooms: {} };
    });
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'GET' && url.pathname === '/rooms') {
      return this.listRooms();
    }
    if (request.method === 'POST' && url.pathname === '/rooms') {
      return this.createRoom(request);
    }
    if (request.method === 'POST' && url.pathname === '/rooms/upsert') {
      return this.upsertRoom(request);
    }
    if (request.method === 'DELETE' && url.pathname.startsWith('/rooms/')) {
      return this.deleteRoom(url.pathname.split('/').pop() ?? '');
    }

    return json({ error: 'Not found' }, 404);
  }

  private async listRooms(): Promise<Response> {
    const now = Date.now();
    let changed = false;

    for (const [id, meta] of Object.entries(this.store.rooms)) {
      if (now - meta.updatedAt > STALE_AFTER_MS) {
        delete this.store.rooms[id];
        changed = true;
      }
    }

    if (changed) {
      await this.ctx.storage.put('rooms', this.store);
    }

    const rooms = Object.values(this.store.rooms).sort((a, b) => {
      const priority = (status: RoomStatus) =>
        status === 'waiting' ? 0 : status === 'playing' ? 1 : 2;
      return priority(a.status) - priority(b.status) || b.createdAt - a.createdAt;
    });

    return json({ rooms });
  }

  private async createRoom(request: Request): Promise<Response> {
    const body = (await request.json().catch(() => null)) as { name?: unknown } | null;
    const name = sanitizeRoomName(body?.name);

    let id = generateRoomCode();
    let attempts = 0;
    while (this.store.rooms[id] && attempts < 32) {
      id = generateRoomCode();
      attempts += 1;
    }
    if (this.store.rooms[id]) {
      return json({ error: '房间号生成冲突，请重试' }, 503);
    }

    const now = Date.now();
    const meta: RoomMeta = {
      id,
      name,
      status: 'waiting',
      players: 0,
      capacity: ROOM_CAPACITY,
      createdAt: now,
      updatedAt: now,
    };

    if (Object.keys(this.store.rooms).length >= MAX_ROOMS) {
      const oldest = Object.values(this.store.rooms).sort(
        (a, b) => a.updatedAt - b.updatedAt,
      )[0];
      if (oldest) delete this.store.rooms[oldest.id];
    }

    this.store.rooms[id] = meta;
    await this.ctx.storage.put('rooms', this.store);
    return json({ room: meta }, 201);
  }

  private async upsertRoom(request: Request): Promise<Response> {
    const body = (await request.json().catch(() => null)) as Partial<RoomMeta> | null;
    if (!body?.id || typeof body.id !== 'string' || !/^[A-Z0-9]{6}$/.test(body.id)) {
      return json({ error: 'invalid room meta' }, 400);
    }

    const existing = this.store.rooms[body.id];
    const healedPlayers =
      typeof body.players === 'number'
        ? Math.max(0, Math.min(ROOM_CAPACITY, Math.floor(body.players)))
        : (existing?.players ?? 0);

    const meta: RoomMeta = {
      id: body.id,
      name: sanitizeRoomName(body.name ?? existing?.name),
      status: isRoomStatus(body.status) ? body.status : (existing?.status ?? 'waiting'),
      players: healedPlayers,
      capacity: ROOM_CAPACITY,
      createdAt: existing?.createdAt ?? Date.now(),
      updatedAt: Date.now(),
    };

    this.store.rooms[body.id] = meta;
    await this.ctx.storage.put('rooms', this.store);
    return json({ room: meta });
  }

  private async deleteRoom(id: string): Promise<Response> {
    if (this.store.rooms[id]) {
      delete this.store.rooms[id];
      await this.ctx.storage.put('rooms', this.store);
    }
    return json({ ok: true });
  }
}
