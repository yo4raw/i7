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
                    // 縮小倍率 rate はカードデータの skill.rate を参照
                    // (Lv1=1.2 / Lv2=1.3 / Lv3=1.4 / Lv4=1.5 / Lv5=1.6、UI 既定は Lv5)
```

アシスト ON + 縮小中の合計倍率は **属性値 × 1.2（属性値段階 floor）→ per-note × rate**（Lv5 rate=1.6 のとき概ね素点 × 1.92）。
アシスト OFF + 縮小中は **属性値 → per-note × rate**（Lv5 で概ね素点 × 1.6）。

複数の縮小スキルが同時発動中でも、縮小倍率は `rate` で**重ねがけにならない**
（ゲーム内仕様として「**いずれか発動中**」判定で `rate` 倍が上限。§4 の「確率の OR 合成」とは別概念）。

### 1-1. キューイング仕様（ゲーム内挙動）

実ゲームでは縮小スキルは**同時刻に重複して発動しない**。複数スキルのトリガーが同一タイミングで重なった場合、先行スキルのカバー区間 `value_A` 秒が経過した後に後続スキルが連続発動する（キューイング）。結果として:

- 複数スキルのカバー時間は時間軸上で**オーバーラップしない**
- 合計カバー時間は `Σ value_i × 発動回数` と単純加算で等価になる
- 曲全体を超えた分はキューからあふれて切り捨て → **100% でキャップ**

§3 / §4 のカバー率が区間マージを用いず「単純合算 + `min(..., 1.0)`」で計算する根拠はこのキューイング仕様にある（重複がないので合算しても二重計上にならず、100% を超えた分のみキャップで切り捨てる）。

## 2. 先頭除外（仕様）

判定縮小スキルは **max(notes_20, デッキ最小 count)** を**縮小倍率 `rate` の適用対象外**とする。
`notes_20` 以外の全ノートは縮小スキルの発動判定と効果適用可能性の対象。

> **先頭除外の適用範囲**: 先頭除外は「縮小倍率 `rate` が乗じられるスコア適用範囲」（§3 理論最大縮小カバー率 / §4 期待値カバー率 で用いる `eligibleCount`）にのみ作用する。
> UI 上の「**スキル最大発動回数**」（= カードが理論上何回発動し得るかの表示値）は先頭除外を考慮せず `notesCount` 全体で計算する。発動判定は実楽曲全体で行われ、先頭除外の有無とは独立であるため。

### 2-1. アルゴリズム

1. `minCount = min(デッキ内縮小スキルの最初の発動位置)`（Perfect / コンボ型は `count` ノート、タイマー型は `floor(count秒 / songDuration × notesCount)` ノート）
2. `excludeHead = max(notes_20 グループのノート数, minCount)`
3. `eligibleCount = notesCount − excludeHead`
4. 各縮小スキル `i` の**縮小スコア寄与計算用の発動回数**: `floor(eligibleCount / count_i)`
  - **判定縮小（タイマー）** は `count` が秒数なので `floor(songDuration / count_i)`
5. UI 表示の「**スキル最大発動回数**」(`calcCardSkillMaxActivations`) は先頭除外を考慮せず以下を用いる:
   - **判定縮小（タイマー）** (`SKILL_TYPE.SHRINK_TIMER`): `count` は秒数なので `floor(songDuration / count_i)`
   - **判定縮小（Perfect / コンボ）**: `count` はノート数なので `floor(notesCount / count_i)`

> **意図**: 最初の縮小発動タイミングは「最も早く発動可能なスキル（= count が最小）」が `count` ノート目以降に到達してから。
> そのため `minCount` より前のノートでは縮小判定が存在しえない。
> `notes_20` 下限は UI 演出（ライト点灯前）との整合のため。

#### 2-1-1. 実データでの典型値

フィクスチャ (`tests/fixtures/songs.json` 145 曲 / `cards.json` 縮小スキル 135 枚) 実測:

- **`notes_20` 合計**: `20` が 74 曲 / `21` が 18 曲 / `0` が 53 曲（EXPERT 未満）。**21 を超える楽曲は存在しない**。
- **Lv5 `count`**: `20-22` が 24 / 31 枚 (≈ 77%)、19 以下は 3 枚のみ。
- **Lv1 `count`**: `23-25` が 87 / 135 枚 (≈ 64%)、ほぼ全枚 `count ≥ 20`。

よって「**Lv5 運用では `excludeHead ≈ 20-22`、Lv1 運用では `excludeHead ≈ 23-25` となり、その直後から最初の縮小判定が行われる**」ケースが一般的。ライト点灯前の `notes_20` 区間（最大 21 ノート）は多くの縮小スキルの `count` (≈ 20) とほぼ重なるため、実質的に「縮小スキルが物理的に発動できない先頭区間をまとめて除外する」挙動となる。

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

各縮小スキル `i` について最大縮小時間を計算し、**単純加算** した値を実効秒数で割る。
実効秒数は楽曲秒数から先頭除外区間（§2、縮小スキルが発動できない区間）の秒数を
ノート密度一定の仮定で控除したもの:

```text
最大縮小時間_i   = floor(eligibleCount / count_i) × value_i
最大縮小時間合計 = Σ_i 最大縮小時間_i
先頭除外秒数     = (excludeHead / notesCount) × songDuration
実効秒数         = songDuration − 先頭除外秒数
表示カバー率     = 最大縮小時間合計 / 実効秒数             ← 100% 超 OK
内部カバー率     = min(最大縮小時間合計 / 実効秒数, 1.0)   ← 100% で内部キャップ
```

### 3-2. 例（MONSTER GENERATiON 2 枚構成）

- 実効秒数 = `104 × (428 − 21) / 428` ≈ **98.90 秒**
- 最大縮小時間合計 = 80 + 85 = **165 秒**
- 表示カバー率 = 165 / 98.90 ≈ **166.84%**（そのまま表示し「100% 超過分は計算対象外」と注記）
- 内部カバー率 = `min(165 / 98.90, 1.0)` = **100%**

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
期待カバー率     = min(65.15 / 98.90, 1.0) ≈ 0.6588 (65.88%)   ← 100% で内部キャップ
表示期待カバー率 = 65.15 / 98.90 ≈ 65.88%                      ← 100% 超 OK
```

