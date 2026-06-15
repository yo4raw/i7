# ダークモード無効化（ライト固定） — 段階1

- 日付: 2026-06-15
- ステータス: ユーザー承認済み
- 関連: 段階2「ダークモード完全除去」（後続の別 spec）

## 背景

ダークモードを廃止する。最終ゴールはコードからの完全除去（段階2）だが、まず段階1で確実にライト表示へ固定し、ユーザーへの影響を即座に止める。死にコードの掃除は段階2で行う。

## 決定

サイトが暗転する起点は `<html>` に付与される `.dark` クラスのみ。これを一切付与しないことで、全ての `dark:` バリアントを発火させず常にライト表示にする。

### 変更点

1. **`src/layouts/BaseLayout.astro`**
   - 初回ペイント前に `localStorage` の `i7_theme_mode` / `prefers-color-scheme` を見て `.dark` を付与する FOUC 防止インラインスクリプトを削除
   - `theme-color` メタをライト用1つ（`#4f46e5`）に集約（`prefers-color-scheme: dark` 用の `#0f172a` を削除）
2. **`src/components/FooterTools.svelte`**
   - 太陽/月のテーマ切替ボタンと `isDark` 状態、`STORAGE_KEYS.THEME_MODE` への読み書きを削除
   - エクスポート/インポートなど他のフッター機能は維持

### 触らない（段階2で対応）

- 各コンポーネント/ページの `dark:` Tailwind クラス（`.dark` が付かないため自然に無効化される）
- `src/styles/global.css` の `@custom-variant dark` / `html.dark` ルール / チャート用 CSS 変数のライト/ダーク切替
- `src/components/EventShareImage.svelte` の `classList.contains('dark')` 分岐（常に false となりライト背景）
- `src/lib/storage.ts` の `STORAGE_KEYS.THEME_MODE` 定義（書き込みは止まるが定義は残置）
- CLAUDE.md のダークモード関連記述

## 実装範囲

- `src/layouts/BaseLayout.astro` / `src/components/FooterTools.svelte` の編集
- ADR 追加（ダークモード廃止の意思決定。段階分けを明記）＋本 spec

## 検証

- dev でフッターのテーマ切替ボタンが消えていること、リロードしても `.dark` が付かずライト表示固定であることを確認
- 既存 E2E（home 等）・`astro check`・本番ビルド

## 影響範囲外

- スコア計算等の機能ロジック
- 段階2の完全除去作業
