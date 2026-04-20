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
| `SCOREUP_ASSIST_RATE` | 0.2 | スコアアップアシスト: 属性値に +20% (×1.2) を適用 |
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
特訓済み → baseShout = shout_max,   baseBeat = beat_max,   baseMelody = melody_max
未特訓   → base<自属性> = <自属性>_max - TRAIN_BONUS[rarity]
         → 他属性は *_max をそのまま使用
```

特訓は「自属性のみ TRAIN_BONUS[rarity] 分増加」の仕様。TRAIN_BONUS は `constants.ts` で定義され、
UR は `+1800`(他レアリティは未確定で 0 扱い)。
例: 10th Anniversary 四葉環(UR / Beat) は `beat_max=7691` で、未特訓時は `7691 - 1800 = 5891`、
Shout / Melody は特訓有無に関わらず `shout_max` / `melody_max` をそのまま使用する。

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
**スロット 0〜5（フレンド枠を含む全枠）** のカードに紐付くブローチが加算対象（種類 8 `AUTO_ONLY` と未発動ブローチは除く）。

**ブローチ種類 (`broachResolver.ts:12-20`)**:

| 種類 | 名称 | 発動条件 | 効果 |
|-----|------|--------|------|
| 1 | `ATTRIBUTE_UP` | 常時 | Shout/Beat/Melody 加算 |
| 4 | `GROUP` | 自デッキ（スロット 0-4）が全員同グループ | 属性値加算 |
| 5 | `IDOL_ATTR_COUNT` | 対象カード（指定アイドル×指定属性、フレンド含む）が 1 枚以上 | 属性値加算 × 対象枚数（最大 6）。`limit` は同種ブローチのデッキ内重複発動上限（2 枚目以降は発動しない） |
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

`broachXxxTotal` はスロット 0〜5（フレンド枠を含む全枠）の有効ブローチ値の合計（§3-3 / §3-4 の条件を満たすもの）。

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

1 ノーツあたりのスコアは属性値・ライト倍率・ノートレートを掛け合わせて **1 回だけ** 切り捨てる:

```
appeal = assist ON 時は teamXxxAssisted、OFF 時は teamXxx

ノーツ得点 = floor(appeal × LIGHT_MULTIPLIER[group] × NOTE_RATE[type])
           // LIGHT_MULTIPLIER: コンボ/サビ倍率 (§2-2)
           // NOTE_RATE: 白 0.025 / 色 0.030 (§2-1)
```

実装: `engine.ts:223-227` の `calcNoteScore()` に集約。`calcMinScore` / `calcMaxScore` / `runOnce` / `calcExpectedScore` のすべてが同じ計算式を使う。

> **外部サイトとの差分**: 実装は以前「合計後に 1 回だけ floor」していたが、これだと微小誤差が出るため各ノーツで per-note floor するよう改修した（外部サイト準拠）。per-note 内では 1 回 floor（`floor(appeal × LIGHT_MULTIPLIER × NOTE_RATE)`）とし、段階分割はしない。

## 6. 判定縮小スキル

判定縮小スキルの仕様詳細は `docs/shrink-skill-spec.md` を参照。本節は概要を記載。

### 6-1. 縮小効果の適用ルール

縮小中（任意の縮小スキルが発動中）のノーツは、**アシスト適用後** の素点を基準に追加スコアが加算される:

```
shrinkExtra = (activeRate > 0 && !note.excluded)
  ? floor(noteScoreAssisted × (activeRate - 1.0))
  : 0
