# トップページ GSAP モーション 設計

- 作成日: 2026-08-21
- 関連 ADR: [0054](../../adr/0054-gsap-home-motion.md)（新規）、[0046](../../adr/0046-apple-design-redesign.md) §4（部分的に上書き）、[0047](../../adr/0047-character-color-identity.md)、[0032](../../adr/0032-unit-test-coverage-gate.md)

## 目的

サイトの第一印象を強化する。トップページを開いた瞬間に「作り込まれたファンサイト」だと伝わる導入をつくる。

データ画面（衣装一覧・スコア計算・衣装比較など）の使い勝手は現状のままとし、演出は加えない。

## スコープ

対象は **トップページ（`src/pages/index.astro`）1 枚のみ**。

トップページに `client:load` で載っている `CharacterColorHero.svelte` と `EventCountdown.svelte` は、data 属性を付与するだけの変更を行う（ロジックとマークアップ構造は変えない）。

### 対象外

- スクロールスクラブ / ピン留め / パララックス（強度「標準」の範囲外）
- ページ遷移アニメーション（View Transitions は ADR 0046 でスコープ外のまま）
- 既存の `materialIn` / `materialOut` / `pressable` の置き換え。狙いは第一印象であって実装統一ではない
- 衣装一覧の無限スクロール行へのエントランス（ADR 0046 §4 の禁止事項を踏襲）
- `backdrop-filter` を伴う演出（CLAUDE.md の「行アイテムに backdrop-filter 禁止」を維持）

## 背景と前提

現状のサイトは ADR 0046 §4「モーションは新規依存を増やさない」に従い、`svelte/transition` ベースの `materialIn` / `materialOut` と `pressable` utility だけで動きを構成している。モーションを使っているコンポーネントは `HeaderNav` / `CardPickerModal` / `ModalDialog` の 3 つのみで、意図的に動きの薄いサイトである。

本設計は **この決定を明示的に覆す**。ただし覆す範囲はトップページに限定し、他ページでは ADR 0046 §4 を引き続き有効とする。

GSAP は 3.15.0 時点でコアが gzip 約 27KB。ライセンスは 2025 年以降すべてのプラグインを含めて無償（standard "no charge" license）。

## アーキテクチャ

### ファイル構成

| 種別 | パス | 役割 |
| --- | --- | --- |
| 新規 | `src/lib/motion/countUp.ts` | 数値の整形・補間・属性パース。純粋関数のみ（node 環境で単体テスト） |
| 新規 | `src/lib/motion/homeMotionDom.ts` | DOM ヘルパーと演出パラメータ表。GSAP に依存しない（jsdom 環境で単体テスト） |
| 新規 | `src/lib/motion/homeMotion.ts` | GSAP ブートストラップとタイムライン。`initHomeMotion()` のみを公開 |
| 変更 | `src/pages/index.astro` | `<script>` の追加と `data-motion-*` 属性の付与 |
| 変更 | `src/components/CharacterColorHero.svelte` | `data-motion-*` 属性の付与のみ |
| 変更 | `src/components/EventCountdown.svelte` | `data-motion-*` 属性の付与のみ |
| 変更 | `src/styles/global.css` | モーション初期状態のクラス定義 |
| 変更 | `src/layouts/BaseLayout.astro` | `<head>` にモーションフラグ判定のインラインスクリプト |

### Svelte island ではなく Astro の `<script>` を使う

GSAP を import するのは `homeMotion.ts` だけに閉じる。`homeMotionDom.ts` を分離するのは、GSAP を静的 import したモジュールを jsdom 単体テストから読み込むと不安定になるため。既存の `src/lib/score/maxScoreFinder.worker.ts`（`/* v8 ignore start */` で実行環境専用のブートストラップを除外）と同じ方針を取る。

`index.astro` に次を置く。

```astro
<script>
  import { initHomeMotion } from '../lib/motion/homeMotion.ts';
  initHomeMotion();
</script>
```

Vite がこのページ専用のチャンクにバンドルし、`type="module"`（defer 相当）で読み込む。他の 2778 ページには載らない。

