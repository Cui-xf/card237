import type { Card, StandardSuit } from '../../../../shared/cards';
import { SUIT_SYMBOL } from '../../../../shared/cards';
import type { PublicSeat } from '../../../../shared/protocol';
import type {
  Shuaiz3PublicData,
  Shuaiz3Team,
  SuitGroup,
} from '../../../../shared/rules/shuaiz3';
import type { Shuaiz3View } from '../../../../shared/rules/types';
import type { BoardContext } from '../../core/types';
import type {
  ResultModel,
  SeatPosition,
  TableCard,
  TableModel,
  TableSeat,
} from '../../core/types';

const SEAT_COUNT = 4;
const HAND_SIZE = 12;
const DECK_SIZE = 54;

/** 客户端按时间推算自己已经摸到的张数。 */
function localRevealed(
  data: Shuaiz3PublicData,
  mySeat: number | null,
  now: number,
): number {
  if (mySeat === null) return 0;
  if (data.phase !== 'dealing') return HAND_SIZE;

  const total = Math.min(
    DECK_SIZE,
    Math.max(0, Math.floor((now - data.dealStartedAt) / data.dealIntervalMs) + 1),
  );
  const own = Math.min(HAND_SIZE, Math.max(0, Math.ceil((total - mySeat) / SEAT_COUNT)));
  return Math.max(data.revealedCount, own);
}

function secondsLeft(deadline: number | null, now: number): number {
  if (deadline === null) return 0;
  return Math.max(0, Math.ceil((deadline - now) / 1_000));
}

function toTableCard(card: Card): TableCard {
  return { id: card.id, rank: card.rank, suit: card.suit };
}

export interface Shuaiz3Center {
  kind: 'none' | 'dealing' | 'declaring' | 'returning' | 'trick';
  revealed: number;
  total: number;
  declaredName: string | null;
  remainingSeconds: number;
  isDealer: boolean;
  mustReturnBottom: boolean;
  bottomCards: TableCard[];
  leadSuit: SuitGroup | null;
  count: number;
  lastTrick: { winnerSeat: number; points: number } | null;
  trumpSuit: StandardSuit | null;
  canDeclareNow: boolean;
  declined: boolean;
  dealerSeat: number | null;
  trick: { leadSuit: SuitGroup; count: number } | null;
  threes: TableCard[];
  team: Shuaiz3Team | null;
}

export type Shuaiz3TableModel = TableModel<Shuaiz3Center>;

function seatPositions(mySeat: number | null): Record<number, SeatPosition> {
  if (mySeat === null) {
    return { 0: 'left', 1: 'top', 2: 'right', 3: 'self' };
  }
  return {
    [mySeat]: 'self',
    [(mySeat + 1) % SEAT_COUNT]: 'left',
    [(mySeat + 2) % SEAT_COUNT]: 'top',
    [(mySeat + 3) % SEAT_COUNT]: 'right',
  };
}

function seatName(seats: (PublicSeat | null)[], index: number | null): string {
  if (index === null) return '玩家';
  return seats[index]?.name ?? '玩家';
}

function buildSeats(
  view: Shuaiz3View,
  seats: (PublicSeat | null)[],
  mySeat: number | null,
): TableSeat[] {
  const positions = seatPositions(mySeat);
  const data = view.data;
  const result: TableSeat[] = [];

  seats.forEach((seat, index) => {
    if (!seat) return;
    result.push({
      index,
      position: positions[index] ?? 'self',
      name: seat.name,
      isSelf: index === mySeat,
      isHost: seat.isHost,
      online: seat.online,
      ready: seat.ready,
      handCount: view.handCounts[index] ?? 0,
      score: data.scores[index] ?? 0,
      badge: data.dealerSeat === index ? '庄' : undefined,
    });
  });

  return result;
}

function buildResult(
  view: Shuaiz3View,
  seats: (PublicSeat | null)[],
): ResultModel | null {
  const result = view.data.result;
  if (view.data.phase !== 'finished' || !result) return null;

  const outcome =
    result.outcome === 'zhuang'
      ? '庄队获胜'
      : result.outcome === 'xian'
        ? '闲队获胜'
        : '平局';

  return {
    title: '本局结束',
    lines: [
      outcome,
      `庄队 ${result.zhuangScore} 分 · 闲队 ${result.xianScore} 分`,
      `过庄线 ${result.threshold} 分`,
    ],
    scores: seats.map((seat, index) => ({
      name: seat?.name ?? `座位 ${index + 1}`,
      score: view.data.scores[index] ?? 0,
    })),
    winnerSeat: null,
  };
}

