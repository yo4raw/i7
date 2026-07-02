# 0038: MC シミュレーションの乱数生成器を sfc32 へ差し替え

- 日付: 2026-07-02
- ステータス: 承認

## 背景

`rng.ts` の `XorShift128Plus` は名前に反して、32bit 状態ペアへ 64bit 版 xorshift128+ のシフト定数（23/17/26）を適用した非標準変種だった。監査での実測:

- χ² 一様性検定（16 bin・10 万サンプル・5% 臨界値 25.0）が seed 依存で 179〜371 と大差で不合格（`Math.random` は 11.7）
- 実利用パターン `rng.next()*100 < per` の発動率に最大 ±0.38pt の系統偏差、連続ペアに相関
- シード初期化 `seed * 2654435761` が `Date.now()` 級シードで 2^53 を超え浮動小数点精度落ちし、隣接シードの初期出力が強く相関

デフォルト 100 試行では標本誤差が支配的で平均への実害は小さいが、mcMin/mcMax/p90 の裾統計と「MC が期待値へ収束する」という仕様前提（shrink-skill-spec §5-4）を損なう。

## 決定

- **sfc32 へ差し替える。** シードは **splitmix32** で 32bit 整数から 4 状態へ展開する（`seed >>> 0` で受けるため精度落ちなし、ウォームアップ込み）。
- クラス名は実体に合わせ `Sfc32` へ変更し、`constructor(seed: number)` / `next(): number`（[0,1) 一様）の API は維持する。
- シード固定の MC 回帰テスト（mcMin/mcMax/mean/stddev の固定値）は新しい乱数列に対応する値へ更新する。

## 検討した代替案

- **正規の xorshift128+（64bit）実装** — BigInt が必要になり MC ホットループの性能劣化が大きい。32bit 演算で完結する sfc32 で品質要件を満たせる。
- **mulberry32** — 状態 32bit で周期 2^32。1 回のシミュレーションで消費する乱数（ノーツ×カード×試行）に対し周期余裕を取り、状態 128bit の sfc32 を採る。
- **`Math.random`** — シード指定不可で再現性（テスト・デバッグ）を失うため却下。

設計の詳細は [docs/superpowers/specs/2026-07-02-score-engine-audit-fixes-design.md](../superpowers/specs/2026-07-02-score-engine-audit-fixes-design.md) を参照。
