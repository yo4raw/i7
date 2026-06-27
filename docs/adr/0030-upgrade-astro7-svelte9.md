# 0030: astro 7 / @astrojs/svelte 9 へのメジャーアップグレードと CSS 圧縮の Vite 一本化

- 日付: 2026-06-27
- ステータス: 承認

## 背景

dependabot が以下のメジャーアップデート PR を提出した。

- `astro` 6.4.8 → 7.0.x（#353）
- `@astrojs/svelte` 8.1.2 → 9.0.0（#357）

両者はピア依存で相互ロックしている（`@astrojs/svelte` 8 は `astro ^6` を要求、`astro` 7 は `@astrojs/svelte ^9` を要求）ため、片方だけでは `ERESOLVE` で CI が失敗する。まとめて1つのアップグレードとして対応する必要があった。

なお、同時に提出されたパッチ更新（svelte 5.56.4 / @playwright/test 1.61.1 / sharp 0.35.2）は CI グリーンのため先行マージ済み。

## 決定

astro 7 と @astrojs/svelte 9 を同時に導入する。あわせて以下を変更する。

- **`overrides.vite` を `^7` → `^8`**: astro 7 は `vite ^8.0.13` を要求するため、既存の vite 固定 override（astro 6 時代に追加）を更新する。
- **`@playform/compress` の CSS 圧縮を無効化（`compress({ CSS: false })`）し、CSS の minify を Vite 内蔵 `cssMinify` に一本化する。**

### CSS 圧縮を Vite に一本化する理由

astro 7 / vite 8 では Tailwind CSS v4 がレスポンシブ variant を **モダンなレンジ構文** `@media (width >= 48rem)` で出力する（vite 7 時代は `@media (min-width: 48rem)` だった）。`@playform/compress` 0.2.3 の CSS パーサはこのレンジ構文を解釈できず、該当する `@media` ブロックを**警告なく丸ごと削除**する。結果として `md:` / `lg:` などレスポンシブユーティリティが最終 CSS から全消失し、PC でもヘッダーがモバイル表示に固定されるなど全ページのレイアウトが崩壊していた（型チェック・ビルド・単体テストはいずれも通過し、E2E と実ブラウザ表示でのみ顕在化）。

Vite 内蔵の CSS minifier は同構文を正しく保持する。`@playform/compress` の CSS 圧縮を切っても最終 CSS サイズの増加はごく僅か（実測 44KB→47KB、gzip 前）で、HTML / JS / SVG / 画像の圧縮は従来どおり維持されるため、CSS のみ Vite に委譲する。

## 検討した代替案

- **メジャー更新を見送る** — astro 6 を維持。astro 7 は新しく Tailwind v4 + vite 8 との非互換が残るため当初候補だったが、原因が `@playform/compress` の CSS 圧縮に特定でき、CSS 圧縮の無効化のみで解消したため採用しない。
- **`@theme` でブレークポイントを明示再宣言する** — レスポンシブ variant 消失の回避策として試したが、原因は variant 生成ではなく圧縮段階での削除だったため無効。不採用。
- **Vite の `cssMinify` を無効化する** — 切り分けには使ったが、CSS が無圧縮になりサイズが増えるため恒久策としては不採用。圧縮は Vite に残し `@playform/compress` 側のみ切る。

## 影響

- astro 7 では `astro dev` がデーモン化される（`astro dev stop` で停止）。dev サーバ起動・E2E の運用手順に影響する。
- 既存の `tests/max-score-finder.test.ts` が ADR 0029（過去ハイスコアイベント選択）の UI 変更に追随しておらず失敗していたため、本対応にあわせて「対象イベント」セレクタを明示操作する形に更新した（本アップグレードとは独立の既存不具合の修正）。
