# 所持衣装のスキル Lv を保存し、スコア計算・編成組合計算に反映する

- 日付: 2026-09-09
- 関連 ADR: 0085

## 目的

所持衣装ごとに 1 枚単位のスキル Lv（1〜5）を保存し、スコア計算ではスロットの既定 Lv として、編成組合計算では「所持衣装で検索」時の評価 Lv として使う。現状はどちらも全衣装 Lv5 前提で、育成途中の衣装を持つ利用者には実態と離れたスコアが出ている。

## 決定済みの前提

| 項目 | 決定 |
| ---- | ---- |
| 保存粒度 | 1 枚ごと（同じ衣装を 2 枚持てば Lv を 2 つ持つ） |
| 保存項目 | スキル Lv のみ。特訓済みかは保存しない（従来どおり済み前提） |
| 入力場所 | 所持数入力（`CountInput.svelte`）の横に枚数分のセレクトを展開 |
| 既定値 | 未入力は Lv5。既存データ・追加した 1 枚も Lv5 扱い（マイグレーション不要） |
| 保存形式 | 別キー `i7_card_skill_levels`。`i7_card_counts` は枚数の単一情報源のまま |

## 1. データ層

### localStorage

- `STORAGE_KEYS.CARD_SKILL_LEVELS = 'i7_card_skill_levels'` を `src/lib/storage.ts` に追加する
- 値は `Record<string, SkillLevel[]>`。キーは `Card.ID` の文字列、配列の i 番目が i 枚目の Lv
- バックアップ（`FooterTools.svelte`）は `STORAGE_KEYS` を列挙するため追加作業なしで対象に入る。形式 version は 1 のまま
- `SkillLevel` 型は `src/lib/score/deckState.ts` の既存定義を流用する

### ストア `src/lib/stores/cardSkillLevels.svelte.ts`

`countStore.svelte.ts` と同じ「`$state` をクロージャに閉じ、関数経由で読み書きする」形にする。

| 関数 | 振る舞い |
| ---- | -------- |
| `getLevels(cardId, count)` | 保存配列を `count` 件に切り詰め、足りない分は 5 で埋めて返す（長さは常に `count`） |
| `setLevel(cardId, index, lv)` | `index` 枚目を更新。更新後に全要素が 5 なら キーごと削除する（既定値は保存しない） |
| `sortedLevels(cardId, count)` | `getLevels` を降順に並べて返す。計算側の消費はこちらを使う |
| `reload()` | `countStore` と同じく localStorage の最新内容に同期する（バックアップ取り込み後に使う） |

所持数を減らしたときに配列を掃除する処理は持たない。読み手が常に `count` に切り詰めるため、余分な要素は無害。

## 2. 入力 UI（`src/components/cards/CountInput.svelte`）

- 所持数が 1 以上のとき、± 行の下に枚数分の `<select>`（選択肢 1〜5）を横並び・折り返し可で表示する
- 各セレクトの `aria-label` は「スキルレベル（n 枚目）」。表示ラベルは「Lv」
- 一覧の表（`CardTableRow`）・タイル（`CardTileCard`）・モバイル（`CardMobileCard`）は同じ部品を使うため、変更はこの 1 ファイル。表の所持数列（`w-28`）が足りなければ広げる
- 行クリックで詳細へ遷移する既存の伝播停止（`stopPropagation`）をセレクトにも付ける
- 衣装詳細・衣装比較・衣装ピッカーの表示は変えない

## 3. スコア計算（`src/components/ScoreCalc.svelte`）

- `handlePick(slot, card)` で `setCard` の後に、スロットの既定 Lv を決める
  - `sortedLevels(card.ID, getCount(card.ID))` を取り、他スロットに同じ衣装が既に k 枚あれば k 番目（0 起点）の Lv を使う。添字が範囲外・未所持なら 5
- スロットの Lv セレクトは残し、手動変更は従来どおり
- 保存デッキ・共有 URL・`i7_score_calc_state` の形式は変えない（スロット Lv は既に保存対象）

