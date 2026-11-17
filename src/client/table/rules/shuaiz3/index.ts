import type Phaser from 'phaser';
import type { PublicSeat } from '../../../../shared/protocol';
import type { Shuaiz3View } from '../../../../shared/rules/types';
import type { Theme } from '../../core/theme';
import type {
  ActionSlot,
  BoardContext,
  CenterView,
  ChromeSpec,
  RuleBoard,
  SelectionResult,
  TableCard,
  TableModel,
} from '../../core/types';
import { buildShuaiz3Model, type Shuaiz3Center, type Shuaiz3TableModel } from './adapter';
import { Shuaiz3CenterView } from './center';
import {
  buildShuaiz3Actions,
  buildShuaiz3Chrome,
  canSelectShuaiz3,
  SHUAIZ3_SEAT_COUNT,
  validateShuaiz3Selection,
} from './logic';

/** 甩 3 玩法插件。 */
export function createShuaiz3Board(): RuleBoard<Shuaiz3View, Shuaiz3Center> {
  return {
    ruleId: 'shuaiz3',
    seatCount: SHUAIZ3_SEAT_COUNT,

    toModel(
      view: Shuaiz3View,
      ctx: BoardContext,
      seats: (PublicSeat | null)[],
      mySeat: number | null,
    ): TableModel<Shuaiz3Center> {
      const model = buildShuaiz3Model(view, ctx, seats, mySeat);
      return { ...model, chrome: buildShuaiz3Chrome(model) };
    },

    createCenter(scene: Phaser.Scene, theme: Theme): CenterView {
      return new Shuaiz3CenterView(scene, theme);
    },

    chrome(model: TableModel<Shuaiz3Center>): ChromeSpec[] {
      return buildShuaiz3Chrome(model as Shuaiz3TableModel);
    },

    actions(model: TableModel<Shuaiz3Center>, selected: TableCard[]): ActionSlot[] {
      return buildShuaiz3Actions(model as Shuaiz3TableModel, selected);
    },

    canSelect(model: TableModel<Shuaiz3Center>, card: TableCard): boolean {
      return canSelectShuaiz3(model as Shuaiz3TableModel, card);
    },

    validateSelection(
      model: TableModel<Shuaiz3Center>,
      selected: TableCard[],
    ): SelectionResult {
      return validateShuaiz3Selection(model as Shuaiz3TableModel, selected);
    },
  };
}
