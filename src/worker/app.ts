import { Hono } from 'hono';
import type { RoomMeta } from '../shared/protocol';
import type { Env } from './env';
import { normalizeRoomCode, sanitizeRoomName } from './util';

const app = new Hono<{ Bindings: Env }>();

app.get('/api/health', (c) => c.json({ ok: true, service: 'card237', now: Date.now() }));

app.get('/api/rooms', (c) => {
  const lobby = c.env.LOBBY.get(c.env.LOBBY.idFromName('global'));
  return lobby.fetch(new Request('https://lobby/rooms'));
});

app.post('/api/rooms', async (c) => {
  const body = (await c.req.json().catch(() => null)) as { name?: unknown } | null;
  const name = sanitizeRoomName(body?.name);

  const lobby = c.env.LOBBY.get(c.env.LOBBY.idFromName('global'));
  const createResponse = await lobby.fetch(
    new Request('https://lobby/rooms', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name }),
    }),
  );
  if (!createResponse.ok) {
    return new Response(createResponse.body, {
      status: createResponse.status,
      headers: createResponse.headers,
    });
  }

  const payload = (await createResponse.json()) as { room?: RoomMeta } | null;
  const meta = payload?.room;
  if (!meta) {
    return c.json({ error: '创建房间失败' }, 500);
  }

  const room = c.env.ROOM.get(c.env.ROOM.idFromName(meta.id));
  const initResponse = await room.fetch(
    new Request('https://room/internal/init', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: meta.id, name: meta.name }),
    }),
  );
  if (!initResponse.ok) {
    return c.json({ error: '初始化房间失败，请重试' }, 502);
  }

  return c.json({ room: meta }, 201);
});

app.get('/api/rooms/:roomId/ws', async (c) => {
  const roomId = normalizeRoomCode(c.req.param('roomId'));
  if (!roomId) return c.json({ error: '房间号无效' }, 404);

  const room = c.env.ROOM.get(c.env.ROOM.idFromName(roomId));
  return room.fetch(c.req.raw);
});

app.get('/api/rooms/:roomId', async (c) => {
  const roomId = normalizeRoomCode(c.req.param('roomId'));
  if (!roomId) return c.json({ error: '房间不存在或已过期' }, 404);

  const room = c.env.ROOM.get(c.env.ROOM.idFromName(roomId));
  return room.fetch(new Request('https://room/internal/meta'));
});

app.all('/api/*', (c) => c.json({ error: 'Not found' }, 404));

app.onError((error, c) => {
  console.error('unhandled worker error', error);
  return c.json({ error: '服务器开小差了，请稍后再试' }, 500);
});

export default app;
