import type { Card } from '../../src/lib/data/fetchCardsJson';
import { getApSkillLevel, SKILL_TYPE } from '../../src/lib/data/fetchCardsJson';
import type { OracleInput, OracleMode } from './oracleTypes';

/**
 * 縮小スキル（判定領域縮小）のスコア寄与（スプレッドシート §5-1 / v1.0.6 数式を移植）。
 *
 * v1.0.6 生数式（`sheet5.xml`）:
 *
 * H39（カード i の期待縮小秒数, shared ref H39:M39）:
 * ```
 * H39 = IFERROR(IFS(H31="判定領域縮小",
 *   IFS(OR(H33="Perfect", H33="コンボ"),
 *         IF($B$15=TRUE, ROUNDDOWN($D8/H34*H36, 0),
 *                        ROUNDDOWN($D8/H34*(H35/100)*H36, 0)),
 *       H33="タイマー",
 *         IF($B$15=TRUE, ROUNDDOWN($D9/H34*H36, 0),
 *                        ROUNDDOWN($D9/H34*(H35/100)*H36, 0)))), )
 * ```
 *
 * M6（縮小カバー率）:
 * ```
 * M6 = IFERROR(SUM(H39:M39)/D9, )   // 分母は曲秒数 D9 そのまま。100% 超を許容
 * ```
 *
 * BN22（縮小スコアの基準スコア = アシスト前相当の属性値スコア）:
 * ```
 * BN21 = SUM(BI11:BN18)                                  // 属性値スコア（= attrScore 引数）
 * BN22 = IF(I6=TRUE, ROUNDDOWN(SUM(BI11:BN18)/1.2, 0), BN21)  // assist ON なら BN21/1.2 を floor
 * ```
 *
 * H40（カード i の縮小スキル寄与, shared ref H40:M40）:
 * ```
 * H40 = IFERROR(IF(H31="判定領域縮小",
 *   IFS($M$6>=1,
 *         IF($B$16=TRUE, ROUNDDOWN($BN$23*(H$39/SUM($H$39:$M$39))*(H$37-1), 0),
 *                        ROUNDDOWN($BN$22*(H$39/SUM($H$39:$M$39))*(H$37-1), 0)),
 *       TRUE,
 *         ROUNDDOWN($BN$22*H$39/$D$9*(H$37-1), 0))), )
 * ```
 *
 * 対応関係:
 *  - `H31` = スキル種別 ⇔ `card.ap_skill_type`（fetchCardsJson で「判定縮小（Perfect）」等に正規化）
 *  - `H33` = 発動条件 ⇔ `card.ap_skill_req`（"Perfect" / "コンボ" / "タイマー"）
 *  - `H34`=count, `H35`=per(%), `H36`=value, `H37`=rate ⇔ `getApSkillLevel(card, level)`
 *  - `$D8`=ノーツ数, `$D9`=曲秒数, `$BN$21`=attrScore 引数, `$I6`=assist
 *
 * モード対応（UI チェックボックスを 2 モードに割り当て）:
 *  - max  → `$B$15=TRUE`（縮小フル発動）。H39 は per を省き `floor(count × value)`
 *  - expected → `$B$15=FALSE`。H39 は `floor(count × per/100 × value)`
 *  - `$B$16`（20ノーツ加算なし β）は既定 FALSE 相当 → 常に BN22 を使用（BN23 は使わない）
 *
 * 先頭除外（notes_20 / minCount）は **反映しない**（スプレッドシート仕様）。
 */
export function computeShrink(input: OracleInput, mode: OracleMode, attrScore: number): number {
  // BN22: assist ON のとき floor(BN21 / 1.2)、OFF のとき BN21 そのまま
  const bn22 = input.assist ? Math.floor(attrScore / 1.2) : attrScore;

  // H39: カード別の期待縮小秒数を算出
  const seconds = input.deck.map((card, i) => computeCardSeconds(card, input, mode, i));
  const sumSeconds = seconds.reduce((a, b) => a + b, 0);
  if (sumSeconds <= 0) return 0;

  // M6: カバー率（分母は曲秒数 D9 そのまま、100% 超を許容）
  const coverage = sumSeconds / input.song.duration;

  // H40: カード別の縮小寄与を算出して合算（D22）
  let total = 0;
  input.deck.forEach((card, i) => {
    if (!card) return;
    if (seconds[i] <= 0) return;
    const rate = getShrinkRate(card, input.skillLevels[i]);
    if (rate == null) return;
    if (coverage >= 1) {
      // カバー率 ≥ 100%: share（ΣH39 比）で正規化（B16=FALSE → BN22）
      total += Math.floor(bn22 * (seconds[i] / sumSeconds) * (rate - 1));
    } else {
      // カバー率 < 100%: 曲秒数 D9 で正規化
      total += Math.floor((bn22 * seconds[i]) / input.song.duration * (rate - 1));
    }
  });
  return total;
}

/** H39: カード i の期待縮小秒数。縮小種別でないカードは 0。 */
function computeCardSeconds(
  card: Card | null,
  input: OracleInput,
  mode: OracleMode,
  index: number,
): number {
  if (!card) return 0;

  // H31="判定領域縮小" 判定。fetchCardsJson は「判定縮小（<req>）」形に正規化する
  // （SKILL_TYPE.SHRINK_PREFIX = "判定縮小（"）。タイマーは "判定縮小（タイマー）"。
  const type = card.ap_skill_type ?? '';
  if (!type.startsWith(SKILL_TYPE.SHRINK_PREFIX)) return 0;

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

  // per_factor: max（$B$15=TRUE フル発動）=1 / expected（$B$15=FALSE）=per/100
  const perFactor = mode === 'max' ? 1 : per / 100;

  // 活動回数 denom/count は小数を保持し、最後にカードごとに一度だけ ROUNDDOWN(...,0)
  return Math.floor((denom / count) * perFactor * value);
}

/** H37: カード i の縮小倍率 rate。縮小種別でない/未定義なら null。 */
function getShrinkRate(card: Card, level: 1 | 2 | 3 | 4 | 5): number | null {
  const type = card.ap_skill_type ?? '';
  if (!type.startsWith(SKILL_TYPE.SHRINK_PREFIX)) return null;
  return getApSkillLevel(card, level).rate;
}
