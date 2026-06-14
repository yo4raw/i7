# スコア計算画面に共通ブローチ スコア寄与 TOP10 を表示

## 背景・目的

ADR 0010 で楽曲詳細ページに追加した「共通ブローチ スコア寄与 TOP10」を、スコア計算画面（`score-calc`）でも楽曲選択時に表示したい。スコア計算中にどの共通ブローチがその楽曲で効くかを、画面遷移せず確認できるようにする。

## スコープ

- スコア計算画面（`ScoreCalc.svelte`）で、楽曲を選択したらブローチランキングを折りたたみセクションで表示する。
- 寄与計算は既存の純粋関数 `buildBroachRanking`（`src/lib/score/songBroachRanking.ts`、単体テスト済み）をそのまま再利用する。新規の計算ロジックは追加しない。
- 楽曲詳細ページ（`songs/[id].astro`）に現在インライン展開しているバーチャートのマークアップを共有コンポーネントに切り出し、両画面で再利用する（DRY）。

## 設計

### コンポーネント抽出（DRY）

現在 `songs/[id].astro` にインライン展開しているランキングのバーチャート（順位・ブローチ名・CSS幅バー・スコア値）を、再利用可能な Svelte コンポーネント **`src/components/score/BroachRankingChart.svelte`** に切り出す。

- props: `{ ranking: BroachRankingEntry[] }`（`BroachRankingEntry` は `src/lib/score/songBroachRanking.ts` の既存型）。
- 描画内容は現状の楽曲詳細のバーチャートと同一（バー色マップ `Shout=bg-red-500 / Beat=bg-green-500 / Melody=bg-blue-500 / All=bg-indigo-500`、最大値を 100% に正規化、スコア値併記）。
- 自身の最大値は `ranking[0].score`（降順前提）。`ranking` が空のときは何も描画しない（呼び出し側でも空チェックするが二重に安全）。

### 利用箇所

1. **`src/components/score/BroachRankingChart.svelte`（新規）** — バーチャート描画の単一責務。
2. **`src/pages/songs/[id].astro`（変更）** — インラインのバーチャート `<ol>...</ol>` を `<BroachRankingChart ranking={broachRanking} />` 呼び出しに置換する。`client:` 指定を付けない（Astro がビルド時に静的 HTML へ描画、ハイドレーションなし）。セクションの外枠（`<section>` カード・見出し・キャプション・`broachRanking.length > 0` ガード）は Astro 側に残す。表示は現状と不変。
3. **`src/components/ScoreCalc.svelte`（変更）** — `selectedSong` からランキングを `$derived` で算出し、楽曲サマリーバー直下に折りたたみセクションを追加する。

### ScoreCalc.svelte の変更詳細

- import: `buildBroachRanking`（`../lib/score/songBroachRanking`）と `BroachRankingChart`（`./score/BroachRankingChart.svelte`）。
- 算出: `const broachRanking = $derived(selectedSong ? buildBroachRanking(selectedSong) : []);`（楽曲切替で自動再計算。23ブローチ×48組で軽量）。
- 表示: 楽曲サマリーバー `<section>` の直後に、既存「スキルオプション」と同じ `<details class="... group" open>` + `<summary>`（▼アイコン `group-open:rotate-180`）パターンで折りたたみセクションを追加する。
  - 見出し: 「🏅 共通ブローチ スコア寄与 TOP10」。
  - 中身: キャプション（デッキ非依存の目安）+ `<BroachRankingChart ranking={broachRanking} />`。
  - 楽曲未選択またはランキング空のときはセクションを描画しない（`{#if selectedSong && broachRanking.length > 0}` で `<details>` ごとガード）。
- E2E 用に `<details>` に `id="broach-ranking-section"` を付与する。

### データ流れ

`selectedSong`（既存 reactive state）→ `$derived` `buildBroachRanking(selectedSong)` → `BroachRankingChart`。楽曲を切り替えるたびにリアクティブに再計算・再描画される。新規フェッチなし。

### エラー・欠損ハンドリング

- 楽曲未選択時・ランキング空（ノーツ無し楽曲）時はセクション非表示。
- バー幅の 0 除算は `ranking[0].score`（空配列は描画されないため発生しない）+ コンポーネント側の `> 0` ガードで回避。

## テスト

- 単体: `buildBroachRanking` は既存テストで担保済み。`BroachRankingChart` は純粋な描画コンポーネントのため単体テストは追加しない。
- E2E（`tests/score-calc.test.ts` に追記）: スコア計算画面で楽曲を選択すると `#broach-ranking-section` が表示され、TOP の行（1 位）とスコア値が出ることを検証する。score-calc の E2E は `playwright.config.ts` の `testIgnore` 対象外で、`BASE=''` のため dev サーバー再利用で実行できる。
- 目視（dev サーバー）: 楽曲選択でランキングが表示・切替で再計算されること、および楽曲詳細ページの表示が抽出後も不変であることを確認（制御側で実施）。

## 用語・命名

- ユーザー可視テキストは「共通ブローチ」「スコア寄与」、属性名 Shout/Beat/Melody。
- 内部識別子は `broach` / `song` を引き続き使用する。

## ADR

新規 ADR は立てず、既存 **`docs/adr/0010-song-broach-score-ranking.md`** に「スコア計算画面でも楽曲選択時に表示する」「バーチャートを `BroachRankingChart.svelte` に共有コンポーネント化し、楽曲詳細は静的描画のまま流用する」を追記する（同一意思決定の延長のため）。
