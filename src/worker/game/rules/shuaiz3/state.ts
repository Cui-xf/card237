import type { Card, StandardSuit } from '../../../../shared/cards';
import type { GameLogEntry } from '../../../../shared/protocol';
import type {
  Shuaiz3Phase,
  Shuaiz3Play,
  Shuaiz3Result,
  Shuaiz3TrickResultView,
  SuitGroup,
} from '../../../../shared/rules/shuaiz3';

/** 一轮出牌的完整内部状态；公开视图只取其中一部分。 */
export interface Shuaiz3Trick {
  leadSeat: number;
  leadSuit: SuitGroup;
  /** 本轮每家应出的张数；触发打小后为 1。 */
  count: number;
  /** 是否因打小降为 1 张。 */
  reduced: boolean;
  /** 被打小前原本想一次打出的全部牌；客户端在静场期间完整亮出。 */
  attemptedCards: Card[];
  /** 按出牌顺序保存，用于并列时的「先出者大」。 */
  plays: Shuaiz3Play[];
}

export interface Shuaiz3State {
  phase: Shuaiz3Phase;
  /** 按座位顺序保存昵称，仅存在于服务端。 */
  names: string[];

  // 发牌
  /** 洗好的 54 张牌，前 48 张按座位轮转，最后 6 张为底牌。 */
  deck: Card[];
  /** 每个座位 12 张，按发牌顺序（seat, seat+4, …）保存。 */
  hands: Card[][];
  bottomCards: Card[];
  dealStartedAt: number;
  dealEndsAt: number;

  // 甩3
  dealerSeat: number | null;
  trumpSuit: StandardSuit | null;
  declaredCardId: string | null;
  /** 只记录谁已放弃，不公开。 */
  declined: boolean[];
  declareDeadline: number | null;

  // 还底
  returnedCards: Card[] | null;
  /** 庄家还底前的 18 张，用于阵营判定。 */
  dealerOriginalHand: Card[] | null;
  returnDeadline: number | null;

  // 阵营
  teams: { zhuang: number[]; xian: number[] } | null;

  // 出牌
  currentSeat: number | null;
  trick: Shuaiz3Trick | null;
  lastTrick: Shuaiz3TrickResultView | null;
  /**
   * 打小亮牌的结束时间；期间 `currentSeat` 为 null，所有玩家都不能出牌。
   *
   * 让所有人先看清被退回的大牌，动效结束后才继续跟牌。
   */
  reduceRevealUntil: number | null;
  /** 已经打出的牌（含历史轮次），机器人用它记牌；不进入公开视图。 */
  playedCards: Card[];
  /** 个人分数，实时公开；队伍总分只在结算时计算。 */
  scores: number[];
  turnStartedAt: number;

  // 结算
  result: Shuaiz3Result | null;

  log: GameLogEntry[];
  nextLogId: number;
}
