import { expect, test, type Page } from '@playwright/test';
import { shot } from '../support/shots';
import {
  declareIfPossible,
  playIfMyTurn,
  returnBottomIfNeeded,
} from '../support/shuaiz3';
import { snapshot, waitForSnapshot } from '../support/snapshot';

const RULE_ID = 'shuaiz3';
const MOBILE_LANDSCAPE = { width: 844, height: 390 };

async function seedIdentity(page: Page): Promise<void> {
  await page.addInitScript(() => {
    try {
      sessionStorage.setItem('card237.playerId', 'e2e-player-0001');
      sessionStorage.setItem('card237.name', '验收员');
    } catch {
      // about:blank 等不可写场景忽略
    }
  });
}

test.describe('甩3 · 手机横屏', () => {
  test.use({ viewport: MOBILE_LANDSCAPE });

  test('全流程 UI 验收', async ({ page, request, context }) => {
    test.setTimeout(320_000);

    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(String(error)));

    // 房间名必须是 test，服务端才会自动补满机器人，单人即可验收。
    const created = await request.post('/api/rooms', {
      data: { name: 'test', ruleId: RULE_ID },
    });
    expect(created.ok()).toBeTruthy();
    const { room } = (await created.json()) as { room: { id: string } };

    await seedIdentity(page);
    await page.goto(`/?e2e=1#/room/${room.id}`);

    // 01 等待房间
    await expect(page.locator('.waiting-panel')).toBeVisible();
    await expect(page.locator('.waiting-seat')).toHaveCount(4);
    await shot(page, '01-等待房间');

    // 房主本人也要准备；机器人会通过服务端 alarm 自动准备。
    await page.getByRole('button', { name: '准备', exact: true }).click();
    await expect(page.getByRole('button', { name: '取消准备' })).toBeVisible();

    const startButton = page.getByRole('button', { name: '开始游戏' });
    await expect(startButton).toBeEnabled({ timeout: 30_000 });
    await shot(page, '02-全员准备');

    await startButton.click();

    // 04 发牌
    await expect(page.locator('.phaser-table canvas')).toHaveCount(1, { timeout: 20_000 });
    await waitForSnapshot(page, (snap) => snap.roomStatus === 'playing', {
      label: '进入牌局',
      timeout: 30_000,
    });
    await page.waitForTimeout(1_200);
    await shot(page, '03-发牌中');

    // 03 断线遮罩（直接切换牌桌连接态，避免网络模拟影响机器人节奏）
    await page.evaluate(() => window.__card237?.table.setConnected(false));
    await page.waitForTimeout(350);
    await shot(page, '04-断线遮罩');
    await page.evaluate(() => window.__card237?.table.setConnected(true));
    await page.waitForTimeout(250);

    // 05 甩 3
    await waitForSnapshot(page, (snap) => snap.phase === 'declaring', {
      label: '进入甩3阶段',
      timeout: 30_000,
    });
    await shot(page, '05-甩3阶段');

    // 手上有 3 就自己甩（保证自己是庄家，能截到还底界面）；没有则等机器人放弃后重发。
    const declareDeadline = Date.now() + 45_000;
    let declaredByMe = false;
    while (Date.now() < declareDeadline) {
      const snap = await snapshot(page);
      if (snap?.buttons.some((button) => button.key === 'quickDeclare' && button.enabled)) {
        await shot(page, '06-甩3按钮');
        declaredByMe = await declareIfPossible(page);
        break;
      }
      if (snap && (snap.phase === 'returning' || snap.phase === 'playing')) break;
      await page.waitForTimeout(150);
    }

    // 07 还底
    const returning = await waitForSnapshot(page, (snap) => snap.phase === 'returning', {
      label: '进入还底阶段',
      timeout: 30_000,
    });
    await page.waitForTimeout(500);
    await shot(page, '07-还底');
    if (returning.center.mustReturnBottom) {
      await returnBottomIfNeeded(page);
    }

    // 08 出牌
    const playing = await waitForSnapshot(page, (snap) => snap.phase === 'playing', {
      label: '进入出牌阶段',
      timeout: 30_000,
    });
    await page.waitForTimeout(400);
    await shot(page, '08-出牌阶段');
    if (playing.turnSeat === playing.selfSeat) {
      await playIfMyTurn(page);
    }

    // 09 对局中（自己出过牌、轮到别人时截一张，能看到出牌区）
    let myPlays = 0;
    let midShot = false;
    const playDeadline = Date.now() + 240_000;

    while (Date.now() < playDeadline) {
      const snap = await snapshot(page);
      if (!snap) {
        await page.waitForTimeout(150);
        continue;
      }
      if (snap.roomStatus === 'finished' || snap.phase === 'finished') break;

      if (snap.phase === 'playing' && snap.turnSeat === snap.selfSeat) {
        const acted = await playIfMyTurn(page);
        if (acted) myPlays += 1;
        continue;
      }

      if (!midShot && myPlays >= 1) {
        await shot(page, '09-对局中');
        midShot = true;
      }

      await page.waitForTimeout(180);
    }

    if (!midShot) await shot(page, '09-对局中');

    // 10 结算
    await waitForSnapshot(
      page,
      (snap) => snap.roomStatus === 'finished' || snap.phase === 'finished',
      { label: '牌局结束', timeout: 40_000 },
    );
    await page.waitForTimeout(1_000);
    await shot(page, '10-结算');

    test.info().annotations.push({
      type: 'dealer',
      description: declaredByMe ? '本局由验收员甩 3' : '本局由机器人/系统甩 3',
    });
    expect(pageErrors, `页面运行时报错：\n${pageErrors.join('\n')}`).toEqual([]);
  });
});

test.describe('甩3 · 手机竖屏', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('竖屏旋转提示', async ({ page, request }) => {
    const created = await request.post('/api/rooms', {
      data: { name: 'portrait-check', ruleId: RULE_ID },
    });
    expect(created.ok()).toBeTruthy();
    const { room } = (await created.json()) as { room: { id: string } };

    await seedIdentity(page);
    await page.goto(`#/room/${room.id}`);

    await expect(page.locator('.rotate-hint')).toBeVisible({ timeout: 20_000 });
    await shot(page, '00-竖屏提示');
  });
});
