# 所持コレクションダッシュボード 設計

- 日付: 2026-06-16
- 関連 ADR: [0022](../../adr/0022-collection-dashboard.md)

## 目的

所持衣装ページに収集状況を可視化するダッシュボードを追加し、UR 収集率・レアリティ別・キャラ別・属性別の進捗を一目で把握できるようにする。

## コンポーネント

`src/components/CollectionDashboard.svelte`（`/mycard/` 上部に `client:load` で配置）。

- Props: `cards: Card[]`（全カード）
- データ: `cardCounts` ストアの `allCounts()` / `totalOwned()` を参照。所持 = 枚数 > 0（種類ベース）
- 純粋ヘルパー `rate(pool)` で `{ owned, total, pct }` を算出（0除算ガード）

### 表示セクション

1. **総括**: UR 収集率（所持/全UR）・全レアリティ収集率・所持種類・合計枚数の4カード
2. **レアリティ別収集率**: `RARITIES`（UR/SSR/SR/R/N）ごとに所持種類/全種類のバー
3. **キャラクター別 UR 収集率**: `CHARACTER_GROUPS` ごとにグループ集計＋各メンバーの所持/全 UR バー
4. **所持衣装の属性バランス**: Shout/Beat/Melody の所持種類を `attrDonutSvg` でドーナツ表示

## 設計判断

- 種類ベース集計（重複所持は「収集率」に含めない）。合計枚数のみ別表示
- 新ページではなく所持衣装ページのセクションとして配置
- 新規チャート依存は導入せず Tailwind バー＋既存 `donutChart` を流用
- ライトテーマ固定（`dark:` 不使用）

## 検証結果

- `astro check` 0 errors
- dev サーバーで仮所持データを投入し、4セクションすべてが正しい数値（UR 0/749、全 59/2765 等）・属性ドーナツ描画を `evaluate_script` で確認
- `tests/mycard.test.ts` は旧ベースパス前提で testIgnore 済みのため E2E 対象外
