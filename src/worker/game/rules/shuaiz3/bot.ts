import type { Card, StandardSuit } from '../../../../shared/cards';
import type { Shuaiz3Play, SuitGroup } from '../../../../shared/rules/shuaiz3';
import type { GameAction } from '../../../../shared/rules/types';
import { createDeck } from '../../deck';
import { isTrump, pointOf, suitGroup, trickCardValue, trumpValue } from './rank';
import { pickAutoReturnCards } from './score';
import type { Shuaiz3State } from './state';

const SEAT_COUNT = 4;
/** 一次最多甩 3 张：再多被打小时损失更大。 */
const MAX_LEAD = 3;

function playAction(cards: Card[]): GameAction {
  return { type: 'play', cardIds: cards.map((card) => card.id) };
}

function sortAsc(cards: readonly Card[], trumpSuit: StandardSuit): Card[] {
  return [...cards].sort(
    (a, b) => trickCardValue(a, trumpSuit) - trickCardValue(b, trumpSuit),
  );
}

function sortDesc(cards: readonly Card[], trumpSuit: StandardSuit): Card[] {
  return [...cards].sort(
    (a, b) => trickCardValue(b, trumpSuit) - trickCardValue(a, trumpSuit),
  );
}

function pointsOf(cards: readonly Card[]): number {
  return cards.reduce((sum, card) => sum + pointOf(card), 0);
}

let deckCache: Card[] | null = null;

/** 整副牌只用于「还有哪些牌没出现」，生成一次即可复用。 */
function fullDeck(): Card[] {
  deckCache ??= createDeck();
  return deckCache;
}

/**
 * 某个花色组里还没露面的最大牌力。
 *
 * 用「整副牌 − 自己手牌 − 已经打出的牌」估计：比自己还大的牌都可能被别人拿着，
 * 因此这个估计偏保守，不会高估甩牌成功率。自己是庄家时还知道还掉了哪 6 张。
 */
function unseenMaxValue(
  state: Shuaiz3State,
  seat: number,
  group: SuitGroup,
  trumpSuit: StandardSuit,
): number {
  const pool: number[] = [];
  for (const card of fullDeck()) {
    if (suitGroup(card, trumpSuit) === group) pool.push(trickCardValue(card, trumpSuit));
  }

  const known: Card[] = [...state.hands[seat], ...(state.playedCards ?? [])];
  if (state.dealerSeat === seat && state.returnedCards) {
    known.push(...state.returnedCards);
  }

  for (const card of known) {
    if (suitGroup(card, trumpSuit) !== group) continue;
    const index = pool.indexOf(trickCardValue(card, trumpSuit));
    if (index >= 0) pool.splice(index, 1);
  }

  return pool.length > 0 ? Math.max(...pool) : Number.NEGATIVE_INFINITY;
}

type LeadKey = [number, number, number, number];

function compareLeadKey(a: LeadKey, b: LeadKey): number {
  for (let index = 0; index < a.length; index += 1) {
    const diff = a[index]! - b[index]!;
    if (diff !== 0) return diff;
  }
  return 0;
}

interface LeadChoice {
  cards: Card[];
  key: LeadKey;
}

/**
 * 找一组「甩出去不会被打小」的连张。
 *
 * 只有该花色外面已经没有比连张里最小牌更大的牌时，整组才会成立。
 * 优先非主牌（省下主牌去杀牌），其次张数、带分、最小牌大小。
 */
function chooseSafeRun(state: Shuaiz3State, seat: number, trumpSuit: StandardSuit): Card[] | null {
  const hand = state.hands[seat];
  const groups = new Map<SuitGroup, Card[]>();
  for (const card of hand) {
    const key = suitGroup(card, trumpSuit);
    const list = groups.get(key);
    if (list) list.push(card);
    else groups.set(key, [card]);
  }

  let best: LeadChoice | null = null;
  for (const [group, cards] of groups) {
    if (cards.length < 2) continue;
    const sorted = sortDesc(cards, trumpSuit);
    const unseen = unseenMaxValue(state, seat, group, trumpSuit);
    const limit = Math.min(MAX_LEAD, sorted.length);

    // 从最长的连张开始尝试，被打小就退到更短的一组。
    for (let count = limit; count >= 2; count -= 1) {
      const run = sorted.slice(0, count);
      const minValue = trickCardValue(run[count - 1]!, trumpSuit);
      if (unseen > minValue) continue;

      const key: LeadKey = [
        group === 'trump' ? 0 : 1,
        count,
        pointsOf(run),
        minValue,
      ];
      if (!best || compareLeadKey(key, best.key) > 0) {
        best = { cards: run, key };
      }
      break;
    }
  }

  return best?.cards ?? null;
}

