import type { CSSProperties } from 'react';
import type { Card } from '../../shared/cards';
import { isJoker, isRedSuit, SUIT_SYMBOL } from '../../shared/cards';

export type CardSize = 'xs' | 'sm' | 'md' | 'lg';

interface PlayingCardProps {
  card: Card;
  size?: CardSize;
  selected?: boolean;
  onClick?: () => void;
  faceDown?: boolean;
  className?: string;
}

const SIZE_CLASS: Record<CardSize, string> = {
  xs: 'card-xs',
  sm: 'card-sm',
  md: '',
  lg: 'card-lg',
};

function accessibleName(card: Card): string {
  if (card.rank === 'SJ') return '小王';
  if (card.rank === 'BJ') return '大王';
  return `${SUIT_SYMBOL[card.suit]}${card.rank}`;
}

export function PlayingCard({
  card,
  size = 'md',
  selected = false,
  onClick,
  faceDown = false,
  className = '',
}: PlayingCardProps) {
  const sizeClass = SIZE_CLASS[size];

  if (faceDown) {
    return <span className={`card-back ${sizeClass} ${className}`.trim()} aria-hidden="true" />;
  }

  const joker = isJoker(card);
  const red = isRedSuit(card.suit) || card.rank === 'BJ';
  const rankLabel = joker ? (card.rank === 'SJ' ? '小' : '大') : card.rank;
  const symbol = joker ? '王' : SUIT_SYMBOL[card.suit];
  const classNames = [
    'card-face',
    sizeClass,
    red ? 'is-red' : '',
    joker ? 'is-joker' : '',
    onClick ? 'card-button' : '',
    selected ? 'is-selected' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  const content = (
    <>
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
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        className={classNames}
        onClick={onClick}
        aria-pressed={selected}
        aria-label={`${accessibleName(card)}，${selected ? '已选中，点击取消' : '点击选择'}`}
      >
        {content}
      </button>
    );
  }

  return (
    <span className={classNames} role="img" aria-label={accessibleName(card)}>
      {content}
    </span>
  );
}

export function StaticCardRow({
  cards,
  size = 'sm',
  className = '',
}: {
  cards: Card[];
  size?: CardSize;
  className?: string;
}) {
  const overlap = size === 'xs' ? 11 : 15;

  return (
    <div className={`static-card-row ${className}`.trim()}>
      {cards.map((card, index) => {
        const tilt = (index - (cards.length - 1) / 2) * 1.1;
        const style = {
          marginLeft: index === 0 ? 0 : -overlap,
          zIndex: index,
          '--tilt': `${tilt}deg`,
        } as CSSProperties;

        return (
          <div key={card.id} className="static-card-slot" style={style}>
            <PlayingCard card={card} size={size} />
          </div>
        );
      })}
    </div>
  );
}
