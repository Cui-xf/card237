import type { Card } from '../cards';

/** 最近一次有效出牌，用于「不出」判定与出牌区展示。 */
export interface LastPlay {
  seat: number;
  cards: Card[];
  at: number;
}

/** 斗地主视角下独有的公开数据。 */
export interface LandlordPublicData {
  landlordSeat: number;
  bottomCards: Card[];
  lastPlay: LastPlay | null;
  passCount: number;
}

export type LandlordAction =
  | { type: 'play'; cardIds: string[] }
  | { type: 'pass' };
