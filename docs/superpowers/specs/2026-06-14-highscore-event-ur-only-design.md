# ハイスコアイベントは UR 衣装のみ表示

## 背景・目的

イベント詳細ページ（`events/[id].astro`）は特効衣装を金/銀/銅ティアごとに全レアリティ表示する。ハイスコアライブイベントでは UR 衣装のみが実質的に重要なため、UR 以外を非表示にして見やすくしたい。

## スコープ

- 変更は `src/pages/events/[id].astro`（+ 判定ヘルパーの切り出し先）に限定。
- 対象は `eventtype` が「ハイスコア」を含むイベント（現状の値は `ハイスコアライブイベント`）。
- 非ハイスコアイベントは従来どおり全レアリティ表示（挙動不変）。

## 設計

### 判定ヘルパー

`eventtype` が「ハイスコア」を含むかを判定する純粋関数を切り出す（表記揺れに備え完全一致ではなく `includes('ハイスコア')`）。配置先は `src/lib/data/eventBonusTiers.ts`（イベント関連の既存モジュール）に `export function isHighScoreEvent(eventtype: string | null | undefined): boolean` を追加する。

```ts
export function isHighScoreEvent(eventtype: string | null | undefined): boolean {
  return !!eventtype && eventtype.includes('ハイスコア');
}
```

### ビルド時フィルタ

`events/[id].astro` の `getStaticPaths` で、ハイスコアイベントのときだけ各ティア（gold/silver/bronze）の `pick()` 結果を `card.rarity === 'UR'` で絞り込む。

- これにより各 `EventBonusCardGrid` に渡るカードが UR のみになる。
- 所持枚数サマリー・OG description（`goldNames`）も自動的に UR のみを反映する（一貫）。
- 絞り込み結果が空のティアは既存の「対象衣装なし」表示になる。
- 非ハイスコアイベントではフィルタを適用しない。

### 注記表示

ハイスコアイベントのときだけ、イベント種別・期間の表示付近（特効セクションの前）に注記を表示する:

> ハイスコアライブイベントのため、UR 衣装のみ表示しています。

- `event.comment` 表示と同系統の軽い強調ボックス（`bg-*`/`border`/`rounded`/`text-sm`、ダークモードペア）。
- 非ハイスコアイベントでは描画しない（`{isHighScore && (...)}`）。
- E2E 用に `data-testid="highscore-ur-note"` を付与する。

### データ流れ・エラーハンドリング

ビルド時フィルタのみ。ロジック・データ構造の変更なし。フィルタ後に全ティア空になっても既存のティア表示（「対象衣装なし」）でカバーされる。

## テスト

- 単体（Vitest, `tests/unit/eventHighScore.test.ts` など）: `isHighScoreEvent` を検証（`ハイスコアライブイベント`→true、`ポイントライブイベント`→false、空/未定義→false）。
- E2E（`tests/event-detail.test.ts` に追記）: ハイスコアイベントを開くと注記 `data-testid="highscore-ur-note"` が表示され、特効グリッドのレアリティバッジが UR のみであることを検証。event-detail E2E は `testIgnore` 対象外で `BASE=''`、dev サーバー再利用で実行できる。ハイスコアイベント ID は `beforeAll` で `fetchEventsCsv` から `isHighScoreEvent` 該当の最初のイベントを解決する。
- dev サーバー目視（制御側）: ハイスコアイベントで UR のみ＋注記、非ハイスコアイベントで従来どおり全表示。

## 用語・命名

- ユーザー可視テキストは「衣装」「ハイスコアライブイベント」を用いる。
- 内部識別子は `card` / `eventtype` / `isHighScoreEvent` を使用する。

## ADR

仕様変更のため `docs/adr/0012-highscore-event-ur-only.md` を追加し `docs/adr/README.md` に追記する（ハイスコアイベントは UR のみ表示・`includes('ハイスコア')` 判定・注記表示の記録）。
