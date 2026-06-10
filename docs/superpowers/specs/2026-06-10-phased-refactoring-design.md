# 段階的リファクタリング設計（安全網ファースト）

- 日付: 2026-06-10
- ステータス: 承認済み
- 方針: 案 A（テスト先行・安全網ファースト）

## 背景と目的

コードベースには長年の機能追加で蓄積した構造的負債がある。事前調査の結果、本質的な負債は「削除すべきデッドコード」ではなく「**巨大コンポーネントの責務混在と重複実装**」と判明した。

主な問題（2026-06-10 時点の実測値）:

| 問題 | 実態 |
|------|------|
| `src/components/ScoreCalc.svelte` の肥大 | 1831 行。UI 操作・状態管理・HTML 文字列生成・モーダル・計算トリガーの 5 責務が混在。`innerHTML` 直操作 16 箇所、Svelte の宣言的レンダリング不使用 |
| `src/components/MaxScoreFinder.svelte` の肥大 | 788 行。設定 UI・Worker 管理・結果表示が混在 |
| `src/lib/score/engine.ts` の肥大 | 935 行。チーム計算・スコア計算・MC シミュレーションが同居 |
| イベント特効ロジックの二重実装 | `ScoreCalc.svelte:61` の `buildDefaultTierMap` が `eventBonusTiers.ts:48` の `buildLiveTierMap` を再実装 |
| 型定義の重複 | `EventForBonus` が `eventBonusTiers.ts:31` と `ScoreCalc.svelte:27` で二重定義 |
| 型安全性の穴 | `selectedSong[gk] as any` 等の `as any` が 4 箇所 |
| テストの穴 | `resolveDeckBroachs` / `skillFormatter` / `buildLiveTierMap` の単体テストなし。`/score-calc/` メインページと `/score-calc/max-score-finder/` の E2E なし |
| 重複 UI ロジック | 属性/レアリティバッジ生成・カードフィルタが CardList / ScoreCalc / MaxScoreFinder で個別実装 |

**目的（優先順）**: 保守性・拡張しやすさの向上。今後の機能追加（スコア計算・探索機能の進化）を楽にする。

## 制約

1. **完全に振る舞い保存**: UI・計算結果・localStorage キー/形式・URL・共有 URL エンコードを一切変えない。純粋な内部構造の改善のみ。
2. **小さい PR を随時リリース**: 1 項目 = 1 PR で main にマージし随時リリース。長期ブランチは作らない。フェーズの途中で通常の機能開発を挟んでも壊れない順序にする。
3. 完全静的サイト原則（CLAUDE.md）を維持。サーバーサイド処理は導入しない。

## 全体戦略

**安全網ファースト**: Phase 0 で現在の挙動をテストで固定してから構造改善に入る。エンジン層は既にオラクルテスト（`tests/unit/score/spreadsheetDiff.test.ts`、スプレッドシート v1.0.6 準拠）で守られているため、穴になっている部分のみ埋める。

**ストラングラー方式**: 巨大コンポーネントは一括書き換えせず、責務単位で抽出する。抽出した部分だけ Svelte 5 Runes の宣言的レンダリングに移行し、親は段階的に縮小する。

各 PR の合格基準: `npm run test:unit` + `npm run test`（E2E）が緑 + dev サーバー（HMR）での目視確認で表示差分なし。

## Phase 0: 安全網整備（リファクタリングしないフェーズ）

現在の挙動をテストで固定する。このフェーズでは実装コードを変更しない。

| # | 内容 | 対象 |
|---|------|------|
| 0.1 | `resolveDeckBroachs` の単体テスト（固有/共有ブローチの条件判定） | `src/lib/score/broachResolver.ts` |
| 0.2 | `skillFormatter` の単体テスト（スキル説明文生成のスナップショット） | `src/lib/score/skillFormatter.ts` |
| 0.3 | `buildLiveTierMap` / `isEventLive` の境界値テスト（開催開始・終了時刻の前後） | `src/lib/data/eventBonusTiers.ts` |
| 0.4 | `/score-calc/` メインページの E2E スモークテスト（デッキ編成 → 計算実行 → 結果表示） | `tests/score-calc.test.ts`（新規） |
| 0.5 | `/score-calc/max-score-finder/` の E2E スモークテスト（探索実行 → 結果表示） | `tests/max-score-finder.test.ts`（新規） |

完了基準: 上記すべてが CI で緑。以降のフェーズの回帰検知網として機能する。

## Phase 1: 重複排除と型統一（低リスク・即効）

