import type { Card } from '../cards';
import type { GameLogEntry } from '../protocol';
import type { LandlordPublicData } from './landlord';
import type { Shuaiz3PublicData } from './shuaiz3';

/** 房间使用哪套规则。新增规则时在这里加一个 id。 */
export type RuleId = 'landlord' | 'shuaiz3';

export interface RuleMetaInfo {
  id: RuleId;
  name: string;
  /** 该规则需要的玩家数，同时决定房间座位数。 */
  capacity: number;
  description: string;
}

/**
 * 客户端发给服务端的通用游戏动作信封。
 *
 * 房间层只负责把 `action` 原样转交给当前规则的运行时，不关心动作的具体形状；
 * 每套规则在自己的 `shared/rules/<ruleId>.ts` 里定义各自的 `XxxAction` 联合类型。
 */
export interface GameAction {
  type: string;
  [key: string]: unknown;
}

/** 所有规则视图都包含的字段，房间层与通用 UI 只依赖这些。 */
export interface GameCommonView {
  ruleId: RuleId;
  phase: string;
  currentSeat: number | null;
  /** 只包含当前观看者自己的手牌，其他玩家的手牌永远不会下发。 */
  hand: Card[];
  handCounts: number[];
  turnStartedAt: number;
  winnerSeat: number | null;
  log: GameLogEntry[];
}

export interface LandlordView extends GameCommonView {
  ruleId: 'landlord';
  data: LandlordPublicData;
}

export interface Shuaiz3View extends GameCommonView {
  ruleId: 'shuaiz3';
  data: Shuaiz3PublicData;
}

export type PublicGameView = LandlordView | Shuaiz3View;
