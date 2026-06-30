# PNG → WebP 画像移行 設計

- 日付: 2026-06-30
- ステータス: 承認（実装計画へ）
- 関連 ADR: `docs/adr/0033-webp-image-format.md`（本設計と同時に追加）

## 目的

サイトのコンテンツ画像（フルカード / サムネイル / 楽曲ジャケット）を PNG から WebP へ全面移行する。狙いは配信サイズ（`dist/` / Cloudflare デプロイ / ページ転送量）の削減と画像形式の統一。

## スコープ

### 対象
- フルカード画像 `public/assets/cards/*.png`（約 2,799 枚）
- サムネイル画像 `public/assets/th_cards/*.png`（約 3,281 枚）
- 楽曲ジャケット画像 `public/assets/songs/*.png`（147 枚）

### 対象外
- アプリアイコン類（`public/apple-touch-icon.png` / `public/pwa-*.png` / `favicon.svg`）— コンテンツ画像ではないため据え置き
- `.git` 履歴の肥大解消（後述「スコープ外・リスク」参照）
- `EventShareImage` / `ScoreCalc` 等が canvas で生成するダウンロード画像のファイル名（`.png` のまま。これはクライアント生成のビットマップ書き出しでありストア画像とは無関係）

## 変換品質

種別ごとに品質を変える。フルカードは高解像度イラストのため劣化ゼロを優先、サムネ・楽曲は小サイズで劣化が視認できないため強圧縮で稼ぐ。

| 種別 | 変換 | 1 枚あたり実測 | ディレクトリ合計（変換後見込み） |
|------|------|---------------|-------------------------------|
| フルカード `cards/` | ロスレス WebP（`{ lossless: true }`） | 約 1,200KB → 約 950KB（約 20% 減） | 3.1GB → 約 2.4GB |
| サムネ `th_cards/` | lossy WebP（`{ quality: 85 }`） | 約 118KB → 約 18KB（約 85% 減） | 357MB → 約 54MB |
| 楽曲 `songs/` | lossy WebP（`{ quality: 85 }`） | 約 42KB → 約 20KB（約 50% 減） | 44MB → 約 22MB |

リポジトリ working tree 合計: 約 3.5GB → 約 2.5GB（約 28% 減）。

WebP 単一形式とし、変換後に元 PNG は working tree から削除する（`<picture>` フォールバックは設けない。WebP は現行ブラウザで普遍的にサポートされるため）。

## アーキテクチャ / 変更点

### 1. 参照側（コード・パス修正）

- `src/lib/ui.ts`: `cardImageUrl` / `cardThumbUrl` / `songImageUrl` の出力拡張子を `.png` → `.webp` に変更する。
  - og:image・JSON-LD（`src/pages/cards/[id].astro` / `src/pages/songs/[id].astro` の `image:` と `<meta og:image>`）および各詳細ページ・一覧の `<img>` はすべてこのヘルパー経由のため、**ヘルパー 1 箇所の変更で自動追従**する。
- `src/components/cards/CardMobileCard.svelte` / `CardTableRow.svelte` / `CardTileCard.svelte`: ヘルパーを通さず `${thumbUrl}/${card.ID}.png` と直書きしている箇所を `cardThumbUrl(card.ID)` 呼び出しに置換する（DRY 化し、拡張子定義をヘルパーに一元化する）。

### 2. 既存画像の一括変換

- 新規スクリプト `scripts/png-to-webp.mjs` を追加する（`sharp` 依存。既に `package.json` にあり）。
  - 指定ディレクトリ配下の `*.png` を WebP に変換し、成功後に元 PNG を削除する。
  - ディレクトリ／呼び出し時に品質モードを切り替え可能にする（`cards/` → lossless、`th_cards/` `songs/` → quality 85）。
  - 冪等（既に `.webp` がある ID はスキップ可能）。**一括変換と GHA ワークフローの両方から再利用する**共通モジュール兼 CLI とする。
- このスクリプトをローカルで 1 回実行して既存約 6,200 枚を変換・PNG 削除し、コミットする。

### 3. GHA フェッチワークフローの WebP 化

ソースサーバー（`i7.step-on-dream.net`）および IDOLiSH7 Wiki は PNG のみ配信するため、各ワークフローは「PNG 取得 → WebP 変換 → PNG 破棄」とする。

- `.github/workflows/fetch-new-cards.yml`（純 bash）
  - 既存 ID 判定の `ls public/assets/cards/*.png` / `th_cards/*.png` を `*.webp` に、存在チェック `[ ! -f ".../${ID}.png" ]` を `.webp` に変更。
  - 取得は一時 PNG に DL → `file --mime-type` で検証 → `scripts/png-to-webp.mjs` で `.webp` 化（フル＝ロスレス、サムネ＝q85）→ 一時 PNG 削除。
  - `actions/setup-node`（`.nvmrc`）＋ 依存導入ステップ（`sharp` が入れば足りる）を追加。
  - `create-pull-request` の `add-paths` を `.webp` 配下に。
- `.github/workflows/fetch-gap-cards.yml`（純 bash、フルカードのみ）
  - 上と同様。フルカードのためロスレス変換。
- `.github/workflows/fetch-new-songs.yml` + `scripts/fetch-song-images.mjs`（既に Node）
  - `fetch-song-images.mjs`: 保存前に `sharp` で `.webp`（q85）化し `${id}.webp` として書き出す（現状 `${id}.png`）。
  - ワークフローの新規ファイル検出 grep（`\.png$`）を `\.webp$` に変更。

### 4. 周辺の追従