/** 没有安全连张时领出单张：优先小牌、非计分、非主牌，避免白送大牌。 */
function pickLeadSingle(hand: readonly Card[], trumpSuit: StandardSuit): Card | null {
  if (hand.length === 0) return null;
  return [...hand].sort((a, b) => {
    const pointDiff = (pointOf(a) > 0 ? 1 : 0) - (pointOf(b) > 0 ? 1 : 0);
    if (pointDiff !== 0) return pointDiff;
    const trumpDiff =
      (suitGroup(a, trumpSuit) === 'trump' ? 1 : 0) -
      (suitGroup(b, trumpSuit) === 'trump' ? 1 : 0);
    if (trumpDiff !== 0) return trumpDiff;
    return trickCardValue(a, trumpSuit) - trickCardValue(b, trumpSuit);
  })[0]!;
}

function chooseLead(state: Shuaiz3State, seat: number, trumpSuit: StandardSuit): GameAction | null {
  const run = chooseSafeRun(state, seat, trumpSuit);
  if (run) return playAction(run);

  const single = pickLeadSingle(state.hands[seat], trumpSuit);
  return single ? playAction([single]) : null;
}

/** 整手都是主牌才算杀牌（领出本身是主牌时不适用）。 */
function isKillPlay(cards: readonly Card[], leadSuit: SuitGroup, trumpSuit: StandardSuit): boolean {
  return leadSuit !== 'trump' && cards.length > 0 && cards.every((card) => isTrump(card, trumpSuit));
}

function maxTrumpValue(cards: readonly Card[], trumpSuit: StandardSuit): number {
  let best = Number.NEGATIVE_INFINITY;
  for (const card of cards) best = Math.max(best, trumpValue(card, trumpSuit));
  return best;
}

/** 当前领先的一手，判定顺序与 `resolveTrick` 完全一致。 */
function winningPlay(
  plays: readonly Shuaiz3Play[],
  leadSuit: SuitGroup,
  count: number,
  trumpSuit: StandardSuit,
): Shuaiz3Play {
  const kills = plays.filter((play) => isKillPlay(play.cards, leadSuit, trumpSuit));
  if (kills.length > 0) {
    let best = kills[0]!;
    for (const play of kills.slice(1)) {
      if (maxTrumpValue(play.cards, trumpSuit) > maxTrumpValue(best.cards, trumpSuit)) {
        best = play;
      }
    }
    return best;
  }

  // 多张领出没有杀牌时，打小机制保证领出者赢。
  if (count > 1) return plays[0]!;

  const same = plays.filter((play) => suitGroup(play.cards[0]!, trumpSuit) === leadSuit);
  if (same.length === 0) return plays[0]!;
  let best = same[0]!;
  for (const play of same.slice(1)) {
    if (trickCardValue(play.cards[0]!, trumpSuit) > trickCardValue(best.cards[0]!, trumpSuit)) {
      best = play;
    }
  }
  return best;
}

function canWinWith(
  plays: readonly Shuaiz3Play[],
  cards: Card[],
  seat: number,
  leadSuit: SuitGroup,
  count: number,
  trumpSuit: StandardSuit,
): boolean {
  return winningPlay([...plays, { seat, cards }], leadSuit, count, trumpSuit).seat === seat;
}

/** 垫牌：先丢非主牌，再丢非计分牌，最后才是小牌。 */
function pickLowest(cards: readonly Card[], count: number, trumpSuit: StandardSuit): Card[] {
  return [...cards]
    .sort((a, b) => {
      const trumpDiff =
        (suitGroup(a, trumpSuit) === 'trump' ? 1 : 0) -
        (suitGroup(b, trumpSuit) === 'trump' ? 1 : 0);
      if (trumpDiff !== 0) return trumpDiff;
      const pointDiff = (pointOf(a) > 0 ? 1 : 0) - (pointOf(b) > 0 ? 1 : 0);
      if (pointDiff !== 0) return pointDiff;
      return trickCardValue(a, trumpSuit) - trickCardValue(b, trumpSuit);
    })
    .slice(0, count);
}

/** 送分给队友：先给 10 分牌（10 / K），再给 5。 */
function pickGifts(cards: readonly Card[], count: number, trumpSuit: StandardSuit): Card[] {
  return [...cards]
    .sort((a, b) => {
      const pointDiff = pointOf(b) - pointOf(a);
      if (pointDiff !== 0) return pointDiff;
      return trickCardValue(a, trumpSuit) - trickCardValue(b, trumpSuit);
    })
    .slice(0, count);
}

/** 自己所在阵营；结算前（理论上不会出牌）只把自己当队友。 */
function teammatesOf(state: Shuaiz3State, seat: number): Set<number> {
  const teams = state.teams;
  if (!teams) return new Set([seat]);
  const group = teams.zhuang.includes(seat) ? teams.zhuang : teams.xian;
  return new Set(group);
}

