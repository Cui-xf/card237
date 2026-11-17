import { describe, expect, it } from 'vitest';
import { RANK_VALUE } from '../../shared/cards';
import { createGame, passTurn, playCards } from './engine';

const names = ['甲', '乙', '丙'];

function newGame() {
  return createGame(names, 1_000, () => 0);
}

describe('createGame', () => {
  it('发牌为 17/17/20，底牌进入地主手牌', () => {
    const game = newGame();
    expect(game.landlordSeat).toBe(0);
    expect(game.currentSeat).toBe(0);
    expect(game.hands.map((hand) => hand.length)).toEqual([20, 17, 17]);
    expect(game.bottomCards).toHaveLength(3);

    const uniqueCards = new Set(game.hands.flat().map((card) => card.id));
    expect(uniqueCards.size).toBe(54);
    for (const card of game.bottomCards) {
      expect(uniqueCards.has(card.id)).toBe(true);
    }
  });

  it('地主先手，且所有玩家手牌都已排序', () => {
    const game = newGame();
    expect(game.phase).toBe('playing');
    expect(game.currentSeat).toBe(game.landlordSeat);
    expect(game.log.some((entry) => entry.kind === 'landlord')).toBe(true);

    for (const hand of game.hands) {
      for (let index = 1; index < hand.length; index += 1) {
        expect(RANK_VALUE[hand[index - 1].rank]).toBeGreaterThanOrEqual(
          RANK_VALUE[hand[index].rank],
        );
      }
    }
  });
});

describe('playCards', () => {
  it('合法出牌会移除手牌并推进回合', () => {
    const game = newGame();
    const seat = game.currentSeat;
    const card = game.hands[seat][0];

    const result = playCards(game, seat, [card.id], 2_000);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.hands[seat]).toHaveLength(19);
    expect(result.state.lastPlay?.cards[0].id).toBe(card.id);
    expect(result.state.currentSeat).toBe((seat + 1) % 3);
    expect(result.state.passCount).toBe(0);
  });

  it('拒绝非当前玩家出牌', () => {
    const game = newGame();
    const wrongSeat = (game.currentSeat + 1) % 3;
    const result = playCards(game, wrongSeat, [game.hands[wrongSeat][0].id]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('轮到');
  });

  it('拒绝不在手牌中的牌与重复 id', () => {
    const game = newGame();
    const seat = game.currentSeat;
    expect(playCards(game, seat, ['spade-3', 'not-a-card']).ok).toBe(false);
    const card = game.hands[seat][0];
    expect(playCards(game, seat, [card.id, card.id]).ok).toBe(false);
  });

  it('出完最后一张牌即结束并记录赢家', () => {
    const game = newGame();
    const seat = game.currentSeat;
    const card = game.hands[seat][0];
    game.hands[seat] = [card];

    const result = playCards(game, seat, [card.id]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.phase).toBe('finished');
    expect(result.state.winnerSeat).toBe(seat);
    expect(result.state.log.at(-1)?.kind).toBe('win');
  });
});

describe('passTurn', () => {
  it('无人出牌时不能不出', () => {
    const game = newGame();
    const result = passTurn(game, game.currentSeat);
    expect(result.ok).toBe(false);
  });

  it('连续两家不出后清空 lastPlay 并回到领出者', () => {
    const game = newGame();
    const leader = game.currentSeat;
    const playResult = playCards(game, leader, [game.hands[leader][0].id], 2_000);
    expect(playResult.ok).toBe(true);
    if (!playResult.ok) return;

    const firstPass = passTurn(playResult.state, (leader + 1) % 3, 3_000);
    expect(firstPass.ok).toBe(true);
    if (!firstPass.ok) return;
    expect(firstPass.state.lastPlay).not.toBeNull();

    const secondPass = passTurn(firstPass.state, (leader + 2) % 3, 4_000);
    expect(secondPass.ok).toBe(true);
    if (!secondPass.ok) return;
    expect(secondPass.state.lastPlay).toBeNull();
    expect(secondPass.state.passCount).toBe(0);
    expect(secondPass.state.currentSeat).toBe(leader);
  });
});
