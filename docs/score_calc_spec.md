# IDOLiSH7 スコア計算仕様書

> 本ドキュメントは `src/lib/score/` の実装をソース・オブ・トゥルースとして、
> スコア計算の現行仕様を記述する。外部サイト
> [オタライフ「スコア計算のやり方」](https://ota-life.com/id7-score/) の
> 仕様と一部差分があるが、各項目で実装を採用した理由を明記する。

## 0. 全体像

スコア計算は **完全クライアントサイド** で実行される。ユーザー端末上で:

1. **`computeTeam()`** — デッキ 6 枠からチーム属性値を計算
2. **`flattenNotes()`** — 楽曲のノート情報を 1 次元の `FlatNote[]` に展開
3. **`runSimulation()`** — モンテカルロシミュレーション（既定 5000 回）でスコア分布を算出
4. **`calcExpectedScore()`** — 外部サイト準拠の算術期待値を算出（参考値）
5. **`calcShrinkCoverage()`** — 判定縮小スキルのカバー率を算出

## 1. 属性システム

| 属性 | 色 |
|------|------|
| Shout（シャウト） | 🔴 赤 |
| Beat（ビート）   | 🟢 緑 |
| Melody（メロディ） | 🔵 青 |

カード・楽曲の両方が 3 属性の値を持ち、ライブ中に属性背景色が切り替わる。
正規化ユーティリティは `normalizeAttribute()`（`types.ts`）。

## 2. 定数リファレンス

### 2-1. ノーツ素点レート (`NOTE_RATE`)

| ノーツ種別 | レート |
|-----------|--------|
| 白・緑（始点） — `white` | 0.025（2.5%） |
| 赤・青（終点） — `color` | 0.030（3.0%） |

### 2-2. ライト倍率 (`LIGHT_MULTIPLIER`)

| ノートグループ | 倍率 | 意味 |
|---------------|------|------|
| `notes_20` | 1.0 | ライト点灯前の約20ノーツ |
| `light_2`  | 1.0 | ライト2つ点灯 |
| `light_3`  | 1.1 | ライト3つ点灯（+10%） |
| `light_4`  | 1.2 | ライト4つ点灯（+20%） |
| `light_5`  | 1.3 | ライト5つ点灯（+30%） |
| `light_6`  | 1.5 | ライト6つ点灯（+50%） |
| `chorus_light_5` | 2.6 | ライト5でサビ突入（稀） |
| `chorus_light_6` | 3.0 | ライト6サビ（通常） |

### 2-3. その他の定数

| 定数 | 値 | 用途 |
|------|-----|------|
| `SHRINK_MULTIPLIER` | 1.6 | 縮小中ノーツの合計倍率（追加分 = 0.6） |
| `SCOREUP_ASSIST_MULTIPLIER` | 1.2 | スコアアップアシスト倍率 |
| `DEFAULT_SCOREUP_BADGE_RATE` | 15 | バッジ倍率のデフォルト（%） |
| `MC_ITERATIONS` | 5000 | MC シミュレーション既定回数 |
| `MC_CHUNK_SIZE` | 50 | UI 応答性のためのチャンクサイズ |
| `CENTER_SKILL_RATES` | UR=10 / SSR=7 | センタースキル増加率（%） |
| `DEFAULT_CENTER_SKILL_RATE` | 6 | SR/R/N 用デフォルト |
| `EVENT_BONUS_MULTIPLIER` | none=1.0 / bronze=2.0 / silver=2.2 / gold=2.4 | 特効ランク倍率 |

## 3. チーム属性値計算 (`computeTeam`)

入力: `deck`（6枚）、ブローチ一覧、楽曲、特効ランク、特訓フラグ、選択ブローチ、共有ブローチ、スキルレベル、ラビットノート。
実装: `engine.ts:61-205`。

### 3-1. カード単位の基本属性値

```
特訓済み → baseShout = shout_max, baseBeat = beat_max, baseMelody = melody_max
未特訓   → baseShout = shout_min, baseBeat = beat_min, baseMelody = melody_min
```

### 3-2. ラビットノート加算 + 特効倍率

ラビットノート（キャラ別の追加ボーナス）を先に加算し、特効倍率を掛けて **四捨五入**。

```
s = round((baseShout  + rabbitNote.shout)  × bonusMult)
b = round((baseBeat   + rabbitNote.beat)   × bonusMult)
m = round((baseMelody + rabbitNote.melody) × bonusMult)

rawShout += s   // 6 枠合計
rawBeat  += b
rawMelody += m
```

**特効ランク (`EVENT_BONUS_MULTIPLIER`)**:

| ランク | bonusMult | 備考 |
|--------|-----------|------|
| `none`   | 1.0 | 特効なし |
| `bronze` | 2.0 | 銅特効（100%） |
| `silver` | 2.2 | 銀特効（120%） |
| `gold`   | 2.4 | 金特効（140%） |

> **外部サイトとの差分**: 外部サイトは 100%/120% の 2 種のみを記載。現行ゲームでは 140% (gold) 特効が存在するため、実装側を採用。

### 3-3. ブローチ加算 (`resolveDeckBroachs`)

UR カードのみがブローチを装備可能。ブローチ種類ごとに条件判定を行い、
属性値加算（種類 9 以外）またはスコア直接加算（種類 9）を行う。

**ブローチ種類 (`broachResolver.ts:12-20`)**:

| 種類 | 名称 | 発動条件 | 効果 |
|-----|------|--------|------|
| 1 | `ATTRIBUTE_UP` | 常時 | Shout/Beat/Melody 加算 |
| 4 | `GROUP` | 自デッキ（スロット 0-4）が全員同グループ | 属性値加算 |
| 5 | `IDOL_ATTR_COUNT` | 指定アイドル×指定属性のカード枚数 ≥ `limit` | 属性値加算 |
| 6 | `ATTRIBUTE_UP_LIMITED` | 常時（デッキ全体で最大 `limit` 枚まで発動） | 属性値加算 |
| 7 | `ALL_ATTRIBUTES` | デッキ内に Shout/Beat/Melody 全て存在（デッキ内 `limit` 枚まで） | 属性値加算 |
| 8 | `AUTO_ONLY` | オートモード限定（本シミュレータでは常に無効） | — |
| 9 | `SCORE_UP` | `broach.song === song.song_name` | スコア直接加算 (`broachScoreBonus`) |

**デッキ内上限 (`limit`)**: 種類 6/7 は同一デッキで上限枚数までしか発動しない。`resolveDeckBroachs` が先着順で `count` を消費する。

### 3-4. 共有ブローチ加算

共有ブローチは複数カード間で共有可能。属性条件付きの場合、対象属性のカード枚数に応じて効果が倍化する。

```
if (sharedBroach.targetAttribute) {
  count = デッキ内で対象属性を持つカード枚数
  bShout += sharedBroach.shout × count
  bBeat  += sharedBroach.beat  × count
  bMelody += sharedBroach.melody × count
} else {
  bShout += sharedBroach.shout
  bBeat  += sharedBroach.beat
  bMelody += sharedBroach.melody
}
```

### 3-5. センター／フレンド ボーナス

センター（スロット 0）とフレンド（スロット 5）のレアリティに応じて、各カードの属性に対応する属性値にボーナス率を加算する。

```
centerRate = getCenterSkillRate(deck[0].rarity)   // UR=10, SSR=7, 他=6
friendRate = getCenterSkillRate(deck[5].rarity)

shoutRate = (centerAttr === 'Shout' ? centerRate : 0) + (friendAttr === 'Shout' ? friendRate : 0)
beatRate  = (centerAttr === 'Beat'  ? centerRate : 0) + (friendAttr === 'Beat'  ? friendRate : 0)
melodyRate = (centerAttr === 'Melody' ? centerRate : 0) + (friendAttr === 'Melody' ? friendRate : 0)
```

> **外部サイトとの差分**: 外部サイトは `ct_skill` テキスト内のキーワード（「かなり」「やや」「大きく」）で判定。実装はレアリティ判定（UR は必ず「かなり(10%)」、SSR は必ず「やや(7%)」という対応関係をコードにしたもの）。結果の数値は同じ。

### 3-6. チーム属性値（最終）— 切り捨て

```
teamShout  = floor((rawShout  + broachShoutTotal)  × (100 + shoutRate)  / 100)
teamBeat   = floor((rawBeat   + broachBeatTotal)   × (100 + beatRate)   / 100)
teamMelody = floor((rawMelody + broachMelodyTotal) × (100 + melodyRate) / 100)
```

### 3-7. スコアアップアシスト適用済み属性値

アシスト ON 時に使用する属性値を属性値段階で計算し、**floor** しておく。

```
teamShoutAssisted  = floor(teamShout  × 1.2)
teamBeatAssisted   = floor(teamBeat   × 1.2)
teamMelodyAssisted = floor(teamMelody × 1.2)
```

ノーツ計算側でアシスト ON かどうかに応じて `teamShout`（unassisted）か `teamShoutAssisted` を選択する。

## 4. ノート展開 (`flattenNotes`)

`noteFlattener.ts`。楽曲データの 8 ノートグループ × 3 属性 × 2 種別（白/色）を 1 次元の `FlatNote[]` に展開する。

```
for groupKey in [notes_20, light_2, light_3, light_4, light_5, light_6, chorus_light_5, chorus_light_6]:
  for attr in [Shout, Beat, Melody]:
    for type in [white, color]:
      count = song[groupKey][`${attr}_${type}`]
      notes.push(FlatNote × count)

// Fisher-Yates シャッフル（XorShift128Plus, seed=42 固定）
```

ノートの発生タイミングは実ゲーム上の配置と同期しないため、シャッフルによる近似。シード固定でビルドごとに同一順序。

## 5. ノーツスコアの計算（per-note floor）

1 ノーツあたりのスコアは以下の 2 段階で切り捨てる:

```
appeal = assist ON 時は teamXxxAssisted、OFF 時は teamXxx

素点      = floor(appeal × NOTE_RATE[type])            // 白 0.025 / 色 0.030
ノーツ得点 = floor(素点 × LIGHT_MULTIPLIER[group])      // コンボ/サビ倍率
```

実装: `engine.ts:223-227` の `calcNoteScore()` に集約。`calcMinScore` / `calcMaxScore` / `runOnce` / `calcExpectedScore` のすべてが同じ計算式を使う。

> **外部サイトとの差分**: 実装は以前「合計後に 1 回だけ floor」していたが、これだと微小誤差が出るため各ノーツで per-note floor するよう改修した（外部サイト準拠）。

## 6. 判定縮小スキル

### 6-1. 縮小効果の適用ルール

縮小中（任意の縮小スキルが発動中）のノーツは、**未アシスト** の素点を基準に追加スコアが加算される:

```
shrinkExtra = (shrinkActive && group !== 'notes_20')
  ? floor(ノーツ得点(unassisted) × (SHRINK_MULTIPLIER - 1.0))   // × 0.6
  : 0
```

- `SHRINK_MULTIPLIER = 1.6` → 追加分は 0.6 倍
- `notes_20` グループは除外（外部サイトの「最初の約 20 ノーツには縮小がかからない」に対応）
- 未アシスト基準で計算することで、外部サイトの `縮小スコア = 属性値楽曲スコア × 0.6 ÷ 1.2`（アシスト時）と等価

### 6-2. 縮小持続時間

縮小スキルの発動時間は **`skill.value`（秒）** で表される。カードデータの skill value 欄が秒数を意味する。

```
// 発動時点
noteTime = n / N × songDuration
endNote = min(floor((noteTime + skill.value) / songDuration × N), N)
shrinkEndNotes[cardIdx] = max(shrinkEndNotes[cardIdx], endNote)

// ノート走査時
shrinkActive = ∃c: shrinkEndNotes[c] > n
```

> コミット `ae53bb8` で誤用していた `sp_time`（特訓時間）から `skill.value` に修正済。

## 7. ノーツスコアの合計とバッジ適用

```
total = Σ (ノーツ得点 + shrinkExtra + scoreUpSum)   // ノーツ順
最終スコア = floor(total × badgeMult) + broachScoreBonus
  where badgeMult = 1 + scoreUpBadgeRate / 100
```

`scoreUpBadgeRate` は `ScoreOptions` で渡される %（例: 15 なら ×1.15）。0 または未指定の場合はバッジなし（×1.0）。

> **外部サイトとの差分**: 外部サイトが 14% などの例示値を使っていることに対応し、実装を「ON/OFF 15% 固定」から「任意数値」に変更した。

## 8. モンテカルロシミュレーション (`runSimulation` / `runOnce`)

### 8-1. 実装位置

`engine.ts:500`（`runSimulation`）／ `engine.ts:405`（`runOnce`）。

### 8-2. RNG

`XorShift128Plus`（`rng.ts`）。`seed` を指定しない場合は `Date.now()`。
試行間で RNG を継続使用し、決定論性（同シード=同結果）を保つ。

### 8-3. `runOnce` の流れ

1. **Phase 1 — タイマースキル**: 各発動機会で `rng.next() × 100 < skill.per` なら発動。区間 `[startNote, endNote)` に `skill.value` を `timerBonus[n]` として記録。
2. **Phase 2 — ノート順処理**: 各ノートで:
   - 通常スキル/縮小スキルのカウンタ判定 → 確率ロール → 発動処理
   - 縮小アクティブ判定
   - ノーツ得点・shrinkExtra・scoreUpSum を合算
   - 縮小 extra を発動中カードで按分して `contributions[c]` に記録（寄与率可視化用）
3. **最終スコア**: `floor(totalScore × badgeMult) + broachScoreBonus`

### 8-4. `runSimulation` の流れ

1. `calcMinScore` / `calcMaxScore` で理論下限・上限を先に求める
2. `iterations` 回 `runOnce` を呼ぶ（`MC_CHUNK_SIZE=50` 毎に `setTimeout(0)` で UI に制御を戻す）
3. 試行結果から `mean / median / stddev / p90 / mcMin / mcMax` を計算
4. カード別スキル統計 `cardStats[]` を生成

### 8-5. 返り値 `SimulationResult`

| フィールド | 内容 |
|-----------|------|
| `minScore` / `maxScore` | 理論下限・上限（`calcMinScore` / `calcMaxScore`） |
| `scores[]` | 全試行スコア |
| `mean` / `median` / `stddev` / `p90` | 統計量（四捨五入） |
| `mcMin` / `mcMax` | 試行中の実測最小・最大 |
| `cardStats[]` | カード別スキル発動統計 |

## 9. 算術期待値 (`calcExpectedScore`)

外部サイト準拠の **単純期待値** を MC と併記して提供（`engine.ts:398`）。

### 9-1. 属性値による楽曲スコア

全ノートを per-note floor で合算（= スキル全不発時のスコア、バッジ未適用）:

```
baseScore          = Σ calcNoteScore(assisted appeal, note)
baseScoreUnassisted = Σ calcNoteScore(unassisted appeal, note)
```

### 9-2. スコアアップ期待値

通常スキル/タイマースキルそれぞれに適用:

```
for 各 scoreUp/timerScoreUp スキル:
  denom = isTimer ? songDuration : notesCount
  scoreUpExpected += (denom / skill.count) × (skill.per / 100) × skill.value
scoreUpExpected = floor(scoreUpExpected)
```

### 9-3. 判定縮小期待値

```
coverage = calcShrinkCoverage(team, notesCount, 0)
shrinkExpected = floor(baseScoreUnassisted × (SHRINK_MULTIPLIER - 1.0) × coverage.expectedCoverageRate)
```

未アシスト基準を使うのは外部サイトの `÷1.2` 補正と等価。

### 9-4. 最終値

```
liveEndScore = baseScore + scoreUpExpected + shrinkExpected
finalScore   = floor(liveEndScore × badgeMult) + broachScoreBonus
```

## 10. 縮小カバー率 (`calcShrinkCoverage`)

`engine.ts:229-308`。縮小スキルが楽曲のうちどれだけの秒数をカバーするかを返す。

### 10-1. 発動区間の生成

```
for 各縮小カード:
  prob = skill.per / 100
  numActivations = floor(notesCount / skill.count)
  for k = 1 .. numActivations:
    noteIndex = k × skill.count - 1
    activationTime = noteIndex / notesCount × songDuration
    start = max(activationTime, offsetSeconds)
    end   = min(activationTime + skill.value, songDuration)
    intervals.push({start, end, prob})
```

### 10-2. 100% 発動カバー率（区間マージ）

```
intervals を start でソート → 隣接重複をマージ
coveredSeconds = Σ (merged.end - merged.start)
coverageRate  = coveredSeconds / effectiveSeconds
```

### 10-3. 期待カバー率（確率積分）

```
times = { 各 interval の start, end }
for 各セグメント [segStart, segEnd]:
  probNone = Π (1 - interval.prob)  // このセグメントを覆う全 interval
  probActive = 1 - probNone
  expectedCoveredSeconds += segLen × probActive
expectedCoverageRate = expectedCoveredSeconds / effectiveSeconds
```

`effectiveSeconds = songDuration - offsetSeconds`。

## 11. スキル種別マッピング

`engine.ts:24-52` の `parseSkill()`:

| `ap_skill_type` (カードデータ) | `skillType` | `isTimer` | `isShrink` | 動作 |
|------------------------------|-------------|----------|-----------|------|
| `スコアアップ（タイマー）` | `timerScoreUp` | true | false | 一定秒毎に発動、区間内のノーツに `value` 加算 |
| `判定縮小スコアアップ` | `shrink` | false | true | N ノーツ毎に発動、`value` 秒間縮小効果 |
| `MISS→Good` / `null` | — | — | — | シミュ対象外（除外） |
| その他（スコアアップ） | `scoreUp` | false | false | N ノーツ毎に発動、ノートに `value` 加算 |

スキルレベル 1〜5 は `getApSkillLevel(card, skillLevel)` で取得し、`count / per / value` が変化する。

## 12. データ型リファレンス

### 12-1. 主要型 (`types.ts`)

| 型 | 用途 |
|----|------|
| `FlatNote` | 1 ノーツ `{ attribute, type, group }` |
| `CardSkill` | スキル情報 `{ skillType, count, per, value, isTimer, isShrink, spTime }` |
| `DeckCard` | デッキ内カード情報（属性値＋ブローチ＋スキル） |
| `ComputedTeam` | チーム属性値（`Shout / ShoutAssisted` 等を含む） |
| `SimulationResult` | MC 結果 |
| `ExpectedScore` | 算術期待値 `{ baseScore, scoreUpExpected, shrinkExpected, liveEndScore, finalScore }` |
| `ScoreOptions` | `{ scoreUpAssist, scoreUpBadgeRate? }` |
| `CardSkillStats` | カード別スキル発動統計 |

### 12-2. ScoreOptions

```typescript
interface ScoreOptions {
  scoreUpAssist: boolean;     // true で属性値に ×1.2 → floor を適用
  scoreUpBadgeRate?: number;  // % (例: 15 → ×1.15)、0 / 未指定 でバッジなし
}
```

## 13. 注意事項・設計上の制約

- ノート順序は実ゲームと同期しない（シャッフル seed=42 固定）
- ブローチは **UR カードのみ** 装備可能（`broachResolver.ts:122`）
- フレンド枠（スロット 5）のブローチも種類 9 以外は属性値加算として機能する
- 種類 8 (`AUTO_ONLY`) ブローチはシミュレーション対象外
- `notes_20` グループ（最初の約 20 ノーツ）は縮小スキル効果の対象外
- 縮小持続時間は `skill.value`（秒）— `spTime` ではない
- MC は試行間で RNG を継続使用。シード固定で結果再現可能。
- 算術期待値と MC 平均は **ほぼ一致** するが、MC は確率的揺れを含むため厳密には異なる

## 14. 外部サイトとの差分まとめ

| 項目 | 外部サイト | 実装 | 採用理由 |
|------|-----------|------|---------|
| 特効ランク | 100% / 120% のみ | + 140% (gold) | ゲーム内に 140% 特効が存在 |
| センター判定 | `ct_skill` キーワード | レアリティ | 数値は同じ、レアリティ対応関係が確定的 |
| バッジ倍率 | 可変（例 14%） | 可変（数値入力） | 外部サイト準拠に変更済 |
| アシスト適用位置 | 属性値に ×1.2 | 属性値に ×1.2 → floor | 外部サイト準拠に変更済 |
| 丸め | 各ノーツで floor | per-note floor | 外部サイト準拠に変更済 |
| 期待値算出 | 算術式 | MC + 算術併記 | 両方表示 |
| ブローチ仕様 | 記載薄い | 種類別詳細 | ゲーム内仕様を実装 |
| スキルレベル | 記載なし | 1〜5 選択可能 | ゲーム内機能 |
| 共有ブローチ | 記載なし | 実装済 | ゲーム内機能 |
| ラビットノート | 言及のみ | 実装済 | ゲーム内機能 |

## 15. 関連ファイル

| パス | 役割 |
|------|-----|
| `src/lib/score/engine.ts` | `computeTeam`, `runSimulation`, `calcMinScore`, `calcMaxScore`, `calcExpectedScore`, `calcShrinkCoverage`, `parseSkill`, `getCenterSkillRate` |
| `src/lib/score/types.ts` | 型定義 |
| `src/lib/score/constants.ts` | 定数 |
| `src/lib/score/noteFlattener.ts` | `flattenNotes` |
| `src/lib/score/rng.ts` | XorShift128Plus |
| `src/lib/score/histogram.ts` | `renderHistogramSvg` |
| `src/lib/score/broachResolver.ts` | `resolveDeckBroachs`, `calcBroachScoreBonus` |
| `src/lib/data/eventBonusTiers.ts` | `EVENT_BONUS_MULTIPLIER` |
| `src/pages/score-calc/index.astro` | スコア計算 UI |
