import type { PublicGame, PublicSeat } from '../../../shared/protocol';
import { seatTextClass } from '../../lib/format';
import { StaticCardRow } from '../PlayingCard';

interface PlayZoneProps {
  game: PublicGame;
  seats: (PublicSeat | null)[];
}

export function PlayZone({ game, seats }: PlayZoneProps) {
  const currentName = seats[game.currentSeat]?.name ?? '玩家';
  const lastPlayerName = game.lastPlay
    ? (seats[game.lastPlay.seat]?.name ?? '玩家')
    : null;

  if (!game.lastPlay) {
    return (
      <div className="play-zone">
        <p className="play-hint">
          {game.phase === 'finished' ? '本局结束' : `等待 ${currentName} 领出`}
        </p>
      </div>
    );
  }

  return (
    <div className="play-zone">
      <p className="play-caption">
        <span className={seatTextClass(game.lastPlay.seat)}>{lastPlayerName}</span>
        <span className="text-mint"> 打出 {game.lastPlay.cards.length} 张</span>
      </p>
      <StaticCardRow
        cards={game.lastPlay.cards}
        size={game.lastPlay.cards.length > 8 ? 'xs' : 'sm'}
        className="play-cards"
      />
    </div>
  );
}
