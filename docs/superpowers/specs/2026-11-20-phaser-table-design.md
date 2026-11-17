# Phaser 牌桌重构设计

- 日期：2026-11-20
- 状态：待评审
- 范围：仅前端牌桌；服务端、协议、房间/大厅其余页面不动

## 1. 目标

现有牌桌由 React DOM 组件 + 手写 CSS 渲染，难以实现流畅的发牌、选牌、出牌与结算演出。用 Phaser（`phaser@4.2.1`）接管对局牌桌的渲染与交互，获得接近原生游戏的质感与动效；整体视觉沿用「深绿毡布 + 金」的赌桌风格，并按 ui-ux-pro-max 的 Card & Board Game 方向升级。

## 2. 非目标

- 不重做大厅、等待桌、顶栏、聊天/记录侧栏、离开确认、Toast。
- 不修改 WebSocket 协议、规则引擎、Durable Object 与服务端代码。
- 不引入图片/音频资源；所有视觉由代码绘制。
- 不做浅色主题、不新增测试文件、不自行启动 dev server。

## 3. 架构

### 3.1 分层

```
src/client/
  pages/RoomPage.tsx            # 保留：预检、命名、顶栏、侧栏、离开确认
  lib/useRoomSocket.ts          # 保留不动
  table/
    createTable.ts              # 组合根：创建 Game、注入插件解析函数
    registry.ts                 # ruleId → 插件工厂，唯一注册点（不在 core 内）
    core/                       # 通用牌桌引擎：不认识任何具体玩法
      TableScene.ts             # 主场景：图层容器 + reconcile
      TableBridge.ts            # React ⇄ Phaser 唯一接口
      types.ts                  # TableModel / TableCard / TableSeat / ActionSlot
      RuleBoard.ts              # 玩法插件接口（见 3.3）
      theme.ts                  # 设计令牌：颜色、字号、间距、圆角、缓动、时长
      layout/
        seatLayout.ts           # 通用座位锚点（按 seatCount 生成椭圆坐标）
        handLayout.ts           # 手牌重叠、选中位移
        responsive.ts           # 断点与缩放参数
      views/
        FeltView.ts             # 毡布、桌沿、中央区
        SeatView.ts             # 头像、昵称、手牌数、分数、徽标槽、回合光
        HandView.ts             # 我的手牌与选牌
        PlayedView.ts           # 各家已出的牌（贴座位）+ 出牌飞行
        ActionBarView.ts        # 通用按钮渲染
        ChromeView.ts           # 通用徽标/标签渲染（内容由玩法提供）
        ResultOverlayView.ts    # 通用结算面板（标题、明细、分数、重开/离开）
      textures/
        cards.ts                # 预生成 54 张牌面 + 牌背 + 阴影纹理
        table.ts                # 毡布噪点、桌沿渐变、暗角、光斑纹理
      fx/
        tweens.ts               # 动效预设与 reduced-motion 开关
        dealQueue.ts            # 通用发牌队列
    rules/
      shuaiz3/                  # 甩 3 插件
        index.ts                # createShuaiz3Board(): RuleBoard
        adapter.ts              # Shuaiz3View → TableModel
        layout.ts               # 4 人座位、手牌尺寸
        actions.ts              # 甩 3 / 还底 / 出牌 的可用条件与动作
        chrome.ts               # 主牌、庄家、队伍标签
        center/                 # 甩 3 专属中央阶段视图
          DealingView.ts         # 发牌揭示 + 快捷甩 3
          DeclareView.ts         # 甩 3 倒计时
          ReturnView.ts          # 还底选择与倒计时
          TrickView.ts           # 本轮引领花色/张数与上一墩摘要
      landlord/                 # 斗地主插件
        index.ts
        adapter.ts
        layout.ts               # 3 人座位、17 张手牌
        actions.ts              # 出牌 / 不出
        chrome.ts               # 地主标记、底牌
        center/
          TrickView.ts           # 上一手牌与不出提示
  lib/gameRules.ts              # 跨玩法无归属的纯函数（如牌面比较）才放这里
```

### 3.1.1 隔离约束（硬性）