function statusText(
  view: Shuaiz3View,
  data: Shuaiz3PublicData,
  seats: (PublicSeat | null)[],
  mySeat: number | null,
  canDeclareNow: boolean,
): { text: string; strong: boolean } {
  const phase = data.phase;
  const trumpLabel = data.trumpSuit ? SUIT_SYMBOL[data.trumpSuit] : '未定';
  const dealerName = seatName(seats, data.dealerSeat);
  const currentName = seatName(seats, view.currentSeat);
  const isMyTurn = mySeat !== null && view.currentSeat === mySeat;

  if (phase === 'dealing' || phase === 'declaring') {
    if (mySeat === null) return { text: '你正在旁观这局牌。', strong: false };
    if (data.dealerSeat !== null) {
      return {
        text: `${dealerName} 已甩出 3，主牌为 ${trumpLabel}`,
        strong: true,
      };
    }
    if (data.you.declined) {
      return { text: '你已取消甩牌，等待其他玩家', strong: true };
    }
    if (canDeclareNow) {
      return {
        text:
          phase === 'dealing'
            ? '摸到 3 了，直接点上方按钮甩出'
            : '点上方按钮甩 3，或取消甩牌',
        strong: false,
      };
    }
    if (phase === 'declaring') {
      return { text: '等待持 3 的玩家甩 3（超时后系统自动甩）', strong: true };
    }
    return { text: '摸到 3 之后可以甩出', strong: false };
  }

  if (phase === 'returning') {
    if (mySeat === null) return { text: '你正在旁观这局牌。', strong: false };
    if (!data.you.mustReturnBottom) {
      return { text: '等待庄家还底…', strong: true };
    }
    return { text: '请选择 6 张非 5 / 10 / K 的牌', strong: false };
  }

  if (phase === 'playing') {
    if (mySeat === null) return { text: '你正在旁观这局牌。', strong: false };
    if (!isMyTurn) {
      return { text: `等待 ${currentName} 出牌…`, strong: true };
    }
    if (!data.trick) {
      return { text: '选择同花色的牌领出，可一次出多张', strong: false };
    }
    return { text: `本轮需要出 ${data.trick.count} 张`, strong: false };
  }

  return { text: '本局结束，等待房主开启下一局。', strong: false };
}

export function buildShuaiz3Model(
  view: Shuaiz3View,
  ctx: BoardContext,
  seats: (PublicSeat | null)[],
  mySeat: number | null,
): Shuaiz3TableModel {
  const data: Shuaiz3PublicData = view.data;
  const revealed = localRevealed(data, mySeat, ctx.now);
  const visibleHand = data.phase === 'dealing' ? view.hand.slice(0, revealed) : view.hand;
  const threes = visibleHand.filter((card) => card.rank === '3').map(toTableCard);
  const dealerSeat = data.dealerSeat;
  const canDeclareNow =
    mySeat !== null && dealerSeat === null && !data.you.declined && threes.length > 0;
  const status = statusText(view, data, seats, mySeat, canDeclareNow);

  const kind: Shuaiz3Center['kind'] =
    data.phase === 'dealing'
      ? 'dealing'
      : data.phase === 'declaring'
        ? 'declaring'
        : data.phase === 'returning'
          ? 'returning'
          : data.phase === 'playing'
            ? 'trick'
            : 'none';

  const remainingSeconds =
    data.phase === 'declaring'
      ? secondsLeft(data.declareDeadline, ctx.now)
      : data.phase === 'returning'
        ? secondsLeft(data.returnDeadline, ctx.now)
        : 0;

  const center: Shuaiz3Center = {
    kind,
    revealed,
    total: HAND_SIZE,
    declaredName: dealerSeat === null ? null : seatName(seats, dealerSeat),
    remainingSeconds,
    isDealer: data.you.mustReturnBottom,
    mustReturnBottom: data.you.mustReturnBottom,
    bottomCards: data.bottomCards.map(toTableCard),
    leadSuit: data.trick?.leadSuit ?? null,
    count: data.trick?.count ?? 0,
    lastTrick: data.lastTrick
      ? { winnerSeat: data.lastTrick.winnerSeat, points: data.lastTrick.points }
      : null,
    trumpSuit: data.trumpSuit,
    canDeclareNow,
    declined: data.you.declined,
    dealerSeat,
    trick: data.trick ? { leadSuit: data.trick.leadSuit, count: data.trick.count } : null,
    threes,
    team: data.you.team,
  };

  return {
    ruleId: 'shuaiz3',
    phase: data.phase,
    seatCount: SEAT_COUNT,
    seats: buildSeats(view, seats, mySeat),
    selfSeat: mySeat,
    hand: visibleHand.map(toTableCard),
    handMarks:
      data.phase === 'returning' && data.you.mustReturnBottom
        ? data.bottomCards.map((card) => card.id)
        : [],
    played: (data.trick?.plays ?? []).map((play) => ({
      seat: play.seat,
      cards: play.cards.map(toTableCard),
    })),
    chrome: [],
    statusText: status.text,
    statusTone: status.strong ? 'strong' : 'muted',
    actions: [],
    result: buildResult(view, seats),
    turnSeat: view.currentSeat,
    lastWinnerSeat: data.lastTrick?.winnerSeat ?? null,
    roomStatus: ctx.roomStatus,
    reducedMotion: ctx.reducedMotion,
    center,
  };
}