何もレンダリングせず `document` を触るだけの Svelte コンポーネントを島として置く案は採らない。Svelte のハイドレーションコストを払う意味がないため。

### GSAP は静的 import にする

`homeMotion.ts` から `gsap` を静的に import する。Vite が `<link rel="modulepreload">` を出力するため HTML と並行取得となり、ラウンドトリップは 1 回で済む。Service Worker が `/_astro/*` を CacheFirst しているので、2 回目以降の訪問はネットワークアクセスが発生しない。

動的 import にすれば `prefers-reduced-motion` 時に 0KB で済むが、追加のラウンドトリップが入りヒーロー表示までの空白が伸びる。reduced-motion 時は GSAP をダウンロードした上でスクリプトが即 return する、という割り切りを取る。

### ScrollTrigger は使わない

スクロール登場は IntersectionObserver（`rootMargin: '0px 0px -15% 0px'`）で実装する。要素が画面下から 15% 入った時点で発火し、発火後は `unobserve`、全消化後に `disconnect` する。

**交差判定だけでは取りこぼす。** 最下部へ一気にスクロールした場合・リロード時にスクロール位置が復元された場合・アンカーリンクで途中へ飛んだ場合、対象は「画面下」から「画面上」へ 1 フレームで移動する。このとき `isIntersecting` は `false` のまま変化しないため、**IntersectionObserver のコールバックがそもそも発火しない**。放置すると `data-motion-item` が残り続け、要素が永久に隠れたままになる。

そのため、交差イベントに加えて **rect ベースの拾い直し（sweep）** を二段で用意する。

1. IntersectionObserver のコールバックが発火するたびに、未再生グループ全体を `getBoundingClientRect()` で判定し直す（別のグループが画面に入ったことを契機に、飛び越された要素を回収する）
2. 呼び出し側が `scroll` イベント（`requestAnimationFrame` で 1 フレーム 1 回に間引き、`passive: true`）から明示的に叩ける `sweep(viewportHeight)` を公開する。全グループを消化した時点でリスナーごと外す

判定の閾値は `rootMargin` と等価な「要素の上端がビューポート高さの 85% ラインより上」（`REVEAL_VIEWPORT_RATIO = 0.85`）とし、`shouldReveal()` として純粋関数に切り出して単体テストする。

ScrollTrigger の追加コスト（gzip 約 12KB、全体の約 31% 増）に見合う機能（pin / scrub / parallax）を本設計では使わないため。将来「演出重視」へ強度を上げる場合は、その時点で ADR を追記した上で ScrollTrigger を導入する。

**トップページの追加ペイロードは gzip 約 27KB。他ページは 0KB。**

### FOUC 対策

`gsap.from()` をそのまま使うと、チャンク到着が遅れた場合に「最終状態が一度見えてから offset へ飛んで再アニメーションする」という見え方になる。これを避けるため、次の 4 段構えとする。

1. `BaseLayout.astro` の `<head>` にインラインスクリプト（ネットワーク不要）を置き、`prefers-reduced-motion` でなければ `<html>` に `data-motion="on"` を付ける
2. `global.css` で `[data-motion="on"] [data-motion-item] { opacity: 0 }` とする。**このフラグが立ったときだけ隠す**
3. GSAP が要素をアニメーションさせると inline style の `opacity` が CSS ルールに優先して可視になる。各トゥイーンの完了時にその要素から `data-motion-item` 属性を外し、以後 CSS ルールの対象から永久に外す
4. ウォッチドッグ: 2.5 秒経ってもタイムラインが開始されなければ `<html>` の `data-motion` フラグを強制解除し、残っている全要素を可視に戻す

フラグは「タイムライン完了時」ではなく**失敗時のみ**外す。スクロール登場を待っている画面外の要素は、それぞれが発火するまで隠れたままである必要があるため。

JavaScript 無効・reduced-motion・チャンク取得失敗・スクリプト例外のいずれの場合でも要素は通常どおり表示される。**「動かない」ことはあっても「見えない」ことは起きない。**

### data 属性の役割

