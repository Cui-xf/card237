import type { RuleId } from '../../../shared/rules/types';
import { landlordRule } from './landlord';
import { shuaiz3Rule } from './shuaiz3';
import type { RuleRuntime } from './types';

/**
 * 服务端规则注册表。
 *
 * 房间层只通过 `ruleRuntime()` 取运行时，不直接 import 任何规则模块。
 * 新增规则时在这里加一行，并在 `shared/rules/index.ts` 的 AVAILABLE_RULES 里开放。
 */
export const RULE_RUNTIMES: Partial<Record<RuleId, RuleRuntime<unknown>>> = {
  landlord: landlordRule,
  shuaiz3: shuaiz3Rule,
};

export function ruleRuntime(ruleId: RuleId): RuleRuntime<unknown> | null {
  return RULE_RUNTIMES[ruleId] ?? null;
}
