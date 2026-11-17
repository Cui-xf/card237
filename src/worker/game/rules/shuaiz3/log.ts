import type { Card } from '../../../../shared/cards';
import { cardLabel } from '../../../../shared/cards';
import type { GameLogKind } from '../../../../shared/protocol';
import type { Shuaiz3State } from './state';

const MAX_LOG_ENTRIES = 80;

export function addLog(
  state: Shuaiz3State,
  kind: GameLogKind,
  text: string,
  at: number,
  seat?: number,
): void {
  state.log.push({ id: state.nextLogId, kind, text, at, seat });
  state.nextLogId += 1;
  if (state.log.length > MAX_LOG_ENTRIES) {
    state.log.splice(0, state.log.length - MAX_LOG_ENTRIES);
  }
}

export function formatCards(cards: Card[]): string {
  const labels = cards.slice(0, 8).map(cardLabel);
  return cards.length > 8 ? `${labels.join(' ')} …（共 ${cards.length} 张）` : labels.join(' ');
}
