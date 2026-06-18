# デッキ編成画面: 各衣装のスキル上乗せ分布チャート

- 日付: 2026-06-18
- 関連 ADR: 0025（本 spec と同時に追加）
- 関連既存実装: [card-compare 分布](2026-06-18-card-compare-distribution-design.md) / `src/lib/score/cardDistribution.ts` / `src/lib/score/teamBuilder.ts`（`computeTeam`）

## 背景・目的

スコア計算（デッキ編成）画面（`src/pages/score-calc/index.astro` → `src/components/ScoreCalc.svelte`）には、各衣装の数値を並べた詳細テーブル（`CardDetailTable`）とモンテカルロのシミュレーション結果（`ScoreCalcResults`）がある。しかし「いま組んでいる編成で、各衣装のスキルがどれだけスコアを上乗せし、どれだけ上振れ/下振れし得るか」が一目で比較できない。

衣装比較画面（card-compare）には ADR 0024 で各衣装のスコア分布（二項分布の密度曲線）を導入済みだが、あちらは **デッキ非依存**（UR 限定・全ノーツ Perfect・センタースキル無視・固有ブローチ込みの単体前提）で計算している。本機能では **現在の編成（デッキ文脈）** に基づいて各衣装のスキル上乗せ分布を描き、シミュレーション結果の直前に置く。

## スコープ

- スコア計算画面の `CardDetailTable` と `ScoreCalcResults` の **間** に新セクションを追加する。
- 各衣装（埋まっているスロット最大 6 枚: センター + メンバー 4 + フレンド）について、ap_skill 発動による **上乗せ分の分布曲線** を重ね合わせ表示する。
- 凡例に各衣装の **実効属性値** と **チーム内貢献比率** を数値併記する。
- 状態の永続化はしない。ドラッグ操作・しきい値線・スライダーは持たない（静的表示）。

### 非スコープ

- card-compare 側の分布チャート（`DistributionChart.svelte` 等）は変更しない。
- 既存シミュレーション結果（`ScoreCalcResults`）・詳細テーブル（`CardDetailTable`）の表示内容は変更しない。
- ノーツ判定のばらつき（GOOD/BAD）はモデルに含めない（全ノーツ Perfect 前提。ap_skill 発動のみを確率変数とする）。

## モデル

### スキル上乗せ分の分布（曲線）

各衣装のスキル発動成功回数 `K` は二項分布 `K ~ Binomial(n, p)` に従う。

- `n` = 選択曲での最大発動回数。`Math.floor(発動機会 ÷ skill.count)`。発動機会は通常スキルはノーツ数、タイマー系は曲尺（`songDuration`）。**シミュレーションと同一のロジックを再利用する**（`src/lib/score/simulation.ts` の最大発動回数算出を共有関数として切り出して使う）。
- `p` = `skill.per / 100`。スキルレベル（`deckState.skillLevels[slotIndex]`）由来。
- `value` = `skill.value`。1 発動あたりの上乗せ（スコアアップ系はスコア、判定縮小系はカバー秒数）。スキルレベル由来でデッキ非依存。
- 分布点: `points[k] = { x: K × value, prob: pmf[k] }`（k = 0..n）。**0 起点**（チーム土台は曲線に含めない）。`pmf` は `src/lib/score/cardDistribution.ts` の `binomialPmf(n, p)` を再利用する。

センタースキル・ScoreUp アシスト・ScoreUp バッジは **属性値（スコア土台）への補正** であって、ap_skill の `per` / `value` / `count` には影響しない（`teamBuilder.parseSkill` はスキルレベルのみから決まる）。したがって曲線の形状はこれらの補正の影響を受けない。

### スキル区分とチャート分割

`classifyCard` 相当の判定で各衣装を `scoreUp` / `shrink` / `none` に分ける。

- `scoreUp`: スコアアップ系・タイマースコアアップ系。横軸 = 上乗せスコア。
- `shrink`: 判定縮小系。横軸 = カバー秒数。
- `none`: スキルなし・判定補助系（`MISS_TO_GOOD` / `BAD_TO_PERFECT`）。曲線は描かず、凡例に属性値・貢献比率のみ表示する（分散ゼロ）。

スコアアップ系と縮小系が **混在** する場合は単位が異なるため **2 チャートに分割**（スコア用・秒数用）。全員同区分なら単一チャート。

### 実効属性値と貢献比率（数値併記）

各衣装の **実効属性値** = 確定的に効く補正をすべて織り込んだ属性値合計。ap_skill 発動分（曲線）だけがばらつく前提での「土台」。**シミュレーションと同じ掛け方** で算出し、衣装ごとの合計がチームの実効属性値と整合するようにする。`computeTeam`（`teamBuilder.ts`）の中間結果を再利用する:

1. 特訓状態を反映した素ステータス（`computeTeam` 内の `baseShout/baseBeat/baseMelody`）。**特訓は常に反映**（特訓済み前提）。
2. 特効（イベントボーナス倍率 `bonusMult`）・ラビットノート加算込み（= `DeckCard.shout_max/beat_max/melody_max`）。
3. 自スロットのブローチ属性加算（`DeckCard.broachShout/broachBeat/broachMelody`。共通ブローチ含む。種類 9 スコアバッジは属性ではなくスコア直加算なので属性値には含めない）。
4. センタースキル分: `computeTeam` と同じく、対象属性（センター/フレンドの属性）に `floor(チーム合計 × centerRate/100)` を加算。**この分はセンターカード（およびフレンドカード）に計上**する。
5. ScoreUp アシスト・ScoreUp バッジ（種類 9）の属性値段階倍率: シミュレーションのスコア土台計算（`getAppeal` / `SCOREUP_ASSIST_RATE` / `scoreUpBadgeRate`）と同じ係数を各衣装の属性値に **一様乗算** する。

