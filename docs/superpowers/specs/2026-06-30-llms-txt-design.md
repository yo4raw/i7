# llms.txt 作成 設計メモ

- 日付: 2026-06-30

## 目的

LLM／AI エージェント向けに、サイトの概要と主要ページを簡潔にまとめた [llms.txt 標準](https://llmstxt.org/) のファイルをルートで配信する。

## 決定事項

- **配置**: `public/llms.txt`（手書きの静的ファイル）。ビルド時に `dist/llms.txt` へコピーされ `https://i7.yo4raw.com/llms.txt` で配信。
- **言語**: 日本語。説明文は `PAGE_DESCRIPTIONS`（`src/lib/seo.ts`）の文言を流用。
- **形式**: H1 タイトル → blockquote 要約 → 補足箇条書き → H2 リンクセクション。
- **セクション**: データベース / プレイヤー向けツール / サイト情報 / Optional（サイトマップ）。
- 2700 件超の詳細ページは個別列挙せず、一覧ページ＋サイトマップへ集約。

詳細な意思決定の記録は [ADR 0034](../../adr/0034-llms-txt.md) を参照。

## 検証

- `npm run dev` で `http://localhost:4321/llms.txt` が `text/plain` で配信されること。
- 本番ビルドで `dist/llms.txt` が生成されること。

## 影響範囲

- 追加: `public/llms.txt`, `docs/adr/0034-llms-txt.md`（README 追記）
- robots.txt / `_headers` の変更は不要。
