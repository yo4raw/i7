# イベント詳細ページの衣装スキル表示

## 背景・目的

イベント詳細ページ（`events/[id].astro` → `EventBonusCardGrid.svelte`）は、特効衣装をサムネ・レアリティ・属性・名前・所持数で一覧表示している。しかし各衣装の **スコアスキルが分からない** ため、どの特効衣装が編成上重要か（特に判定縮小スキル持ち）をこのページ単体で判断できない。

ユーザーは、イベント詳細ページで各特効衣装のスキルが分かること、そして **縮小スキル持ちが目立つこと** を求めている。

## スコープ

- 対象: イベント詳細ページの特効衣装グリッド（金・銀・銅すべて）
- 変更ファイルは 2 つのみ:
  - `src/pages/events/[id].astro`（props にスキルフィールドを追加）
  - `src/components/EventBonusCardGrid.svelte`（スキル行と縮小強調を追加）
- 新規データフェッチは行わない。ビルド時に既に取得済みの `Card` からスキルフィールドを渡すだけの純粋な表示拡張。

## 設計

### データの受け渡し（`events/[id].astro`）

`getStaticPaths` の `pick()` が返す `Card` には `ap_skill_type` / `ap_skill_req` が含まれている。`EventBonusCardGrid` へ渡す card オブジェクトのマッピングにこの 2 フィールドを追加する。

### グリッド表示（`EventBonusCardGrid.svelte`）

`EventBonusCardItem` 型に `apSkillType: string | null` / `apSkillReq: string | null` を追加し、各カードセルにスキル行を追加する。

- 既存の `formatSkillBadge(apSkillType)`（`src/lib/score/skillFormatter.ts`）で `{ label, isShrink }` を取得する。スキル整形ロジックは新規に書かず既存関数を再利用する。
- **スキルバッジ**: 縮小は `bg-pink-500 text-white`、それ以外は `bg-gray-50 dark:bg-slate-700 text-gray-800 dark:text-slate-100`。SNS 共有パネル（`EventSharePanel.astro`）と同一配色で一貫させる。
- **発動条件**: `apSkillReq`（例「コンボ」「Perfect」「タイマー」）をバッジに併記する。未設定時は省略。
- **縮小持ちカードの枠強調**: `isShrink` の場合、セル全体の枠を `border-pink-400 ring-1 ring-pink-300 dark:border-pink-500 dark:ring-pink-500` にする。非縮小は現状どおり `border-gray-200 dark:border-slate-700`。

### データ流れ

ビルド時に `Card` から `ap_skill_type` / `ap_skill_req` を抽出 → props で grid へ → クライアントで Svelte が表示。GViz / CSV への追加フェッチは発生しない。

### エラー・欠損ハンドリング

スキル未設定（`ap_skill_type` が null）の場合、`formatSkillBadge` が `{ label: '-', isShrink: false }` を返すため、ラベル「-」・非強調で表示される。既存ロジックでカバー済みのため特別な分岐は追加しない。

## テスト

- E2E: `tests/event-detail.test.ts` に、特効衣装グリッドにスキルバッジが表示されること、および縮小持ち衣装がピンク強調（バッジ色・枠）されることのアサーションを追加する。
- 単体: スキル整形は既存の `formatSkillBadge` を再利用するため新規の単体テストは不要。必要に応じて `tests/unit/` の既存カバレッジに委ねる。

## 用語・命名

- ユーザー可視テキストは「衣装」を用いる（バッジラベルはスキル名なので対象外）。
- 内部識別子は `card` / `apSkill*` を用いる。

## ADR

本変更は表示仕様の追加であり、配色・強調方針（縮小ピンク強調、枠 ring）の意思決定を伴う。実装時に `docs/adr/0008-event-detail-card-skill.md` を追加し、`docs/adr/README.md` の一覧にも追記する。