```

- `activeRate` = 発動中スキルの `skill.rate` の最大値（「いずれか発動中」判定で重ねがけなし）
- スキルレベル別に `rate` は変化する（Lv1=1.2 〜 Lv5=1.6 が典型）
- 先頭除外: `excludeHead = max(notes_20 グループのノート数, デッキ内縮小スキル count の最小値)` まで (`note.excluded=true` になる)

### 6-2. 縮小持続時間

縮小スキルの発動時間は **`skill.value`（秒）** で表される。

```
noteTime = n / N × songDuration
endNote = min(floor((noteTime + skill.value) / songDuration × N), N)
shrinkEndNotes[cardIdx] = max(shrinkEndNotes[cardIdx], endNote)
shrinkActive = ∃c: shrinkEndNotes[c] > n
```

### 6-3. カバー率

`calcShrinkCoverage` は 4 指標を返す。内部計算用は `effectiveSeconds = songDuration - offset` で **100% キャップ**。表示用 raw 系は 100% 超可。

- `coveredSeconds = min(rawCoveredSeconds, effectiveSeconds)` — スコア計算用
- `rawCoveredSeconds = Σ (numActivations × value)` — 表示用
- `expectedCoveredSeconds = min(rawExpectedCoveredSeconds, effectiveSeconds)` — 期待値用
- `rawExpectedCoveredSeconds = Σ (numActivations × value × per/100)` — 表示用

## 7. ノーツスコアの合計とアシスト / バッジ適用

```
// アシストは属性値段階で適用 (docs/score_calc_spec.md §3-7)
appeal = scoreUpAssist ? floor(team[attr] × 1.2) : team[attr]
noteScore = floor(appeal × LIGHT_MULTIPLIER × NOTE_RATE)
total = Σ (noteScore + shrinkExtra + scoreUpSum)
最終スコア = floor(total × badgeMult) + broachScoreBonus
  where badgeMult = 1 + scoreUpBadgeRate / 100   (例: 15 → 1.15)
```

- アシスト ON: 属性値に ×1.2 を適用し floor してから per-note 計算（重複 floor 防止）
- バッジ: 最終合計に乗算。`SCOREUP_ASSIST_RATE = 0.2` (属性値段階への加算率)。
- `scoreUpBadgeRate` は `ScoreOptions` で渡される %（例: 15 なら ×1.15）。0 または未指定の場合はバッジなし（×1.0）。

## 8. モンテカルロシミュレーション (`runSimulation` / `runOnce`)

### 8-1. 実装位置

`engine.ts:500`（`runSimulation`）／ `engine.ts:405`（`runOnce`）。

### 8-2. RNG

`XorShift128Plus`（`rng.ts`）。`seed` を指定しない場合は `Date.now()`。
試行間で RNG を継続使用し、決定論性（同シード=同結果）を保つ。

### 8-3. `runOnce` の流れ

1. **Phase 1 — タイマースキル**: 各発動機会で `rng.next() × 100 < skill.per` なら発動。発動タイミングに最も近いノート 1 個に `skill.value` を `timerBonus[n]` として 1 回加算。
2. **Phase 2 — ノート順処理**: 各ノートで:
   - 通常スキル/縮小スキルのカウンタ判定 → 確率ロール → 発動処理
   - 縮小アクティブ判定
   - ノーツ得点・shrinkExtra・scoreUpSum を合算
   - 縮小 extra を発動中カードで按分して `contributions[c]` に記録（寄与率可視化用）
3. **最終スコア**: `floor(totalScore × badgeMult) + broachScoreBonus`（アシストは §3-7 の属性値段階で既に適用済みのため最終段階の乗算は不要）

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

仕様 (`docs/shrink-skill-spec.md` §5-3) に準拠した **単純期待値** を MC と併記して提供。

### 9-1. 属性値による楽曲スコア

全ノートを per-note floor で合算（アシスト適用済み appeal で計算、バッジ未適用）:

```
baseScore = Σ calcNoteScore(getAppeal(team, attr, assist), note)
```

### 9-2. スコアアップ期待値

通常スキル/タイマースキルそれぞれに適用:

```
for 各 scoreUp/timerScoreUp スキル:
  denom = isTimer ? songDuration : notesCount
  scoreUpExpected += floor(denom / skill.count) × (skill.per / 100) × skill.value
scoreUpExpected = floor(scoreUpExpected)
```

### 9-3. 判定縮小期待値

```
maxRate  = max(デッキ内縮小スキルの rate)
coverage = calcShrinkCoverage(team, notesCount, 0, excludedCount)
shrinkExpected = floor(eligibleBaseScore × (maxRate - 1.0) × coverage.expectedCoverageRate)
```

- `eligibleBaseScore` は `note.excluded !== true` のノートのみを合算した assisted 素点。
- `expectedCoverageRate = min(rawExpectedCoveredSeconds / effectiveSeconds, 1.0)` （100% キャップ）。

### 9-4. 最終値

```
liveEndScore = baseScore + scoreUpExpected + shrinkExpected
finalScore   = floor(liveEndScore × badgeMult) + broachScoreBonus
```

## 10. 縮小カバー率 (`calcShrinkCoverage`)

`engine.ts` の `calcShrinkCoverage`。仕様 (`docs/shrink-skill-spec.md` §3, §4) に準拠した単純加算 + 100% キャップ方式。

### 10-1. 単純加算

```
eligibleCount = notesCount − excludeHeadCount
for 各縮小カード:
  numActivations = floor(eligibleCount / skill.count)
  rawCoveredSeconds         += numActivations × skill.value
  rawExpectedCoveredSeconds += numActivations × skill.value × (skill.per / 100)
