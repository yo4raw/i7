import type { Card } from '../../src/lib/data/fetchCardsJson';
import type { OracleInput } from './oracleTypes';

const NOTE_RATE = { white: 0.025, color: 0.03 } as const;

/**
 * 未特訓時に自属性から差し引く固定値（レアリティ別）。
 * スプレッドシート AM26 系 `if(自属性 && 未特訓, stat − (AM20×AM21), stat)` の減算分に相当。
 * UR のみ確定値。オラクル独立性のため engine の定数は import せずここで定義する。
 */
const TRAIN_BONUS: Record<string, number> = { UR: 1800 };

type AttrName = 'Shout' | 'Beat' | 'Melody';
const ATTRS: AttrName[] = ['Shout', 'Beat', 'Melody'];

function normalizeAttr(raw: string | null | undefined): AttrName | null {
  if (raw === 'Shout' || raw === 'Beat' || raw === 'Melody') return raw;
  return null;
}

function statMax(card: Card, attr: AttrName): number {
  if (attr === 'Shout') return card.shout_max || 0;
  if (attr === 'Beat') return card.beat_max || 0;
  return card.melody_max || 0;
}

/**
 * 属性値スコア（スプレッドシート §1-2 〜 §1-4 / v1.0.6 数式を移植）。
 *
 * フロー:
 *  1. カード別 特効適用後ステータス: `ROUND(stat × eventMult)`（AM29 系。未特訓は自属性から
 *     TRAIN_BONUS を減算）
 *  2. デッキ6枚を属性ごとに合算 + ブローチ/ラビット属性加算（AN67〜AN69 系）
 *  3. センター/フレンドボーナス: `floor(appeal × (1 + 0.1×center一致 + 0.1×friend一致))`
 *     （AN71 系。10% ハードコード・センター+フレンドを合算してから一括 floor）
 *  4. アシスト: `floor(appeal × 1.2)`（AN72 系）
 *  5. per-note 2 段 floor: `floor(floor(appeal × NOTE_RATE) × light) × count` を全ステージ合算
 *     （BA11/BA12 系 → BI11:BN18 → BN21）
 *
 * スコアアップ/縮小トグルに依存しない（両モード共通）。
 */
export function computeAttributeScore(input: OracleInput): number {
  // 1 + 2: 特効適用後ステータスをデッキ合算
  const appeal: Record<AttrName, number> = { Shout: 0, Beat: 0, Melody: 0 };
  input.deck.forEach((card, i) => {
    if (!card) return;
    const cardAttr = normalizeAttr(card.attribute);
    const mult = input.eventMultipliers[i] ?? 1.0;
    const trained = input.trained[i] ?? true;
    const trainBonus = TRAIN_BONUS[card.rarity ?? ''] ?? 0;
    for (const attr of ATTRS) {
      let base = statMax(card, attr);
      if (!trained && cardAttr === attr) base -= trainBonus;
      appeal[attr] += Math.round(base * mult);
    }
  });

  // ブローチ/ラビット属性加算（AN68/AN69 系）
  appeal.Shout += input.broachAttr.shout + input.rabbitAttr.shout;
  appeal.Beat += input.broachAttr.beat + input.rabbitAttr.beat;
  appeal.Melody += input.broachAttr.melody + input.rabbitAttr.melody;

  // 3: センター/フレンド（10% ハードコード・合算してから一括 floor）
  const centerAttr = normalizeAttr(input.deck[input.center]?.attribute);
  const friendAttr = normalizeAttr(input.deck[input.friend]?.attribute);
  for (const attr of ATTRS) {
    let rate = 1.0;
    if (centerAttr === attr) rate += 0.1;
    if (friendAttr === attr) rate += 0.1;
    appeal[attr] = Math.floor(appeal[attr] * rate);
  }

  // 4: アシスト（×1.2 floor）
  if (input.assist) {
    for (const attr of ATTRS) appeal[attr] = Math.floor(appeal[attr] * 1.2);
  }

  // 5: per-note 2 段 floor をステージ合算
  let total = 0;
  for (const stage of input.song.noteStages) {
    const perNoteBase = Math.floor(appeal[stage.attribute] * NOTE_RATE[stage.type]);
    const perNote = Math.floor(perNoteBase * stage.light);
    total += perNote * stage.count;
  }
  return total;
}