- `scripts/verify-card-images.mjs` / `scripts/refetch-card-images.mjs`: ローカル側ファイルを `.webp` で扱う（source 側 URL は引き続き `.png`）。ID 存在ベースの照合に調整。
- 単体／E2E テスト: `tests/unit/seo.test.ts` / `tests/unit/ui.test.ts` / `tests/card-compare.test.ts` / `tests/card-detail.test.ts` / `tests/song-detail.test.ts` の `.png` アサートを `.webp` に更新。
- `public/sw.js`: `SW_VERSION` を更新し旧 PNG キャッシュをパージする（キャッシュ判定はパス prefix で拡張子非依存のため他は不変）。
- `CLAUDE.md`: 「Card Images」表の URL パターン（`{ID}.png` → `{ID}.webp`）、GHA cron の説明を更新。
- `docs/adr/0033-webp-image-format.md`: WebP 採用・品質方針（フル=ロスレス / その他=q85）・PNG 全削除・履歴リライト見送りの理由を記録。`docs/adr/README.md` の一覧にも追記。

## データフロー（変換後）

```
ビルド時:  public/assets/{cards,th_cards,songs}/{id}.webp  →  dist/assets/.../{id}.webp
参照:      cardImageUrl/cardThumbUrl/songImageUrl → .../{id}.webp
           → <img> / og:image / JSON-LD すべて WebP
GHA 定期:  source(PNG) → 一時DL → sharp 変換 → {id}.webp → PR → merge → deploy
```

## エラー処理・検証

- 変換スクリプトは変換成功（出力ファイルが生成され読み込み可能）を確認してから元 PNG を削除する。失敗時は PNG を残し ID をログ出力。
- GHA は従来どおり mime-type 検証で破損／404 を弾いてから変換する。
- リリース前に `npm run build` でフル静的生成（動的ルート全件・圧縮後）と `npm run test` を通す。

## リリース戦略（GitHub push 制限への対応）

### 制約

- GitHub: **1 ファイル 100MiB 超は拒否**（個々の webp は最大約 1MB なので問題なし）。
- GitHub: **1 回の push が約 2GiB を超えると拒否／タイムアウト**する。フルカード変換後は約 2.4GB に達するため、単一コミットを 1 push で送ると失敗する恐れが高い。

### 方針: チャンク push + 単一 PR（原子的マージ）

`git push` は差分（その push に含まれる新規オブジェクト）だけを転送するため、**コミットを分割し各 push を 2GiB 未満に抑えれば**安全に送れる。マージは ref 更新のみで容量問題は起きないので、**ブランチは 1 本・PR は 1 本（マージは原子的）**を維持する。

実行手順（`feat/webp-migration` ブランチ上）:

1. コード・ワークフロー・テスト・ドキュメント修正をコミット（軽量）。
2. 一括変換を画像種別・容量チャンク単位でコミット＆**コミットごとに push**:
   - サムネ `th_cards/`（約 54MB）＋楽曲 `songs/`（約 22MB）→ 1 コミット 1 push。
   - フルカード `cards/`（約 2.4GB）→ **ID 範囲で 4 分割程度**（各約 600MB）のコミットに分け、各コミット後に push。
   - 各 push が 2GiB 未満であることを目視確認しながら進める。
3. 全 push 完了後に PR を 1 本作成し、**通常マージ（squash しない）**でマージする。
   - squash すると全ファイルが 1 コミットに集約され、main への反映自体は ref 更新なので問題ないが、`fetch-*.yml` の auto-merge は `--squash` を使う点と整合させ、本 PR は手動で通常マージする。

### フォールバック: PR 分割

チャンク push でも問題が出る場合は、サイトを壊さない順序で PR を分割する:

1. **PR-A（複数可）**: webp を **PNG と併存**で追加（ヘルパー・ワークフローは変更せず PNG 参照のまま）。サイトは PNG を使い続けるので無破壊。チャンク push で webp を載せる。
2. **PR-B（カットオーバー）**: ヘルパーを `.webp` に切替＋ PNG 削除＋ワークフロー WebP 化＋テスト/ドキュメント更新。これをマージした瞬間に WebP へ切り替わる。

> PR を分ける場合、**参照切替（ヘルパー変更）と PNG 削除は必ず最後の PR にまとめる**こと。先に切り替えると webp 未配置の画像が壊れる。

### cron との競合回避

フェッチ系 cron（毎時 00 分）が移行作業中に PNG を追加して PR を作る可能性がある。作業中は競合を避けるため、移行 PR のマージ直前に main を取り込み、必要なら cron ワークフローを一時停止（`workflow_dispatch` のみに）するか、マージ後すぐワークフロー WebP 化が効くよう同一 PR に含める。

### リポジトリサイズへの影響（注意）

本移行後、`.git` 履歴には旧 PNG（約 3.5GB）と新 webp（約 2.4GB）の双方が残り、合計約 6GB に膨らむ。GitHub のサイズ警告（推奨 1GB / ソフト上限 5GB 付近）に触れる可能性がある。clone サイズ削減には別途履歴リライトが必要（スコープ外）。

## スコープ外・リスク（明示）

- **`.git` 履歴の肥大は解消しない**: 過去コミットに約 3.5GB の PNG が残るため clone サイズは縮まない。縮小には `git filter-repo` 等の履歴リライト（強制 push・全 fork/clone へ影響）が必要。今回は配信サイズ削減を目的とし、履歴リライトは**将来の別タスク**として見送る。
- **一部 SNS の og プレビュー**: WebP og:image は X / Discord / Facebook では表示されるが、LINE 等一部 JP プラットフォームでリンクプレビュー画像が出ない可能性がある（機能破壊ではなく見た目の劣化）。採用済み方針として許容する。
- **フルカードのロスレス WebP の削減幅は約 20%**: lossy より控えめ。劣化ゼロ優先の意図的なトレードオフ。
