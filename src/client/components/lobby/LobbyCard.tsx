import type { Card } from '../../../shared/cards';
import { isJoker, isRedSuit, SUIT_SYMBOL } from '../../../shared/cards';

interface LobbyCardProps {
  card: Card;
  faceDown?: boolean;
}

function accessibleName(card: Card): string {
  if (card.rank === 'SJ') return '小王';
  if (card.rank === 'BJ') return '大王';
  return `${SUIT_SYMBOL[card.suit]}${card.rank}`;
}

/** 大厅 hero 展示用的静态牌面；牌桌已由 Phaser 绘制。 */
export function LobbyCard({ card, faceDown = false }: LobbyCardProps) {
  if (faceDown) {
    return <span className="card-back card-lg" aria-hidden="true" />;
  }

  const joker = isJoker(card);
  const red = isRedSuit(card.suit) || card.rank === 'BJ';
  const rankLabel = joker ? (card.rank === 'SJ' ? '小' : '大') : card.rank;
  const symbol = joker ? '王' : SUIT_SYMBOL[card.suit];
  const classes = ['card-face', 'card-lg', red ? 'is-red' : '', joker ? 'is-joker' : '']
    .filter(Boolean)
    .join(' ');

  return (
    <span className={classes} role="img" aria-label={accessibleName(card)}>
      <span className="card-corner">
        <span className="card-rank">{rankLabel}</span>
        <span className="card-suit">{symbol}</span>
      </span>
      <span className="card-center" aria-hidden="true">
        {symbol}
      </span>
      <span className="card-corner card-corner-bottom">
        <span className="card-rank">{rankLabel}</span>
        <span className="card-suit">{symbol}</span>
      </span>
    </span>
  );
}
