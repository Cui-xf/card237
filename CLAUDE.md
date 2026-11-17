# Card237 项目规范

## 项目概览

- 三人实时卡牌游戏（斗地主雏形），支持创建/加入房间、准备开局、出牌与断线重连。
- 前端：React 19 + TypeScript + Vite + Tailwind CSS v4（`@tailwindcss/vite`）。
- 后端：Cloudflare Workers + Hono，房间与大厅分别由 Durable Object 承载。
- 实时通信：WebSocket，消息协议集中在 `src/shared/protocol.ts`。


## 协作约定（重要）

- **不要自行启动开发服务器、预览或部署**（`npm run dev`、`vite preview`、`wrangler dev/deploy`），由用户自己启动。
- **不要新增或修改测试文件**，也不要主动跑测试；功能由用户自行验证，用户会截图反馈问题。
- 改完代码至少执行一次 `npm run typecheck`，确保没有类型错误。
- 除非用户明确要求，否则不要执行 `git commit` / `git push`。


## 玩家身份与隔离

- 玩家身份由 `playerId` 决定（`src/client/lib/identity.ts`），服务端只按 WebSocket 上的 `playerId` 认人。
- `playerId` 与昵称保存在 `sessionStorage`：同一标签页刷新仍是同一玩家；新标签页即新玩家，方便用多个标签页模拟多人。
- 不要把 `playerId` 改回 `localStorage`，否则同一浏览器的所有标签页会共用座位与对局状态。
- 已知限制：Chrome「复制标签页」会复制 sessionStorage，复制出来的标签页仍与原标签页同身份；需要全新身份时新开标签页并粘贴地址。

## 验证清单

- `npm run typecheck` 通过。
- 视觉/交互改动不主动截图验收，等待用户在自己启动的环境里反馈。
