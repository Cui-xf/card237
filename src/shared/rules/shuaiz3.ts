import type { Card, StandardSuit } from '../cards';

/** 发牌 → 甩3 → 还底 → 出牌 → 结算。 */
export type Shuaiz3Phase = 'dealing' | 'declaring' | 'returning' | 'playing' | 'finished';

/**
 * 「同花色」的判定单位。
 *
 * 规则规定所有主牌（主花色牌 + 大小王 + 4 张 2）视为同一花色，
 * 因此主牌统一归到 `trump`，其余花色保持原样。
 */
export type SuitGroup = 'trump' | StandardSuit;

export type Shuaiz3Team = 'zhuang' | 'xian';

export interface Shuaiz3Play {
  seat: number;
  cards: Card[];
}

export interface Shuaiz3TrickView {
  leadSeat: number;
  leadSuit: SuitGroup;
  /** 本轮每家应出的张数；触发打小后为 1。 */
  count: number;
  /** 是否触发过打小。 */
  reduced: boolean;
  /**
   * 甩牌被打小时，玩家原本想一次打出的全部牌。
   *
   * 客户端据此先完整亮出这手牌，动效结束后再收起多余的大牌、只留下实际打出的小牌。
   */
  attemptedCards: Card[];
  plays: Shuaiz3Play[];
}

export interface Shuaiz3TrickResultView {
  winnerSeat: number;
  points: number;
  cards: Card[];
  /** 本轮各家的出牌；本轮结束后仍留在桌面上，直到下一轮领出。 */
  plays: Shuaiz3Play[];
}

export interface Shuaiz3Result {
  zhuangScore: number;
  xianScore: number;
  threshold: number;
  outcome: 'zhuang' | 'xian' | 'draw';
  /** 局末才公开的阵营划分。 */
  teams: { zhuang: number[]; xian: number[] };
}

/** 甩3 视角下独有的公开数据；信息隔离规则见设计文档第 9 节。 */
export interface Shuaiz3PublicData {
  phase: Shuaiz3Phase;
  dealerSeat: number | null;
  trumpSuit: StandardSuit | null;
  /** 被甩出的那张 3 的 id；发牌阶段为 null。 */
  declaredCardId: string | null;

  // 发牌
  dealStartedAt: number;
  dealEndsAt: number;
  dealIntervalMs: number;
  /** 当前观看者已经摸到的张数（0–12），客户端用它揭示 `hand` 的前缀。 */
  revealedCount: number;

  // 甩3 / 还底倒计时
  declareDeadline: number | null;
  returnDeadline: number | null;

  // 底牌：只有庄家在 returning 阶段能看到具体牌面。
  bottomCount: number;
  bottomCards: Card[];
  /** 仅 finished 阶段公开。 */
  returnedCards: Card[] | null;

  // 出牌
  trick: Shuaiz3TrickView | null;
  lastTrick: Shuaiz3TrickResultView | null;
  /** 个人分数，实时显示；不显示队伍总分。 */
  scores: number[];

  // 本人信息：永远只包含观看者自己的身份与可用动作。
  you: {
    seat: number | null;
    team: Shuaiz3Team | null;
    canDeclare: boolean;
    canDecline: boolean;
    declined: boolean;
    mustReturnBottom: boolean;
  };

  result: Shuaiz3Result | null;
}

export type Shuaiz3Action =
  | { type: 'declareTrump'; cardId: string }
  | { type: 'declineTrump' }
  | { type: 'returnBottom'; cardIds: string[] }
  | { type: 'play'; cardIds: string[] };

export const SHUAIZ3_DEAL_INTERVAL_MS = 90;
export const SHUAIZ3_DECLARE_TIMEOUT_MS = 20_000;
export const SHUAIZ3_RETURN_TIMEOUT_MS = 60_000;
export const SHUAIZ3_SCORE_THRESHOLD = 60;
/**
 * 打小后的亮牌静场时间。
 *
 * 服务端在这段时间内暂停出牌，客户端完整亮出被退回的大牌，
 * 动效结束后才收起大牌、继续跟牌。至少 3 秒，方便场上所有人看清。
 */
export const SHUAIZ3_REDUCE_REVEAL_MS = 3_000;