- `table/core/**` 禁止 import `table/rules/**`、`table/registry.ts` 或任何具体玩法模块；核心只通过注入的 `RuleBoard` 接口工作。
- `table/registry.ts` 与 `table/createTable.ts` 是唯一允许接触全部玩法的组合根。
- `table/rules/<A>/**` 禁止 import `table/rules/<B>/**`；玩法之间零耦合。
- 共享内容只允许下沉到 `core/**`（与玩法无关）或 `shared/**` / `lib/gameRules.ts`（纯函数）。
- 新增玩法 = 新增 `table/rules/<id>/` + 在 `registry.ts` 注册一行 + 在 `shared/rules` 增加规则元信息，不需要改核心渲染、布局或动效代码。
- 玩法专属文案、阶段、按钮、徽标全部留在各自目录，核心 `TableScene` 只认 `TableModel` 与插件返回的视图对象。

### 3.2 数据流

1. `useRoomSocket` 收到 `ServerMessage.state`，React 更新 `RoomView`。
2. `RoomPage` 调用 `bridge.update(state)`；bridge 只在引用变化时转发。
3. 组合根注入的解析函数按 `state.ruleId` 取对应插件，插件 `toModel(view)` 把规则视图映射为 `TableModel`。
4. `TableScene.reconcile(model)` 按 id 做增量更新：核心视图（毡布/座位/手牌/按钮）由 core 处理，中央阶段区交给插件创建的 `CenterView`。
5. Phaser 内点击 → 插件产出的 `ActionSlot.action` → `bridge.onAction(action)` → `RoomPage.sendGameAction` → WebSocket。

规则在同一 Game 内切换时，Scene 通过注入的解析函数换插件、销毁旧 `CenterView`，不重建 Phaser.Game。结算面板由 core 的 `ResultOverlayView` 渲染；房主重开与离开通过 `createTable` 注入的回调处理，不属于 `GameAction`。

### 3.3 玩法插件接口

```ts
interface RuleBoard<TView extends PublicGameView> {
  readonly ruleId: RuleId;
  readonly seatCount: number;

  /** 规则视图 → 通用牌桌模型。玩法差异在这一步收敛。 */
  toModel(view: TView, ctx: BoardContext): TableModel;

  /** 中央阶段区（发牌/甩 3/还底/出牌/结算），生命周期由场景管理。 */
  createCenter(scene: Phaser.Scene, theme: Theme): CenterView;

  /** 玩法徽标：主牌、庄家、地主、队伍等。 */
  chrome(model: TableModel): ChromeSpec[];

  /** 按钮与可用条件。返回的 action 原样发给服务端。 */
  actions(model: TableModel, selected: Card[]): ActionSlot[];

  /** 某张牌此刻是否允许被选中（阶段、身份、点数限制）。 */
  canSelect(model: TableModel, card: Card): boolean;

  /** 选牌合法性校验；核心 HandView 只负责选中态与动效。 */
  validateSelection(model: TableModel, selected: Card[]): SelectionResult;
}
```

`CenterView` 是插件自有对象，只需实现：

```ts
interface CenterView {
  update(model: TableModel, now: number, ctx: CenterContext): void;
  destroy(): void;
}

interface CenterContext {
  scene: Phaser.Scene;
  width: number;
  height: number;
  anchors: Record<SeatPosition, { x: number; y: number }>;
  metrics: Metrics;
  reducedMotion: boolean;
}
```

核心场景只持有 `CenterView` 接口，不 import 任何玩法类，也不知道「甩 3」「地主」是什么。

### 3.4 规则无关的牌桌模型

```ts
interface TableModel<TCenter = unknown> {
  ruleId: RuleId;
  phase: string;
  seatCount: number;
  seats: TableSeat[];            // 已按「自己在下」旋转
  selfSeat: number | null;
  hand: TableCard[];             // 仅自己
  handMarks: string[];           // 手牌上需要高亮的牌 id（如还底阶段的底牌）
  played: { seat: number; cards: TableCard[] }[];
  chrome: ChromeSpec[];          // 玩法徽标，由 core 的 ChromeView 渲染
  statusText: string;
  statusTone: 'muted' | 'strong';
  actions: ActionSlot[];
  result: ResultModel | null;    // 通用结算面板数据，null 表示本局未结束
  turnSeat: number | null;
  roomStatus: 'waiting' | 'playing' | 'finished';
  reducedMotion: boolean;
  /** 玩法私有数据，仅该玩法的 CenterView 解释，核心不读。 */
  center: TCenter;
}
```

配套类型：

