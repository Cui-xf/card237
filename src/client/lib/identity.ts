const PLAYER_ID_KEY = 'card237.playerId';
const NAME_KEY = 'card237.name';

let memoryPlayerId: string | null = null;

/**
 * 玩家身份按浏览器标签页隔离：
 * - playerId 和昵称都存放在 sessionStorage；
 * - 同一标签页刷新后仍是同一玩家（座位、断线重连不受影响）；
 * - 新开标签页会生成新的 playerId，视作另一名玩家。
 *
 * 注意：Chrome 的「复制标签页」会连同 sessionStorage 一起复制，
 * 这种场景下两个标签页仍会共用同一个 playerId。
 */
function readSession(key: string): string | null {
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeSession(key: string, value: string): void {
  try {
    window.sessionStorage.setItem(key, value);
  } catch {
    // 隐私模式禁用存储时忽略，仅本次页面有效。
  }
}

export function getPlayerId(): string {
  if (memoryPlayerId) return memoryPlayerId;
  const saved = readSession(PLAYER_ID_KEY);
  if (saved && /^[A-Za-z0-9_-]{8,64}$/.test(saved)) {
    memoryPlayerId = saved;
    return saved;
  }
  const created = crypto.randomUUID();
  writeSession(PLAYER_ID_KEY, created);
  memoryPlayerId = created;
  return created;
}

export function getSavedName(): string {
  return (readSession(NAME_KEY) ?? '').slice(0, 12);
}

export function saveName(name: string): void {
  writeSession(NAME_KEY, name.trim().slice(0, 12));
}
