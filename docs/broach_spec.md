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
  name: string;      // 表示名（例: "ALL750", "Shout700"）
  shout: number;     // Shout加算値
  beat: number;      // Beat加算値
  melody: number;    // Melody加算値
}
```

### 共有ブローチ一覧

| 名前 | Shout | Beat | Melody |
|------|-------|------|--------|
| ALL750 | 750 | 750 | 750 |
| ALL700 | 700 | 700 | 700 |
| ALL500 | 500 | 500 | 500 |
| ALL300 | 300 | 300 | 300 |
| ALL200 | 200 | 200 | 200 |
| Shout700 | 700 | 0 | 0 |
| Shout400 | 400 | 0 | 0 |
| Beat700 | 0 | 700 | 0 |
| Beat400 | 0 | 400 | 0 |
| Melody700 | 0 | 0 | 700 |
| Melody400 | 0 | 0 | 400 |

## 6. ブローチ種類（broach_type）

固定ブローチには発動条件が異なる複数の種類がある。

| broach_type | 名称 | 発動条件 |
|-------------|------|---------|
| 1 | 属性UP | 無条件で発動 |
| 4 | グループ | 自カード（スロット0-4）に指定グループ以外のカードがない（空スロット・フレンド枠は無視） |
| 5 | アイドル属性カウント | デッキ内に同アイドル・同属性のカードが `limit` 枚以上 |
| 6 | 属性UP（上限付き） | 無条件だがデッキ内の発動数に上限あり |
| 7 | 全属性 | デッキ内にShout・Beat・Melody全属性が存在 |
| 8 | オート専用 | 現在のスコア計算では常に無効 |
| 9 | スコアUP | 指定楽曲をプレイ中のみ発動（ステータスではなくスコアに直接加算） |

### デッキ内発動上限

種類6・7のブローチにはデッキ全体での発動上限（`limit` フィールド）がある。同種のブローチが複数カードに存在する場合、上限を超えた分は無効になる。

## 7. スコア計算への影響

ブローチは2つの経路でスコアに影響する。

### ステータス加算（種類1〜8）

カードの属性値に加算され、チーム属性値の計算に反映される。フレンド枠（スロット5）のカードには適用されない。

```
broachShoutTotal = Σ スロット0-4の有効ブローチShout値
broachBeatTotal  = Σ スロット0-4の有効ブローチBeat値
broachMelodyTotal = Σ スロット0-4の有効ブローチMelody値

teamShout  = floor((rawShout  + broachShoutTotal)  × (100 + shoutRate)  / 100)
teamBeat   = floor((rawBeat   + broachBeatTotal)   × (100 + beatRate)   / 100)
teamMelody = floor((rawMelody + broachMelodyTotal) × (100 + melodyRate) / 100)
```

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
