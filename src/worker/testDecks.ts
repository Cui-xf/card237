import type { Card } from '../shared/cards';
import type { RuleId } from '../shared/rules/types';
import { createDeck } from './game/deck';

/**
 * 测试房间的固定牌序。
 *
 * 验收截图需要稳定覆盖「我是庄 / 别人是庄」「一轮出多张牌」等场景，
 * 靠随机洗牌很难每次都撞上，所以测试房间直接按下面这副排好的牌发。
 * 普通房间不受影响。
 *
 * 发牌规则：牌序 0..47 按座位 0/1/2/3 轮转，最后 6 张是底牌。
 */
const SHUAIZ3_TEST_DECK_ORDER: readonly string[] = [
  // —— 第 1–12 张 ——
  'spade-3', // 座位 0（验收员）拿到 ♠3，可以在发牌阶段抢先甩 3 当庄
  'spade-7', // 座位 1 留作「别人当庄」时的庄家：一手机器人里牌力最高的主牌
  'club-3', // 座位 2 —— 预留给牌局后半段的跟牌
  'club-6', // 座位 3
  // —— 第 13–24 张 ——
  'club-A', // 座位 0：第一轮领出 ♣A♣K♣Q（无人能压过 ♣Q，甩牌成立）
  'joker-BJ',
  'diamond-5',
  'diamond-J',
  // —— 第 25–36 张 ——
  'club-K',
  'joker-SJ',
  'spade-4',
  'spade-8',
  // —— 第 37–48 张 ——
  'club-Q',
  'spade-2',
  'heart-3',
  'heart-7',
  // —— 第 49–60 张 ——
  'diamond-A', // 座位 0：第二轮领出 ♦A♦K，逼座位 1 用主牌杀
  'spade-K',
  'club-4',
  'club-7',
  // —— 第 61–72 张 ——
  'diamond-K',
  'spade-J',
  'diamond-10',
  'diamond-Q',
  // —— 第 73–84 张 ——
  'heart-A',
  'diamond-2',
  'spade-5',
  'spade-9',
  // —— 第 85–96 张 ——
  'heart-K',
  'club-2',
  'heart-4',
  'heart-8',
  // —— 第 97–108 张 ——
  'heart-Q',
  'heart-2',
  'club-5',
  'club-8',
  // —— 第 109–120 张 ——
  'heart-J',
  'club-J',
  'spade-6',
  'spade-10',
  // —— 第 121–132 张 ——
  'spade-A', // 座位 0：留 3 张主牌，第三轮跟得起庄家的三张甩牌
  'club-10',
  'heart-5',
  'heart-9',
  // —— 第 133–144 张 ——
  'spade-Q',
  'club-9',
  'heart-6',
  'heart-10',
  // —— 底牌（6 张）：全是小方块，庄家还底时按「最小的非计分牌」原样还回去
  'diamond-3',
  'diamond-4',
  'diamond-6',
  'diamond-7',
  'diamond-8',
  'diamond-9',
];

function buildDeck(order: readonly string[]): Card[] {
  const byId = new Map(createDeck().map((card) => [card.id, card]));
  return order.map((id) => {
    const card = byId.get(id);
    if (!card) throw new Error(`测试牌序里有未知的牌：${id}`);
    return card;
  });
}

const TEST_DECKS: Partial<Record<RuleId, Card[]>> = {
  shuaiz3: buildDeck(SHUAIZ3_TEST_DECK_ORDER),
};

/** 取某个规则在测试房间使用的固定牌序；没有配置时返回 null（照常洗牌）。 */
export function testDeckFor(ruleId: RuleId): Card[] | null {
  const deck = TEST_DECKS[ruleId];
  return deck ? deck.map((card) => ({ ...card })) : null;
}
