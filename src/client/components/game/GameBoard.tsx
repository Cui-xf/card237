import type { PublicGameView } from '../../../shared/rules/types';
import { hasRuleBoard } from '../../table/registry';
import { PhaserTable } from './PhaserTable';
import type { GameBoardProps } from './types';

type Props = Omit<GameBoardProps<PublicGameView>, 'game'> & { game: PublicGameView };

/** 已注册 Phaser 插件的规则走新牌桌。 */
export function GameBoard({ game, ...rest }: Props) {
  if (!hasRuleBoard(game.ruleId)) return null;
  return <PhaserTable game={game} {...rest} />;
}