| # | 内容 | 詳細 |
|---|------|------|
| 1.1 | イベント特効ロジック統一 | `ScoreCalc.svelte` のローカル `EventForBonus` 型（27 行目）と `buildDefaultTierMap`（61 行目）を削除し、`eventBonusTiers.ts` の `EventForBonus` / `buildLiveTierMap` を import して使う |
| 1.2 | `as any` 排除 | 楽曲の属性グループアクセス（`selectedSong[gk] as any` 等 4 箇所）に group key の union 型を導入。ダミー Song には `Partial<Song>` ベースの型を定義 |
| 1.3 | バッジコンポーネント化 | `src/components/ui/AttributeBadge.svelte` / `RarityBadge.svelte` を新設し、CardList / ScoreCalc / MaxScoreFinder / DeckList のバッジ生成を置換 |
| 1.4 | 小掃除 | `ScoreCalc.svelte` の `loadJson` 二重 import 解消、`score/constants.ts` の `EventBonusTier` re-export 廃止（直接 import に統一） |
| 1.5 | カードフィルタ共通化 | `src/lib/cardFilter.ts` を新設（テキスト・レアリティ・属性・所持のみフィルタ）。CardList / ScoreCalc ピッカー / MaxScoreFinder で共用。単体テスト付き |

## Phase 2: ScoreCalc.svelte の分割（本丸・最大リスク）

1831 行 → 目標 300 行以下、`innerHTML` 16 箇所 → 0。抽出順は依存が少ない順:

| # | 内容 | 抽出先 |
|---|------|--------|
| 2.1 | UI 非依存ロジック抽出（デッキ状態・特効適用・検証） | `src/lib/score/deckState.ts`（単体テスト付き） |
| 2.2 | カード選択モーダル抽出（フィルタ・ソート含む、Runes 化） | `src/components/score/CardPickerModal.svelte` |
| 2.3 | 編成スロット表示抽出（D&D 含む、Runes 化） | `src/components/score/DeckSlots.svelte` |
| 2.4 | 計算結果表示抽出（ヒストグラム・カード詳細テーブル） | `src/components/score/ScoreCalcResults.svelte` |
| 2.5 | 親 `ScoreCalc.svelte` を Runes ベースの調整役に縮小 | — |

各ステップ後に Phase 0 の E2E + 単体テストで回帰を検知する。万一 E2E をすり抜ける回帰が出た場合は該当 PR 単位で revert できる粒度を保つ。

## Phase 3: MaxScoreFinder と engine.ts の整理

| # | 内容 | 詳細 |
|---|------|------|
| 3.1 | Worker 管理抽出 | `src/lib/score/searchWorkerPool.ts`（起動・進捗集約・中断処理） |
| 3.2 | 結果表示パネル抽出 | `src/components/score/SearchResults.svelte` |
| 3.3 | `engine.ts` 分割 | `teamBuilder.ts`（`computeTeam` 系）/ `simulation.ts`（`runSimulation` 系）に分割。`engine.ts` からの re-export で既存 import を壊さない。オラクルテスト（`spreadsheetDiff.test.ts`）が回帰防止 |

## Phase 4: 周辺整理（任意・低優先）

| # | 内容 |
|---|------|
| 4.1 | `.astro` ページ内のデータ変換ロジック（例: `pages/score-calc/index.astro` の `eventsForBonus` 変換）を `src/lib/data/` へ移動 |
| 4.2 | `scripts/` の一回限りスクリプト（`apply-dark-variants.mjs` 等）に用途・実行頻度のコメント追記 |
| 4.3 | 用語・命名規約（`ev`/`event` の使い分け、ブローチ用語など）を CLAUDE.md に追記 |

## 成功基準

| 指標 | 現状 | 目標 |
|------|------|------|
| `ScoreCalc.svelte` 行数 | 1831 | ≤ 300 |
| `innerHTML` 直操作（ScoreCalc） | 16 箇所 | 0 |
| `as any`（コンポーネント内） | 4 箇所 | 0 |
| `EventForBonus` 定義 | 2 箇所 | 1 箇所 |
| 特効ティア計算実装 | 2 系統 | 1 系統 |
| `resolveDeckBroachs` / `skillFormatter` 単体テスト | なし | あり |
| `/score-calc/` 系 E2E | spec ページのみ | メイン + max-score-finder |

すべてのフェーズを通じて、ユーザーから見える変化はゼロであること。

## エラーハンドリング・リスク対応

- 各 PR は単独で revert 可能な粒度を保つ（リリース済みの直前状態に戻せる）
- Phase 2 が最大リスク。E2E スモークに加え、抽出前後で dev サーバーのスクリーンショット比較を行う
- localStorage 形式は不変なので、リリース順序やユーザーデータのマイグレーションを考慮する必要はない
- フェーズ間は独立しており、途中で通常の機能開発を優先しても整合性は壊れない（ただし Phase 2 の途中で ScoreCalc に機能追加すると競合しやすいため、2.1〜2.5 はなるべく連続して進める）

## スコープ外

- UI/UX の改善（振る舞い保存の制約に反するため）
- localStorage スキーマの変更・永続化層の Store 化（現行の `storage.ts` + `STORAGE_KEYS` で十分機能している）
- パフォーマンス最適化（必要になったら別プロジェクトとして扱う）
- PWA / Service Worker / デプロイ構成の変更
