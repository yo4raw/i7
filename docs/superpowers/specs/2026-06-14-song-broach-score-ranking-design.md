# 楽曲詳細ページの共通ブローチ スコア寄与 TOP10

## 背景・目的

楽曲ごとに、どの共通ブローチ（`SHARED_BROACHS`）が大きくスコアに寄与するかは、属性偏重・倍率分布によって変わる。ユーザーは楽曲詳細ページで「その楽曲における共通ブローチのスコア寄与 TOP10」を、棒グラフで視覚的に強さが分かる形で見たい。

## ドメイン整理

- 共通ブローチ（`src/lib/data/sharedBroachs.ts` の `SHARED_BROACHS`、全26種）は属性値（shout/beat/melody）を appeal に加算する。
- 1 ノーツ得点は実エンジン（`src/lib/score/simulation.ts` の `calcNoteScore`）と同じ 2 段 floor:
  `floor(floor(appeal × NOTE_RATE[type]) × LIGHT_MULTIPLIER[group])`
  （`NOTE_RATE` = 始点(white)0.025 / 終点(color)0.030、`LIGHT_MULTIPLIER` = ステージ倍率）。
- id 24-26（`targetAttribute` 付き「±属性枚数分 +300」）はデッキ内の対象属性カード枚数でスケールするため、デッキ非依存の単独寄与とは直接比較できない。

## スコープ

- 楽曲詳細ページに「共通ブローチ スコア寄与 TOP10」セクションを追加（水平棒グラフ）。
- 寄与は **デッキ非依存の単独寄与**: ブローチの属性値をそのまま appeal とし、実エンジンと同一式でその楽曲の全ノーツに適用して合算する。
- `targetAttribute` を持つ 3 種（id 24-26）は**ランキングから除外**し、フラット加算の 23 種を対象とする。

## 設計

### 寄与スコアの計算

ノーツを 1 件ずつ展開せず、ステージ×属性×始点終点の **カウント × 1ノーツ得点** で集計する（実エンジンと同一の `calcNoteScore` を再利用）:

```
寄与(broach) = Σ_(group ∈ SONG_NOTE_GROUP_KEYS, attr ∈ {shout,beat,melody}, type ∈ {white,color})
                 count(group, attr, type) × calcNoteScore(broach[attr], { type, group })
```

`count(group, attr, type)` は `song[group][`${attr}_${type}`]`。`broach[attr]` が 0 の属性は寄与 0。

DRY のため、現在 private な `calcNoteScore`（`simulation.ts`）に `export` を付与して再利用する（式の二重定義を避け engine と乖離させない）。`calcNoteScore` の第 2 引数は `FlatNote` 型だが、`attribute` フィールドは未使用（appeal は呼び出し側が属性別に渡す）であり、`{ type, group, attribute, excluded:false }` 形の合成ノートで呼べる。

### 構成（追加/変更ファイル）

1. **新規 `src/lib/score/songBroachRanking.ts`** — 純粋関数 `buildBroachRanking(song)` を提供。
   - `SHARED_BROACHS`（`targetAttribute` 無しの 23 種）・`SONG_NOTE_GROUP_KEYS`（`fetchSongsJson.ts`）・`calcNoteScore`（`simulation.ts`）・`NOTE_RATE`/`LIGHT_MULTIPLIER` を再利用。
   - 各ブローチの寄与を上式で算出し、寄与降順で上位 10 件を返す。寄与が全ブローチ 0（ノーツ無し）の場合は空配列。
   - 返却型:
     ```ts
     export type BroachAttrTag = 'Shout' | 'Beat' | 'Melody' | 'All';
     export interface BroachRankingEntry {
       id: number;
       name: string;
       score: number;
       attribute: BroachAttrTag; // バー色分け用。単一属性ブローチはその属性、ALL系は 'All'
     }
     function buildBroachRanking(song: Song): BroachRankingEntry[]; // 最大10件、score 降順
     ```
   - `attribute` の決定: shout/beat/melody のうち非 0 が 1 つだけならその属性、複数非 0 なら `'All'`。

2. **`src/lib/score/simulation.ts`** — `function calcNoteScore` を `export function calcNoteScore` に変更（挙動変更なし）。

3. **`src/pages/songs/[id].astro`** — 「ノーツ内訳」セクションの下に「共通ブローチ スコア寄与 TOP10」セクションを追加。`buildBroachRanking(song)` の結果が空でないときのみ描画。

### 棒グラフ表示

SVG ではなく **CSS 幅バー**（`<div>` の `width: N%`）で水平棒グラフを描画する（レスポンシブ・ダークモード・アクセシブル、クライアント JS 不要）。

- 各行: 順位 + ブローチ名 + バー + スコア値（`toLocaleString()`）。
- バー幅は `score / maxScore × 100%`（1 位が 100%）。
- バー色はブローチ属性で塗る: Shout=`bg-red-500` / Beat=`bg-green-500` / Melody=`bg-blue-500` / All=`bg-indigo-500`（`ATTR_BADGE_BG` と整合、All は indigo）。
- バーは色のみに依存しないよう、スコア値を必ず併記する（色覚アクセシビリティ）。

### データ流れ

ビルド時: `song` props → `buildBroachRanking()` → 静的 HTML（CSS バー）。新規フェッチ・クライアント JS なし。

### エラー・欠損ハンドリング

- ノーツが無い楽曲では寄与が全 0 → `buildBroachRanking` が空配列を返し、セクションを描画しない。
- `maxScore` が 0 になるケース（空配列）はセクション非表示で回避されるため、バー幅の 0 除算は発生しない。

## テスト

- 単体（Vitest, `tests/unit/score/songBroachRanking.test.ts`）: `buildBroachRanking` を検証 —
  - 最大 10 件・`score` 降順。
  - `targetAttribute` を持つ id 24-26 が結果に含まれない。
  - Shout 偏重曲では Shout 系ブローチが Melody 系より上位。
  - ノーツ無し楽曲で空配列。
  - `attribute` タグが単一属性/ALL を正しく判定。
- 既存テスト: `calcNoteScore` の `export` 追加後も `npm run test:unit` が全て緑であること（特に `tests/unit/score/engine.test.ts`）。
- E2E: 楽曲詳細を含むページ E2E は `playwright.config.ts` の `testIgnore` で無効化中のため追加しない。レンダリング確認は dev サーバー目視で行う。

## 用語・命名

- ユーザー可視テキストは「共通ブローチ」「スコア寄与」、属性名 Shout/Beat/Melody。
- 内部識別子は `broach` / `song` / `SHARED_BROACHS` を引き続き使用する。

## ADR

寄与の定義（デッキ非依存・実エンジン式）、条件付き 3 種の除外、CSS バー採用の意思決定を含むため、`docs/adr/0010-song-broach-score-ranking.md` を追加し `docs/adr/README.md` に追記する。
