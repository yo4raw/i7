# ダークモード完全除去 — 段階2

- 日付: 2026-06-15
- ステータス: ユーザー承認済み
- 関連: [ADR 0020](../../adr/0020-abolish-dark-mode.md)、段階1「無効化（ライト固定）」

## 背景

[ADR 0020](../../adr/0020-abolish-dark-mode.md) のダークモード廃止のうち、段階1（無効化＝`.dark` を付与しない）はリリース済み（v1.31.0）。段階2では残存する死にコードを完全に除去し、ライト一本化を確定する。

## 決定

ダークモード関連コードを src/ から完全に削除する。チャートの配色は `var(--chart-*)` 参照を維持し、`:root` のライト値のみを残すことで変更なく動作を継続させる。

### 変更点

1. **`dark:` クラスの一括削除（約 638 箇所 / 約45ファイル）**
   - 使い捨ての Node スクリプトで、各ソースファイルの class 属性内に出現する `dark:…` ユーティリティトークンのみを正規表現で除去する（トークン規則: `dark:` に続く非空白・非引用符の連続。先頭の余分なスペースも詰める）
   - 実行後に `grep -rc "dark:" src/` が 0 であることを検証し、スクリプトは削除する（ワークスペース衛生）
2. **`src/styles/global.css`**
   - `@custom-variant dark (...)` を削除
   - `@layer base` 内の `html.dark { ... }`（チャート dark 変数を含む）と `html.dark body { ... }` を削除
   - `:root` のライト用チャート変数（`--chart-grid` 等）と `html { @apply text-gray-900 bg-gray-50; }` は維持
3. **`src/lib/storage.ts`**
   - `STORAGE_KEYS.THEME_MODE`（`i7_theme_mode`）を削除。他に参照は無い
4. **`src/components/EventShareImage.svelte`**
   - `document.documentElement.classList.contains('dark')` による背景色分岐を削除し、背景を `#ffffff` 固定にする
   - ボタンの `dark:` クラスは 1 の一括削除対象
5. **`scripts/apply-dark-variants.mjs`** を削除（ダーク variant 一括付与用の補助スクリプトで、不要になる）
6. **`CLAUDE.md`**
   - 「Styling」節のダークテーマ運用に関する記述、`scripts/apply-dark-variants.mjs` への言及、`STORAGE_KEYS.THEME_MODE` の行など、ダークモード関連の記述を削除・整理する

## 検証

- `grep -rc "dark:" src/` が 0
- `grep -rn "html.dark\|custom-variant\|THEME_MODE\|classList.*dark" src/` が 0
- `astro check` 0 errors
- `npm run test:unit`（ロジックは無影響だが回帰確認）
- 主要 E2E（home / card-compare 等）
- dev でライト表示の目視（チャート＝スコア計算ヒストグラム・ドーナツ・スキル仕様図、各ページの崩れがないか）
- 本番ビルド

## リスクと対応

- 一括正規表現の取りこぼし・二重スペース → `grep` 0 件・`astro check`・ビルド・目視で担保。二重スペースは無害（必要なら手当て）
- チャート変数の参照（`donutChart.ts` / `histogram.ts` / `specDiagrams.ts` の `var(--chart-*)`）は**変更しない**。`:root` ライト値へ解決される

## 影響範囲外

- 機能ロジック・データ取得層
- チャート描画モジュールの `var(--chart-*)` 参照（据え置き）
