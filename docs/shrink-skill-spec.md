# 判定縮小スキルの計算仕様

## 0. 対象スキル

`parseSkill` (`engine.ts:25`) が `isShrink === true` と判定するもの:

- `ap_skill_type === "判定縮小スコアアップ"` (`SKILL_TYPE.SHRINK`)
- `ap_skill_type` が `"判定縮小（"` (`SKILL_TYPE.SHRINK_PREFIX`) で始まる（例: `"判定縮小（Perfect）"`, `"判定縮小（タイマー）"`）

`CardSkill` に格納されるパラメータ:

| フィールド | 意味 | 典型例 (Lv5) |
| --- | --- | --- |
| `count` | 発動判定の単位（ノート数 or 秒） | 20 ノート |
| `per` | 発動確率（%） | 40 |
| `value` | 持続時間（秒） | 4 |
| `rate` | 縮小中ノートの倍率（仕様上のスコア係数） | 1.6 |
| `isShrink` | true | — |
| `isTimer` | 縮小タイマー型の場合のみ true | false |

**縮小倍率**: カードデータの `rate`（`CardSkill.rate`、スキルレベル依存）を参照する。
過去は `SHRINK_MULTIPLIER = 1.6` 固定だったが、2026-04-20 の `fix/shrink-skill-spec-compliance` で `skill.rate` 参照に統一（§7-4 解消済み）。

## 1. 縮小追加スコアの基本式（仕様）

縮小中（いずれかの縮小スキルが発動中）かつ `note.group !== 'notes_20'` のノートに対し、
**アシスト適用後の素点**（= `noteScoreAssisted`）に縮小倍率を乗じる。アシストは属性値段階で適用する（`docs/score_calc_spec.md §3-7` 準拠）:

```text
appeal            = scoreUpAssist ? floor(teamXxx × 1.2) : teamXxx
                    // アシストは属性値段階で floor(×1.2)（§3-7 準拠）
perNoteBase       = floor(appeal × NOTE_RATE)
noteScoreAssisted = floor(perNoteBase × LIGHT_MULTIPLIER)
                    // per-note は 2 段 floor（§5 準拠）
noteScoreShrunk   = floor(noteScoreAssisted × rate)
                    // 縮小倍率 rate（Lv5 で 1.6、本実装は Lv5 固定で計算）
```

アシスト ON + 縮小中の合計倍率は **属性値 × 1.2（属性値段階 floor）→ per-note × rate**（Lv5 rate=1.6 のとき概ね素点 × 1.92）。
アシスト OFF + 縮小中は **属性値 → per-note × rate**（概ね素点 × 1.6）。

複数の縮小スキルが同時発動中でも、縮小倍率は `rate` で**重ねがけにならない**
（ゲーム内仕様として「**いずれか発動中**」判定で `rate` 倍が上限。§4 の「確率の OR 合成」とは別概念）。

## 2. 先頭除外（仕様）

判定縮小スキルは **max(notes_20, デッキ最小 count)** を**縮小倍率 `rate` の適用対象外**とする。
`notes_20` 以外の全ノートは縮小スキルの発動判定と効果適用可能性の対象。

> **先頭除外の適用範囲**: 先頭除外は「縮小倍率 `rate` が乗じられるスコア適用範囲」（§3 理論最大縮小カバー率 / §4 期待値カバー率 で用いる `eligibleCount`）にのみ作用する。
> UI 上の「**スキル最大発動回数**」（= カードが理論上何回発動し得るかの表示値）は先頭除外を考慮せず `notesCount` 全体で計算する。発動判定は実楽曲全体で行われ、先頭除外の有無とは独立であるため。

### 2-1. アルゴリズム

1. `minCount = min(デッキ内縮小スキルの count)`（縮小スキル 1 枚の場合はその count）
2. `excludeHead = max(notes_20 グループのノート数, minCount)`
3. `eligibleCount = notesCount − excludeHead`
4. 各縮小スキル `i` の**縮小スコア寄与計算用の発動回数**: `floor(eligibleCount / count_i)`
5. UI 表示の「**スキル最大発動回数**」(`calcCardSkillMaxActivations`) は先頭除外を考慮せず `floor(notesCount / count_i)` を用いる。

