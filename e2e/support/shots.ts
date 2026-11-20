import { mkdir, rm } from 'node:fs/promises';
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

/** 清空上一轮的截图，避免场景改名或调整顺序后残留旧编号。 */
export async function cleanShots(): Promise<void> {
  await rm(SHOT_DIR, { recursive: true, force: true });
  await mkdir(SHOT_DIR, { recursive: true });
}

/**
 * 按调用顺序自动编号的截图器。
 *
 * 场景顺序就是截图顺序：中途插入新的验收场景时，后面的编号自动顺延，
 * 不用手工改「10-结算」这类固定编号。
 */
export function createShots(page: Page): (name: string) => Promise<string> {
  let index = 0;
  return async (name: string) => {
    index += 1;
    return shot(page, `${String(index).padStart(2, '0')}-${name}`);
  };
}
