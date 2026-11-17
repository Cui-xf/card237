import type Phaser from 'phaser';
import type { Card } from '../../../../shared/cards';
import type { PublicSeat } from '../../../../shared/protocol';
import type { LandlordView } from '../../../../shared/rules/types';
import { cardTextureKey } from '../../core/textures';
import type { Theme } from '../../core/theme';
import type {
  ActionSlot,
  BoardContext,
  CenterContext,
  ChromeSpec,
  ResultModel,
  SeatPosition,
  SelectionResult,
  TableCard,
  TableModel,
  TableSeat,
} from '../../core/types';

const SEAT_COUNT = 3;

export interface LandlordCenter {
  kind: 'trick';
  landlordSeat: number;
  lastPlaySeat: number | null;
  lastPlayCount: number;
  passCount: number;
  bottomCards: TableCard[];
}

export type LandlordTableModel = TableModel<LandlordCenter>;

function toTableCard(card: Card): TableCard {
  return { id: card.id, rank: card.rank, suit: card.suit };
}

function seatPositions(mySeat: number | null): Record<number, SeatPosition> {
  if (mySeat === null) {
    return { 0: 'left', 1: 'right', 2: 'self' };
  }
  return {
    [mySeat]: 'self',
    [(mySeat + 1) % SEAT_COUNT]: 'left',
    [(mySeat + 2) % SEAT_COUNT]: 'right',
  };
}

function seatName(seats: (PublicSeat | null)[], index: number | null): string {
  if (index === null) return '玩家';
  return seats[index]?.name ?? '玩家';
}

function buildSeats(
  view: LandlordView,
  seats: (PublicSeat | null)[],
  mySeat: number | null,
): TableSeat[] {
  const positions = seatPositions(mySeat);
  const result: TableSeat[] = [];

  seats.forEach((seat, index) => {
    if (!seat) return;
    result.push({
      index,
      position: positions[index] ?? 'self',
      name: seat.name,
      isSelf: index === mySeat,
      isHost: seat.isHost,
      online: seat.online,
      ready: seat.ready,
      handCount: view.handCounts[index] ?? 0,
      badge: view.data.landlordSeat === index ? '地主' : undefined,
    });
  });

  return result;
}

function buildStatus(
  view: LandlordView,
  seats: (PublicSeat | null)[],
  mySeat: number | null,
): { text: string; strong: boolean } {
  if (mySeat === null) return { text: '你正在旁观这局牌。', strong: false };
  if (view.phase === 'finished') {
    return { text: '本局结束，等待房主开启下一局。', strong: false };
  }
  if (view.currentSeat === mySeat) {
    return { text: '轮到你出牌', strong: false };
  }
  return {
    text: `等待 ${seatName(seats, view.currentSeat)} 出牌…`,
    strong: true,
  };
}

function buildResult(
  view: LandlordView,
  seats: (PublicSeat | null)[],
): ResultModel | null {
  if (view.phase !== 'finished' || view.winnerSeat === null) return null;
  return {
    title: '本局结束',
    lines: [`${seatName(seats, view.winnerSeat)} 获胜`],
    winnerSeat: view.winnerSeat,
  };
}

export function buildLandlordModel(
  view: LandlordView,
  ctx: BoardContext,
  seats: (PublicSeat | null)[],
  mySeat: number | null,
): LandlordTableModel {
  const data = view.data;
  const status = buildStatus(view, seats, mySeat);
  const played = data.lastPlay
    ? [{ seat: data.lastPlay.seat, cards: data.lastPlay.cards.map(toTableCard) }]
    : [];

  const center: LandlordCenter = {
    kind: 'trick',
    landlordSeat: data.landlordSeat,
    lastPlaySeat: data.lastPlay?.seat ?? null,
    lastPlayCount: data.lastPlay?.cards.length ?? 0,
    passCount: data.passCount,
    bottomCards: data.bottomCards.map(toTableCard),
  };

  const model: LandlordTableModel = {
    ruleId: 'landlord',
    phase: view.phase,
    seatCount: SEAT_COUNT,
    seats: buildSeats(view, seats, mySeat),
    selfSeat: mySeat,
    hand: view.hand.map(toTableCard),
    handMarks: [],
    played,
    chrome: [],
    statusText: status.text,
    statusTone: status.strong ? 'strong' : 'muted',
    actions: [],
    result: buildResult(view, seats),
    turnSeat: view.currentSeat,
    lastWinnerSeat: view.winnerSeat,
    roomStatus: ctx.roomStatus,
    reducedMotion: ctx.reducedMotion,
    center,
  };

  model.chrome = buildLandlordChrome(model);
  return model;
}

export function validateLandlordSelection(
  _model: LandlordTableModel,
  selected: TableCard[],
): SelectionResult {
  if (selected.length > 0) return { ok: true, hint: '轮到你出牌' };
  return { ok: false, hint: '请选择要出的牌' };
}

