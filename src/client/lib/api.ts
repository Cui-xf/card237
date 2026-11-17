import type { RoomMeta } from '../../shared/protocol';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      ...(init?.body ? { 'content-type': 'application/json' } : {}),
      ...init?.headers,
    },
  });

  const payload = (await response.json().catch(() => null)) as
    | (T & { error?: string })
    | null;

  if (!response.ok) {
    throw new Error(payload?.error ?? `请求失败（${response.status}）`);
  }
  if (!payload) {
    throw new Error('服务器返回了空响应');
  }
  return payload;
}

export function fetchRooms(): Promise<{ rooms: RoomMeta[] }> {
  return request('/api/rooms');
}

export function createRoom(name: string): Promise<{ room: RoomMeta }> {
  return request('/api/rooms', {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
}

export function fetchRoom(roomId: string): Promise<{ room: RoomMeta }> {
  return request(`/api/rooms/${encodeURIComponent(roomId)}`);
}