```ts
interface TableCard { id: string; rank: Rank; suit: Suit }

interface ChromeSpec {
  label: string;
  tone: 'gold' | 'muted' | 'danger';
  seat?: number;           // 挂在某座位时提供
  placement: 'table' | 'seat' | 'self';
}

interface ActionSlot {
  key: 'primary' | 'secondary' | 'quickDeclare';
  label: string;
  enabled: boolean;
  hint: string;
  action: GameAction;      // 点击后原样发给服务端
}

interface SelectionResult {
  ok: boolean;
  hint: string;
}

interface ResultModel {
  title: string;
  lines: string[];
  scores?: { name: string; score: number }[];
  winnerSeat: number | null;
}
```

`Shuaiz3TableModel` 可以把它自己的 `center` 定义为发牌/倒计时/还底/出牌/结算的判别联合；`LandlordTableModel` 只定义出牌与结算。两者都只是插件内部类型，核心不引用。

规则差异只出现在 `table/rules/<id>/`（adapter、actions、chrome、center），`core/` 不认识甩 3 或斗地主。

### 3.5 生命周期

- `RoomPage` 在牌桌列挂载时创建 `Phaser.Game`，卸载时 `destroy(true)`。
- 同一 `roomId` 下规则/座位变化复用 Game，只重建视图对象。
- 渲染器用 `Phaser.AUTO`；WebGL 不可用时退回 Canvas 2D。
- 不使用 Phaser 的 `Scale.FIT`；使用 `Scale.RESIZE` 铺满容器，按实时尺寸重排。
- `PhaserTable` 在画布外层渲染视觉隐藏的 `aria-live` 区域；场景通过 `onStatus(text)` 回调推送状态文本。

## 4. 视觉设计系统

### 4.1 色彩令牌

| 令牌 | 值 | 用途 |
|---|---|---|
| `bg.abyss` | `#050D0A` | 页面/画布垫底 |
| `felt.center` | `#1B5C3C` | 毡布中心受光区 |
| `felt.mid` | `#144A2F` | 毡布主色 |
| `felt.edge` | `#0B2B1B` | 毡布边缘暗角 |
| `rim.wood` | `#3A2417 → #6B4526` | 桌沿木纹渐变 |
| `gold.base` | `#D8A64C` | 主按钮、金线、徽记 |
| `gold.light` | `#F2D69A` | 高光、悬停 |
| `gold.deep` | `#9C6F2C` | 按钮底部、阴影 |
| `ivory` | `#F7F3E8` | 牌面 |
| `ink` | `#1B2430` | 牌面文字 |
| `suit.red` | `#B3261E` | 红桃/方块 |
| `cream` | `#EFE9DA` | 主要文字 |
| `mint` | `#9AB7A8` | 次要文字 |
| `danger` | `#E06A5F` | 离开、错误 |
| `turn.glow` | `rgba(242,214,154,.75)` | 当前回合呼吸光 |

只做暗色主题，不提供 light mode。

### 4.2 质感（全部代码生成）

- 毡布：256×256 程序化噪点纹理平铺 + 中心径向受光 + 四角暗角，三层叠加。
- 桌沿：木纹渐变 + 内圈金色 hairline + 外圈接触阴影。
- 牌面：象牙白底、极细内描边、左上角点数+花色、中央大点数；按 DPR 2–3 倍预渲染为纹理。
- 牌背：深绿底 + 金色回纹细线 + 中心菱形徽记。
- 阴影：每张牌一层柔和投影，预渲染进纹理，避免逐帧滤镜。

### 4.3 字体

- 中文/正文：`"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif`
- 数字/点数/倒计时：`ui-rounded, "Arial Rounded MT Bold", "PingFang SC", sans-serif`，粗体 + 紧字距。
- 层级：桌标题 20–22、座位名 14、手牌数 13、点数 22、倒计时 34、按钮 16；正文最小 12；正文对比度 ≥ 4.5:1。
- 只用系统字体，不加载 Web Font。

### 4.4 组件语汇

- 座位：圆形头像盘（昵称首字）+ 回合金色呼吸环；昵称下方手牌数徽章与分数胶囊；庄家为金色角标。
- 按钮：胶囊形，上半渐变高光、下半深金；按下位移 1–2px；禁用态去饱和 40% 且不发光。
- 状态提示：居中半透明深绿胶囊 + 细金描边；强提示用金文字。
- 弹层（发牌/结算）：桌面压暗 + 居中卡片式面板 + 金色分隔线，分数滚动。

## 5. 布局