export function buildLandlordActions(
  model: LandlordTableModel,
  selected: TableCard[],
): ActionSlot[] {
  if (model.roomStatus !== 'playing' || model.selfSeat === null) return [];
  if (model.turnSeat !== model.selfSeat) return [];

  const center = model.center;
  const canPass =
    center.lastPlaySeat !== null && center.lastPlaySeat !== model.selfSeat;

  return [
    {
      key: 'secondary',
      label: '不出',
      enabled: canPass,
      hint: '本手不出',
      action: { type: 'pass' },
    },
    {
      key: 'primary',
      label: selected.length > 0 ? `出牌 · ${selected.length}` : '出牌',
      enabled: selected.length > 0,
      hint: selected.length > 0 ? '确认出牌' : '请选择要出的牌',
      action: { type: 'play', cardIds: selected.map((card) => card.id) },
    },
  ];
}

export function buildLandlordChrome(model: LandlordTableModel): ChromeSpec[] {
  const landlordSeat = model.center.landlordSeat;
  const landlord =
    model.seats.find((seat) => seat.index === landlordSeat)?.name ?? '玩家';
  const specs: ChromeSpec[] = [
    { label: `地主 ${landlord}`, tone: 'gold', placement: 'table' },
  ];

  if (model.selfSeat !== null) {
    specs.push({
      label: model.selfSeat === landlordSeat ? '地主' : '农民',
      tone: model.selfSeat === landlordSeat ? 'gold' : 'muted',
      placement: 'self',
    });
  }

  return specs;
}

export const LANDLORD_SEAT_COUNT = 3;

export function canSelectLandlord(model: LandlordTableModel, _card: TableCard): boolean {
  return model.roomStatus === 'playing' && model.selfSeat !== null;
}

/** 斗地主中央信息与底牌。 */
export class TrickView {
  private readonly scene: Phaser.Scene;
  private readonly title: Phaser.GameObjects.Text;
  private readonly subtitle: Phaser.GameObjects.Text;
  private readonly bottomLabel: Phaser.GameObjects.Text;
  private bottomImages: Phaser.GameObjects.Image[] = [];
  private bottomSignature = '';

  constructor(scene: Phaser.Scene, theme: Theme) {
    this.scene = scene;
    this.title = scene.add
      .text(0, 0, '', {
        fontFamily: theme.font.body,
        fontSize: `${theme.size.body}px`,
        color: theme.color.mint,
        align: 'center',
      })
      .setOrigin(0.5)
      .setDepth(15);
    this.subtitle = scene.add
      .text(0, 0, '', {
        fontFamily: theme.font.body,
        fontSize: `${theme.size.caption}px`,
        color: theme.color.gold.base,
        align: 'center',
      })
      .setOrigin(0.5)
      .setDepth(15);
    this.bottomLabel = scene.add
      .text(0, 0, '底牌', {
        fontFamily: theme.font.body,
        fontSize: `${theme.size.caption}px`,
        color: theme.color.mint,
        align: 'center',
      })
      .setOrigin(0.5)
      .setDepth(15);
  }

  update(model: TableModel, _now: number, ctx: CenterContext): void {
    const typed = model as LandlordTableModel;
    const center = typed.center;
    const lastSeatName =
      center.lastPlaySeat === null
        ? null
        : (typed.seats.find((seat) => seat.index === center.lastPlaySeat)?.name ??
          '玩家');

    this.title
      .setText(
        lastSeatName
          ? `上一手：${lastSeatName} 出 ${center.lastPlayCount} 张`
          : '等待出牌',
      )
      .setPosition(ctx.width / 2, ctx.height * 0.52);
    this.subtitle
      .setText(center.passCount > 0 ? `${center.passCount} 家不出` : '')
      .setVisible(center.passCount > 0)
      .setPosition(ctx.width / 2, ctx.height * 0.52 + 24);

    this.layoutBottom(center.bottomCards, ctx);
  }

  destroy(): void {
    this.title.destroy();
    this.subtitle.destroy();
    this.bottomLabel.destroy();
    for (const image of this.bottomImages) image.destroy();
    this.bottomImages = [];
  }

  private layoutBottom(
    cards: LandlordTableModel['center']['bottomCards'],
    ctx: CenterContext,
  ): void {
    const signature = cards.map((card) => card.id).join(',');
    if (signature !== this.bottomSignature) {
      this.bottomSignature = signature;
      for (const image of this.bottomImages) image.destroy();
      this.bottomImages = [];

      const cardW = ctx.metrics.cardW * 0.52;
      const cardH = cardW * 1.5;
      const gap = cardW * 0.55;
      const total = cardW + gap * Math.max(0, cards.length - 1);

      cards.forEach((card, index) => {
        const image = this.scene.add
          .image(
            ctx.width / 2 - total / 2 + cardW / 2 + index * gap,
            ctx.height * 0.19,
            cardTextureKey(card.id),
          )
          .setDisplaySize(cardW, cardH)
          .setDepth(15);
        this.bottomImages.push(image);
      });
    }

    const y = ctx.height * 0.19;
    const cardW = ctx.metrics.cardW * 0.52;
    const total = cardW + cardW * 0.55 * Math.max(0, cards.length - 1);
    for (let index = 0; index < this.bottomImages.length; index += 1) {
      const image = this.bottomImages[index];
      if (!image) continue;
      image.setPosition(
        ctx.width / 2 - total / 2 + cardW / 2 + index * cardW * 0.55,
        y,
      );
    }
    this.bottomLabel.setPosition(ctx.width / 2, y - cardW * 0.95);
  }
}