function chooseFollow(state: Shuaiz3State, seat: number, trumpSuit: StandardSuit): GameAction | null {
  const trick = state.trick;
  if (!trick) return null;

  const hand = state.hands[seat];
  const { leadSuit, count } = trick;
  const plays = trick.plays;
  const suitCards = hand.filter((card) => suitGroup(card, trumpSuit) === leadSuit);
  const fillers = hand.filter((card) => suitGroup(card, trumpSuit) !== leadSuit);

  const teams = teammatesOf(state, seat);
  const leader = winningPlay(plays, leadSuit, count, trumpSuit);
  const partnerAhead = leader.seat !== seat && teams.has(leader.seat);
  const lastToPlay = plays.length === SEAT_COUNT - 1;

  // 1) 该花色够张：从中选 count 张。
  if (suitCards.length >= count) {
    if (partnerAhead) {
      // 队友领先：最后一手放心把分垫给队友，否则先丢小牌避免被后面截胡。
      return playAction(
        lastToPlay
          ? pickGifts(suitCards, count, trumpSuit)
          : pickLowest(suitCards, count, trumpSuit),
      );
    }

    if (count === 1) {
      // 单张：用「刚好能赢」的最小牌，压不过就丢最小的一张。
      const asc = sortAsc(suitCards, trumpSuit);
      const winning = asc.find((card) =>
        canWinWith(plays, [card], seat, leadSuit, count, trumpSuit),
      );
      return playAction([winning ?? asc[0]!]);
    }

    // 多张领出：跟同花色改变不了结果，丢最小的几张。
    return playAction(pickLowest(suitCards, count, trumpSuit));
  }

  // 2) 该花色不够：必须先出光该花色，再用其他牌补足。
  const need = count - suitCards.length;

  if (leadSuit !== 'trump' && suitCards.length === 0) {
    // 缺门且可以整手主牌杀牌：桌上有分、且主牌有余量时才值得杀。
    const trumps = fillers.filter((card) => isTrump(card, trumpSuit));
    if (trumps.length >= need) {
      const tablePoints = plays.reduce((sum, play) => sum + pointsOf(play.cards), 0);
      const spare = trumps.length - need;
      const worthKilling =
        !partnerAhead && (tablePoints >= 10 || (tablePoints >= 5 && spare >= 1));

      if (worthKilling) {
        const asc = sortAsc(trumps, trumpSuit);
        const cheap = asc.slice(0, need);
        if (canWinWith(plays, cheap, seat, leadSuit, count, trumpSuit)) {
          return playAction(cheap);
        }
        const strong = asc.slice(-need);
        if (canWinWith(plays, strong, seat, leadSuit, count, trumpSuit)) {
          return playAction(strong);
        }
      }
    }
  }

  // 不杀牌：队友领先且是最后一手就垫分，否则丢最小的非计分牌。
  const gift = partnerAhead && lastToPlay;
  const fillersPicked = gift
    ? pickGifts(fillers, need, trumpSuit)
    : pickLowest(fillers, need, trumpSuit);

  return playAction([...suitCards, ...fillersPicked]);
}

function choosePlay(state: Shuaiz3State, seat: number): GameAction | null {
  const trumpSuit = state.trumpSuit;
  if (!trumpSuit) return null;
  if (state.hands[seat].length === 0) return null;

  return state.trick
    ? chooseFollow(state, seat, trumpSuit)
    : chooseLead(state, seat, trumpSuit);
}

/**
 * 甩3 机器人。
 *
 * - 发牌阶段不动作（不抢着甩 3），真人可以先甩。
 * - 发牌结束后持 3 的机器人一定会甩 3 当庄：机器人之间互相放弃会导致反复重新发牌。
 * - 庄家是机器人时，按「最小的非计分牌」自动还底，保留主牌与 5 / 10 / K。
 * - 出牌阶段会记牌、判断当前赢家、与队友配合，只做合法且有利的选择。
 */
export function botAction(state: Shuaiz3State, seat: number): GameAction | null {
  switch (state.phase) {
    case 'declaring': {
      if (state.dealerSeat !== null) return null;
      if (state.declined[seat]) return null;
      const three = state.hands[seat].find((card) => card.rank === '3');
      return three ? { type: 'declareTrump', cardId: three.id } : null;
    }

    case 'returning': {
      if (state.dealerSeat !== seat || state.returnedCards !== null) return null;
      if (!state.trumpSuit) return null;
      const cards = pickAutoReturnCards(state.hands[seat], state.trumpSuit);
      if (cards.length !== 6) return null;
      return { type: 'returnBottom', cardIds: cards.map((card) => card.id) };
    }

    case 'playing':
      if (state.currentSeat !== seat) return null;
      return choosePlay(state, seat);

    default:
      return null;
  }
}
