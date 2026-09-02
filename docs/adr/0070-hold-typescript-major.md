# 0070 TypeScript のメジャー更新を上流の対応まで保留する

- ステータス: 承認
- 日付: 2026-09-02

## 文脈

Dependabot が `typescript` を 5.9.3 から 7.0.2 へ上げる PR（#384）を 2026-07-09 に出したが、CI の build と typecheck が両方失敗したまま約 2 か月放置されていた。

原因は上流の peer 依存である。実測した範囲は次のとおり（いずれも npm の最新公開版）。

| パッケージ | 最新版 | 要求する `typescript` |
|-----------|--------|---------------------|
| `@astrojs/check` | 0.9.10 | `^5.0.0 \|\| ^6.0.0` |
| `@astrojs/svelte` | 9.0.1 | `^5.3.3 \|\| ^6.0.0` |
| `svelte2tsx` | 0.7.57 | `^4.9.4 \|\| ^5.0.0 \|\| ^6.0.0` |

`npm ci` が `ERESOLVE` で止まるため、CI は起動直後に落ちる。当リポジトリ側のコード変更では解決できない。

TypeScript 7 は npm の `latest` であり、プレリリースではない。つまり待っても自動的に解決するのは Astro 側の対応であって、TypeScript 側ではない。

## 決定

**`typescript` のメジャー更新を `.github/dependabot.yml` の `ignore` で保留する。** `@astrojs/check` と `@astrojs/svelte` が TypeScript 7 に対応したら、この項目を外して上げる。

マイナー・パッチの更新は従来どおり Dependabot に任せる（`update-types` を `semver-major` のみに絞る）。

PR #384 は閉じた。

## 検討した代替案

### `--legacy-peer-deps` または `overrides` で押し通す

`package.json` の `overrides` で peer 依存の宣言を無視させれば `npm ci` は通る。しかし `astro check` は TypeScript の内部 API（`typescript/lib/tsserverlibrary` 相当）を経由して型情報を取るため、宣言だけ通しても型チェックが壊れる可能性が高い。カバレッジゲート（[0032](0032-unit-test-coverage-gate.md)）と型チェックは CI の主要なゲートであり、そこを不安定にする取引は成立しない。

### PR を開いたまま放置する

Dependabot は新しいパッチ版（7.0.3、7.1.0 …）が出るたびに PR を作り直す。いずれも同じ理由で落ちるため、CI の失敗が恒常的に並ぶ。「失敗している PR がある」状態が普通になると、本当に見るべき失敗を見落とす。

### `@astrojs/check` を外して型チェックをやめる

`astro check` を捨てれば TypeScript 7 を入れられるが、`.astro` と `.svelte` を含む型チェックが CI から消える。削減のために品質ゲートを外す判断は [0069](0069-ponytail-audit-cleanup.md) の方針にも反する。

## 影響

- `.github/dependabot.yml` の npm セクションに `ignore` を追加する。
- 上流が対応したら本 ADR を更新し、`ignore` を外す。判断の起点は `@astrojs/check` の `peerDependencies.typescript` に `^7` が入ること。