```

### 10-2. 100% キャップ

```
effectiveSeconds = songDuration - offsetSeconds
coveredSeconds         = min(rawCoveredSeconds,         effectiveSeconds)
expectedCoveredSeconds = min(rawExpectedCoveredSeconds, effectiveSeconds)
coverageRate           = coveredSeconds         / effectiveSeconds    // 100% 以下
expectedCoverageRate   = expectedCoveredSeconds / effectiveSeconds    // 100% 以下
rawCoverageRate         = rawCoveredSeconds         / effectiveSeconds  // 100% 超可 (表示用)
rawExpectedCoverageRate = rawExpectedCoveredSeconds / effectiveSeconds  // 100% 超可 (表示用)
```

表示用 raw* は 100% 超過可 (UI で「超過分は計算対象外」と注記)。内部計算用は必ず 100% キャップ。

## 11. スキル種別マッピング

`engine.ts:24-52` の `parseSkill()`:

| `ap_skill_type` (カードデータ) | `skillType` | `isTimer` | `isShrink` | 動作 |
|------------------------------|-------------|----------|-----------|------|
| `スコアアップ（タイマー）` | `timerScoreUp` | true | false | 一定秒毎に発動、発動タイミングのノート 1 個に `value` 点を 1 回加算 |
| `判定縮小スコアアップ` | `shrink` | false | true | N ノーツ毎に発動、`value` 秒間縮小効果 |
| `MISS→Good` / `BAD以上をPerfectに変更` / `null` | — | — | — | シミュ対象外（除外） |
| その他（スコアアップ） | `scoreUp` | false | false | N ノーツ毎に発動、発動タイミングのノート 1 個に `value` 点を 1 回加算 |

スキルレベル 1〜5 は `getApSkillLevel(card, skillLevel)` で取得し、`count / per / value` が変化する。

## 12. データ型リファレンス

### 12-1. 主要型 (`types.ts`)

| 型 | 用途 |
|----|------|
| `FlatNote` | 1 ノーツ `{ attribute, type, group }` |
| `CardSkill` | スキル情報 `{ cardIndex, skillType, originalType, count, per, value, rate, isTimer, isShrink, spTime }`。`rate` は判定縮小スキルの倍率（Lv 毎に 1.2〜1.6、非縮小スキルは 0）。`originalType` は表示用の元 `ap_skill_type`（正規化後）。`spTime` はカードの **特訓可能回数**（「特訓済み」は `spTime` 分の特訓完了状態を意味し、`TRAIN_BONUS` が属性値に加算されている） |
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

## 16. 計算例（楽曲 ID2: MONSTER GENERATiON）

> デッキ構成別の具体的な計算例。楽曲仕様は `notes_count = 428 / notes_20 = 21 ノート / songDuration = 104 秒`。

### 16-1. センター Card ID3414 単独（スコア寄与スキルなし）

- スキルのタイプが「BAD以上をPerfectに変更」なのでスコアに寄与しない
  - そのため MC シミュレーションも変化なし
  - シミュレーションの分布も 1 つの計算値に収束する

#### カード ID3414 のみの属性値

| 状態 | Shout | Beat | Melody |
|------|------:|------:|------:|
| 未特訓 | 3,898 | 5,891 | 4,611 |
| 特訓済み | 3,898 | 7,691 | 4,611 |

#### デッキ全体の属性値

**加算の内訳（特訓済み基準）**:

| 項目 | Shout | Beat | Melody | 備考 |
|------|------:|------:|------:|------|
| カード特訓済み属性値 | 3,898 | 7,691 | 4,611 | — |
| 固定ブローチ | — | +4,500 | — | Card が ID3414 のみなので条件を満たす |
| センターボーナス (UR: 10%) | — | +1,219 | — | (7,691 + 4,500) × 10% |
| **合計** | **3,898** | **13,410** | **4,611** | — |

#### MONSTER GENERATiON のノート内訳

| レベル | 倍率 | S白 | S色 | B白 | B色 | M白 | M色 | 計 |
|--------|-----:|----:|----:|----:|----:|----:|----:|----:|
| Notes 2.0 | ×1.0 | — | — | — | — | 15 | 6 | 21 |
| Light 2 | ×1.0 | — | — | — | — | 10 | 4 | 14 |
| Light 3 | ×1.1 | — | — | 2 | — | 33 | 11 | 46 |
| Light 4 | ×1.2 | — | — | 46 | — | — | — | 46 |
| Light 5 | ×1.3 | — | — | 47 | 2 | — | — | 49 |
| Light 6 | ×1.5 | 76 | 9 | 9 | 1 | — | — | 95 |
| Chorus Light 6 | ×3.0 | 21 | 14 | 47 | 11 | 49 | 15 | 157 |
| **合計** | — | **97** | **23** | **151** | **14** | **107** | **36** | **428** |

#### 1 ノートあたりのスコア算出式

`ノート数 × floor(倍率 × 各対象属性値 × (白なら2.5% | 色なら3%))`

**Notes 2.0 (×1.0 / 最初の20ノーツ, 縮小スキル対象外)**:

- M白 (15 * floor(4,611 * 1.0 * 2.5%)) = 1,725
- M色 (6 * floor(4,611 * 1.0 * 3%)) = 828
- 小計: 2,553

**Light 2 (×1.0)**:

- M白 (10 * floor(4,611 * 1.0 * 2.5%)) = 1,150
- M色 (4 * floor(4,611 * 1.0 * 3%)) = 552
- 小計: 1,702

**Light 3 (×1.1)**:

- B白 (2 * floor(13,410 * 1.1 * 2.5%)) = 736
- M白 (33 * floor(4,611 * 1.1 * 2.5%)) = 4,158
- M色 (11 * floor(4,611 * 1.1 * 3%)) = 1,672
- 小計: 6,566

**Light 4 (×1.2)**:

- B白 (46 * floor(13,410 * 1.2 * 2.5%)) = 18,492
- 小計: 18,492

**Light 5 (×1.3)**:

- B白 (47 * floor(13,410 * 1.3 * 2.5%)) = 20,445
- B色 (2 * floor(13,410 * 1.3 * 3%)) = 1,044
- 小計: 21,489

**Light 6 (×1.5)**:

- S白 (76 * floor(3,898 * 1.5 * 2.5%)) = 11,096
- S色 (9 * floor(3,898 * 1.5 * 3%)) = 1,575
- B白 (9 * floor(13,410 * 1.5 * 2.5%)) = 4,518
- B色 (1 * floor(13,410 * 1.5 * 3%)) = 603
- 小計: 17,792

**Chorus Light 6 (×3.0)**:

- S白 (21 * floor(3,898 * 3.0 * 2.5%)) = 6,132
- S色 (14 * floor(3,898 * 3.0 * 3%)) = 4,900
- B白 (47 * floor(13,410 * 3.0 * 2.5%)) = 47,235
- B色 (11 * floor(13,410 * 3.0 * 3%)) = 13,266
- M白 (49 * floor(4,611 * 3.0 * 2.5%)) = 16,905
- M色 (15 * floor(4,611 * 3.0 * 3%)) = 6,210
- 小計: 94,648

#### スコア合計

| グループ | 小計 |
|---------|----:|
| Notes 2.0 | 2,553 |
| Light 2 | 1,702 |
| Light 3 | 6,566 |
| Light 4 | 18,492 |
| Light 5 | 21,489 |
| Light 6 | 17,792 |
| Chorus Light 6 | 94,648 |
| **合計** | **163,242** |

スキル (BAD→Perfect) はスコア寄与なし、固定ブローチも種類 4 (GROUP / 属性値加算型) のため `broachScoreBonus = 0`。
したがって仕様通りに計算した場合 `calcMinScore = calcMaxScore = MC 全 scores = 163,242` となる。

#### 最終スコア（§3-7 / `docs/shrink-skill-spec.md §1` 準拠）

SCOREUPアシストは **属性値段階で ×1.2 (floor)** を適用する（§3-7 準拠）。バッジは最終合計に乗算で重ねる。

**属性値（アシスト後 floor 済み）**:

- teamShout_assisted  = floor(3,898 × 1.2)  = floor(4,677.6)  = **4,677**
- teamBeat_assisted   = floor(13,410 × 1.2) = floor(16,092.0) = **16,092**
- teamMelody_assisted = floor(4,611 × 1.2)  = floor(5,533.2)  = **5,533**

**各グループの per-note 再計算（アシスト後）**:

| グループ | 倍率 | 合計 |
|---------|-----:|-----:|
| Notes 2.0 | ×1.0 | 3,060 (M白 15×138 + M色 6×165) |
| Light 2 | ×1.0 | 2,040 |
| Light 3 | ×1.1 | 7,902 |
| Light 4 | ×1.2 | 22,172 |
| Light 5 | ×1.3 | 25,788 |
| Light 6 | ×1.5 | 21,341 |
| Chorus Light 6 | ×3.0 | 113,581 |
| **合計 (アシスト ON)** | — | **195,884** |

**計算例まとめ**:

| 適用条件 | 計算 | 最終スコア |
|---------|-----|----------:|
| なし (基本スコアのみ) | 163,242 | **163,242** |
| SCOREUPアシストのみ | アシスト属性値で per-note 再計算 | **195,884** |
| SCOREUPバッジ (15) のみ | `floor(163,242 × 1.15)` | **187,728** |
| アシスト + バッジ (15) | `floor(195,884 × 1.15)` = `floor(225,266.6)` | **225,266** |

### 16-2. センター ID3414 + フレンド ID1952（縮小スキル 1 枚）

- センターの Card ID3414 は「BAD以上をPerfectに変更」なのでスコア寄与なし
- フレンドの Card ID1952 は「判定縮小（Perfect）」スキル付きのため **スコアに影響する**
  - SL5: 20ノーツごとに 40% 発動、4 秒持続、対象ノートを 1.6 倍
- 縮小スキルの確率発動により MC シミュレーションのスコア分布が 1 点に収束せず、min / max / 期待値 / MC に差が出る

#### カード構成

| カード | 役割 | 属性 | rarity | Shout | Beat | Melody | スキル |
|--------|------|------|--------|------:|------:|------:|-------|
| ID3414 (10th Anniv 四葉環) | センター | Beat | UR | 3,898 | 7,691 | 4,611 | BAD→Perfect (寄与なし) |
| ID1952 (記念日2024 四葉環) | フレンド | Melody | UR | 4,691 | 4,243 | 7,666 | 判定縮小 Perfect (SL5: 20ノーツ毎 40% / 4秒 / 1.6倍) |
| **合計 (raw)** | — | — | — | **8,589** | **11,934** | **12,277** | — |

#### デッキ全体の属性値（2 枚構成）

**加算の内訳（特訓済み基準）**:

| 項目 | Shout | Beat | Melody | 備考 |
|------|------:|------:|------:|------|
| カード特訓済み合計 | 8,589 | 11,934 | 12,277 | — |
| 固定ブローチ (Card 3414) | — | +4,500 | — | `group=IDOLiSH7` 条件、2 枚とも IDOLiSH7 で成立 |
| センター 3414 (UR Beat: +10%) | — | ×1.10 | — | (11,934 + 4,500) × 1.10 = 18,077 |
| フレンド 1952 (UR Melody: +10%) | — | — | ×1.10 | (12,277 + 0) × 1.10 = 13,504 |
| **合計 (floor)** | **8,589** | **18,077** | **13,504** | — |

計算式:

- teamShout  = floor(8,589 × 1.00) = **8,589**
- teamBeat   = floor((11,934 + 4,500) × 1.10) = floor(18,077.4) = **18,077**
- teamMelody = floor((12,277 + 0) × 1.10) = floor(13,504.7) = **13,504**

Card 1952 には紐付く固定ブローチが無いため、broach 加算は Card 3414 の Beat+4,500 のみ。`broachScoreBonus = 0` (broach_type=4 は属性値加算型)。

#### 基本スコア（縮小全不発時）の内訳

**Notes 2.0 (×1.0 / 最初の20ノーツ, 縮小スキル対象外)**:

- M白 (15 * floor(13,504 * 1.0 * 2.5%)) = 15 × 337 = 5,055
- M色 (6 * floor(13,504 * 1.0 * 3%))   = 6 × 405 = 2,430
- 小計: 7,485

**Light 2 (×1.0)**:

- M白 (10 * floor(13,504 * 1.0 * 2.5%)) = 10 × 337 = 3,370
- M色 (4 * floor(13,504 * 1.0 * 3%))   = 4 × 405 = 1,620
- 小計: 4,990

**Light 3 (×1.1)**:

- B白 (2 * floor(18,077 * 1.1 * 2.5%))  = 2 × 497 = 994
- M白 (33 * floor(13,504 * 1.1 * 2.5%)) = 33 × 371 = 12,243
- M色 (11 * floor(13,504 * 1.1 * 3%))   = 11 × 445 = 4,895
- 小計: 18,132

**Light 4 (×1.2)**:

- B白 (46 * floor(18,077 * 1.2 * 2.5%)) = 46 × 542 = 24,932
- 小計: 24,932

**Light 5 (×1.3)**:

- B白 (47 * floor(18,077 * 1.3 * 2.5%)) = 47 × 587 = 27,589
- B色 (2 * floor(18,077 * 1.3 * 3%))    = 2 × 705 = 1,410
- 小計: 28,999

**Light 6 (×1.5)**:

- S白 (76 * floor(8,589 * 1.5 * 2.5%))  = 76 × 322 = 24,472
- S色 (9 * floor(8,589 * 1.5 * 3%))     = 9 × 386 = 3,474
- B白 (9 * floor(18,077 * 1.5 * 2.5%))  = 9 × 677 = 6,093
- B色 (1 * floor(18,077 * 1.5 * 3%))    = 1 × 813 = 813
- 小計: 34,852

**Chorus Light 6 (×3.0)**:

- S白 (21 * floor(8,589 * 3.0 * 2.5%))  = 21 × 644 = 13,524
- S色 (14 * floor(8,589 * 3.0 * 3%))    = 14 × 773 = 10,822
- B白 (47 * floor(18,077 * 3.0 * 2.5%)) = 47 × 1,355 = 63,685
- B色 (11 * floor(18,077 * 3.0 * 3%))   = 11 × 1,626 = 17,886
- M白 (49 * floor(13,504 * 3.0 * 2.5%)) = 49 × 1,012 = 49,588
- M色 (15 * floor(13,504 * 3.0 * 3%))   = 15 × 1,215 = 18,225
- 小計: 173,730

**基本スコア合計**:

| グループ | 小計 |
|---------|----:|
| Notes 2.0 | 7,485 |
| Light 2 | 4,990 |
| Light 3 | 18,132 |
| Light 4 | 24,932 |
| Light 5 | 28,999 |
| Light 6 | 34,852 |
| Chorus Light 6 | 173,730 |
| **合計 (= `calcMinScore`)** | **293,120** |

#### 縮小の計算ロジック（2 枚構成）

詳細な手順は `docs/shrink-skill-spec.md §6-1`（2 枚構成・縮小スキル 1 枚ケース）を参照。

### 16-3. センター ID3414 + フレンド ID1952 + メンバー ID3597（縮小スキル 2 枚）

縮小の計算ロジックの詳細な手順は `docs/shrink-skill-spec.md §6-2`（3 枚構成・縮小スキル 2 枚ケース）を参照。

### 16-4. Card ID861 のスキル計算（タイマー型スコアアップ）

1. **発動回数最大値**: `floor(MONSTER GENERATiON 104秒 / 16) = 6 回`
2. **スコアアップ理論最大値**: `6 回 × 7200 = 43,200`
3. **スコアアップ期待値**: `6 回 × 7200 × 47% = 20,304`

### 16-5. Card ID204 のスキル計算（ノートベース スコアアップ）

1. **発動回数最大値**: `floor(MONSTER GENERATiON 428ノート / 16) = 26 回`
2. **スコアアップ理論最大値**: `26 回 × 6403 = 166,478`
3. **スコアアップ期待値**: `26 回 × 6403 × 46% = 76,579.88`
