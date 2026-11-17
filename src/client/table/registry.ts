import type { RuleId } from '../../shared/rules/types';
import type { RuleBoard } from './core/types';
import { createLandlordBoard } from './rules/landlord';
import { createShuaiz3Board } from './rules/shuaiz3';

export type RuleBoardFactory = () => RuleBoard;

const BOARDS: Partial<Record<RuleId, RuleBoardFactory>> = {
  landlord: createLandlordBoard,
  shuaiz3: createShuaiz3Board,
};

export function resolveRuleBoard(ruleId: RuleId): RuleBoard | null {
  return BOARDS[ruleId]?.() ?? null;
}

export function hasRuleBoard(ruleId: RuleId): boolean {
  return ruleId in BOARDS;
}
