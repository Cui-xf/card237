import type { RuleId, RuleMetaInfo } from './types';

/**
 * 所有已知规则的元数据。
 *
 * 这里只描述「规则怎么介绍自己」，不含任何规则逻辑；
 * 服务端实现注册在 `worker/game/rules/index.ts`，客户端牌桌组件在 `components/game/`。
 */
export const RULE_META: Record<RuleId, RuleMetaInfo> = {
  landlord: {
    id: 'landlord',
    name: '斗地主（测试）',
    capacity: 3,
    description: '3 人斗地主骨架，用于回归测试',
  },
  shuaiz3: {
    id: 'shuaiz3',
    name: '甩3',
    capacity: 4,
    description: '4 人找朋友，100 分制',
  },
};

/**
 * 已经实现服务端运行时与客户端牌桌的规则。
 *
 * 未实现的规则不会出现在建房选项里，避免创建出无法开局的房间。
 */
export const AVAILABLE_RULES: RuleMetaInfo[] = [RULE_META.shuaiz3, RULE_META.landlord];

/** 建房默认规则。 */
export const DEFAULT_RULE_ID: RuleId = 'shuaiz3';

export function isRuleId(value: unknown): value is RuleId {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(RULE_META, value);
}

export function isRuleAvailable(ruleId: RuleId): boolean {
  return AVAILABLE_RULES.some((rule) => rule.id === ruleId);
}

export function ruleMeta(ruleId: RuleId): RuleMetaInfo {
  return RULE_META[ruleId];
}