- 三个断点：紧凑（<720px，手机横屏）、标准（720–1200）、宽屏（>1200）。
- 座位锚点按椭圆计算；自己固定在底部中央。4 人：左、上、右；3 人：左、右。
- 手牌在底部独占「牌架」：默认重叠，选中上浮 14px 并前移层级，悬停上浮 8px；牌多时自动增大重叠以保证不超屏宽。
- 出牌区在中央偏上；各家出牌贴向各自座位并缩小；本轮结束由赢家收走。
- 操作按钮在手牌右上方；状态提示在手牌上方居中。
- 竖屏手机可玩（座位压缩、手牌缩小），并保留现有「横屏游玩」提示。

## 6. 动效

全部可被 `prefers-reduced-motion: reduce` 一键降为瞬时终态。

| 场景 | 时长/节奏 | 说明 |
|---|---|---|
| 发牌 | 每张 40ms，单张 260ms | 从牌堆沿弧线飞到各座位，自己的牌落地翻面；发牌中可点击快捷甩 3 |
| 选牌/悬停 | 140ms `easeOutCubic` | 上浮 + 轻微放大，松开回位 |
| 出牌 | 320ms 弧线 | 选中牌带轻微旋转飞入中央，落桌 2px 回弹 |
| 收墩 | 280ms | 非赢家牌缩小飞向赢家，赢家牌金光脉冲 |
| 回合提示 | 1.6s 循环 | 当前座位金色呼吸环 |
| 倒计时 | 每帧 | 环形进度；最后 5 秒转红并脉冲 |
| 结算 | 420ms `back.out` | 桌面压暗，面板 0.92→1，分数滚动 |
| 重连 | 循环 | React 顶部横幅不变；牌桌轻压暗，不打断已有牌面 |

## 7. 交互

- 点击/轻触选牌，再次点击取消；`Esc` 清空选择；`Enter` 提交主操作。
- 规则校验复用现有 `isLeadValid` / `isFollowValid` / `isPointCard`，迁到 `table/rules/shuaiz3/` 内部，逻辑不变。
- 按钮可用条件与现有 `Shuaiz3Board` / `LandlordBoard` 完全对齐：旁观、非本回合、已甩牌、还底张数与禁选点数、跟牌张数与花色。
- 画布挂 `aria-label` 与 `tabindex`；React 侧保留视觉隐藏的 `aria-live` 播报状态。
- 指针交互为主，不做拖拽多选；触控目标 ≥ 44×44px。

## 8. 错误与边界

- 房间不存在、JOIN_REJECTED、玩家未命名：仍走现有 React 页面，不创建 Phaser。
- 断线重连：由 `useRoomSocket` 负责；牌桌展示最后一次状态并轻压暗。
- 相位切换（发牌→甩 3→还底→出牌→结算）与房间回到等待：清空选中、回收临时对象，不重建 Game。
- 已结束状态保留结算面板；房主可重开，其他玩家等待。

## 9. 代码清理

新牌桌接入后删除：

- `components/game/shuaiz3/Shuaiz3Board.tsx`、`BottomReturnPanel.tsx`、`DealingOverlay.tsx`、`DeclarePanel.tsx`、`ResultOverlay.tsx`、`TrickTable.tsx`
- `components/game/landlord/LandlordBoard.tsx`、`PlayZone.tsx`
- `components/Hand.tsx`、`SeatPanel.tsx`、`PlayingCard.tsx`、`room/TurnMeter.tsx`、`room/WinnerOverlay.tsx`
- 仅被上述组件使用的 CSS（`styles/room.css` 中对应段落）
- `components/game/shuaiz3/rules.ts`：内容迁入 `table/rules/shuaiz3/`

大厅使用的手牌展示若仍依赖 `PlayingCard`，改为一个仅供大厅的轻量 DOM 组件，不保留整份旧牌桌样式。

## 10. 验收

- `npm run typecheck` 通过。
- 用户在多标签页环境实测：
  - 甩 3：发牌动画、快捷甩 3、庄家还底、跟牌校验、收墩、结算、重开。
  - 斗地主：出牌、不出、底牌展示与结算的全流程与新牌桌一致。
  - 桌面宽屏、手机横屏、竖屏三种布局无溢出、无遮挡。
  - 断线重连后牌面与选中状态正确恢复。
  - `prefers-reduced-motion` 下无动画但仍可完整操作。
- 隔离检查：`table/core/` 中检索不到 `shuaiz3` / `landlord` 字样；两个玩法目录互不 import；新增玩法的接入成本仅为「新目录 + registry 一行 + shared 规则元信息」。
- 不新增测试文件，不主动跑测试。
