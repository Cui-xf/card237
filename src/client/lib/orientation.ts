export type LandscapeResult = 'locked' | 'fullscreen' | 'manual';

/**
 * 尽量把浏览器切到横屏：先请求全屏，再尝试锁定方向。
 *
 * - Android Chrome 在全屏下支持 screen.orientation.lock，返回 'locked'；
 * - iOS Safari 不支持全屏和方向锁定时会退回 'manual'，需要用户手动旋转；
 * - 只进入全屏但锁定失败时返回 'fullscreen'。
 */
export async function requestLandscapeMode(): Promise<LandscapeResult> {
  const root = document.documentElement;

  try {
    if (!document.fullscreenElement && typeof root.requestFullscreen === 'function') {
      await root.requestFullscreen({ navigationUI: 'hide' });
    }
  } catch {
    // 浏览器拒绝全屏（例如 iOS Safari），继续尝试方向锁定。
  }

  try {
    if (typeof screen.orientation?.lock === 'function') {
      await screen.orientation.lock('landscape');
      return 'locked';
    }
  } catch {
    // 方向锁定失败（未全屏或浏览器不支持），交给用户手动旋转。
  }

  return document.fullscreenElement ? 'fullscreen' : 'manual';
}
