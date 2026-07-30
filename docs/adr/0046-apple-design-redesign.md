# 0046 apple-design 原則に基づくサイト全体リデザイン

- ステータス: 承認
- 日付: 2026-07-20

## 文脈

現行 UI は Tailwind デフォルト + indigo-700 ヘッダー + 「白カード + `rounded-lg` + `shadow` + `border-l-4`」の反復で構成されており、デザイントークン・モーション設計・アクセシビリティ配慮（`prefers-reduced-motion` 等）を持たない。scoped CSS はゼロで、スタイルは 100% ユーティリティクラスのインライン記述。

一方、[0001](0001-reject-glassmorphism-redesign.md) では「グラス・ミュージックアプリ風」の全面リデザインを 14 タスク・E2E 通過まで実装したが、リリース直前のスクリーンショット確認で**「視認性が悪い」ため全面破棄**した。その教訓として「不透明〜高不透明度のサーフェスと高コントラストを最優先」「モックアップ承認は実データの詰まった画面（衣装一覧・スコア計算）で取る」が残っている。

今回、Apple の UI 設計思想（WWDC "Designing Fluid Interfaces" / "The Details of UI Typography" / "Principles of Great Design" 等）を Web プラットフォーム（CSS / Pointer Events / spring 近似）へ翻訳した `apple-design` スキルに基づき、見た目（タイポグラフィ・色・影・マテリアル）と動き（モーション・フィードバック）の両面でサイト全体をリデザインする。半透明マテリアルを含めて再挑戦するが、0001 の破綻を繰り返さないための明確な制約を設ける。

## 決定

### 1. マテリアルは 3 層に分離する（0001 の再来を防ぐ中核）

| レイヤー | 対象 | 処方 |
| --- | --- | --- |
| **Chrome（半透明）** | HeaderNav 本体、デスクトップドロップダウン、モバイルナビ、モーダルスクリム | 暗色インディゴ材 `material-chrome`（`indigo-700/85` + `backdrop-blur 16px` + `saturate`）を主とし、明色材 `material-overlay`（`white/80` + `blur 20px` + `ring-black/8`）はドロップダウン等に限定 |
| **Content（不透明）** | 全カード・テーブル・フィルタ・フォーム・チャート | `surface-card` = **完全不透明** `bg-white` + radius/shadow トークン |
| **背景** | body | `bg-gray-50` + 極微弱な indigo 系グラデーションティント（半透明 chrome の存在意義を作るが、`gray-500` キャプションの AA を割らない輝度に留める） |

- **本文テキストを載せる面は不透明**（0001 の破綻要因を規約化）。
- **明色材の上に明色材を重ねない**（モーダルパネル内のカードは solid）。ヘッダーを暗色ティント材にするのは、白テキストの実効コントラストが背後コンテンツの色に左右されにくく、構造的にコントラスト崩壊が起きにくいため。
- **リスト行・タイルに `backdrop-filter` を使わない**（衣装一覧 2689 件でのパフォーマンス劣化を避ける。半透明は chrome の小領域限定）。

### 2. WCAG AA を半透明面の受け入れ基準として明文化する

半透明サーフェス上のテキストは、想定される最明・最暗の背後コンテンツ双方に対して通常テキスト 4.5:1 を満たすこと。リリース前検証（衣装一覧・スコア計算・モーダルの実データスクリーンショット）で実測する。0001 教訓 2・3 に従い、承認は見栄え重視のホームではなく情報密度の高い実画面で取る。

### 3. アクセシビリティのフォールバックを CSS 定義側に集約する

`prefers-reduced-transparency: reduce`（不透明化 + blur 除去）・`prefers-contrast: more`（不透明 + 実線ボーダー）・`prefers-reduced-motion: reduce`（モーションを短絡・cross-fade 化）への対応を、利用側の各コンポーネントではなく `@utility` 定義内および `global.css` のグローバル `@media` に集約する。これによりフォールバックが定義 1 箇所で全適用され、抜け漏れを防ぐ。

### 4. モーションは新規依存を増やさない