> **意図**: 最初の縮小発動タイミングは「最も早く発動可能なスキル（= count が最小）」が `count` ノート目以降に到達してから。
> そのため `minCount` より前のノートでは縮小判定が存在しえない。
> `notes_20` 下限は UI 演出（ライト点灯前）との整合のため。

### 2-2. 例（MONSTER GENERATiON 2 枚構成）

- 楽曲: `notes_count = 428` / `notes_20 = 21 ノート` / `songDuration = 104 秒`
- デッキ縮小スキル: Card 1952 (`count=20`) / Card 3597 (`count=23`)
- `minCount = min(20, 23) = 20`
- `excludeHead = max(21, 20) = 21` / `eligibleCount = 407`
- Card 1952 (`count=20` / `per=40%` / `value=4秒`): 縮小スコア寄与用 `floor(407 / 20) = 20 回` / 合計 `20 × 4 = 80 秒`
- Card 3597 (`count=23` / `per=39%` / `value=5秒`): 縮小スコア寄与用 `floor(407 / 23) = 17 回` / 合計 `17 × 5 = 85 秒`
- カード別の縮小スキル寄与点数は **期待縮小時間比 32 : 33.15**（≈ 49 : 51）で按分（最大縮小時間 × `per` を反映した固定比。MC 試行ごとの実発動時間比ではなく、カード別 UI 表示用の簡易配分ルール）
- **UI 表示の「スキル最大発動回数」（先頭除外を考慮しない）**:
  - Card 1952 (`count=20`): `floor(428 / 20) = 21 回`
  - Card 3597 (`count=23`): `floor(428 / 23) = 18 回`

### 2-3. 例（Binary Vampire × ID1923 単独デッキ）

- 楽曲: `songID=60 (Binary Vampire)` / `notes_count = 461` / `notes_20 = 20 ノート` / `songDuration = 92 秒`
- デッキ縮小スキル: Card 1923 (`count=22` / `per=42%` / `value=4秒` / `rate=1.6`) 1 枚のみ
- `minCount = 22`
- `excludeHead = max(20, 22) = 22` / `eligibleCount = 439`
- **縮小スコア寄与計算用の発動回数**: `floor(439 / 22) = 19 回` / 合計 `19 × 4 = 76 秒`
- **UI 表示の「スキル最大発動回数」**: `floor(461 / 22) = 20 回`（先頭除外の 22 ノート分は発動カウントには影響しない）

## 3. 理論最大縮小カバー率（仕様）

### 3-1. 基本式

各縮小スキル `i` について最大縮小時間を計算し、**単純加算** した値を楽曲秒数で割る:

```text
最大縮小時間_i   = floor(eligibleCount / count_i) × value_i
最大縮小時間合計 = Σ_i 最大縮小時間_i
表示カバー率     = 最大縮小時間合計 / songDuration             ← 100% 超 OK
内部カバー率     = min(最大縮小時間合計 / songDuration, 1.0)   ← 100% で内部キャップ
```

### 3-2. 例（MONSTER GENERATiON 2 枚構成）

- 最大縮小時間合計 = 80 + 85 = **165 秒**
- 表示カバー率 = 165 / 104 ≈ **158.65%**（そのまま表示し「100% 超過分は計算対象外」と注記）
- 内部カバー率 = `min(165 / 104, 1.0)` = **100%**

### 3-3. 理論最大縮小スコアアップ

**厳密式（per-note 丸め、§1 および §5-4 MC と整合）**:

```text
理論最大縮小加算 = Σ { floor(noteScoreAssisted(note) × (rate − 1.0))
                     : note.group ≠ 'notes_20' かつ 縮小発動中 }
```

**簡易解析式（全体 1 回丸め、§5-2 / §5-3 で使用）**:

