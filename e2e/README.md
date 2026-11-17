# 牌桌 UI 自动化验收（E2E）

基于 Playwright + 本机 Chrome 的手机横屏 UI 验收平台，当前覆盖 **甩 3**。

## 运行

```bash
npm run test:e2e          # 无头运行，自动起/复用 dev server
npm run test:e2e:headed   # 有头，方便观察
npm run test:e2e:report   # 打开 HTML 报告
```

产物：

- 验收截图：`e2e/screenshots/*.png`（每一步一张，按序号命名）
- 运行报告：`e2e/artifacts/report/index.html`
- 失败现场：`e2e/artifacts/results/`（截图、trace）
- 两个目录都在 `.gitignore` 里，不会污染提交。

环境要求：

- 本机已安装 Google Chrome（配置用 `channel: 'chrome'`，不下载浏览器）。
- 端口：Web `5273`、API `8787`。已有 `npm run dev` 在跑时会直接复用；
  5173 常被其他项目占用，所以 E2E 固定用自己的端口。
- 可用 `E2E_BASE_URL` / `E2E_API_URL` / `E2E_WEB_PORT` 覆盖默认地址。

## 它是怎么驱动游戏的

1. **测试房间**：`POST /api/rooms` 创建名为 `test` 的房间。服务端对 `test`
   房间自动用机器人补满空座（`src/worker/room.ts`），因此一个人就能跑完整局。
2. **调试桥**：页面带 `?e2e=1` 时，`PhaserTable` 会把牌桌控制器挂到
   `window.__card237.table`，提供：
   - `debugSnapshot()`：阶段、手牌、每张牌/每个按钮的场景坐标、中央区数据；
   - `setConnected(boolean)`：用于验证断线遮罩。
   正常游玩（不带 `?e2e=1`）不会暴露任何东西。
3. **真实点击**：测试按快照里的坐标换算成页面坐标，用鼠标点 canvas 上的牌和
   按钮，走的是真实命中区域，而不是直接调用内部函数。
4. **自动出牌**：`e2e/support/shuaiz3.ts` 里有一份保守的合法策略（领出单张、
   跟牌先出光领出花色），只用于把对局推进到结算。

## 文件

```
playwright.config.ts        # 端口、手机横屏 844×390、webServer
e2e/
  specs/shuaiz3.spec.ts     # 甩 3 全流程 + 竖屏提示
  support/snapshot.ts       # 快照读取、等待、坐标点击
  support/shuaiz3.ts        # 甩 3 的合法出牌/还底/甩 3 策略
  support/shots.ts          # 截图落盘
```

## 扩展新玩法

1. 页面入口不变，牌桌插件在 `src/client/table/registry.ts` 注册即可。
2. 新建 `e2e/specs/<rule>.spec.ts`，沿用 `snapshot.ts` 的等待/点击工具。
3. 需要自动对局时，按该玩法的规则写一份 `pickXxxIds(snapshot)` 策略。
