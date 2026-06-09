import type { Card } from '../../src/lib/data/fetchCardsJson';
import { getApSkillLevel } from '../../src/lib/data/fetchCardsJson';
import type { OracleInput, OracleMode } from './oracleTypes';

/**
 * スコアアップスキル（スプレッドシート §3 / v1.0.6 `H38:M38` 数式を移植）。
 *
 * v1.0.6 生数式 (`sheet5.xml` H38, shared ref H38:M38):
 * ```
 * H38 = IFERROR(ROUNDDOWN(
 *   IFS(H31="スコアアップ",
 *     IFS(OR(H33="Perfect", H33="コンボ"),
 *           $D8/H34 * IFS($B12=TRUE,1, $B13=TRUE,((H35+$C14)/100), TRUE,(H35/100)) * H36,
 *         H33="タイマー",
 *           $D9/H34 * IFS($B12=TRUE,1, $B13=TRUE,((H35+$C14)/100), TRUE,(H35/100)) * H36)),
 *   0), )
 * ```
 *
 * 対応関係:
 *  - `H31` = スキル種別 ⇔ `card.ap_skill_type`（`fetchCardsJson` で「スコアアップ（Perfect）」等に正規化）
 *  - `H33` = 発動条件 ⇔ `card.ap_skill_req`（"Perfect" / "コンボ" / "タイマー"）
 *  - `H34` = count, `H35` = per(%), `H36` = value ⇔ `getApSkillLevel(card, level)`
 *  - `$D8` = ノーツ数, `$D9` = 曲秒数
 *
 * モード別の per_factor:
 *  - max（フル発動 $B12=TRUE）→ 1（100% 扱い）
 *  - expected（確率, $B12=FALSE,$B13=FALSE）→ per/100
 *
 * 活動回数 `$D8/count`（タイマーは `$D9/count`）は小数を保持し、最後に
 * カードごとに一度だけ `ROUNDDOWN(...,0)`。デッキ 6 枚分を合算（D21 = SUM(H38:M38)）。
 * スコアアップ種別でないカード（縮小/判定変更等）は寄与 0。
 */
export function computeScoreUp(input: OracleInput, mode: OracleMode): number {
  let total = 0;
  input.deck.forEach((card, i) => {
    total += computeCardScoreUp(card, input, mode, i);
  });
  return total;
}

function computeCardScoreUp(
  card: Card | null,
  input: OracleInput,
  mode: OracleMode,
  index: number,
): number {
  if (!card) return 0;

  // H31="スコアアップ" 判定。fetchCardsJson が「スコアアップ（<req>）」形に正規化するため
  // 接頭辞で判定する（生データが括弧無し "スコアアップ" の場合も含めて吸収）。
  const type = card.ap_skill_type ?? '';
  if (!type.startsWith('スコアアップ')) return 0;

  const req = card.ap_skill_req ?? '';
  const skill = getApSkillLevel(card, input.skillLevels[index]);
  const count = skill.count;
  const per = skill.per;
  const value = skill.value;
  if (!count || per == null || value == null) return 0;

  // H33 による活動基数の選択: Perfect/コンボ → ノーツ数(D8), タイマー → 曲秒数(D9)
  let denom: number;
  if (req === 'Perfect' || req === 'コンボ') {
    denom = input.song.notes; // $D8
  } else if (req === 'タイマー') {
    denom = input.song.duration; // $D9
  } else {
    return 0;
  }

  // per_factor: max=1(フル発動) / expected=per/100
  const perFactor = mode === 'max' ? 1 : per / 100;

  // 活動回数は小数を保持し、最後にカードごとに一度だけ ROUNDDOWN(...,0)
  return Math.floor((denom / count) * perFactor * value);
}
