import type Phaser from 'phaser';
import type { PublicSeat } from '../../../../shared/protocol';
import type { LandlordView } from '../../../../shared/rules/types';
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
import {
  buildLandlordActions,
  buildLandlordChrome,
  buildLandlordModel,
  canSelectLandlord,
  LANDLORD_SEAT_COUNT,
  TrickView,
  validateLandlordSelection,
  type LandlordCenter,
  type LandlordTableModel,
} from './board';

/** 斗地主玩法插件。 */
export function createLandlordBoard(): RuleBoard<LandlordView, LandlordCenter> {
  return {
    ruleId: 'landlord',
    seatCount: LANDLORD_SEAT_COUNT,

    toModel(
      view: LandlordView,
      ctx: BoardContext,
      seats: (PublicSeat | null)[],
      mySeat: number | null,
    ): TableModel<LandlordCenter> {
      return buildLandlordModel(view, ctx, seats, mySeat);
    },

    createCenter(scene: Phaser.Scene, theme: Theme): CenterView {
      return new TrickView(scene, theme);
    },

    chrome(model: TableModel<LandlordCenter>): ChromeSpec[] {
      return buildLandlordChrome(model as LandlordTableModel);
    },

    actions(model: TableModel<LandlordCenter>, selected: TableCard[]): ActionSlot[] {
      return buildLandlordActions(model as LandlordTableModel, selected);
    },

    canSelect(model: TableModel<LandlordCenter>, card: TableCard): boolean {
      return canSelectLandlord(model as LandlordTableModel, card);
    },

    validateSelection(
      model: TableModel<LandlordCenter>,
      selected: TableCard[],
    ): SelectionResult {
      return validateLandlordSelection(model as LandlordTableModel, selected);
    },
  };
}
