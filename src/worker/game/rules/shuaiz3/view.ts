import { SHUAIZ3_DEAL_INTERVAL_MS } from '../../../../shared/rules/shuaiz3';
import type { Shuaiz3Team } from '../../../../shared/rules/shuaiz3';
import type { Shuaiz3View } from '../../../../shared/rules/types';
import { BOTTOM_COUNT, DECK_SIZE, revealedForSeat, revealedTotal } from './deal';
import { sortHandForPlay } from './rank';
import type { Shuaiz3State } from './state';

/**
 * 视图投影：信息隔离全部集中在这里。
 *
 * 永不下发：其他玩家手牌、非庄家看到的底牌、其他玩家的阵营、
 * 其他玩家是否已放弃、庄家还底的具体牌（只在 finished 公开）。
 */
export function buildView(state: Shuaiz3State, viewerSeat: number | null): Shuaiz3View {
  const now = Date.now();
  const seat = viewerSeat;
  const dealing = state.phase === 'dealing';

  const totalRevealed = dealing ? revealedTotal(state.dealStartedAt, now) : DECK_SIZE;
  const revealedCount = seat === null ? 0 : revealedForSeat(seat, totalRevealed);

  const ownHand = seat === null ? [] : (state.hands[seat] ?? []);
  const hand =
    state.trumpSuit && state.phase === 'playing'
      ? sortHandForPlay(ownHand, state.trumpSuit)
      : [...ownHand];

  const canActOnTrump =
    (state.phase === 'dealing' || state.phase === 'declaring') && state.dealerSeat === null;
  const declined = seat !== null && state.declined[seat] === true;
  const drewTrumpCandidate =
    seat !== null &&
    canActOnTrump &&
    !declined &&
    ownHand.slice(0, revealedCount).some((card) => card.rank === '3');

  const team: Shuaiz3Team | null =
    seat !== null && state.teams
      ? state.teams.zhuang.includes(seat)
        ? 'zhuang'
        : 'xian'
      : null;

  const showBottom =
    seat !== null && seat === state.dealerSeat && state.phase === 'returning';

  const trick = state.trick
    ? {
        leadSeat: state.trick.leadSeat,
        leadSuit: state.trick.leadSuit,
        count: state.trick.count,
        reduced: state.trick.reduced,
        plays: state.trick.plays.map((play) => ({ seat: play.seat, cards: [...play.cards] })),
      }
    : null;

  return {
    ruleId: 'shuaiz3',
    phase: state.phase,
    currentSeat: state.phase === 'playing' ? state.currentSeat : null,
    hand,
    handCounts: state.hands.map((cards) => cards.length),
    turnStartedAt: state.turnStartedAt,
    winnerSeat: null,
    log: state.log.slice(-40),
    data: {
      phase: state.phase,
      dealerSeat: state.dealerSeat,
      trumpSuit: state.trumpSuit,
      declaredCardId: state.declaredCardId,

      dealStartedAt: state.dealStartedAt,
      dealEndsAt: state.dealEndsAt,
      dealIntervalMs: SHUAIZ3_DEAL_INTERVAL_MS,
      revealedCount,

      declareDeadline: state.declareDeadline,
      returnDeadline: state.returnDeadline,

      bottomCount: BOTTOM_COUNT,
      bottomCards: showBottom ? [...state.bottomCards] : [],
      returnedCards: state.phase === 'finished' ? state.returnedCards : null,

      trick,
      lastTrick: state.lastTrick,
      scores: [...state.scores],

      you: {
        seat,
        team,
        canDeclare: drewTrumpCandidate,
        canDecline: drewTrumpCandidate,
        declined,
        mustReturnBottom:
          state.phase === 'returning' &&
          seat !== null &&
          seat === state.dealerSeat &&
          state.returnedCards === null,
      },

      result: state.phase === 'finished' ? state.result : null,
    },
  };
}
