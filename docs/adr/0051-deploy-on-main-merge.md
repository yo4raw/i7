# 0051. main へのマージで即デプロイし、タグ運用とリリース履歴を廃止する

- ステータス: 承認
- 日付: 2026-08-26

## コンテキスト

これまで本番反映は `v*` タグの push を唯一のトリガーとしていた。`deploy.yml` が Cloudflare Workers へデプロイし、`release.yml` が GitHub Release を作成し、サイト内の `/releases/` ページが git タグとコミット件名からリリース履歴を組み立てていた。

この運用には次の問題があった。

- **反映が手動タグ待ちになる**。main にマージ済みの変更が本番に出るまで、人がタグを打つ操作を挟む必要があった。
- **画像取得 cron の自動タグが機能していなかった**。`fetch-new-cards.yml` 等は PR を auto-merge した後にパッチタグを bump して push していたが、`actions/checkout` が永続化した `GITHUB_TOKEN` の認証ヘッダが `RELEASE_PAT` より優先されるため、GitHub 側で workflow 起動が抑止されていた。実際に v1.55.1 / v1.55.2 がタグだけ進んで本番未反映のまま放置された。
- **バージョン番号が意味を持っていなかった**。実態は「画像が増えたらパッチ +1」であり、semver としての情報量がない。

## 決定

**main へのマージ（push）で即座に本番へデプロイする。タグ運用・GitHub Release・サイト内リリース履歴ページは廃止する。**

- `deploy.yml` のトリガーを `push: tags: ['v*']` から `push: branches: [main]` へ変更する。サイト成果物に影響しない `docs/**` と `.claude/**` のみの変更は `paths-ignore` で除外する。
- `release.yml`（GitHub Release 自動作成）を削除する。
- `src/pages/releases/` を削除し、`src/lib/seo.ts` の該当説明も削除する。
- フッターのバージョン表示は `git describe --tags` から **最終コミットの日付と短縮 SHA**（例: `2026-08-26 (f9b1509b)`）へ置き換え、リリース履歴ページへのリンクを外す。
- 画像取得 cron 4 本は「Bump tag」ステップを削除し、代わりに `deploy.yml` を reusable workflow (`workflow_call`) として `uses:` で直接呼び出す。`RELEASE_PAT` は不要になる。

品質ゲートは従来どおり PR の CI（typecheck / カバレッジ / lint / 本番ビルド）が担う。デプロイジョブ自身も `npm run build` を行うため、ビルドが壊れた変更は本番へ出ない。

## 検討した代替案

- **main マージ時にパッチタグを自動採番して push する**: リリース履歴と GitHub Release を維持できるが、意味のないバージョン番号を機械的に増やし続けることになる。また `GITHUB_TOKEN` 由来の push が workflow を起動しない制約は残るため、PAT 運用の複雑さを引きずる。
- **コミット件名で semver を判定する（Conventional Commits）**: squash マージの PR タイトル次第で意図せず minor が上がる。リリース履歴を廃止する判断と併せて不要になった。
- **リリース履歴ページをコミット履歴ベースに作り直す**: タグを廃止しても履歴表示は残せるが、毎時の画像取得 cron によるコミットが大半を占め、利用者にとって意味のある更新履歴にならない。ページ自体を廃止する方が正直である。
- **cron の auto-merge を PAT で実行して main push を発火させる**: PAT の管理と失効リスクが残る。reusable workflow の直接呼び出しなら `GITHUB_TOKEN` だけで完結する。

## 影響

- リリース告知は「タグを打った時」という区切りを失う。`release-tweet` スキルはタグ差分ではなく、告知したい範囲のコミット差分を指定して使う運用に変える。
- 既存のタグ（〜v1.56.0）は削除せず残す。過去の履歴としては GitHub 上で参照できる。
- 本番反映の頻度が上がる。`deploy.yml` の `concurrency: cloudflare-deploy` (`cancel-in-progress: false`) により、連続マージ時もデプロイは直列に処理される。