既定 Lv の決定は `src/lib/score/deckState.ts` に純関数 `defaultSkillLevelFor(levels: SkillLevel[], alreadyUsed: number): SkillLevel` として置き、単体テストの対象にする。

## 4. 編成組合計算

### 入力（`src/lib/score/maxScoreFinder.ts`）

- `SearchInput` に `ownedSkillLevels: Record<string, SkillLevel[]>`（降順）を追加する。`ownedOnly` のときだけ使う
- `src/components/MaxScoreFinder.svelte`（`SearchInput` を組み立てている箇所）で所持衣装ごとに `sortedLevels` から組み立てて Worker に渡す。プレーンなオブジェクトなので `postMessage` の直列化はそのまま通る

### 評価（`evaluateDeck`）

- `ownedOnly` が true のとき、スロット 0〜4 の Lv を次の規則で決める: スロット i の衣装がスロット 0〜i-1 に k 枚出ていれば `ownedSkillLevels[id][k] ?? 5`
- フレンド枠（スロット 5）と `ownedOnly` が false のときは従来どおり Lv5 固定
- 同じ衣装を複数枚使う編成では、高い Lv を先頭側のスロットに入れる。同一衣装の並びは正規形判定（`isCanonical`）で既に 1 通りに潰されているため探索空間は増えない
- `SEARCH_SKILL_LEVELS` 定数はスロットごとの配列を組み立てる形に置き換える（`ownedOnly` false 時は同じ内容）

### 結果（`DeckRecord` / `SearchResults.svelte`）

- `DeckRecord` に `skillLevels?: SkillLevel[]` を追加し、`ownedOnly` 時に評価に使った配列を記録する
- `SearchResults.svelte` は固定の `[5,5,5,5,5,5]` / `getApSkillLevel(card, 5)` をやめ、記録された Lv（無ければ 5）でスキル効果・`computeTeam`・スコア計算への引き渡しを行う

### 解説文

- `src/pages/score-calc/max-score-finder/index.astro` の「スキルレベルは全て Lv5 / 特訓済み前提」と ToolGuide の説明を、「特訓済み前提。スキルレベルは既定 Lv5、『所持衣装で検索』ON のときは衣装一覧で登録したスキル Lv で評価」に改める（ADR 0058: 仕様を変えたら解説も直す）

## 5. テスト

### Vitest（`tests/unit/`）

- ストア: 切り詰め・5 埋め・全 5 で削除・降順ソート・`reload`
- `defaultSkillLevelFor`: 未所持 → 5、1 枚目 → 最高 Lv、2 枚目 → 次の Lv、範囲外 → 5
- `evaluateDeck`: 同一衣装 2 枚（Lv5 と Lv3）で 2 枚目のみ Lv3 が効くこと、フレンドは 5 のままであること、`ownedOnly` false では全 5 で結果が従来と一致すること、`DeckRecord.skillLevels` が記録されること

### Playwright（`tests/`）

- 衣装一覧で所持数を 1 にして Lv を 3 に変更 → リロード後も 3 が残る
- スコア計算で同じ衣装をスロットに置く → スロットの Lv セレクトが 3 になる
- 編成組合計算は CPU 負荷が重いため単体テストで代替する

## 6. ADR

`docs/adr/0085-owned-card-skill-levels.md` を追加し、README の一覧表に行を足す。決定事項は上表の 5 項目と同一衣装複数枚の割り当て規則。代替案は「衣装ごとに 1 つの Lv」「`i7_card_counts` の値をオブジェクト化」「1 枚ごとのレコード配列に置き換え」「特訓済みも保存」。

## 対象外

- 特訓済みかの保存
- 衣装詳細ページでの Lv 編集
- 編成組合計算の「所持衣装で検索」OFF 時の Lv 指定
- ラビットノート・共通ブローチの扱いの変更
