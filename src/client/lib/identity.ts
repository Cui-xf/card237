const PLAYER_ID_KEY = 'card237.playerId';
const NAME_KEY = 'card237.name';

let memoryPlayerId: string | null = null;

export function getPlayerId(): string {
  if (memoryPlayerId) return memoryPlayerId;
  try {
    const saved = localStorage.getItem(PLAYER_ID_KEY);
    if (saved && /^[A-Za-z0-9_-]{8,64}$/.test(saved)) {
      memoryPlayerId = saved;
      return saved;
    }
    const created = crypto.randomUUID();
    localStorage.setItem(PLAYER_ID_KEY, created);
    memoryPlayerId = created;
    return created;
  } catch {
    memoryPlayerId ??= crypto.randomUUID();
    return memoryPlayerId;
  }
}

export function getSavedName(): string {
  try {
    return (localStorage.getItem(NAME_KEY) ?? '').slice(0, 12);
  } catch {
    return '';
  }
}

export function saveName(name: string): void {
  try {
    localStorage.setItem(NAME_KEY, name.trim().slice(0, 12));
  } catch {
    // 隐私模式下 localStorage 可能不可用，忽略即可。
  }
}
