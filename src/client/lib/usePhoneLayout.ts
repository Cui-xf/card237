import { useMediaQuery } from './useMediaQuery';

/**
 * 手机横屏（矮窗口 + 触摸）走紧凑布局，桌面窄窗口不受影响。
 * 页面通过给根节点加 `is-landscape` 类来启用横屏样式。
 */
export const PHONE_LANDSCAPE_QUERY =
  '(orientation: landscape) and (max-height: 600px) and (pointer: coarse)';

/** 手机竖屏：用于提示用户把手机横过来。 */
export const PHONE_PORTRAIT_QUERY =
  '(orientation: portrait) and (max-width: 900px) and (pointer: coarse)';

export function usePhoneLayout() {
  const isLandscape = useMediaQuery(PHONE_LANDSCAPE_QUERY);
  const isPortraitPhone = useMediaQuery(PHONE_PORTRAIT_QUERY);

  return { isLandscape, isPortraitPhone };
}