| 属性 | 付与先 | 役割 |
| --- | --- | --- |
| `data-motion="on"`（`<html>`） | `BaseLayout.astro` のインラインスクリプトが動的に付与 | モーション有効フラグ。CSS の初期非表示ルールのスイッチ |
| `data-motion-item` | アニメーション対象の全要素 | 初期非表示の対象マーカー。トゥイーン完了時に除去する |
| `data-motion-group="hero-bar"` 等 | アニメーション対象の要素自身（`data-motion-item` と併記） | stagger をまとめる単位。DOM 順がそのまま stagger 順になる |
| `data-count-to="2689"` | カウントアップ対象の `<span>` | 最終値。サーバーレンダリング値と一致させる |

## 演出プラン

### 初回ロードのタイムライン

`gsap.timeline()` 1 本。全体で約 0.9 秒で完了する。

| t (秒) | 対象 | 動き |
| --- | --- | --- |
| 0.00 | ヒーローの `<h1>` と説明文 | `y: 12 → 0` / `opacity: 0 → 1`、0.45s、`power2.out` |
| 0.12 | 16 色バーの 16 セグメント | `scaleY: 0.15 → 1`（`transform-origin: bottom`）+ `opacity`、1 本あたり 0.4s、stagger 0.025s で左から順に立ち上がる |
| 0.45 | ユニット名ラベル（4 つ） | `opacity: 0 → 1` のみ、0.3s |
| 0.50 | 統計チップ 3 個（衣装 / 楽曲 / イベント） | `y: 8 → 0` + `opacity`、stagger 0.06s |
| 0.55 | 統計チップの数値 | カウントアップ、0.8s、`power2.out`、`snap: 1` |

16 色バーが左から波のように立ち上がるのが視覚的な主役となる。ADR 0047 の「ヘッダーの 3px 線を大判で反復する」というアイデンティティを、動きの面でも最も目立つ位置に置く意図。

### スクロール登場（各要素 1 回のみ）

| 対象 | 動き |
| --- | --- |
| 開催中／次回イベントの `<li>` | `y: 16 → 0` + `opacity`、0.5s、stagger 0.08s |
| 「主な機能」のカード 10 枚 | カテゴリ（3 グループ）単位で発火し、グループ内を stagger 0.05s |
| 衣装内訳のレアリティチップ | `scale: 0.9 → 1` + `opacity` を stagger 0.04s、続けて各枚数をカウントアップ |
| 謝辞 / お問い合わせ / プライバシー / 免責事項 | セクションごとに `y: 12 → 0` + `opacity` のみ。読み始めを妨げないため stagger しない |

### 数値カウントアップ

対象は統計チップ 3 個、機能カードの stat 3 個、衣装内訳のレアリティ別枚数。

表示は `toLocaleString('ja-JP')` でカンマ整形する。整形と補間の計算は `countUp.ts` の純粋関数に切り出し、Vitest で検証する。

統計チップと機能カードの stat には既に `tabular-nums` が効いており、桁が動いても幅は揺れない。**衣装内訳のチップには `tabular-nums` が無いため追加する**（`RARITY_BADGE_CLASSES` の色は変更しない。ADR 0047 の 3 チャンネル規約の対象外）。

## アクセシビリティ

- **`prefers-reduced-motion: reduce`**: `<head>` のインライン判定で `data-motion` フラグを立てない。要素は最初から最終状態で表示され、`homeMotion.ts` は即 return する。カウントアップも行わず最終値のままとする
- **カウントアップとスクリーンリーダー**: 途中値の読み上げを避けるため、カウント対象の `<span>` に `aria-hidden="true"` を付け、隣に `sr-only` で最終値を持つ `<span>` を置く。スクリーンリーダーには常に確定値だけが届く
- **`prefers-reduced-transparency` / `prefers-contrast`**: blur も半透明も使わないため追加対応は不要
- **フォーカスとタブ順序**: DOM 構造を変えず `transform` と `opacity` のみを操作するため影響しない

## パフォーマンス

- アニメーションは `transform` と `opacity` のみ。レイアウトもペイントも発生させない
- `will-change` はトゥイーン開始時に付与し完了時に除去する。16 セグメントに常時付けるとレイヤーが増えすぎるため
- IntersectionObserver は発火後 `unobserve`、全消化後に `disconnect` する

