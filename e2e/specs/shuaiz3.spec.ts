import { expect, test, type Page } from '@playwright/test';
import { cleanShots, createShots, shot } from '../support/shots';
import {
  declareIfPossible,
  playIfMyTurn,
  returnBottomIfNeeded,
} from '../support/shuaiz3';
import { clickScenePoint, snapshot, waitForSnapshot } from '../support/snapshot';

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

  test('全流程 UI 验收', async ({ page, request }) => {
    test.setTimeout(320_000);

    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(String(error)));
    // 每轮验收重新生成整套截图，顺序按真实牌局发生先后自动编号。
    await cleanShots();
    const capture = createShots(page);

    // 房间名必须是 test：服务端才会自动补满机器人，并使用固定牌序（可复现）。
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
    await capture('等待房间');

    // 房主本人也要准备；机器人会通过服务端 alarm 自动准备。
    await page.getByRole('button', { name: '准备', exact: true }).click();
    await expect(page.getByRole('button', { name: '取消准备' })).toBeVisible();

    const startButton = page.getByRole('button', { name: '开始游戏' });
    await expect(startButton).toBeEnabled({ timeout: 30_000 });
    await capture('全员准备');

    await startButton.click();

    // 02 发牌
    await expect(page.locator('.phaser-table canvas')).toHaveCount(1, { timeout: 20_000 });
    await waitForSnapshot(page, (snap) => snap.roomStatus === 'playing', {
      label: '进入牌局',
      timeout: 30_000,
    });
    await page.waitForTimeout(1_200);
    await capture('发牌中');

    // 03 断线遮罩（直接切换牌桌连接态，避免网络模拟影响机器人节奏）
    await page.evaluate(() => window.__card237?.table.setConnected(false));
    await page.waitForTimeout(350);
    await capture('断线遮罩');
    await page.evaluate(() => window.__card237?.table.setConnected(true));
    await page.waitForTimeout(250);

    // 04 甩 3：发牌过程中一摸到 3 就甩，抢在发牌结束后的机器人之前当庄。
    // 客户端按时间推算揭示进度，可能比服务端早几十毫秒，点击被拒就继续重试。
    const declareDeadline = Date.now() + 45_000;
    let declaredByMe = false;
    let declareShot = false;
    while (Date.now() < declareDeadline) {
      const snap = await snapshot(page);
      if (!snap) {
        await page.waitForTimeout(100);
        continue;
      }
      if (snap.center.dealerSeat === snap.selfSeat) {
        declaredByMe = true;
        break;
      }
      if (
        snap.phase === 'returning' ||
        snap.phase === 'playing' ||
        snap.phase === 'finished'
      ) {
        break;
      }
      if (snap.buttons.some((button) => button.key === 'quickDeclare' && button.enabled)) {
        if (!declareShot) {
          await capture('甩3阶段');
          declareShot = true;
        }
        await declareIfPossible(page);
        await page.waitForTimeout(150);
        continue;
      }
      await page.waitForTimeout(120);
    }

    // 庄家确定：中央显示庄家座位与主牌花色（第一局的「我是庄」从这里开始）。
    await waitForSnapshot(page, (snap) => snap.center.dealerSeat !== null, {
      label: '确定庄家',
      timeout: 15_000,
    });
    await page.waitForTimeout(250);
    await capture('庄家确定');

    // 05 还底
    const returning = await waitForSnapshot(page, (snap) => snap.phase === 'returning', {
      label: '进入还底阶段',
      timeout: 30_000,
    });
    await page.waitForTimeout(500);
    await capture('还底');
    if (returning.center.mustReturnBottom) {
      await returnBottomIfNeeded(page);
    }

    // 06 出牌：轮到自己领出
    // 固定牌序配套的领出剧本：第一轮甩 ♣A♣K♣Q（无人能压，我赢下），
    // 第二轮甩 ♦A♦K（座位 1 手里没有方块，只能用主牌杀），
    // 这样「多张牌」的四个画面会按 本轮出牌中 → 我赢下 → 别人赢下 → 别人先出 的顺序出现。
    const leadPlan: string[][] = [
      ['club-A', 'club-K', 'club-Q'],
      ['diamond-A', 'diamond-K'],
    ];
    const playing = await waitForSnapshot(page, (snap) => snap.phase === 'playing', {
      label: '进入出牌阶段',
      timeout: 30_000,
    });
    await page.waitForTimeout(400);
    await capture('出牌阶段·轮到我出牌');
    if (playing.turnSeat === playing.selfSeat) {
      await playIfMyTurn(page, leadPlan);
    }

    // 07+ 对局过程：按真实牌局发生的顺序补齐各类局面。
    let midTrickShot = false;
    let followShot = false;
    let myWinShot = false;
    let otherWinShot = false;
    const playDeadline = Date.now() + 240_000;

    while (Date.now() < playDeadline) {
      const snap = await snapshot(page);
      if (!snap) {
        await page.waitForTimeout(100);
        continue;
      }
      if (snap.roomStatus === 'finished' || snap.phase === 'finished') break;

      const center = snap.center as {
        trick?: unknown;
        lastTrick?: { winnerSeat?: number };
      };
      const lastWinner = center.lastTrick?.winnerSeat;
      const between = !center.trick && Boolean(center.lastTrick) && snap.played.length > 0;
      const hasMulti = snap.played.some((group) => group.cards.length >= 2);
      const mine = snap.played.find((group) => group.seat === snap.selfSeat);

      // 本轮结束、下一轮领出前：四家的牌留在桌上，赢家那一手描金边。
      // 「多张一手」只有甩牌成立时才会出现，所以这四张图都要求桌上有多张牌。
      if (between) {
        if (lastWinner === snap.selfSeat && (mine?.cards.length ?? 0) >= 2 && !myWinShot) {
          await capture('本轮结束·我赢下·轮到我出牌');
          myWinShot = true;
        } else if (lastWinner !== snap.selfSeat && hasMulti && !otherWinShot) {
          await capture('本轮结束·别人赢下·等待领出');
          otherWinShot = true;
        }
      } else if (
        !midTrickShot &&
        snap.played.length >= 2 &&
        hasMulti &&
        snap.turnSeat !== snap.selfSeat
      ) {
        await capture('本轮出牌中');
        midTrickShot = true;
      }

      // 不在自己回合时不应该出现出牌按钮。
      if (snap.phase === 'playing' && snap.turnSeat !== snap.selfSeat) {
        expect(
          snap.buttons.filter((button) => button.key === 'primary'),
          '非自己回合不应显示出牌按钮',
        ).toHaveLength(0);
      }

      if (snap.phase === 'playing' && snap.turnSeat === snap.selfSeat) {
        // 别人（机器人）甩出多张后轮到自己跟牌。
        if (center.trick && hasMulti && !followShot) {
          await capture('别人先出·轮到我出牌');
          followShot = true;
        }
        await playIfMyTurn(page, leadPlan);
        continue;
      }

      await page.waitForTimeout(60);
    }

    // 结算
    await waitForSnapshot(
      page,
      (snap) => snap.roomStatus === 'finished' || snap.phase === 'finished',
      { label: '牌局结束', timeout: 40_000 },
    );
    await page.waitForTimeout(1_000);
    await capture('结算');

    // 第二局：这次不甩 3，让持 3 的机器人自己甩牌当庄，覆盖「我不是庄」的场景。
    const finished = await snapshot(page);
    const restartButton = finished?.overlayButtons.find(
      (button) => button.key === 'restart',
    );
    expect(restartButton, '结算面板应显示「再来一局」').toBeTruthy();
    if (!finished || !restartButton) throw new Error('结算面板缺少「再来一局」按钮');
    await clickScenePoint(page, finished, restartButton.x, restartButton.y);

    await expect(page.locator('.waiting-panel')).toBeVisible({ timeout: 15_000 });
    // 再来一局会把所有人的准备状态清空，真人需要重新准备（机器人自己会准备）。
    await page.getByRole('button', { name: '准备', exact: true }).click();
    const startAgain = page.getByRole('button', { name: '开始游戏' });
    await expect(startAgain).toBeEnabled({ timeout: 30_000 });
    await startAgain.click();

    // 机器人戴上「庄」角标并领出，验收员此时只能等待。
    // 只等庄家这一手（played.length === 1）：下一位机器人 450ms 后就会跟牌，
    // 早一点截图才能拍到「庄家领出」而不会混进别人的出牌动画。
    await waitForSnapshot(
      page,
      (snap) =>
        snap.roomStatus === 'playing' &&
        snap.phase === 'playing' &&
        snap.center.dealerSeat !== null &&
        snap.center.dealerSeat !== snap.selfSeat &&
        snap.played.length === 1 &&
        snap.turnSeat !== snap.selfSeat,
      { label: '机器人当庄并领出', timeout: 60_000 },
    );
    await capture('第二局·别人当庄·庄家领出');

    await waitForSnapshot(
      page,
      (snap) =>
        snap.roomStatus === 'playing' &&
        snap.phase === 'playing' &&
        snap.turnSeat === snap.selfSeat &&
        snap.played.length > 0,
      { label: '第二局轮到我出牌', timeout: 60_000 },
    );
    await page.waitForTimeout(250);
    await capture('第二局·别人当庄·轮到我出牌');

    test.info().annotations.push({
      type: 'dealer',
      description: declaredByMe ? '首局由验收员甩 3' : '首局由机器人/系统甩 3',
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