分母の実効秒数（98.90 秒）は §3-1 と同じく先頭除外秒数を控除した値。

縮小期待スコアアップ:

```text
対象素点         = Σ { noteScoreAssisted(note) : note.group ≠ 'notes_20' }
縮小期待値       = floor(対象素点 × (rate − 1.0) × 期待カバー率)
```

### 4-1. 例（MONSTER GENERATiON ２ 枚構成）

- 期待縮小時間合計 = 80 × 0.40 + 85 × 0.39 = **65.15 秒**
- 期待カバー率 = `min(65.15 / 98.90, 1.0)` ≈ **65.88%**
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
発動区間は §1-1 のキューイング仕様に従い、時間軸上でオーバーラップせず先行区間の終了後に
連続発動する。例えば 1000 回のシミュレーションを行う場合は下記のようなtypescriptで試行する。

> **RNG の注記**: 以下のサンプルコードは説明便宜上 `Math.random()` を使用しているが、
> 本実装はシード固定可能な `XorShift128Plus`（`src/lib/score/rng.ts`）を採用しており、
> 実際の判定式は `rng.next() * 100 < skill.per` となる（数学的には等価）。
> シード固定により試行が再現可能（`docs/score_calc_spec.md §8-2` 参照）。

```typescript
interface ShrinkSkill {
  count: number;   // 発動判定ノート数
  per: number;     // 発動確率 (%)
  value: number;   // 持続時間 (秒)
  rate: number;    // 縮小倍率 (例: 1.6)
}

interface ActiveShrink {
  endNote: number; // 終了ノート index (exclusive)
  rate: number;    // 発動中スキルの縮小倍率
}

interface QueueItem {
  durationNotes: number; // notes 換算の持続時間
  rate: number;
}

const ITERATIONS = 1000;
const trialScores: number[] = [];

for (let trial = 0; trial < ITERATIONS; trial++) {
  // ノート順にキューイングして発動区間を決める
  let active: ActiveShrink | null = null;
  const queue: QueueItem[] = [];
  const counters = shrinkSkills.map(() => 0);

  let score = baseMinScore;
  for (let n = 0; n < notesCount; n++) {
    const note = notes[n];

    // (A) 終了した active をドレインし、queue の先頭を順次繋げる
    while (active && active.endNote <= n) {
      const next = queue.shift();
      active = next
        ? { endNote: n + next.durationNotes, rate: next.rate }
        : null;
    }

    // (B) 各スキルのトリガー判定（先頭除外ノートでは対象外）
    for (let i = 0; i < shrinkSkills.length; i++) {
      if (note.group === 'notes_20') continue;  // §2 先頭除外
      counters[i]++;
      if (counters[i] < shrinkSkills[i].count) continue;
      counters[i] = 0;
      if (Math.random() >= shrinkSkills[i].per / 100) continue;
      const durationNotes = Math.floor(
        (shrinkSkills[i].value / songDuration) * notesCount,
      );
      if (active == null) {
        active = { endNote: n + durationNotes, rate: shrinkSkills[i].rate };
      } else {
        // 先行 active が稼働中 → キューに退避 (§1-1)
        queue.push({ durationNotes, rate: shrinkSkills[i].rate });
      }
    }

    // (C) rate 適用（「いずれか発動中」判定・重ねがけなし、§1）
    if (active && active.endNote > n && note.group !== 'notes_20') {
      score += Math.floor(noteScoreAssisted(note) * (active.rate - 1.0));
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

試行回数を増やすほど `mean` は仕様の算術期待値 (§5-3) に収束する。ただし実装は
「最初のトリガー成立前のデッドゾーン（最小 count 分のノート）」と「曲終了でキューからあふれた
分」が切り捨てられるため、§5-3 の単純加算期待値より数 % 下振れることがある点に留意。
`stddev` / `p90` / `mcMin` でデッキのばらつきリスク（最悪ケースの底・ピーク時の上振れ）を評価できる。

複数枚の縮小スキルが同時発動中でも縮小倍率は `rate`（1.6）のまま変わらない（§1 参照）。
キューイングにより発動区間は時間軸上で重ならないため、「いずれか発動中」判定は単に
`active != null` の確認に帰着する（区間の多重合成は不要）。
各スキルへのスコア寄与点数は §2-2 の按分ルール（期待縮小時間の比、例: 32 : 33.15）で分配する。

### 5-5. 最大カバー率モード（縮小全発動）

スコア計算ページの「縮小全発動」チェックボックスを ON にすると、MC シミュレーション時に `ScoreOptions.maxShrinkCoverage = true` が渡され、Phase B (§5-4 の 243-248 行目相当) の確率ロール `rng.next() * 100 < skill.per` を **縮小スキルに限り常に成功扱い** にする:

```typescript
const roll = rng.next() * 100;                                 // 乱数は従来通り消費（決定性を担保）
const alwaysTrigger = skill.isShrink && options?.maxShrinkCoverage === true;
if (alwaysTrigger || roll < skill.per) {
  // 発動処理（キューイングは通常通り）
}
```

- **効果**: 「すべての縮小スキルが毎回発動した場合」のスコア分布を MC 試行数分得られる。カバー率は単純合計 `Σ floor(eligibleCount / count_i) × value_i` のまま、実効秒数（§3-1）で 100% キャップされる（§3-1 の表示/内部カバー率と同値）。
- **適用範囲**: **MC シミュレーションのみ**。`calcMinScore` / `calcMaxScore` / `calcExpectedScore` は本オプションを参照しないため、§5-1 / §5-2 / §5-3 の数式は従来通り成立する。
- **用途**: 「理論上の最善ケースに近いスコア分布」を把握することで、ばらつきのリスク（`mcMin` / `stddev`）を最大カバー率前提で評価できる。通常の確率ベース MC（既定値: OFF）と比較することで、確率ロールの揺らぎ寄与量を定量的に分離できる。
- **実装参照**: `src/lib/score/engine.ts` `runOnce()` の Phase B 分岐。タイマー系スコアアップスキル (Phase 1) には適用されない（縮小スキル専用オプション）。

---

## 6. 計算例（MONSTER GENERATiON）

楽曲条件（共通）: `notes_count = 428` / `notes_20 = 21 ノート` / `songDuration = 104 秒`

### 6-1. 2 枚構成・縮小スキル 1 枚（ID3414 + ID1952）

- デッキ: センター ID3414（BAD→Perfect、縮小スキル非保有）+ フレンド ID1952（判定縮小 Perfect, SL5: `count=20` / `per=40%` / `value=4秒` / `rate=1.6`）

1. **先頭除外数**: `excludeHead = max(notes_20=21, minCount=20) = 21 ノート`
2. **eligibleCount**: `428 − 21 = 407 ノート`
3. **発動回数の上限**: `floor(407 / 20) = 20 回`
4. **スコアアップ対象の最大時間**: `20 × 4 = 80 秒`
5. **実効秒数**: `104 × 407 / 428 ≈ 98.90 秒`（先頭除外 21 ノート分を秒換算で控除）
6. **最大縮小カバー率 (表示用)**: `80 / 98.90 ≈ 80.9%`
7. **最大縮小カバー率 (内部計算用)**: `min(80 / 98.90, 1.0) ≈ 80.9%`（100% 未満なのでキャップなし）
8. **縮小カバー率期待値 (表示用 & 内部計算用)**: `(80 × 0.40) / 98.90 = 32 / 98.90 ≈ 32.36%`
9. **最大縮小スコアアップ**: `eligibleBaseScore × (rate − 1.0) × 内部最大カバー率 = eligibleBaseScore × 0.6 × 0.809`
10. **縮小スコアアップ期待値**: `eligibleBaseScore × (rate − 1.0) × 期待カバー率 = eligibleBaseScore × 0.6 × 0.3236`

### 6-2. 3 枚構成・縮小スキル 2 枚（ID3414 + ID1952 + ID3597）

倍率の基本は §6-1 と同じ（発動中のノートは素点の `rate` 倍、**追加分は `rate − 1.0` = 0.6 倍**）。
カバー率は各スキルの「発動回数 × 持続秒」を **単純加算** し、内部計算用は実効秒数 (≈98.90 秒) で 100% キャップ。

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
   - 生 (表示用): `(80 + 85) / 98.90 ≈ 166.84%`（100% 超過、表示のみ）
   - 内部計算用: `min(165 / 98.90, 1.0) = 100%`
6. **縮小カバー率期待値**:
   - 生 (表示用): `((80 × 0.40) + (85 × 0.39)) / 98.90 = 65.15 / 98.90 ≈ 65.88%`
   - 内部計算用: `min(65.15 / 98.90, 1.0) ≈ 65.88%`（100% 未満なのでキャップなし）
7. **最大縮小スコアアップ**: `eligibleBaseScore × 0.6 × 内部最大カバー率 (= 1.0)`
8. **縮小スコアアップ期待値**: `eligibleBaseScore × 0.6 × 期待カバー率 (≈ 0.6588)`
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
| 7-9 | MC のキューイング未実装 | `runOnce` / `calcMaxScore` をキューイング版に更新 (`engine.ts` の `activeShrink` + `shrinkQueue` 方式)。§5-4 の例示コードも同方式に更新。複数縮小構成のスコア過小評価（旧実装で 20〜30% 下振れ）を MC 平均が §5-3 期待値の ±数% 以内に収束するよう改善 |
| 7-11 | ノート全体シャッフルが先頭除外と矛盾 / カバー率分母が全曲尺 | 2026-06-10 対応。`flattenNotes` をグループ内シャッフルに変更（ステージ順固定、excluded は曲先頭からの連続区間に）。`calcShrinkCoverage` / `calcCardSkillExpected` / `calcCardSkillMax` の分母を実効秒数（songDuration − 先頭除外秒数）に統一（§3-1 / §4）。旧実装は除外ノーツが曲中に散在して縮小効果区間に混入し、縮小スコアが約 (除外数/全ノーツ数) 過小評価されていた |

### 残存リスク（別タスク）

- **7-6 発動位置の線形仮定 vs シャッフル実順序**: `calcShrinkCoverage` は発動時刻を線形計算、`calcMaxScore` / `runOnce` はシャッフル後順序（7-11 対応後はグループ内シャッフル・ステージ順固定）で `counters[c]` を進める。`calcExpectedScore` と MC 平均の微差の原因（7-9 解消後も残る「最初のトリガー成立前のデッドゾーン」と合わせて数% 水準の乖離を生む）。
- **7-7 寄与按分**: 期待縮小時間比で按分（実装済）。ただし `totalExpectedShrinkTime = 0` のケース（per=0 等）は寄与 0 として扱う。キューイング化後もカード別寄与は期待時間比のまま（実際にキュー経由で割り当てた時間ベースの按分に切り替える場合は別タスクで検討）。
- **7-8 `notesCount` と `notes.length`**: 依然として `song.notes_count` と `flattenNotes` 結果の整合依存。
- **7-10 縮小 rate 採用ロジックの関数間差異**: `calcMaxScore` (`engine.ts` の `runOnce`/`calcMaxScore`) はキューイング順で「現在 active の rate」を per-note に適用するのに対し、`calcExpectedScore` は明示的に `maxRate = max(deck内のskill.rate)` を採用する（§5-3 の簡易解析式に整合）。デッキ内の縮小スキルがすべて同じ Lv（同じ rate）であれば結果は一致するが、Lv が混在すると `calcMaxScore` が「真の理論最大」を返さないケースがある。現状 UI はスキル Lv を一括選択する想定のため実害は無いが、Lv 別個別指定 UI を導入する場合は `calcMaxScore` 側も `maxRate` 一択に揃える等の追従修正が必要。