## テスト

### 単体テスト（Vitest）

`tests/unit/motion/countUp.test.ts` を新規作成する。

- 補間値の整形: `formatCount(1234.7)` → `"1,235"`、進捗 0 / 0.5 / 1 の各点で期待値を検証
- `prefersReducedMotion()` の再実装はしない。`prefers-reduced-motion` の判定は `BaseLayout.astro` の `<head>` インラインスクリプトが 1 箇所で行い、`homeMotion.ts` は `<html>` の `data-motion` フラグを読むだけとする（判定ロジックの二重化を避ける）
- `homeMotion.ts` は GSAP と実ブラウザ API に依存するため `/* v8 ignore start */` 〜 `/* v8 ignore stop */` でカバレッジ計測から除外し、E2E で検証する。テスト可能なロジックはすべて `countUp.ts` と `homeMotionDom.ts` に置く

`tests/unit/motion/homeMotionDom.test.ts` も新規作成する（`// @vitest-environment jsdom`）。属性の読み書き・グループ収集・IntersectionObserver の登録と解除を、観測子をファクトリ経由で注入して検証する。

CI にカバレッジ 95% ゲート（ADR 0032）があり、対象は `src/lib/**` 全体。`countUp.ts` と `homeMotionDom.ts` は 100% を狙い、`homeMotion.ts` は全体を `v8 ignore` で除外する。

### E2E テスト（Playwright）

`tests/home-motion.test.ts` を新規作成する。

1. `reducedMotion: 'reduce'` エミュレート時、`<html>` に `data-motion` が付かず、ヒーローと機能カードの `opacity` が `1` であること
2. 通常時、タイムライン完了後にヒーローと統計チップから `data-motion-item` が外れ、`opacity` が `1` であること
3. ページ最下部までスクロールしたあと、`data-motion-item` が残っている要素が 0 個であること
4. 統計チップの数値がアニメーション完了後に最終値（`data-count-to`）と一致すること

### 既存 E2E のリグレッション確認

- `tests/home.test.ts` の「衣装枚数と楽曲数が 0 より大きい」は `a[href$="/cards/"] .text-2xl` の `textContent` を読む。カウントアップ途中に読むと `0` を拾って落ちる可能性があるため、アニメーション完了を待つ待機を入れて安定化する
- `tests/character-color-bar.test.ts` の `getByLabel('七瀬陸の衣装一覧').click()` は、`scaleY` 中はバウンディングボックスが動く。Playwright は位置の安定を待つため理論上は通るが、実際に実行して確認する

## 記録すべき決定

### `docs/adr/0054-gsap-home-motion.md`（新規）

- 決定: トップページに限り GSAP を導入し、ADR 0046 §4「モーションは新規依存を増やさない」を部分的に上書きする
- 理由: サイトの第一印象強化。コストをトップページ 1 枚（gzip 約 27KB）に閉じ込め、他 2778 ページはゼロに保つ
- 却下案:
  - WAAPI + IntersectionObserver の自作。依存ゼロで ADR 0046 を維持できるが、カウントアップとシーケンス制御を自前実装することになる
  - 各コンポーネント内で直接 GSAP を呼ぶ。`client:load` の初期 JS に載って FCP を悪化させ、セクションを跨いだ登場順の制御も難しい
  - ScrollTrigger の併用。追加 12KB に見合う演出（pin / scrub / parallax）を本設計では使わない
- `docs/adr/README.md` の一覧表に行を追加する

### `docs/adr/0046-apple-design-redesign.md`（更新）

§4 に「[0054](0054-gsap-home-motion.md) により、トップページに限り GSAP の使用を許可。それ以外のページでは本節が有効」と追記する。ADR は削除せず追記で覆す運用に従う。

### `CLAUDE.md`（更新）

デザイン規約のモーション節に次を追記する。

- GSAP はトップページ専用（`src/pages/index.astro` と `src/lib/motion/home*.ts`）。他ページへ広げる場合は必ず ADR を追加すること
- トップページの要素に付いた `data-motion-*` 属性は `src/lib/motion/homeMotion.ts` から参照されている。マークアップ変更時は同ファイルも確認すること