- Framer Motion 系（`motion`）ライブラリや `svelte/motion` の Spring は**導入しない**。理由: ドラッグで閉じるシート・フリック等のジェスチャー駆動 UI は本サイトに存在せず、追加もしない（YAGNI）。ジェスチャー駆動でないトランジションは Svelte 組み込みの `svelte/transition` + CSS で十分。
- 開閉トランジション（ドロップダウン・モバイルナビ・モーダル）は `materialIn`/`materialOut`（scale + fade + blur の materialize、`transform-origin` をトリガーにアンカー）。イントロ 180ms / **アウトロ 120ms 以下**（閉操作をブロックしないため）。
- ボタン押下は `pressable`（`active:scale-[0.97]`、pointer-down での即時フィードバック）。
- 無限スクロールで追加される行にエントランスアニメを付けない（2689 件でのちらつき・パフォーマンス回避）。

### 5. タイポグラフィは CJK を前提に設計する

- 欧文向けの負トラッキング（`-0.02em`）は**使わない**（漢字が詰まって逆効果）。大見出しは `text-display`（`font-feature-settings: "palt"` + `letter-spacing: 0.01em` + `line-height: 1.35`）。
- 見出しに `text-wrap: balance`、説明文に `text-wrap: pretty`。スコア・ステータス数値列に `tabular-nums`。
- フォントはシステムフォントスタックを維持（`--font-sans` に Hiragino / Yu Gothic を明示）。カスタム Web フォントは導入しない。

### 6. 属性色の不整合を是正する

`global.css` の `@theme` にある `--color-beat` / `--color-melody` は色定義の単一情報源である `src/lib/constants.ts`（`ATTR_HEX`）と値が逆転していた（`@theme`: beat=`#3b82f6`/melody=`#22c55e`、正: Beat=`#22c55e`/Melody=`#3b82f6`）。`@theme` 側を constants.ts に合わせて修正する。色の単一情報源は引き続き `constants.ts` とする。

## 検討した代替案

- **半透明を完全に不採用（0001 完全踏襲）**: 最も安全だが、Apple 流のマテリアル階層による奥行き表現が得られない。chrome 限定 + AA 明文化 + フォールバックで視認性を担保できると判断し、限定的な再挑戦を選択。
- **明色ライトグラスヘッダー**: iOS/macOS ツールバーに近い白半透明。白コンテンツ上でヘッダー境界が曖昧になりスクロールエッジ効果への依存が強まるため、ブランド継続性でも優る暗色インディゴ材を採用。
- **motion（Framer Motion 系）の導入**: velocity handoff・interruptible spring を正確に実装できるが、本サイトにジェスチャー駆動 UI がなく、バンドルサイズと保守コストに見合わない。将来ジェスチャー UI を導入する場合に再検討する。
- **段階的リリース（ページ単位で順次適用）**: 一貫性のない中間状態が生じるため不採用。全ページ一括で適用し、Phase 2 完了時点に実データ画面での承認ゲートを設けることで 0001 の破綻リスクに対処する。

## 影響

- `src/styles/global.css`: `@theme` にトークン（影 4 段・角丸・blur・`--font-sans`・`--ease-spring`）追加、Beat/Melody 修正、`@utility`（`material-chrome`/`material-overlay`/`surface-card`/`pressable`/`text-display`）新設、body 背景グラデ、`prefers-reduced-motion` 一括対応。
- `src/lib/motion.ts` 新規: `prefersReducedMotion()` と `materialIn`/`materialOut` トランジション。
- `HeaderNav.svelte` / `BaseLayout.astro` / `CardPickerModal.svelte` を中心にマテリアル・モーション・スクロールエッジ効果を導入。全ページ・全コンポーネントのカードパターンを `surface-card` へ置換。
- `EventShareImage.svelte`（modern-screenshot による画像出力）には `backdrop-filter` を使わない（レンダリング非対応リスクのため）。
- ダークモード廃止（[0020](0020-abolish-dark-mode.md)）は継続。`dark:` バリアントは引き続き使用しない。
- View Transitions の導入は本 ADR のスコープ外（将来課題）。
- `CLAUDE.md` にデザイン規約（マテリアル 3 層・utility 使用規約・「本文面は不透明」「行アイテムに backdrop-filter 禁止」）を追記。
- 本 ADR の §1（クロームの indigo 材）と §5（カスタム Web フォントを導入しない）は、[0047](0047-character-color-identity.md) により部分的に上書きされた。マテリアル 3 層の構造とアクセシビリティ・モーションの方針は引き続き有効。