```text
対象素点  = Σ { noteScoreAssisted(note) : note.group ≠ 'notes_20' }
理論最大縮小加算 ≈ floor(対象素点 × (rate − 1.0) × 内部カバー率)
```

> **注**: 簡易解析式は全体を 1 回 floor する近似式。per-note 丸めの厳密式とは `(発動ノート数) × 1` 点以下の切り捨て誤差が出る。解析値と MC 実測値の比較時は数十点オーダーの差を許容すること。

## 4. 期待値カバー率（仕様）

各スキルの発動確率を考慮した単純加算:

```text
期待縮小時間_i   = 最大縮小時間_i × (per_i / 100)
期待縮小時間合計 = Σ_i 期待縮小時間_i
                   = 80 × 0.40 + 85 × 0.39
                   = 32 + 33.15
                   = 65.15 秒
期待カバー率     = min(65.15 / 104, 1.0) ≈ 0.6264 (62.64%)   ← 100% で内部キャップ
表示期待カバー率 = 65.15 / 104 ≈ 62.64%                      ← 100% 超 OK
```

縮小期待スコアアップ:

```text
対象素点         = Σ { noteScoreAssisted(note) : note.group ≠ 'notes_20' }
縮小期待値       = floor(対象素点 × (rate − 1.0) × 期待カバー率)
```

### 4-1. 例（MONSTER GENERATiON ２ 枚構成）

- 期待縮小時間合計 = 80 × 0.40 + 85 × 0.39 = **65.15 秒**
- 期待カバー率 = `min(65.15 / 104, 1.0)` ≈ **62.64%**
- 単純加算のみ（「確率の OR 合成」`1 − Π(1−p_i)` による重複補正は仕様として用いない）

## 5. スコア計算での使用箇所（仕様）

### 5-1. 最低スコア（縮小全不発）

全ノートの `noteScoreAssisted` を合算。縮小効果は反映しない。

### 5-2. 最高スコア（縮小全発動）

簡易解析式（§3-3 の近似を用いる）:

```text
対象素点 = Σ { noteScoreAssisted(note) : note.group ≠ 'notes_20' }
理論最大 ≈ 最低スコア + floor(対象素点 × (rate − 1.0) × min(最大縮小時間合計 / songDuration, 1.0))
```

厳密値が必要な場合は §3-3 の per-note 式で計算すること。

### 5-3. 算術期待値

簡易解析式（§3-3 の近似を用いる）:

```text
期待スコア ≈ 最低スコア + floor(対象素点 × (rate − 1.0) × min(期待縮小時間合計 / songDuration, 1.0))
```

MC 平均（§5-4）との差は per-note 丸め誤差 + 確率独立仮定の差で説明できる。

### 5-4. モンテカルロ

シミュレータでは `per`（発動確率）と `rate`（縮小倍率）が重要となり、試行回数を多くするほど
スコアのばらつきが可視化しやすくなる。これが本アプリの醍醐味である。

各発動判定は `Math.random() < per_i / 100` の真偽で決める（真なら発動）。
例えば 1000 回のシミュレーションを行う場合は下記のようなtypescriptで試行する。