**貢献比率** = その衣装の実効属性値 ÷ デッキ全衣装の実効属性値合計（百分率）。全衣装の合計は 100%。

> 注: ScoreUp アシスト/バッジは全衣装に一様に掛かるため貢献比率（=比）は変えないが、表示する実効属性値の絶対値をシミュレーションの土台と一致させるために乗算する。

## コンポーネント構成

### 1. `src/lib/score/deckSkillDistribution.ts`（新規・純粋関数）

デッキ入力（`computeTeam` と同じ材料: `deckState` の各配列 + 選択曲 + ブローチ等）を受け取り、埋まっている各スロットについて以下を持つエントリ配列を返す純粋関数を提供する。

```ts
interface DeckSkillDistEntry {
  slotIndex: number;            // 0=センター, 1-4=メンバー, 5=フレンド
  cardName: string;
  thumbUrl: string;
  color: string;                // 表示色（DISPLAY_ORDER 対応の固定6色）
  skillGroup: 'scoreUp' | 'shrink' | 'none';
  n: number;                    // 最大発動回数
  p: number;                    // 発動率 (0..1)
  value: number;                // 1発動あたり上乗せ（score or 秒）
  points: { x: number; prob: number }[]; // x=K×value, 総和1
  effectiveAppeal: number;      // 実効属性値合計
  contribRatio: number;         // 0..1（chart 描画側で % 表示）
}
```

- `binomialPmf` は `cardDistribution.ts` から import して再利用する。
- `n` 算出と実効属性値算出は `teamBuilder.ts` / `simulation.ts` の既存ロジックを再利用（必要なら共有関数として小さく切り出す）。新たな計算式を二重定義しない。
- 表示順は `deckState.ts` の `DISPLAY_ORDER` に従う。

### 2. `src/components/score/DeckSkillDistribution.svelte`（新規・静的描画）

- props: `deckState` / `selectedSong` / `allBroachs` / `scoreUpAssist` / `scoreUpBadgeRate`（`ScoreCalc.svelte` が既に保持しているもの）。
- `deckSkillDistribution.ts` でエントリを算出し、`scoreUp` / `shrink` の有無に応じて 1〜2 個の密度曲線チャートを SVG で描画する。
- 横軸は 0 起点。各チャートの横軸ドメインはその区分の全エントリの最大 `x` を上限に共有スケール。
- 凡例: 各衣装行に「色■ + サムネ/衣装名 + 実効属性値 + 貢献 XX%」。`none` の衣装も凡例に出す（曲線なし）。
- 静的表示。`DistributionChart.svelte` の低レベル SVG 描画でそのまま流用できるヘルパーがあれば最小限抽出してよいが、ドラッグ/絶対軸/4枚固定色などの差異が大きいため、基本は本コンポーネントに自前実装する。

### 3. `src/components/ScoreCalc.svelte`（編集）

- `CardDetailTable`（既存 383 行付近）と `ScoreCalcResults`（385 行付近）の **間** に `DeckSkillDistribution` を新セクション（`<section class="bg-white rounded-lg shadow ...">`）として差し込む。

## エラー処理・エッジケース

- デッキが空（埋まっているスロット 0）または選択曲なし → セクションを描画しない（`CardDetailTable` と同じガード）。
- `none` の衣装のみ（誰もスコア寄与スキルを持たない）→ 曲線チャートは出さず、凡例（属性値・貢献比率）のみ表示。
- `n = 0`（選択曲でそのスキルが一度も発動機会を持たない）→ 分散ゼロ。`x=0` の 1 点スパイク扱い。
- 実効属性値合計が 0（理論上ありえないが防御的に）→ 貢献比率は 0% 表示。

## テスト

### 単体（Vitest）: `tests/unit/score/deckSkillDistribution.test.ts`

- 各エントリの `points` の `prob` 総和が 1（誤差許容）。
- 全エントリの `contribRatio` の総和が 1（誤差許容）。
- スコアアップ系・縮小系混在のデッキで `skillGroup` が正しく分かれる。
- スキルなし/判定補助系の衣装が `none` になり曲線点が単一スパイクになる。
- 実効属性値が `computeTeam` のチーム合計と整合する（センター計上・アシスト/バッジ乗算込み）。

### 表示確認（Playwright, dev サーバー再利用）

- `npm run dev` 起動後、スコア計算画面でデッキを組み、新セクションが詳細テーブルとシミュ結果の間に表示されることをスクリーンショットで確認。

## 検討した代替案

- **card-compare の `DistributionChart.svelte` を改造して共用** — ドラッグ前提・絶対スコア軸・最大 4 枚・固定 4 色という設計を、静的・0 起点・最大 6 枚・数値併記へ拡張すると分岐が増え、比較画面のリグレッションリスクが上がるため不採用。新規コンポーネントとして分離する。
- **横軸を絶対スコア（チーム土台込み）にする** — 比較画面と見た目を揃えられるが、デッキでは土台がチーム共通の大きな値になり全曲線が右端に密集してスキルのばらつきが見えなくなるため不採用。0 起点の上乗せスコア軸を採用。
- **モンテカルロ結果からの分布抽出** — シミュレータと完全一致するが、各衣装への分解が煩雑で近似かつ低速。ap_skill 発動は単純な二項分布で厳密計算できるため解析計算を採用（ADR 0024 と同方針）。
- **貢献比率をドーナツ/積み上げバーで別チャート化** — 視覚的だが画面要素が増える。スコア計算画面は既に要素が多いため、分布チャート凡例への数値併記に留める。
