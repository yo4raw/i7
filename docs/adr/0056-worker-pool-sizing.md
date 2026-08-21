# 0056 Web Worker プール数は現状維持とする（調査の結果）

- ステータス: 承認
- 日付: 2026-08-21

## 文脈

[0055](0055-e2e-hydration-fixture.md) で E2E のフレークを調査した際、CPU バウンドなテスト（総当たり探索・MC シミュレーション）が並列実行時にタイムアウトを超過する事象を観測した。その原因として「アプリがブラウザごとに `navigator.hardwareConcurrency` 分の Web Worker を起動しており、コア数を大きく超過している」と推定し、`hardwareConcurrency - 1` へ絞る改善を別 ADR 案件として見送っていた。

**この推定は誤りだった。** 実装を確認したところ、上限は既に設けられていた。

## 調査結果

### 1. 総当たり探索（編成組合計算）

`src/components/MaxScoreFinder.svelte` の worker 数は既に三重に上限が掛かっている。

```ts
const workerCount = Math.min(
  8,
  Math.max(1, (navigator.hardwareConcurrency || 4) - 1),
  Math.max(1, chunks.length),
);
```

- `hardwareConcurrency - 1` は**既に適用済み**（メインスレッド用に 1 コア残す）
- さらに **8 で頭打ち**にしている。コア数が多いマシンでも 8 を超えない
- チャンク数が少なければそれ以下に落ちる（無駄な worker を立てない）
- `searchWorkerPool.ts` は `finally` で必ず `terminate()` する

4 コアなら 3、10 コアなら 8。実ユーザーが明示的にボタンを押して起動する処理として妥当な配分であり、変更する理由がない。

### 2. MC シミュレーション（スコア計算）

`src/lib/score/simulation.ts` の `runSimulation` は **Web Worker を一切使わない**。メインスレッドで `MC_CHUNK_SIZE`（= 50 試行）ごとに `await new Promise(r => setTimeout(r, 0))` を挟み、イベントループへ制御を返しながら進める。進捗率もこのチャンク境界で更新される。

つまり「コアを占有して UI が飢える」構造ではなく、そもそも 1 コアしか使っていない。

## 決定

**Web Worker プール数は現状のまま変更しない。**

- 総当たり探索の `min(8, hardwareConcurrency - 1, chunks.length)` は既に適切な上限であり、これ以上絞ると探索時間が伸びるだけで利得がない
- MC シミュレーションは Worker を使っておらず、絞る対象が存在しない

E2E で観測した枯渇は、**Playwright が複数ワーカーで複数のブラウザを同時に走らせる**ことによるテスト環境固有の事象であり、アプリ側の問題ではない。対処は [0055](0055-e2e-hydration-fixture.md) のとおりテスト側のタイムアウト調整で完結している。

## 検討した代替案

### 総当たり探索の上限をさらに下げる（却下）

E2E の枯渇は緩和されるが、実ユーザーの探索時間が直接伸びる。テスト環境の都合で本番の性能を落とすのは本末転倒。テスト側は 0055 で解決済み。

### MC シミュレーションを Web Worker へ移す（見送り）

メインスレッドから外せば計算中の UI 応答性は上がる。ただし現状も `MC_CHUNK_SIZE = 50` ごとに制御を返しており、実用上の詰まりは報告されていない。Worker 化は `ComputedTeam` / `FlatNote[]` の転送コストと実装複雑度を伴うため、体感の問題が実際に報告された時点で改めて判断する。

## 影響

- コード変更なし。
- [0055](0055-e2e-hydration-fixture.md) の「検討した代替案」に書いた前提（`hardwareConcurrency` 分すべて起動している）が誤りだったため、同 ADR に訂正を追記する。
