import type { Card } from '../../../../shared/cards';
import { SHUAIZ3_DEAL_INTERVAL_MS } from '../../../../shared/rules/shuaiz3';
import { createDeck, shuffle } from '../../deck';
import { addLog } from './log';
import type { Shuaiz3State } from './state';

export const SEAT_COUNT = 4;
export const HAND_SIZE = 12;
export const BOTTOM_COUNT = 6;
export const DECK_SIZE = SEAT_COUNT * HAND_SIZE + BOTTOM_COUNT;

export const DEAL_TOTAL_MS = DECK_SIZE * SHUAIZ3_DEAL_INTERVAL_MS;

interface DealPlan {
  deck: Card[];
  hands: Card[][];
  bottomCards: Card[];
}

/** 洗牌并保证至少一张 3 发给玩家（4 张 3 全在底牌时重洗）。 */
function buildDealPlan(random: () => number): DealPlan {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const deck = shuffle(createDeck(), random);
    const hands: Card[][] = Array.from({ length: SEAT_COUNT }, () => []);

    // 牌序 0..47 按座位 0,1,2,3 轮转，最后 6 张为底牌。
    for (let index = 0; index < SEAT_COUNT * HAND_SIZE; index += 1) {
      hands[index % SEAT_COUNT].push(deck[index]);
    }

    if (hands.some((hand) => hand.some((card) => card.rank === '3'))) {
      return { deck, hands, bottomCards: deck.slice(SEAT_COUNT * HAND_SIZE) };
    }
  }

  throw new Error('发牌失败：连续多次洗牌都没有把 3 发给玩家');
}

function baseState(names: string[]): Shuaiz3State {
  return {
    phase: 'dealing',
    names: [...names],
    deck: [],
    hands: [],
    bottomCards: [],
    dealStartedAt: 0,
    dealEndsAt: 0,
    dealerSeat: null,
    trumpSuit: null,
    declaredCardId: null,
    declined: Array.from({ length: SEAT_COUNT }, () => false),
    declareDeadline: null,
    returnedCards: null,
    dealerOriginalHand: null,
    returnDeadline: null,
    teams: null,
    currentSeat: null,
    trick: null,
    lastTrick: null,
    scores: Array.from({ length: SEAT_COUNT }, () => 0),
    turnStartedAt: 0,
    result: null,
    log: [],
    nextLogId: 1,
  };
}

function applyDealPlan(state: Shuaiz3State, plan: DealPlan, now: number): void {
  state.deck = plan.deck;
  state.hands = plan.hands;
  state.bottomCards = plan.bottomCards;
  state.dealStartedAt = now;
  state.dealEndsAt = now + DEAL_TOTAL_MS;
  state.turnStartedAt = now;
}

export function createGame(
  names: string[],
  now = Date.now(),
  random: () => number = Math.random,
): Shuaiz3State {
  if (names.length !== SEAT_COUNT) {
    throw new Error(`甩3 需要 ${SEAT_COUNT} 名玩家才能开始`);
  }

  const state = baseState(names);
  applyDealPlan(state, buildDealPlan(random), now);
  addLog(state, 'deal', '开始逐张发牌，每人 12 张，剩余 6 张为底牌', now);
  return state;
}

/** 本轮作废后重新洗牌发牌；保留日志与昵称，其余全部重置。 */
export function redeal(state: Shuaiz3State, now: number, random: () => number): void {
  const names = state.names;
  const log = state.log;
  const nextLogId = state.nextLogId;

  Object.assign(state, baseState(names));
  state.log = log;
  state.nextLogId = nextLogId;

  applyDealPlan(state, buildDealPlan(random), now);
  addLog(state, 'deal', '无人甩 3，重新发牌', now);
}

/** 当前已经发出去的张数（0–54），由时间推导，不需要逐张 alarm。 */
export function revealedTotal(
  dealStartedAt: number,
  now: number,
  intervalMs = SHUAIZ3_DEAL_INTERVAL_MS,
): number {
  const elapsed = Math.max(0, now - dealStartedAt);
  return Math.min(DECK_SIZE, Math.floor(elapsed / intervalMs) + 1);
}

/** 座位 seat 已经摸到的张数（0–12）。 */
export function revealedForSeat(seat: number, totalRevealed: number): number {
  return Math.min(HAND_SIZE, Math.max(0, Math.ceil((totalRevealed - seat) / SEAT_COUNT)));
}

export function dealtCards(
  state: Shuaiz3State,
  seat: number,
  now: number,
): Card[] {
  const total = revealedTotal(state.dealStartedAt, now);
  return state.hands[seat].slice(0, revealedForSeat(seat, total));
}
