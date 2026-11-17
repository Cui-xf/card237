import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { Card } from '../../shared/cards';
import { PlayingCard } from './PlayingCard';

interface HandProps {
  cards: Card[];
  selected: Set<string>;
  onToggle: (cardId: string) => void;
  disabled?: boolean;
}

export function Hand({ cards, selected, onToggle, disabled = false }: HandProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    const update = () => setWidth(element.clientWidth);
    update();

    const observer = new ResizeObserver((entries) => {
      const nextWidth = entries[0]?.contentRect.width;
      if (typeof nextWidth === 'number') setWidth(nextWidth);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const count = cards.length;
  const cardWidth = width > 0 && width < 520 ? 48 : width > 0 && width < 860 ? 58 : 68;
  const cardHeight = Math.round(cardWidth * 1.42);
  const step =
    count <= 1 || width <= 0
      ? cardWidth
      : Math.min(cardWidth * 0.66, Math.max(11, (width - cardWidth) / (count - 1)));
  const overlap = Math.max(0, cardWidth - step);

  return (
    <div
      ref={containerRef}
      className="hand"
      role="group"
      aria-label={`你的手牌，共 ${count} 张`}
      style={
        {
          '--hand-card-w': `${cardWidth}px`,
          '--hand-card-h': `${cardHeight}px`,
        } as CSSProperties
      }
    >
      {count === 0 ? (
        <p className="hand-empty">暂无手牌</p>
      ) : (
        cards.map((card, index) => (
          <div
            key={card.id}
            className="hand-slot"
            style={
              {
                marginLeft: index === 0 ? 0 : -overlap,
                zIndex: index,
                '--i': index,
              } as CSSProperties
            }
          >
            <PlayingCard
              card={card}
              selected={selected.has(card.id)}
              onClick={disabled ? undefined : () => onToggle(card.id)}
            />
          </div>
        ))
      )}
    </div>
  );
}
