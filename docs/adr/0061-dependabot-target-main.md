# 0061 Dependabot の依存更新を main 直行にする

- ステータス: 承認
- 日付: 2026-08-26

## 文脈

ADR 0052 で簡易 Git Flow を採用し、`main` 直行を許すのは毎時の cron 4 本（アセット自動取り込み）だけの例外とした。決定 3 で `develop` を GitHub の default branch にした理由の一つは「Dependabot の宛先が default branch に追従するため、設定の書き換えを最小にできる」ことであり、Dependabot の PR は `develop` へ向くことを前提としていた。

しかし依存更新を `develop` に溜める運用には次の問題がある。

- **PR 同士が `package-lock.json` で衝突する**。2026-08-26 に滞留していた 4 件を処理した際、`vitest` と `@vitest/coverage-v8` をマージした時点で `@playwright/test` の PR がコンフリクトし、Dependabot にリベースさせてから CI を待ち直す必要があった。滞留する PR が増えるほどこの手戻りは増える。
- **依存更新をまとめてリリースする価値が薄い**。機能変更と違い、依存更新は 1 件ずつ独立しており、まとめたところで利用者から見た意味は変わらない。`develop` に溜める理由が「リリース単位をまとめる」ことにあるなら、依存更新はその対象として弱い。

## 決定

**`.github/dependabot.yml` に `target-branch: main` を指定し、Dependabot の PR を `main` へ向ける。** npm と github-actions の両方の ecosystem に指定する。

`main` へマージすると `tag-release.yml` が MINOR を上げたタグを採番し（ADR 0059）、そのまま本番へデプロイされる。`sync-main-to-develop.yml` が `develop` へ back-merge するため（ADR 0060）、`main` は `develop` の祖先であり続け、リリースの fast-forward も通る。

cron の自動取り込みと違い、**auto-merge はしない**。CI（typecheck / カバレッジ / lint / 本番ビルド）が通ったことを確認したうえで人がマージする。依存更新は壊れる可能性があり、実際 TypeScript 7.0.2 の PR (#384) は `@astrojs/check` の peer 依存と衝突して CI が落ちている。

`ci.yml` の `pull_request.branches` は既に `[main, develop]` であり、変更は不要。

## 検討した代替案

- **`develop` 宛のまま維持する**: ADR 0052 の設計に忠実で、`main` 直行の例外を増やさずに済む。ただし上記の衝突の手戻りが残る。
- **Dependabot に `groups` を設定して 1 PR にまとめる**: `develop` 宛のまま衝突を減らせるが、まとめた PR が 1 件でも壊れると全体がマージできなくなり、切り分けの手間が増える。
- **依存更新も auto-merge する**: 手作業は最小になるが、CI をすり抜ける破壊的変更（メジャー更新、peer 依存の非互換）がそのまま本番へ出る。#384 のような PR を人が止められなくなるため不採用。

## 影響

- `.github/dependabot.yml`: npm / github-actions の両方に `target-branch: main` を追加
- `CLAUDE.md`: ブランチ戦略の表に `dependabot/` の行を追加し、`main` 直行である旨を明記
- 依存更新をマージするたびに MINOR が上がり、本番デプロイ（約 6 分）が走る。`devDependencies` の更新では本番の成果物は変わらないが、デプロイ自体は実行される
- 既に `develop` 宛で開いている PR（#384）は宛先が変わらない。次に Dependabot が作る PR から `main` 宛になる
