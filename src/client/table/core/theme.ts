export const FONT_BODY =
  '"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif';
export const FONT_NUM =
  'ui-rounded, "Arial Rounded MT Bold", "PingFang SC", "Hiragino Sans GB", sans-serif';

/** 牌桌统一设计令牌；视图层不得写裸色值。 */
export const THEME = {
  color: {
    bg: {
      abyss: '#050D0A',
    },
    felt: {
      center: '#1B5C3C',
      mid: '#144A2F',
      edge: '#0B2B1B',
    },
    rim: {
      from: '#3A2417',
      to: '#6B4526',
    },
    gold: {
      base: '#D8A64C',
      light: '#F2D69A',
      deep: '#9C6F2C',
    },
    ivory: '#F7F3E8',
    ink: '#1B2430',
    suit: {
      red: '#B3261E',
      black: '#1B2430',
    },
    cream: '#EFE9DA',
    mint: '#9AB7A8',
    danger: '#E06A5F',
    turnGlow: 'rgba(242,214,154,0.75)',
    shade: 'rgba(0,0,0,0.45)',
  },
  font: {
    body: FONT_BODY,
    num: FONT_NUM,
  },
  size: {
    title: 21,
    seatName: 14,
    handCount: 13,
    rank: 22,
    countdown: 34,
    button: 16,
    body: 14,
    caption: 12,
  },
  motion: {
    fast: 140,
    play: 320,
    collect: 280,
    dealCard: 260,
    dealGap: 40,
    result: 420,
    turnPulse: 1600,
  },
  radius: {
    card: 10,
    button: 999,
    seat: 26,
  },
} as const;

export type Theme = typeof THEME;
