const timeFormatter = new Intl.DateTimeFormat('zh-CN', {
  hour: '2-digit',
  minute: '2-digit',
});

export function formatTime(timestamp: number): string {
  return timeFormatter.format(new Date(timestamp));
}

export function initials(name: string): string {
  const chars = [...name.trim()];
  return chars.length > 0 ? chars[0].toUpperCase() : '?';
}

const SEAT_TEXT_CLASSES = ['text-gold-300', 'text-emerald-300', 'text-rose-300'] as const;

export function seatTextClass(seat: number | null | undefined): string {
  if (seat === null || seat === undefined || seat < 0) return 'text-cream';
  return SEAT_TEXT_CLASSES[seat % SEAT_TEXT_CLASSES.length];
}
