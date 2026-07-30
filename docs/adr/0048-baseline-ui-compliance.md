# 0048. Baseline UI 規約への準拠（z-index スケール・セーフエリア・ネイティブダイアログ全廃）

- ステータス: 承認
- 日付: 2026-07-30

## 背景

`src/` 配下の UI コード全 62 ファイル（Astro 22 / Svelte 40 / CSS 1）を Baseline UI 規約（AI 生成 UI の劣化を防ぐための実装規約）に照らして走査し、17 件の違反を検出した。

ADR 0046（マテリアル 3 層・モーション方針）と ADR 0047（3 チャンネル配色）で基盤は整備済みだったが、以下 3 系統の逸脱が残っていた。

1. **トークンを使わず値を直書きしている箇所** — 任意値の影 `shadow-[0_-4px_12px_...]`、スケール外の角丸、`z-40` / `z-50` の直書き
2. **合成できないプロパティをアニメーションしている箇所** — 進捗バーの `width` トランジション、全画面 `backdrop-filter` の opacity フェード、`transition-all`
3. **ネイティブ `alert()` / `confirm()` / `prompt()`** — 計 18 箇所

## 決定

### 1. z-index スケールを単一情報源として定義する

`src/styles/global.css` の `:root` に 3 段のみ定義し、利用側は Tailwind v4 の custom-property 形式 `z-(--z-chrome)` で参照する。生の `z-50` や arbitrary な `z-[60]` は使わない。

| トークン | 値 | 用途 |
|---|---|---|
| `--z-panel` | 40 | 画面下端に固定するパネル（衣装比較の詳細パネル等） |
| `--z-chrome` | 50 | sticky なヘッダー等の構造クローム |
| `--z-overlay` | 60 | モーダル・ダイアログ・トースト |

**なぜ**: 変更前はヘッダーとモーダルがどちらも `z-50` で、重なり順が DOM 出現順に暗黙依存していた。新しいオーバーレイを足すたびに壊れうる。

### 2. 下部セーフエリア対応をユーティリティに集約する

`@utility pb-safe`（`padding-bottom: env(safe-area-inset-bottom)`）と `@utility bottom-safe`（`bottom: max(1rem, env(safe-area-inset-bottom))`）を定義し、利用側に `env()` を散らさない。ADR 0046 の「フォールバックは定義側に集約する」方針を踏襲する。

### 3. アニメーションは合成プロパティのみに限定する

- 進捗バーは `width` ではなく `transform: scaleX()` + `origin-left` を動かす（レイアウト再計算を起こさない）
- モーダルのスクリムから `backdrop-blur-sm` を外す。全画面の `backdrop-filter` を opacity フェードさせると合成コストが跳ね上がる。パネル側の `materialIn` / `materialOut` は維持する
- `transition-all` は使わない（対象を明示する）
- 「実施中」バッジの `animate-pulse` を削除する。明示的に要求されていないアニメーションであり、かつオフスクリーンでも再生され続けていた。実施中の強調は赤バッジと「残り N 時間」テキストで足りる

### 4. ネイティブダイアログを全廃し、自前のダイアログとインライン表示へ置き換える

新規コンポーネント 2 つを `src/components/ui/` に追加した。

- **`ModalDialog.svelte`** — `confirm(options): Promise<boolean>` と `prompt(options): Promise<string | null>` を公開する。`role="alertdialog"`（`danger: true` 時）/ `role="dialog"`、`aria-modal`、`aria-labelledby` / `aria-describedby`、Esc で cancel、Tab をパネル内に閉じ込める、破壊的操作では初期フォーカスをキャンセル側に置く、閉じたらトリガー要素へフォーカスを戻す
- **`InlineAlert.svelte`** — 操作したボタンの近くに出すエラー / 完了表示。`role="alert"` / `role="status"`

置き換え対象は `confirm()` 5 箇所・`alert()` 10 箇所・`prompt()` 3 箇所。

**なぜ**:
- ブラウザモーダルはページの JS 実行をブロックし、Playwright / MCP によるブラウザ自動化を停止させる
- `alert()` はどの操作に対する結果なのかを伝えられない（Baseline UI「エラーは操作箇所の近くに出す」）

## 検討した代替案

### アクセシブルなコンポーネントプリミティブ（Base UI / React Aria / Radix）を導入する

Baseline UI は「キーボード／フォーカス挙動を手書きで再実装しない」「アクセシブルなプリミティブを使う」と定めており、本来はこちらが正道。

**採用しなかった理由**: 挙げられているプリミティブはいずれも React 向けで、本リポジトリは Astro + Svelte 構成。加えて ADR 0046 で「モーションのために新規依存を増やさない」方針を確立しており、ダイアログ 1 種のために依存を追加する判断とは整合しない。

**トレードオフ**: フォーカストラップ・Esc・フォーカス復帰を自前で実装した。ライブラリが吸収してくれるエッジケース（`inert` による背景要素の無効化、iOS のスクロールロック等）は未対応。代わりに ARIA 属性・Esc・Tab トラップ・フォーカス復帰を実測で検証し、E2E テストで確認している。

### ネイティブ `confirm()` を残し `alert()` のみインライン化する

差分は小さいが、`confirm()` もブラウザ自動化を止めるため自動化の問題は解決しない。ユーザー確認のうえ両方を置き換えた。

### `animate-pulse` を IntersectionObserver でオフスクリーン停止する

見た目を維持できるが、バッジ 1 個ごとに observer が増える（イベント一覧では 170 個超）。そもそも明示要求のないアニメーションなので削除を選んだ。

## 適用範囲外（意図的に維持する）

| 項目 | 理由 |
|---|---|
| `text-display` の正トラッキング | ADR 0046 が CJK 見出し向けに明示採用済み。Baseline の「tracking を変えない」より本プロジェクトの決定が優先 |
| `material-chrome` / `material-overlay` の `backdrop-filter` | chrome の小領域限定で、リスト行・タイルには未使用。ADR 0046 準拠 |
| レアリティ／特効段階／計算段階／フレンド枠 amber／免責 yellow の配色 | ADR 0047 の「3 チャンネル規約の対象外」に明記済み |
| `CardList` のスピナー式ローディング | Baseline は構造スケルトンを SHOULD とするが、無限スクロールの sentinel にスケルトンは不適 |
| `animate-spin` | ローディング中のみ DOM に存在し、常時再生ではない |
| `CardPickerModal` のフォーカストラップ不足 | `ModalDialog` と同じ土台へ載せ替える余地があるが、本 ADR の対象外とした（別途対応） |
