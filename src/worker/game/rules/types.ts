import type { GameAction, PublicGameView, RuleMetaInfo } from '../../../shared/rules/types';

/** 规则运行时需要的可配置项；后续接后台时由房间层注入。 */
export interface RuleConfig {
  /** 甩3 结算门槛，默认 60。 */
  scoreThreshold: number;
}

export interface RuleCreateContext {
  /** 按座位顺序的昵称，长度等于规则人数。 */
  names: string[];
  now: number;
  random: () => number;
  config: RuleConfig;
}

export interface RuleActionContext {
  now: number;
  random: () => number;
  config: RuleConfig;
}

export interface RuleApplyResult {
  ok: boolean;
  error?: string;
  /** 规则已结束，房间层据此把 room.status 置为 finished。 */
  finished?: boolean;
}

export interface RuleTickResult {
  /** 时间推进是否改变了状态。 */
  changed: boolean;
  finished?: boolean;
}

/**
 * 一套规则的运行时。
 *
 * 房间层只通过这个接口与规则交互：它不认识任何规则专属字段，
 * 规则之间也不互相 import。状态 `S` 由各规则自己定义，注册表里以
 * `RuleRuntime<unknown>` 存放。
 */
export interface RuleRuntime<S = unknown> {
  readonly meta: RuleMetaInfo;
  create(ctx: RuleCreateContext): S;
  /** 处理一次玩家动作；返回新状态或错误，不修改入参状态。 */
  apply(
    state: S,
    seat: number,
    action: GameAction,
    ctx: RuleActionContext,
  ): { result: RuleApplyResult; state?: S };
  /** 时间推进：发牌结束、甩3 超时、还底超时等。必须幂等。 */
  tick(state: S, now: number, ctx: RuleActionContext): { result: RuleTickResult; state?: S };
  /**
   * 机器人：返回该座位当前应执行的动作，null 表示暂不行动。
   *
   * 只由房间层在「该座位是机器人 + 轮到它行动」时调用；没有实现这个方法的规则
   * 不会获得机器人座位。动作同样走 `apply`，因此和真人动作遵守完全相同的校验。
   */
  botAction?(state: S, seat: number, ctx: RuleActionContext): GameAction | null;
  /** 下一次需要 Alarm 的时间；null 表示没有定时任务。 */
  nextDeadline(state: S): number | null;
  /** 按观看者生成公开视图；viewerSeat 为 null 表示旁观者。 */
  view(state: S, viewerSeat: number | null, names: string[]): PublicGameView;
  isFinished(state: S): boolean;
}
