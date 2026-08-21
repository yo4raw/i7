# 0054 トップページに限り GSAP を導入する（ADR 0046 §4 の部分的上書き）

- ステータス: 承認
- 日付: 2026-08-21

## 文脈

[0046](0046-apple-design-redesign.md) §4 で「モーションは新規依存を増やさない」と決めて以降、サイトの動きは `svelte/transition` ベースの `materialIn` / `materialOut`（`src/lib/motion.ts`）と `pressable` utility だけで構成されている。モーションを使っているコンポーネントは `HeaderNav` / `CardPickerModal` / `ModalDialog` の 3 つのみで、意図的に動きの薄いサイトである。

この判断は「ドラッグで閉じるシート・フリック等のジェスチャー駆動 UI は本サイトに存在せず、追加もしない（YAGNI）」という前提に立っていた。その前提自体は今も正しい。

一方で、トップページは SNS からの流入と検索流入の入口であり、**「非公式ファンサイトとしてどれだけ作り込まれているか」が最初に伝わる場所**でもある。現状のトップページは 16 色バーのヒーロー（[0047](0047-character-color-identity.md)）・統計チップ・機能カード・衣装内訳という良い素材を持ちながら、それらが一斉に静止した状態で現れるだけになっている。

ここに限って演出を入れたい、という要求が出た。ジェスチャー駆動 UI の話ではなく、**シーケンス制御された登場演出と数値カウントアップ**が欲しいという要求である。

## 決定

1. **トップページ（`src/pages/index.astro`）に限り GSAP の使用を許可する。** これにより ADR 0046 §4 は、トップページについてのみ上書きされる。他のすべてのページでは §4 が引き続き有効であり、`materialIn` / `materialOut` / `pressable` を使う。

2. **依存はトップページ 1 枚に閉じ込める。** GSAP は `src/lib/motion/homeMotion.ts` からのみ import し、`index.astro` の `<script>` から呼ぶ。Vite がこのページ専用チャンクに切り出すため、残り 2778 ページの追加ペイロードは 0 バイトとなる。トップページの追加は gzip 約 27KB（GSAP 3.15.0 コア）。

3. **ScrollTrigger は導入しない。** スクロール登場は IntersectionObserver で実装する。ScrollTrigger の追加 gzip 約 12KB（全体の約 31% 増）に見合う機能（pin / scrub / parallax）を使わないため。将来この強度へ上げる場合は本 ADR を追記した上で導入する。

4. **GSAP を他ページへ広げる場合は必ず ADR を追加する。** 「トップだけ」という境界が形骸化しないよう、拡大は都度の意思決定として記録する。

5. **アクセシビリティとフェイルセーフの原則を明文化する。** `prefers-reduced-motion: reduce` ではモーションを一切実行せず最終状態を即時表示する。また初期非表示は `<html data-motion="on">` フラグが立っているときだけ有効とし、JavaScript 無効・チャンク取得失敗・例外のいずれでも要素が可視のままになるようにする。**「動かない」ことはあっても「見えない」ことは起きない**（[0001](0001-reject-glassmorphism-redesign.md) の視認性破綻を繰り返さない）。

## 検討した代替案

### WAAPI + IntersectionObserver で自作する（却下）

依存ゼロで ADR 0046 §4 を維持できる。しかしシーケンス制御（ヒーロー → 統計チップ → セクションの時間軸を跨いだ調整）とカウントアップのイージング／スナップを自前で書くことになり、100 行程度の実装とその保守を抱える。ここは既製ライブラリの得意分野であり、自作する動機が薄い。

### 各コンポーネント内で直接 GSAP を呼ぶ（却下）

`CharacterColorHero.svelte` / `EventCountdown.svelte` の中で個別に GSAP を使う案。動きとマークアップが近くて読みやすい反面、この 2 つは `client:load` の島であるため **GSAP が初期 JS に載って FCP を悪化させる**。さらに島を跨いだ登場順の制御ができず、今回の狙い（シーケンス感のある第一印象）と噛み合わない。

### サイト全体に GSAP を導入する（却下）

衣装一覧・スコア計算などのデータ画面にも演出を広げる案。衣装一覧は 2689 件の無限スクロールを持ち、行へのエントランスアニメーションは ADR 0046 §4 で明示的に禁止している（ちらつきとパフォーマンス）。またツール画面は「速く正確に操作できること」が価値であり、演出は妨げになる。

### ヒーローだけ CSS `@keyframes` に逃がす（却下）

ファーストビューを GSAP のロード完了に依存させない案。追加ペイロードを減らせるが、今回の狙いの中心である 16 色バーの演出が GSAP 側の timeline から切り離され、統計チップとの時間軸が合わなくなる。`modulepreload` + Service Worker の CacheFirst により初回以外はネットワーク待ちが発生しないため、この複雑さを払う価値がないと判断した。

## 影響

- `package.json` に `gsap` を追加する。
- `src/lib/motion/countUp.ts` / `src/lib/motion/homeMotionDom.ts` / `src/lib/motion/homeMotion.ts` を新設する。GSAP の import は `homeMotion.ts` だけに閉じ、同ファイルは `/* v8 ignore */` でカバレッジ対象外とする（`maxScoreFinder.worker.ts` と同じ方針）。既存の `src/lib/motion.ts`（`materialIn` / `materialOut` / `prefersReducedMotion`）はそのまま残す。
- `src/layouts/BaseLayout.astro` の `<head>` にモーションフラグ判定のインラインスクリプトを追加する。トップページ以外でもフラグは立つが、参照する CSS ルールの対象要素がトップページにしか無いため実害はない。
- `docs/adr/0046-apple-design-redesign.md` §4 に本 ADR への参照を追記する。
- `CLAUDE.md` のモーション規約に「GSAP はトップページ専用」「`data-motion-*` 属性は `homeMotion.ts` から参照される」を追記する。
- 既存 E2E（`tests/home.test.ts` / `tests/character-color-bar.test.ts`）はトップページを対象とするため、カウントアップ中の値を読まないよう安定化する。
- 設計の詳細は `docs/superpowers/specs/2026-08-21-gsap-home-motion-design.md` を参照。
