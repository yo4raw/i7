# イベント詳細ページ: 特効衣装の所持枚数編集 — 設計

日付: 2026-06-10
ステータス: 承認済み

## 目的

イベント詳細ページ（`/events/[id]/`）に表示される特効衣装（金/銀/銅）の所持枚数を、その場で編集できるようにする。所持枚数は所持衣装ページと同じ `i7_card_counts`（localStorage）を読み書きし、サイト全体で整合させる。

## 背景

- 現状のイベント詳細ページ（`src/pages/events/[id].astro`）は完全に静的な Astro 描画で、クライアント JS を持たない。特効衣装タイルは衣装詳細ページへの `<a>` リンク。
- 所持枚数編集の部品は既に存在する:
  - `src/lib/stores/cardCounts.svelte.ts` — `i7_card_counts` を読み書きする Svelte 5 runes ストア
  - `src/components/cards/CountInput.svelte` — `+ / − / 数値入力` のステッパー（所持衣装ページ・衣装一覧で使用中）
- 衣装一覧のタイル（`CardTileCard.svelte`）では、リンク領域とステッパーを分離する構成が確立している。

## 採用アプローチ

**特効 tier（金/銀/銅）ごとに 1 つの Svelte アイランド**を配置する（ページに 3 アイランド、`client:load`）。

検討した代替案:

- タイルごとに `CountInput` をアイランドとして埋め込む案 — 衣装数ぶん（数十個）のアイランドが生成されハイドレーション負荷が大きく、サマリー表示用に別アイランドも必要になるため不採用。
- 素の JS インラインスクリプト案 — ステッパーの見た目とロジックの複製が発生し、既存ストアとの一貫性が崩れるため不採用。

## コンポーネント設計

### 新規: `src/components/EventBonusCardGrid.svelte`

- **props**
  - `cards: EventBonusCardItem[]` — 必要最小フィールドのみの slim 型: `{ ID: number; cardname: string; name: string; attribute: string; rarity: string }`
  - `base: string` — `import.meta.env.BASE_URL`
- **描画内容**
  1. サマリー行: 「対象 N 枚 ・ 所持 M 枚」
     - N = `cards.length`（特効対象の衣装種類数）
     - **M = 対象衣装の所持枚数合計（同一衣装の重複所持を含む）。** `$derived` で `cardCounts` ストアに即時連動。
  2. 衣装タイルグリッド（現行の grid レイアウト・見た目を踏襲）
     - 画像 + テキスト（レアリティ/属性バッジ・衣装名・キャラ名）部分は `<a href="{base}cards/{ID}/">` のまま維持
     - その下に「所持 [−][数値][+]」行を **リンクの外** に追加（`CountInput.svelte` を流用）
- 衣装が 0 枚の tier は「対象衣装なし」を表示（現行挙動を維持）。
- ダークモード: 新規マークアップには `dark:` バリアントを必ずペアで指定する。
- SSR: Svelte アイランドはビルド時に SSR されるため、衣装名等の静的 HTML（SEO）は維持される。SSR 時の所持数は 0 で描画され、ハイドレーション時に localStorage の値へ更新される（所持衣装ページと同じ挙動）。

### 変更: `src/pages/events/[id].astro`

- 各 tier セクション内の「対象 N 枚」表記とタイルグリッドを `<EventBonusCardGrid client:load>` に置き換える。
- `getStaticPaths()` で組み立てる props を slim 型の配列に変換して渡す（フルの `Card` を HTML に直列化しない）。
- セクションラッパー（バッジ・効果サマリー・銅特効の対象メンバー表記）は Astro 側に残す。
- ついで修正: セクションの `bg-white` にダークバリアントが欠けているため `dark:bg-slate-800` を追加する。

## データフロー

```
CountInput (+/−/入力)
  → cardCounts ストア (setCount / deltaCount)
  → localStorage i7_card_counts
  → 同ページ内の全 CountInput / サマリーが $derived で即時更新
```

- `i7_card_counts` は既存キーのため、`STORAGE_KEYS` への追記やバックアップ（FooterTools）対応は不要。
- 所持衣装ページ等の他ページとは localStorage 経由で整合する（ページ間のリアルタイム同期はスコープ外）。

## エラーハンドリング / エッジケース

- 数値入力は `CountInput` 既存仕様に従う（負数・非数は 0 に丸め、0 はストアからキー削除）。
- イベント CSV にあるがカードマスターに存在しない ID は `getStaticPaths()` で既にフィルタ済み。

## テスト

- Playwright E2E `tests/event-detail.test.ts` を新規追加:
  1. イベント詳細ページを開く
  2. 特効衣装タイルのステッパーで +1 → 入力値と「所持 M 枚」サマリーが更新されること
  3. `localStorage.i7_card_counts` に反映されること
  4. ステッパー操作で衣装詳細ページへ遷移しないこと
- 単体テスト追加は不要（新規ロジックはサマリー集計のみで、ストアは既存実装を流用）。
- 日常検証は `npm run dev`（HMR）+ スクリーンショットで実施。E2E 実行時のみ preview ビルドが走る。

## スコープ外

- イベント一覧ページ（`/events/`）での枚数編集
- 特効ボーナス値の試算（所持枚数 × ボーナス%の合計表示など）
- タブ/ページ間のリアルタイム同期
