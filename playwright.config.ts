import { defineConfig } from '@playwright/test';

/**
 * 牌桌 UI 自动化验收平台。
 *
 * - 直接复用本机安装的 Chrome（`channel: 'chrome'`），不下载浏览器；
 * - 默认以手机横屏 844×390 运行，贴近真实游玩环境；
 * - 如已有 `npm run dev` 在跑，会直接复用，不会重复启动。
 */
/** 5173 常被其他项目占用，E2E 固定用自己的端口，避免误连到别的 dev server。 */
const WEB_PORT = process.env.E2E_WEB_PORT ?? '5273';
const BASE_URL = process.env.E2E_BASE_URL ?? `http://127.0.0.1:${WEB_PORT}`;
const API_URL = process.env.E2E_API_URL ?? 'http://127.0.0.1:8787';

export default defineConfig({
  testDir: './e2e/specs',
  outputDir: './e2e/artifacts/results',
  fullyParallel: false,
  workers: 1,
  timeout: 300_000,
  expect: { timeout: 20_000 },
  reporter: [
    ['list'],
    [
      'html',
      { open: 'never', outputFolder: './e2e/artifacts/report' },
    ],
  ],
  use: {
    baseURL: BASE_URL,
    channel: 'chrome',
    browserName: 'chromium',
    viewport: { width: 844, height: 390 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    locale: 'zh-CN',
    timezoneId: 'Asia/Shanghai',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  webServer: [
    {
      command: 'npm run dev:api',
      url: `${API_URL}/api/rooms`,
      reuseExistingServer: true,
      timeout: 120_000,
      stdout: 'ignore',
      stderr: 'ignore',
    },
    {
      command: `npm run dev:web -- --port ${WEB_PORT} --strictPort --host 127.0.0.1`,
      url: BASE_URL,
      reuseExistingServer: true,
      timeout: 120_000,
      stdout: 'ignore',
      stderr: 'ignore',
    },
  ],
});