```typescript
interface ShrinkSkill {
  count: number;   // 発動判定ノート数
  per: number;     // 発動確率 (%)
  value: number;   // 持続時間 (秒)
  rate: number;    // 縮小倍率 (例: 1.6)
}

interface Interval {
  start: number;   // 発動ノート index (inclusive, 0-indexed)
  end: number;     // 終了ノート index (exclusive)
  rate: number;    // 発動したスキルの縮小倍率（スキルごとに異なり得る）
}

const ITERATIONS = 1000;
const trialScores: number[] = [];

for (let trial = 0; trial < ITERATIONS; trial++) {
  // Phase 1: 各縮小スキルの発動区間を確率ロールで決定
  const intervals: Interval[] = [];
  for (const s of shrinkSkills) {
    const numActivations = Math.floor(eligibleCount / s.count);
    for (let k = 1; k <= numActivations; k++) {
      if (Math.random() < s.per / 100) {
        const startNote = excludeHead + k * s.count;
        const endNote = Math.min(
          startNote + Math.floor((s.value / songDuration) * notesCount),
          notesCount,
        );
        intervals.push({ start: startNote, end: endNote, rate: s.rate });
      }
    }
  }

  // Phase 2: ノート走査で縮小加算を積む
  let score = baseMinScore;
  for (let n = 0; n < notesCount; n++) {
    const note = notes[n];
    if (note.group === 'notes_20') continue;
    // そのノートで発動中の区間だけを抽出し、rate の最大値を使う（重ねがけなし = max の単一適用）
    const activeIntervals = intervals.filter(iv => iv.start <= n && n < iv.end);
    if (activeIntervals.length > 0) {
      const effectiveRate = Math.max(...activeIntervals.map(iv => iv.rate));
      score += Math.floor(noteScoreAssisted(note) * (effectiveRate - 1.0));
    }
  }

  trialScores.push(score);
}

// 1000 個のスコアから統計量を算出
const sorted = [...trialScores].sort((a, b) => a - b);
const sum = trialScores.reduce((a, b) => a + b, 0);
const mean = sum / trialScores.length;
const variance =
  trialScores.reduce((acc, s) => acc + (s - mean) ** 2, 0) / trialScores.length;

const mcMin  = sorted[0];
const mcMax  = sorted[sorted.length - 1];
const stddev = Math.sqrt(variance);
const p90    = sorted[Math.floor(sorted.length * 0.9)];   // 90 パーセンタイル
```

試行回数を増やすほど `mean` は仕様の算術期待値 (§5-3) に収束する。
`stddev` / `p90` / `mcMin` でデッキのばらつきリスク（最悪ケースの底・ピーク時の上振れ）を評価できる。

複数枚の縮小スキルが同時発動中でも縮小倍率は `rate`（1.6）のまま変わらない（§1 参照）ため、
`intervals` に同じ `n` を覆う区間が複数存在しても `floor(noteScoreAssisted × (rate − 1.0))` は 1 回しか加算しない。
各スキルへのスコア寄与点数は §2-2 の按分ルール（期待縮小時間の比、例: 32 : 33.15）で分配する。

---

## 6. 計算例（MONSTER GENERATiON）

楽曲条件（共通）: `notes_count = 428` / `notes_20 = 21 ノート` / `songDuration = 104 秒`

### 6-1. 2 枚構成・縮小スキル 1 枚（ID3414 + ID1952）

- デッキ: センター ID3414（BAD→Perfect、縮小スキル非保有）+ フレンド ID1952（判定縮小 Perfect, SL5: `count=20` / `per=40%` / `value=4秒` / `rate=1.6`）

1. **先頭除外数**: `excludeHead = max(notes_20=21, minCount=20) = 21 ノート`
2. **eligibleCount**: `428 − 21 = 407 ノート`
3. **発動回数の上限**: `floor(407 / 20) = 20 回`
4. **スコアアップ対象の最大時間**: `20 × 4 = 80 秒`
5. **最大縮小カバー率 (表示用)**: `80 / 104 ≈ 76.9%`
6. **最大縮小カバー率 (内部計算用)**: `min(80 / 104, 1.0) ≈ 76.9%`（100% 未満なのでキャップなし）
7. **縮小カバー率期待値 (表示用 & 内部計算用)**: `(80 × 0.40) / 104 = 32 / 104 ≈ 30.77%`
8. **最大縮小スコアアップ**: `eligibleBaseScore × (rate − 1.0) × 内部最大カバー率 = eligibleBaseScore × 0.6 × 0.769`
9. **縮小スコアアップ期待値**: `eligibleBaseScore × (rate − 1.0) × 期待カバー率 = eligibleBaseScore × 0.6 × 0.3077`

### 6-2. 3 枚構成・縮小スキル 2 枚（ID3414 + ID1952 + ID3597）

