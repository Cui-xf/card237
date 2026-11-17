import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import type { Page } from '@playwright/test';

const SHOT_DIR = path.join(process.cwd(), 'e2e', 'screenshots');

/** 保存一张验收截图到 `e2e/screenshots/<name>.png`。 */
export async function shot(page: Page, name: string): Promise<string> {
  await mkdir(SHOT_DIR, { recursive: true });
  await page.waitForTimeout(180);
  const file = path.join(SHOT_DIR, `${name}.png`);
  await page.screenshot({ path: file });
  return file;
}
