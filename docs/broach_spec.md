# ブローチ仕様書

## 1. 概要

ブローチはカードに装着することでステータスを強化するアイテム。URカードには最大2つのブローチスロットがある。ブローチには「固定ブローチ」と「共有ブローチ」の2種類が存在する。

## 2. ブローチの種類

### 固定ブローチ

カードに紐付いたブローチ。つけ外しはできない。

- データソース: Google Spreadsheet (GID: `1087762308`)
- フェッチャー: `src/lib/data/fetchFixedBroachsJson.ts`
- `card_id` でカードと紐付く

### 共有ブローチ

任意のURカードに自由に装着できるブローチ。

- データソース: `src/lib/data/sharedBroachs.ts` にハードコード
- カードとの紐付きはなく、ユーザーが任意に選択する

## 3. スロットルール

| カードレアリティ | スロット数 | 備考 |
|----------------|----------|------|
| UR | 2 | 固定ブローチ + 共有ブローチの組み合わせ |
| UR以外 | 0 | ブローチ装着不可 |

### 装着パターン

| 固定ブローチ | 共有ブローチ | 合計 |
|------------|-----------|------|
| あり | 最大1つ | 2 |
| なし | 最大2つ | 2 |

- 固定ブローチが存在するカードは、共有ブローチを **1つだけ** セットできる
- 固定ブローチが存在しないURカードは、共有ブローチを **2つまで** セットできる

## 4. 固定ブローチのデータ構造

```typescript
interface FixedBroach {
  id: number | null;          // ブローチID
  card_id: number | null;     // 紐付くカードID
  card_name: string | null;   // カード名
  shout: number | null;       // Shout加算値
  beat: number | null;        // Beat加算値
  melody: number | null;      // Melody加算値
  attribute: string | null;   // 属性条件
  idol: string | null;        // アイドル条件
  group: string | null;       // グループ条件
  auto: number | null;        // オート
  song: string | null;        // 楽曲条件
  score: number | null;       // スコア加算値（種類9用）
  limit: number | null;       // デッキ内発動上限
  broach_type: number | null; // ブローチの種類（1〜9）
  condition: string | null;   // 条件テキスト
}
```

## 5. 共有ブローチのデータ構造

```typescript
interface SharedBroach {
  id: number;
  name: string;                                  // 表示名（例: "ALL750", "Shout700"）
  shout: number;                                 // Shout加算値
  beat: number;                                  // Beat加算値
  melody: number;                                // Melody加算値
  targetAttribute?: 'Shout' | 'Beat' | 'Melody'; // 条件付きブローチのみ設定
}
```

`targetAttribute` を持つブローチは、装着カード自身の属性ではなく **デッキ内で対応属性を持つカード枚数** に応じて加算値が倍化する（例: `targetAttribute: 'Shout'` かつデッキに Shout 属性 3 枚なら `shout × 3` を装着カードに加算）。詳細は `score_calc_spec.md §3-4` を参照。

### 共有ブローチ一覧

#### 全属性ブローチ

| 名前 | Shout | Beat | Melody |
|------|-------|------|--------|
| ALL750 | 750 | 750 | 750 |
| ALL700 | 700 | 700 | 700 |
| ALL500 | 500 | 500 | 500 |
| ALL300 | 300 | 300 | 300 |
| ALL200 | 200 | 200 | 200 |

#### 単属性ブローチ

| 名前 | Shout | Beat | Melody |
|------|-------|------|--------|
| Shout1100 | 1100 | 0 | 0 |
| Shout1000 | 1000 | 0 | 0 |
| Shout900 | 900 | 0 | 0 |
| Shout700 | 700 | 0 | 0 |
| Shout500 | 500 | 0 | 0 |
| Shout400 | 400 | 0 | 0 |
| Beat1100 | 0 | 1100 | 0 |
| Beat1000 | 0 | 1000 | 0 |
| Beat900 | 0 | 900 | 0 |
| Beat700 | 0 | 700 | 0 |
| Beat500 | 0 | 500 | 0 |
| Beat400 | 0 | 400 | 0 |
| Melody1100 | 0 | 0 | 1100 |
| Melody1000 | 0 | 0 | 1000 |
| Melody900 | 0 | 0 | 900 |
| Melody700 | 0 | 0 | 700 |
| Melody500 | 0 | 0 | 500 |
| Melody400 | 0 | 0 | 400 |

#### 条件付きブローチ（属性枚数分）

