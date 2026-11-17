import type { Card } from '../../shared/cards';
import { cardLabel, findCard, sortCards } from '../../shared/cards';
import type { GameLogEntry, GameLogKind, LastPlay } from '../../shared/protocol';
import { createDeck, shuffle } from './deck';

export interface GameState {
  phase: 'playing' | 'finished';
  /** 按座位顺序保存昵称，仅存在于服务端，不会整体下发给客户端。 */
  names: string[];
  landlordSeat: number;
  currentSeat: number;
  hands: Card[][];
  bottomCards: Card[];
  lastPlay: LastPlay | null;
  passCount: number;
  winnerSeat: number | null;
  startedAt: number;
  turnStartedAt: number;
  log: GameLogEntry[];
  nextLogId: number;
}

export type EngineResult =
  | { ok: true; state: GameState }
  | { ok: false; error: string };

const MAX_LOG_ENTRIES = 60;
const SEAT_COUNT = 3;

function addLog(
  state: GameState,
  kind: GameLogKind,
  text: string,
  at: number,
  seat?: number,
): void {
  state.log.push({ id: state.nextLogId, kind, text, at, seat });
  state.nextLogId += 1;
  if (state.log.length > MAX_LOG_ENTRIES) {
    state.log.splice(0, state.log.length - MAX_LOG_ENTRIES);
  }
}

function formatCards(cards: Card[]): string {
  const labels = cards.slice(0, 8).map(cardLabel);
  return cards.length > 8 ? `${labels.join(' ')} …（共 ${cards.length} 张）` : labels.join(' ');
}

function assertXor(value: boolean, error: string): void {
  if (!value) throw new Error(error);
}

/**
 * 创建一局游戏：洗牌、发 17/17/17、随机地主并发放底牌。
 *
 * 当前为骨架实现：地主由随机数直接产生，跳过了叫地主/抢地主流程。
 * 后续可以在不改动房间与通信层的前提下，扩展为真实的叫分状态机。
 */
export function createGame(
  names: string[],
  now = Date.now(),
  random: () => number = Math.random,
): GameState {
  assertXor(names.length === SEAT_COUNT, '需要 3 名玩家才能开始');

  const deck = shuffle(createDeck(), random);
  const hands: Card[][] = [
    deck.slice(0, 17),
    deck.slice(17, 34),
    deck.slice(34, 51),
  ].map((hand) => sortCards(hand));
  const bottomCards = deck.slice(51, 54);
  const landlordSeat = Math.floor(random() * SEAT_COUNT) % SEAT_COUNT;

  hands[landlordSeat] = sortCards([...hands[landlordSeat], ...bottomCards]);

  const state: GameState = {
    phase: 'playing',
    names: [...names],
    landlordSeat,
    currentSeat: landlordSeat,
    hands,
    bottomCards: sortCards(bottomCards),
    lastPlay: null,
    passCount: 0,
    winnerSeat: null,
    startedAt: now,
    turnStartedAt: now,
    log: [],
    nextLogId: 1,
  };

  addLog(state, 'system', `牌局开始，随机决定地主为「${names[landlordSeat]}」`, now);
  addLog(state, 'landlord', `${names[landlordSeat]} 成为地主，获得 3 张底牌`, now, landlordSeat);

  return state;
}

export function playCards(
  state: GameState,
  seat: number,
  cardIds: string[],
  now = Date.now(),
): EngineResult {
  if (state.phase !== 'playing') return { ok: false, error: '牌局已经结束' };
  if (seat !== state.currentSeat) return { ok: false, error: '还没轮到你出牌' };
  if (!Array.isArray(cardIds) || cardIds.length === 0) {
    return { ok: false, error: '请先选择要出的牌' };
  }
  if (new Set(cardIds).size !== cardIds.length) {
    return { ok: false, error: '不能重复选择同一张牌' };
  }

  const hand = state.hands[seat];
  const selected: Card[] = [];
  for (const id of cardIds) {
    const card = findCard(hand, id);
    if (!card) return { ok: false, error: '所选卡牌不在你的手牌中' };
    selected.push(card);
  }

  // TODO(rules): 在这里加入斗地主牌型校验（单张/对子/三带/顺子/连对/飞机/炸弹/王炸）
  // 以及“必须大过上家”的比较逻辑；目前骨架只校验回合与手牌归属。
  const selectedIds = new Set(cardIds);
  state.hands[seat] = hand.filter((card) => !selectedIds.has(card.id));
  state.lastPlay = { seat, cards: sortCards(selected), at: now };
  state.passCount = 0;

  addLog(state, 'play', `${state.names[seat]} 出牌：${formatCards(selected)}`, now, seat);

  if (state.hands[seat].length === 0) {
    state.phase = 'finished';
    state.winnerSeat = seat;
    state.currentSeat = seat;
    addLog(state, 'win', `${state.names[seat]} 出完手牌，赢得本局`, now, seat);
    return { ok: true, state };
  }

  state.currentSeat = (seat + 1) % SEAT_COUNT;
  state.turnStartedAt = now;
  return { ok: true, state };
}

export function passTurn(state: GameState, seat: number, now = Date.now()): EngineResult {
  if (state.phase !== 'playing') return { ok: false, error: '牌局已经结束' };
  if (seat !== state.currentSeat) return { ok: false, error: '还没轮到你操作' };
  if (!state.lastPlay) return { ok: false, error: '当前没有需要压过的牌，请先出牌' };
  if (state.lastPlay.seat === seat) return { ok: false, error: '你是本轮领出者，不能不出' };

  state.passCount += 1;
  const nextSeat = (seat + 1) % SEAT_COUNT;
  addLog(state, 'pass', `${state.names[seat]} 不出`, now, seat);

  if (state.passCount >= 2) {
    state.lastPlay = null;
    state.passCount = 0;
    addLog(state, 'system', `连续两家不出，${state.names[nextSeat]} 重新领出`, now, nextSeat);
  }

  state.currentSeat = nextSeat;
  state.turnStartedAt = now;
  return { ok: true, state };
}
