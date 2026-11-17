import { RULE_META } from '../../../../shared/rules';
import type { GameAction, LandlordView } from '../../../../shared/rules/types';
import { createGame, passTurn, playCards, type GameState } from './engine';
import type { RuleRuntime } from '../types';

/**
 * 斗地主规则运行时。
 *
 * `engine.ts` 是这套规则自己的牌局状态机，本文件负责把它接到 `RuleRuntime` 契约上。
 */
export const landlordRule: RuleRuntime<GameState> = {
  meta: RULE_META.landlord,

  create({ names, now, random }) {
    return createGame(names, now, random);
  },

  apply(state, seat, action: GameAction, ctx) {
    switch (action.type) {
      case 'play': {
        const cardIds = action.cardIds;
        if (!Array.isArray(cardIds) || cardIds.some((id) => typeof id !== 'string')) {
          return { result: { ok: false, error: '出牌数据无效' } };
        }

        const result = playCards(state, seat, cardIds as string[], ctx.now);
        if (!result.ok) return { result: { ok: false, error: result.error } };

        return {
          result: { ok: true, finished: result.state.phase === 'finished' },
          state: result.state,
        };
      }

      case 'pass': {
        const result = passTurn(state, seat, ctx.now);
        if (!result.ok) return { result: { ok: false, error: result.error } };
        return { result: { ok: true }, state: result.state };
      }

      default:
        return { result: { ok: false, error: '不支持的操作' } };
    }
  },

  tick(state) {
    return {
      result: { changed: false, finished: state.phase === 'finished' },
    };
  },

  nextDeadline() {
    return null;
  },

  view(state, viewerSeat): LandlordView {
    return {
      ruleId: 'landlord',
      phase: state.phase,
      currentSeat: state.currentSeat,
      hand: viewerSeat === null ? [] : [...(state.hands[viewerSeat] ?? [])],
      handCounts: state.hands.map((hand) => hand.length),
      turnStartedAt: state.turnStartedAt,
      winnerSeat: state.winnerSeat,
      log: state.log.slice(-40),
      data: {
        landlordSeat: state.landlordSeat,
        bottomCards: state.bottomCards,
        lastPlay: state.lastPlay,
        passCount: state.passCount,
      },
    };
  },

  isFinished(state) {
    return state.phase === 'finished';
  },
};