| 名前 | Shout | Beat | Melody | targetAttribute |
|------|-------|------|--------|-----------------|
| S属性枚数分Shout+300 | 300 | 0 | 0 | Shout |
| B属性枚数分Beat+300 | 0 | 300 | 0 | Beat |
| M属性枚数分Melody+300 | 0 | 0 | 300 | Melody |

## 6. ブローチ種類（broach_type）

固定ブローチには発動条件が異なる複数の種類がある。

| broach_type | 名称 | 発動条件 |
|-------------|------|---------|
| 1 | 属性UP | 無条件で発動 |
| 4 | グループ | 自カード（スロット0-4）に指定グループ以外のカードがない（空スロット・フレンド枠は無視） |
| 5 | アイドル属性カウント | 加算値は指定アイドル × 指定属性のカード枚数（フレンド枠含む、最大 6 枚）で倍率化。`limit` は同種ブローチ自体のデッキ内重複発動上限（2 枚目以降は発動しない） |
| 6 | 属性UP（上限付き） | 無条件だがデッキ内の発動数に上限あり |
| 7 | 全属性 | デッキ内にShout・Beat・Melody全属性が存在 |
| 8 | オート専用 | 現在のスコア計算では常に無効 |
| 9 | スコアUP | 指定楽曲をプレイ中のみ発動（ステータスではなくスコアに直接加算） |

### デッキ内発動上限

種類6・7のブローチにはデッキ全体での発動上限（`limit` フィールド）がある。同種のブローチが複数カードに存在する場合、上限を超えた分は無効になる。

### アイドル属性カウントの倍率（種類5）

種類5のブローチはデッキ内の同アイドル・同属性カード枚数に応じて加算値がスケールする。フレンド枠（スロット5）も枚数カウントに含まれるため、対象枚数は最大 6 枚。`limit` はブローチ自体のデッキ内重複発動数を制限するフィールドで、同種ブローチを複数カードが持っていても `limit` 枚目までしか発動しない（種類 6/7 と同じデッキ内発動上限の仕組み）。

例: カードID 2132（Melody属性・四葉環）の固定ブローチ（Melody+1000）の場合、デッキ内のMelody属性・四葉環カードが 2 枚なら Melody+2000、6 枚（デッキ全員が対象）なら Melody+6000 が最大値。ただし同じブローチをデッキ内の複数カードが装備していても、`limit = 1` なら 1 枚分しか加算されず +12000 にはならない。

## 7. スコア計算への影響

ブローチは2つの経路でスコアに影響する。

### ステータス加算（種類1〜8）

カードの属性値に加算され、チーム属性値の計算に反映される。スロット0〜5 全枠（フレンド枠含む）のブローチが加算対象となる。

```text
broachShoutTotal = Σ スロット0-5（フレンド枠含む）の有効ブローチShout値
broachBeatTotal  = Σ スロット0-5（フレンド枠含む）の有効ブローチBeat値
broachMelodyTotal = Σ スロット0-5（フレンド枠含む）の有効ブローチMelody値

baseShout  = rawShout  + broachShoutTotal
baseBeat   = rawBeat   + broachBeatTotal
baseMelody = rawMelody + broachMelodyTotal

# センター（slot 0）とフレンド（slot 5）のセンタースキル倍率は、
# それぞれの属性値ボーナスを「個別に floor してから合算」する（合算 floor ではない）。
centerXxx = (centerAttr 一致時) ? floor(baseXxx × centerRate / 100) : 0
friendXxx = (friendAttr 一致時) ? floor(baseXxx × friendRate / 100) : 0

teamShout  = baseShout  + centerShout  + friendShout
teamBeat   = baseBeat   + centerBeat   + friendBeat
teamMelody = baseMelody + centerMelody + friendMelody
```

センター／フレンドそれぞれの倍率適用と独立 floor の詳細式・例は `docs/score_calc_spec.md §3-5 / §3-6` を参照。

### スコア直接加算（種類9）

最終スコアに直接加算される。バッジ倍率適用後に加算。

```
最終スコア = floor(floor(ノーツスコア合計) × バッジ倍率) + broachScoreBonus
```

## 8. 実装ファイル

| ファイル | 役割 |
|---------|------|
| `src/lib/data/fetchFixedBroachsJson.ts` | 固定ブローチデータのフェッチ |
| `src/lib/data/sharedBroachs.ts` | 共有ブローチのマスターデータ |
| `src/lib/score/broachResolver.ts` | ブローチの条件判定・発動上限処理 |
| `src/lib/score/engine.ts` | ブローチ値のチーム属性値・スコアへの反映 |
| `src/lib/score/types.ts` | `DeckCard.broach*`、`ComputedTeam.broach*` 型定義 |
