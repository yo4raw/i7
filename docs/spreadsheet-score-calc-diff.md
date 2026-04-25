# スプレッドシート版 (ota-life.com v1.0.5) とのスコア計算ロジック差分

> 比較対象:
>
> - **スプレッドシート**: [アイナナスコア計算 v1.0.5](https://docs.google.com/spreadsheets/d/1St4Hf609y9FobAn6-UjDIbkzDedo4Bssl5HT7PalFRk/) (ota-life.com 配布版)。2026-04-25 に playwright で主要シート・数式を採取
> - **i7 実装**: `src/lib/score/` および `docs/score_calc_spec.md` / `docs/shrink-skill-spec.md`（`main` ブランチ HEAD = `0e73ff4`）
>
> スプレッドシート側の全シート構造・数式リファレンスは `docs/spreadsheet-spec-v1.0.5.md` に分離記録している。本書は **両者の差異と縮小スキル計算の重点比較** に焦点を絞る。

## 0. サマリー

| 機能領域 | 差分の大きさ | 備考 |
| --- | --- | --- |
| **縮小スキル**（本書の主対象） | 大（§5 で詳述） | 基準スコア・先頭除外・rate 採用ロジック・カバー率分母がすべて異なる |
| 特効倍率 | 小 | スプレッドシート 0/100/120/140% ↔ i7 1.0/2.0/2.2/2.4（同値） |
| センタースキル | 中 | 10% ハードコード vs レアリティ別（UR=10 / SSR=7 / 他=6）。丸め位置も異なる |
| アシスト適用 | 中 | 両者とも属性値段階の ×1.2 floor だが、**縮小時だけスプレッドシートはアシスト無し基準を用いる** |
| バッジ | 一致 | `floor(合計 × (1 + badge%))`。既定値 16% も同じ |
| per-note 丸め | 一致 | 白 0.025 / 色 0.030、2 段 floor(`floor(appeal × rate) × light_mult`) |
| ライト倍率 | 一致 | 1.0 / 1.1 / 1.2 / 1.3 / 1.5 / 2.6 / 3.0 |
| ブローチ | 中 | スプレッドシートは種類 1-9 + 共有（メイン/サブ枠） / i7 は 1/4/5/6/7/8/9 + 共有ブローチ |
| ラビットノート | 中 | スプレッドシートは「デッキに居るキャラ」単位のフラグ和（`COUNTIF >= 1` で一度だけ加算）／ i7 はカード単位で毎カード加算 |
| モンテカルロ | スプレッドシートに無し | スプレッドシートは **期待値近似** のみ。i7 は MC + 期待値併記 |

結論: **i7 の縮小スキル計算は仕様 (`docs/shrink-skill-spec.md`) に忠実な実装**。スプレッドシートは**期待値のみの解析式ベース**で、(a) 基準スコアのアシスト剥離、(b) 先頭除外の未適用、(c) カバー率分母＝全曲尺、(d) カード別 rate の加重平均、という 4 点で系統的に異なる値を返す。

---

## 1. スプレッドシートのスコア計算フロー

### 1-1. 最終スコア組み立て

| セル | 内容 | 数式 |
| --- | --- | --- |
| `D20` 属性値スコア | per-note 2 段 floor の総和 | `=BN21` |
| `D21` スコアアップスキル | カード別 `H38:M38` の和 | `=SUM(H38:M38)` |
| `D22` 縮小スキル | カード別 `H40:M40` の和 | `=SUM(H40:M40)` |
| `D23` ライブ終了時 | 3 者合算 | `=SUM(D20,D21,D22)` |
| `D24` 最終リザルト | バッジ適用 | `=IF(K6=TRUE, ROUNDDOWN(D23*(1+'設定'!$B$3),0), D23)` |

- `'設定'!$B$3` = バッジ倍率（既定 16%）
- `K6` がバッジ ON チェックボックス、`I6` がアシスト ON チェックボックス

実値例（既定デッキ: 百[記念日2024]×2 + 百[7th Anniversary] + 千[記念日2021]×3、曲: Binary Vampire / 461 ノート / 92 秒、アシスト ON / バッジ 16%）:

```text
属性値スコア        1,600,353  (BN21)
スコアアップスキル    293,220  (D21)
縮小スキル           608,828  (D22)
ライブ終了時       2,502,401  (D23 = 合算)
最終リザルト       2,902,785  (D24 = floor(2,502,401 × 1.16))
```

### 1-2. 属性値スコア内部: `BN21 = SUM(BI11:BN18)`

8×6 = 48 セルの合計。行がステージ (light_2 〜 chorus_light_6 等)、列が attr×type (S白/S色/B白/B色/M白/M色):

```text
BI11 = BA11 * BA22   ... BN11 = BF11 * BF22
BI12 = BA12 * BA23   ... BN12 = BF12 * BF23
BI18 = BA17 * BA29   ... BN18 = BF17 * BF29
```

- `BA22:BF29` = 楽曲データから `FILTER` で取得した各ステージ × attr × type のノート数（8 ステージ相当）
- `BA11:BF11` = 属性値 × `NOTE_RATE` を `ROUNDDOWN` した「1 ノーツ素点」（ただし **`BA11` だけは `TRUE` リテラルが保持されている**。他の 5 列は `=ROUNDDOWN($AN72*2.5%)` 形式の正しい数式。v1.0.5 のテンプレート不整合の可能性あり）
- `BA12:BF17` = 各ステージのライト倍率を乗じて再 floor した per-note 基底値 (`=ROUNDDOWN($BA11 * $AZ12)` 形)

**i7 との per-note 公式**（`NOTE_RATE` / `LIGHT_MULTIPLIER` / 2 段 floor）は一致しているが、**BA11 の `TRUE` 固定問題で Shout 白ノートだけ素点が常に 1 になる** のはスプレッドシート側のバグと思われる。

### 1-3. アシスト適用位置

```text
AN72 = IF(I6=TRUE, ROUNDDOWN(AN71*1.2, 0), AN71)   // Shout appeal (assisted)
AP72 = ...                                           // Beat appeal
AR72 = ...                                           // Melody appeal
```

`AN72 / AP72 / AR72` が `BB11 / BC11 / … / BF11` の per-note floor の入力値になっているため、**属性値スコア `BN21` にはアシストが反映される**。i7 の `getAppeal(team, attr, assist) = scoreUpAssist ? floor(team × 1.2) : team`（§3-7）と同等。

### 1-4. センター／フレンドボーナス（AN71 系）

```text
AN71 = ROUNDDOWN(AN69 * (1 + IF($J20="Shout",0.1,0) + IF($M20="Shout",0.1,0)), 0)
AP71 = ROUNDDOWN(AP69 * (1 + IF($J20="Beat",0.1,0)  + IF($M20="Beat",0.1,0)),  0)
AR71 = ROUNDDOWN(AR69 * (1 + IF($J20="Melody",0.1,0)+ IF($M20="Melody",0.1,0)),0)
```

- `$J20` = センター属性（スプレッドシートはスロット 3 = 列 J がセンター）
- `$M20` = フレンド属性（スロット 6 = 列 M）
- **センター/フレンド率は常に 10% ハードコード**
- **センター分とフレンド分を加算してから一括 floor**（`floor(base × 1.2)` 相当）

**i7 との差** (`docs/score_calc_spec.md §3-5`):

- i7 はレアリティ判定で `getCenterSkillRate(rarity)` — UR=10, SSR=7, R/N=6
- i7 は **センター分とフレンド分を独立に floor** して合算

丸め誤差の例（team base Beat = 100,929、センター＋フレンドとも Beat/UR）:

| 手法 | 計算 | 結果 |
| --- | --- | ---: |
| スプレッドシート | `floor(100,929 × 1.2)` | **121,114** |
| i7 仕様 | `100,929 + floor(10,092.9) + floor(10,092.9)` | **121,113** |

UR × UR の場合はほぼ同値だが 1 単位の差が出る。SSR/SR をセンター/フレンドに配置した場合はスプレッドシート側が実態と合わなくなる（10% 固定のまま）。

---

## 2. 特効倍率

`'設定'!$B$6:$C$9`:

| ランク | スプレッドシート | i7 |
| --- | --- | --- |
| 金特効 | **140%** | `gold = 2.4` |
| 銀特効 | 120% | `silver = 2.2` |
| 銅特効 | 100% | `bronze = 2.0` |
| 無し | 0% | `none = 1.0` |

表記は「基礎 + 加算」形式（例: 140% = +140% なので合計 ×2.4）。**値は i7 と一致**。`docs/score_calc_spec.md §3-2` の差分表に「外部サイトは 100/120 のみ」と記載があるが、**v1.0.5 スプレッドシートは 140% (gold) を含む最新版**に更新されている。

---

## 3. スコアアップスキル（期待値）

カード別セル `H38:M38`:

```text
H38 = ROUNDDOWN(
        IFS(
          H31="スコアアップ", IFS(
            OR(H33="Perfect", H33="コンボ"),
              $D8/H34 * IFS($B12=TRUE, 1,
                            $B13=TRUE, (H35+$C14)/100,
                            TRUE,      H35/100) * H36,
            H33="タイマー",
              $D9/H34 * IFS($B12=TRUE, 1,
                            $B13=TRUE, (H35+$C14)/100,
                            TRUE,      H35/100) * H36)))
```

- `$D8` = ノーツ数 / `$D9` = 曲秒数
- `H34` = count, `H35` = per(%), `H36` = value（スコア/秒/回）
- `$B12` = 「スコアアップフル発動」(100% 発動扱い)
- `$B13` + `$C14` = 「確率UP + 10%」（`$C14 = 10`）

**差分**:

| 観点 | スプレッドシート | i7 (`calcExpectedScore`) |
| --- | --- | --- |
| 活動回数 | `$D8/H34` (**小数許容**) | `floor(denom / skill.count)` |
| 丸め | 最後に一度 `ROUNDDOWN` | 同じく最後に `floor` |
| 独自オプション | スコアアップフル発動 / 確率UP+10% | 無し（MC / `calcMaxScore` で別途表現） |

活動回数を小数のまま残すため、例えば `ノート 461 / count 14` の場合 i7=33 回 / スプレッドシート=32.928… 回 になり、per × value 乗算後の結果が数点〜数十点ずれる。

---

## 4. ブローチ（属性値加算）

スプレッドシートは固有ブローチ (`AN39`) と装着ブローチ (`AN46` / `AN54`) で別処理。要点:

- **種類 1-7 + 9 を実装**: i7 は 1/4/5/6/7/8/9（種類 2/3 は `broachResolver.ts` で `BROACH_TYPE` に未定義 → `resolveDeckBroachs` の switch から漏れる。実害は「未知種別なら属性値加算しない」＝安全側）
- **種類 8 (オート限定)**: スプレッドシートも `IFERROR(...,)` で実質スキップ、i7 の `AUTO_ONLY` と同等
- **`$AM$13:$AQ$13 = filter(...)` での配列比較**（種類 4: 全員同グループ判定）は i7 の `cards[0..4]` 5 人判定と同じ範囲
- **共有ブローチ 2 枠・メイン/サブ**: スプレッドシート側は「`AN$42="メイン" AND AN$50="メイン"` なら ×」「同名 >1 枚なら ×」と厳格に排除。i7 の `validateSharedBroachs` (`src/pages/score-calc/index.astro`) と同趣旨

大きな構造差は無い。丸め単位で ±数点の差が出うる程度。

---

## 5. 縮小スキル — 本書の最重点

### 5-1. スプレッドシートの縮小スキル数式（完全形）

#### H39 — カード i の期待縮小秒数

```text
H39 = IFERROR(
  IFS(H31 = "判定領域縮小",
      IFS(OR(H33="Perfect", H33="コンボ"),
            IF($B$15=TRUE,
                 ROUNDDOWN( $D8/H34 * H36, 0),          // フル発動: count × value
                 ROUNDDOWN( $D8/H34 * H35/100 * H36, 0) // 通常: count × per × value
            ),
          H33="タイマー",
            IF($B$15=TRUE,
                 ROUNDDOWN( $D9/H34 * H36, 0),
                 ROUNDDOWN( $D9/H34 * H35/100 * H36, 0)
            ))),
  )
```

- `$B$15` (縮小フル発動) は UI オプション。既定 FALSE
- 活動回数 `$D8/H34` は**小数を保持**（i7 と異なる）
- **先頭除外 (`notes_20` / `minCount`) を反映しない**

#### M6 — 縮小カバー率（表示兼計算用）

```text
M6 = IFERROR( SUM(H39:M39) / D9, )
```

- 分母 `D9` は**曲秒数そのまま**（i7 の `effectiveSeconds = songDuration − offsetSeconds` と異なる）
- **値は 100% を超えうる**。UI はそのまま `76.09%` や `153%` のように表示する
- 100% キャップは `M6 >= 1` 分岐として H40 内でのみ実現

#### BN22 / BN23 — 縮小スコアの基準スコア

```text
BN22 = IF(I6=TRUE, ROUNDDOWN( SUM(BI11:BN18) / 1.2, 0), BN21)
BN23 = IF(I6=TRUE, ROUNDDOWN( SUM(BI12:BN18) / 1.2, 0), SUM(BI12:BN18))
```

- **`BN22` はアシスト前相当の属性値スコア** — `I6=TRUE` (アシスト ON) のとき **`BN21 ÷ 1.2` を floor**
- `BN23` はさらに **行 11（`notes_20` ステージ相当）を除外** したもの
- `BN22` は `(BI11:BN18)` すべてを合算 / `BN23` は `(BI12:BN18)` = 行 11 を飛ばす

**`÷ 1.2` の意味**: アシストを「属性値段階で ×1.2」として適用しているため、アシスト前のスコア総和 ≒ `アシスト後 / 1.2`。per-note floor を全て通過させた後の近似なので、厳密には `assist_off ≠ assist_on / 1.2` の場合がある（1〜数十単位の誤差）。

#### H40 — カード i の縮小スキル寄与スコア

```text
H40 = IFERROR(
  IF(H31 = "判定領域縮小",
     IFS($M$6 >= 1,                                      // coverage ≥ 100% の場合
           IF($B$16 = TRUE,
                ROUNDDOWN($BN$23 * (H$39 / SUM($H$39:$M$39)) * (H$37-1), 0),  // β: 20ノーツ除外
                ROUNDDOWN($BN$22 * (H$39 / SUM($H$39:$M$39)) * (H$37-1), 0)), // 通常
         TRUE,                                           // coverage < 100% の場合
           ROUNDDOWN($BN$22 * H$39 / $D$9 * (H$37-1), 0)),
     ),
  )
```

- `H$37` = カード i の縮小倍率（`rate`、衣装データから `VLOOKUP`）
- `$B$16` = 「20ノーツ加算なし (β版)」チェックボックス。**coverage ≥ 100% 時のみ作用**
- **カバー率 100% 未満**: `BN22 × (H39 / D9) × (rate_i − 1)`
- **カバー率 100% 以上**: `BN22 × (H39 / Σseconds) × (rate_i − 1)` ← share は曲尺でなく総秒数で正規化 → 合計で `BN22 × (rate-1)` に収束（100% キャップ相当）

### 5-2. i7 の縮小スキル期待値（`calcExpectedScore`）

```typescript
// docs/shrink-skill-spec.md §4, §5-3 準拠
const assisted       = opts.scoreUpAssist;
const eligibleNotes  = notes.filter(n => !n.excluded);
const eligibleBase   = Σ calcNoteScore(getAppeal(team, n.attr, assisted), n);
const maxRate        = max(deck.cards.filter(c => c.skill?.isShrink).map(c => c.skill.rate));
const coverage       = calcShrinkCoverage(team, notesCount, 0, excludedCount);
// coverage.expectedCoverageRate = min(rawExpectedCoveredSeconds / effectiveSeconds, 1.0)
const shrinkExpected = floor(eligibleBase * (maxRate - 1.0) * coverage.expectedCoverageRate);
```

補助関数:

```typescript
// shrinkExclusion.ts — 先頭除外（docs/shrink-skill-spec.md §2）
minCount       = min(deck内縮小スキル count)
excludeHead    = max(notes_20.size, minCount)
eligibleCount  = notesCount - excludeHead
// 低倍率グループ (notes_20, light_2, ...) から累積して excludeHead 分除外

// calcShrinkCoverage — カバー率（docs/shrink-skill-spec.md §3 §4）
raw            = Σ_i floor(eligibleCount / count_i) × value_i × (per_i / 100)
effective      = songDuration − offsetSeconds   // offsetSeconds = excluded時間
expected       = min(raw / effective, 1.0)
```

### 5-3. 縮小スキル — 両者の完全な項目別対比

| # | 項目 | スプレッドシート v1.0.5 | i7 (`calcExpectedScore` / `shrinkExclusion`) |
| --- | --- | --- | --- |
| 1 | **基準スコア** | **アシスト無し相当** = `floor(BN21/1.2)` if assist ON (`BN22`) | **アシスト適用後** = `Σ calcNoteScore(getAppeal(team, attr, assisted), n)` |
| 2 | **先頭除外 (`notes_20` / `minCount`)** | 既定 **無し**（全ノートを基礎に含める）。β `$B$16` を ON にし、かつ coverage ≥ 100% の時に限り `BN23` (行 11=notes_20 除外) へ切替 | 常時 **有り**。`excludeHead = max(notes_20, minCount)` を累積で除外 |
| 3 | **活動回数の丸め** | `$D8/count` (小数のまま) × (per/100) × value → 最後に `ROUNDDOWN` | `floor(eligibleCount / count) × value × per/100` (先に floor) |
| 4 | **カバー率分母** | 曲秒数 `D9` そのまま（`M6 = Σsec / D9`） | `effectiveSeconds = D9 − offsetSeconds`（先頭除外時間を差し引く） |
| 5 | **カバー率の 100% キャップ** | `M6` 値は 100% 超を許容（表示用）。計算分岐は `$M$6 >= 1` で判定 | `expectedCoverageRate = min(raw/eff, 1.0)`（値の段階で clamp） |
| 6 | **rate の採用**（Lv 混在時） | **カード別 rate を seconds 比で加重平均**（各カード `H37 = VLOOKUP(... skillLevel × 4 + 19 ...)` → 個別利用） | **`maxRate = max(rate_i)`** を採用してデッキ全体に一律適用 |
| 7 | **複数スキルのキューイング** | 無し。期待秒数単純和。カバー率 > 100% は「share で按分」により 100% キャップ | 算術期待値は無し（maxRate × min(raw, 100%) で近似）。**MC はキューイング実装あり** (`activeShrink + shrinkQueue`、`docs/shrink-skill-spec.md §1-1`) |
| 8 | **アシストとの重ね** | 縮小スコアにアシストは**乗らない**（`BN22` がアシスト前基準のため） | 縮小スコアに**アシストが乗る**（`eligibleBase` が assisted base）|
| 9 | **バッジ適用** | `D24 = floor((属性値スコア + スキル + 縮小) × (1 + 16%))` | `finalScore = floor(liveEndScore × badgeMult) + broachScoreBonus` |
| 10 | **固定ブローチのスコア加算 (種類 9)** | 縮小とは別系統で `AR63/AR64/AR65` 経由で属性値 or スコアに加算 | `broachScoreBonus` として最終 `floor` 後に加算（バッジ適用後） |
| 11 | **UI オプション** | `$B$15` 縮小フル発動 / `$B$16` 20ノーツ加算なし(β) | MC `maxShrinkCoverage` オプション（縮小スキル限定・ロール強制成功、§5-5） |
| 12 | **確率的揺らぎの表現** | 無し（固定期待値のみ表示） | MC 試行 (`runSimulation`) で `mean / stddev / p90 / mcMin / mcMax` を提供 |

### 5-4. 数値検証: Binary Vampire + 既定デッキ

スプレッドシート側の表示値から逆算:

```text
D8 = 461 ノート / D9 = 92 秒
縮小カード: 2 枚（count=22, per=42%, value=4, rate=1.6 相当）
H39 = floor(461/22 × 42/100 × 4) = floor(35.21…) = 35 秒 (1 枚あたり)
M6   = (35 × 2) / 92           = 76.09%   ← 100% 未満
BN21 = 1,600,353 (assist ON なので assisted total)
BN22 = floor(1,600,353 / 1.2) = 1,333,627
H40  = floor(1,333,627 × 35/92 × 0.6) = floor(304,414.31) = 304,414
D22  = 2 × 304,414 = 608,828     ← CSV で確認
```

**i7 仕様 (`docs/shrink-skill-spec.md §2-3`) 相当で同じ条件を計算**:

```text
Binary Vampire: notes_count=461 / notes_20=20 / songDuration=92
minCount=22, excludeHead = max(20, 22) = 22, eligibleCount = 439
1 枚あたり numActivations = floor(439/22) = 19 回（スプレッドシート: 461/22 = 20.95 回 → 20 回相当）
rawExpectedCovered = 19 × 4 × 0.42 = 31.92 秒 / 枚 → 2 枚 = 63.84 秒
offsetSeconds = (20/461) × 92 ≈ 3.99 秒
effectiveSeconds = 92 − 3.99 ≈ 88.01
expectedCoverageRate = min(63.84/88.01, 1.0) = 0.7254
eligibleBaseAssisted ≒ BN21 − notes_20寄与 ≒ 1,600,353 − notes_20分
shrinkExpected = floor(eligibleBaseAssisted × 0.6 × 0.7254)
```

両者は次のように系統的に異なる:

| 指標 | スプレッドシート | i7（仕様通り） | 比率 |
| --- | ---: | ---: | ---: |
| カード別発動回数 | 20.95 (小数) | 19 (整数) | **+10.3%** |
| 1 枚あたり期待秒数 | 35 秒 | 31.92 秒 | **+9.7%** |
| カバー率分母 | 92 秒（全曲尺） | ≈88.01 秒（notes_20 除外） | **+4.5%** |
| カバー率（表示用） | 76.09% | ≈72.54% | **+4.9%** |
| 基準スコア | 1,333,627 (アシスト無し) | ≈ 1,600,353 − notes_20 分 (アシスト有り) | **−20%〜** |
| 最終縮小スコア | 608,828 | 推定 630,000〜660,000 程度（注） | **±3〜10%** |

注: i7 は (基準が高く ≒ +20%) × (カバー率が低く ≒ −5%) × (eligibleBase が notes_20 分小さく ≒ −5%) で、結果としてスプレッドシートと大きくは乖離しない — ただし個別の誤差源は打ち消し合って小さく見えるだけで、**デッキ構成次第で逆側に乖離する可能性がある**。

### 5-5. デッキ別に差が顕在化するケース

#### (a) Lv 混在デッキ（rate 1.2 + rate 1.6 の 2 枚）でカバー率が 100% を超える構成

- スプレッドシート: 秒数比で加重平均 → `BN22 × ((35/70 × 0.2) + (35/70 × 0.6)) = BN22 × 0.4`
- i7: `eligibleBase × (1.6 − 1) × 1.0 = eligibleBase × 0.6`
- **差分**: i7 の方が `BN22 × 0.2` ≒ 数十万点高い

#### (b) 先頭除外が大きく影響する短い曲 / count の大きいスキル

- `notes_20 = 21` が `notes_count = 300` の曲に対して 7% 占める楽曲では i7 の eligibleBase が大きく下がる
- スプレッドシートは先頭除外無しのため相対的に高評価

#### (c) アシスト ON / OFF 比較

- アシスト ON 時:
  - スプレッドシート: 属性値スコア ×1.2 相当だが、縮小スコアはアシスト前基準のまま
  - i7: 属性値スコアも縮小スコアも ×1.2 乗る
- アシスト OFF のとき両者ほぼ同等。アシスト ON で i7 > スプレッドシート

#### (d) 縮小フル発動前提の比較

- スプレッドシート: `$B$15 = TRUE` で `H39 = floor(D8/count × value)`（per を省く）
- i7: 同条件は `maxShrinkCoverage=true` を MC に渡すことで得る（`calcMaxScore` 経由の理論最大 + MC 分布）
- 両者で「縮小フル発動」の定義範囲が異なる（スプレッドシートは発動秒を max 化、i7 は per の確率を常に 1 として MC 試行）

---

## 6. 補足: スプレッドシート固有の設計判断

1. **活動回数を floor しない** (`D8/count` そのまま) → per-bucket 期待値計算に近い近似。i7 は `floor(eligibleCount/count)` で「発動に至らない端数」を切り捨て。
2. **カバー率分母が全曲尺** → notes_20 も縮小発動対象に含めてしまう（ゲーム内仕様では notes_20 区間に発動不可であることを考慮していない）。
3. **アシスト前基準で縮小を計算** → 「縮小は属性値段階ではなく素点段階の ×(rate-1)」という実装になっている。i7 仕様はアシスト後の素点に rate を乗じる。
4. **Lv 混在時のカード別 rate 加重平均** → 実ゲームのキューイング挙動（i7 仕様 §1-1）と異なる。実ゲームは「いずれか発動中なら最大 rate」であるため、i7 の `maxRate` 採用が近い。
5. **v1.0.5 の `BA11 = TRUE` リテラル残置** → Shout 白 notes_20 の per-note score が本来 `floor(Shout × 0.025)` のはずが `1` になっている可能性。該当楽曲では `BN21` 値に小さな誤差を与える（Shout 白ノートの数 × (真の per-note − 1) 分）。

---

## 7. 推奨される i7 側の再確認ポイント

以下は「スプレッドシートと合わせるべき差」ではなく、「スプレッドシートとの違いがユーザーから質問されたときに根拠を説明できるようにするためのチェックリスト」:

| 論点 | i7 の立場 | 根拠 |
| --- | --- | --- |
| 先頭除外は必要か？ | 必要 | `docs/shrink-skill-spec.md §2` / §1-2 — notes_20 では縮小スキルが物理的に発動できない |
| アシストは縮小にも乗るか？ | 乗る | `docs/shrink-skill-spec.md §1` — per-note `noteScoreAssisted × rate` |
| Lv 混在時は max か加重か？ | max | `docs/shrink-skill-spec.md §1` 「いずれか発動中」判定で `rate` 倍が上限 |
| カバー率分母は effectiveSeconds か全曲尺か？ | effectiveSeconds | `docs/shrink-skill-spec.md §3-1` — 先頭除外と整合 |
| 100% キャップは値側か分岐側か？ | 値側 clamp | `docs/shrink-skill-spec.md §4` / §5-3 — `min(..., 1.0)` |

**i7 の数式はゲーム仕様 + 縮小スキル仕様書に対して整合的**。スプレッドシートとの差異は「スプレッドシートが解析式の簡略近似を採っている」ことに起因するため、i7 側を仕様書準拠のまま維持するのが妥当。

---

## 8. 取得したスプレッドシート数式（補足・主要セルのみ）

playwright 経由で読み取った数式の代表例（UI の名前ボックスでセル移動 → 数式バーを読み取り）:

### 縮小関連（最重要）

| セル | 数式 |
| --- | --- |
| `M6` | `=IFERROR(SUM(H39:M39)/D9,)` |
| `BN22` | `=IF(I6=TRUE, ROUNDDOWN(SUM(BI11:BN18)/1.2,0), BN21)` |
| `BN23` | `=IF(I6=TRUE, ROUNDDOWN(SUM(BI12:BN18)/1.2,0), SUM(BI12:BN18))` |
| `H39` | `=IFERROR(IFS(H31="判定領域縮小", IFS(OR(H33="Perfect",H33="コンボ"), IF($B$15=TRUE, ROUNDDOWN($D8/H34*H36,0), ROUNDDOWN($D8/H34*H35/100*H36,0)), H33="タイマー", IF($B$15=TRUE, ROUNDDOWN($D9/H34*H36,0), ROUNDDOWN($D9/H34*H35/100*H36,0)))),)` |
| `H40` | `=IFERROR(IF(H31="判定領域縮小", IFS($M$6>=1, IF($B$16=TRUE, ROUNDDOWN($BN$23*(H$39/SUM($H$39:$M$39))*(H$37-1),0), ROUNDDOWN($BN$22*(H$39/SUM($H$39:$M$39))*(H$37-1),0)), TRUE, ROUNDDOWN($BN$22*H$39/$D$9*(H$37-1),0)),),)` |
| `H37` | rate 参照、スキルレベル依存 `VLOOKUP(AM10, '衣装データ'!$B$2:$AR, 19 + 4×sp_time or skillLevel)` |

### 属性値スコア

| セル | 数式 |
| --- | --- |
| `BN21` | `=SUM(BI11:BN18)` |
| `AN72` | `=IF(I6=TRUE, ROUNDDOWN(AN71*1.2,0), AN71)` (Shout appeal) |
| `AN71` | `=IFERROR(ROUNDDOWN(AN69*(1+(IF($J20="Shout",0.1,0)+IF($M20="Shout",0.1,0))),0),)` |
| `AN69` | `=AN68+AR63` |
| `AN68` | `=AN67+AU26` |
| `AN67` | `=SUM(AM63:AQ63)` |

### 最終リザルト

| セル | 数式 |
| --- | --- |
| `D23` | `=SUM(D20,D21,D22)` |
| `D24` | `=IF(K6=TRUE, ROUNDDOWN(D23*(1+'設定'!$B$3),0), D23)` |
| `'設定'!B3` | `16%` (既定) |

### スコアアップスキル

| セル | 数式 |
| --- | --- |
| `H38` | `=ROUNDDOWN(IFS(H31="スコアアップ", IFS(OR(H33="Perfect",H33="コンボ"), $D8/H34 * IFS($B12=TRUE,1, $B13=TRUE,((H35+$C14)/100), TRUE,(H35/100)) * H36, H33="タイマー", $D9/H34 * …)))` |

---

## 9. 追加調査課題（本レポートでは未対応）

- **`BA11 = TRUE` リテラル問題**: スプレッドシート v1.0.5 は Shout 白 per-note score のセルが `TRUE` になっている。Shout 白 notes_20 ノートのスコアが 1 に固定される不具合と推察。v1.0.6 等で修正される可能性あり — 再調査したときに修正状況を確認する。
- **スキル発動条件別のスプレッドシート対応範囲**: 「判定強化 (BAD→Perfect)」「判定ガード (MISS→Perfect)」が `H31` で分類のみされ、スコア計算に寄与しない動作は i7 と同じ。
- **共有ブローチ UR 枠のサブ限定ルール**: `AN$42="メイン" AND AN$50="メイン"` の排除はスプレッドシート側にあるが、`ブローチ登録` シート上のメイン/サブ区分がユーザー入力（= 画面 UI 側でガードされていない）。i7 は `validateSharedBroachs` で UR カードのみ 2 枠化し、固有ブローチ付きは 1 枠に削る。差異の詳細は別レポートに委譲。
- **ラビットノート加算ロジック**: スプレッドシートは「キャラごとの bonus × `COUNTIF >= 1` フラグ」でデッキ全体に 1 回ずつ加算する方式 (`SUMIF(AX10:AX25, ">=1", AU10:AU25)`)。i7 は `src/lib/data/rabbitNote.ts` 経由でカード単位に加算する。キャラ重複デッキでの差異が未検証。