倍率の基本は §6-1 と同じ（発動中のノートは素点の `rate` 倍、**追加分は `rate − 1.0` = 0.6 倍**）。
カバー率は各スキルの「発動回数 × 持続秒」を **単純加算** し、内部計算用は `songDuration` (104 秒) で 100% キャップ。

- デッキ: センター ID3414 + フレンド ID1952（`count=20` / `per=40%` / `value=4秒`）+ メンバー ID3597（`count=23` / `per=39%` / `value=5秒`）

1. **先頭除外数**: `excludeHead = max(notes_20=21, minCount=min(20,23)=20) = 21 ノート`
2. **eligibleCount**: `428 − 21 = 407 ノート`
3. **発動回数の上限（スキル毎）**:
   - Card 1952: `floor(407 / 20) = 20 回`
   - Card 3597: `floor(407 / 23) = 17 回`
4. **スコアアップ対象の最大時間（スキル毎）**:
   - Card 1952: `20 × 4 = 80 秒`
   - Card 3597: `17 × 5 = 85 秒`
5. **最大縮小カバー率**:
   - 生 (表示用): `(80 + 85) / 104 ≈ 158.65%`（100% 超過、表示のみ）
   - 内部計算用: `min(165 / 104, 1.0) = 100%`
6. **縮小カバー率期待値**:
   - 生 (表示用): `((80 × 0.40) + (85 × 0.39)) / 104 = 65.15 / 104 ≈ 62.64%`
   - 内部計算用: `min(65.15 / 104, 1.0) ≈ 62.64%`（100% 未満なのでキャップなし）
7. **最大縮小スコアアップ**: `eligibleBaseScore × 0.6 × 内部最大カバー率 (= 1.0)`
8. **縮小スコアアップ期待値**: `eligibleBaseScore × 0.6 × 期待カバー率 (≈ 0.6264)`
9. **カード別スコア寄与按分**: **期待縮小時間比** `32 : 33.15`（≈ 49 : 51）で固定配分（§2-2）。

---

## 7. 実装との整合（過去の矛盾点）

> 2026-04-20 実装を本仕様に合わせた (`fix/shrink-skill-spec-compliance`)。
> 以前列挙していた矛盾点 (7-1〜7-5) は解消済み。参考のため対応内容を残す。

| # | 項目 | 対応 |
|---|------|------|
| 7-1 | 先頭除外が `maxCount` ベース | `shrinkExclusion.ts` を `Math.min(...shrinkCounts)` に変更 |
| 7-2 | 最大カバー率が区間マージ | `calcShrinkCoverage.coveredSeconds = min(rawCoveredSeconds, effectiveSeconds)` に |
| 7-3 | アシスト適用位置が最終乗算 | `getAppeal` で属性値段階 `floor(team × 1.2)` に。`applyFinalBonus` の assistMult 削除 |
| 7-4 | 縮小倍率が `SHRINK_MULTIPLIER` 固定 | `CardSkill.rate` を追加。`calcMaxScore` / `runOnce` / `calcExpectedScore` が `skill.rate` を参照 (発動中の max rate を採用) |
| 7-5 | 期待値カバー率が独立事象 OR | `expectedCoverageRate = min(rawExpectedCoveredSeconds / effectiveSeconds, 1.0)` に |

### 残存リスク（別タスク）

- **7-6 発動位置の線形仮定 vs シャッフル実順序**: `calcShrinkCoverage` は発動時刻を線形計算、`calcMaxScore` / `runOnce` はシャッフル後順序で `counters[c]` を進める。`calcExpectedScore` と MC 平均の微差の原因。
- **7-7 寄与按分**: 期待縮小時間比で按分（実装済）。ただし `totalExpectedShrinkTime = 0` のケース（per=0 等）は寄与 0 として扱う。
- **7-8 `notesCount` と `notes.length`**: 依然として `song.notes_count` と `flattenNotes` 結果の整合依存。
