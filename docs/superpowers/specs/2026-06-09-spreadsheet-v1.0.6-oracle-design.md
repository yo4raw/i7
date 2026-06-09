# スプレッドシート v1.0.6 オラクル化＋差分検証 設計書（サブプロジェクト B）

> 作成: 2026-06-09
> 親設計: `docs/superpowers/specs/2026-06-09-score-calc-spreadsheet-alignment-design.md`（サブB）
> 調査メモ: `docs/spreadsheet-v1.0.6-investigation.md`
> 参照正: ota-life.com「アイナナスコア計算ツール」**v1.0.6**（コピー `1PeVXm...09XwI`）

## 背景と目的

engine（`src/lib/score/`）のスコア計算と、スプレッドシート v1.0.6 のロジック差分を
**実行可能な形で可視化・明文化**し、engine 改修時の**回帰ガード**を整える。

engine をスプレッドシートに合わせて書き換えること（＝サブC）は本書のスコープ外。
本書は「オラクル構築＋差分レポート＋既知差分の明文化」まで。どの差分を engine 側で
直すかは差分を見てから個別判断する（ユーザー合意：差分レポート方式）。

## 確定した設計判断

| 項目 | 決定 |
| --- | --- |
| ゴールデン値 | 複数デッキをスプレッドシートに設定 → GViz で実採取（採取ワークフロー検証済み） |
| オラクルの位置づけ | `tests/` 配下の**検証専用・engine 非依存の独立ポート**（出荷コードに含めない） |
| 再現範囲 | **両モード（期待値=確率 / 最大値=フル発動）× 全構成要素**（属性値/スコアアップ/縮小/最終） |
| 差分の扱い | **差分レポート方式**：`一致 / 既知差分 / 想定外` に分類。想定外のみテスト失敗、既知差分は記録 |

## アーキテクチャ：2つの比較

オラクルは engine 内部を一切流用しない独立実装とする（engine を engine で検証することを避ける）。

```
        ┌─ 同一入力（デッキ/楽曲/設定/モード）─┐
        ↓                                       ↓
 spreadsheetOracle（独立ポート）           engine.ts（既存）
        ↓                                       ↓
 ① オラクル値 ──完全一致照合──→ ライブ採取ゴールデン値
    （ポートが忠実かを担保）
        ↓
 ② オラクル値 ──項目別差分レポート──→ engine 値
    （一致/既知差分/想定外に分類、想定外のみ fail）
```

- **① ポート忠実性検証**：オラクル出力 = スプレッドシート実採取値（属性値/スコアアップ/縮小/最終）を**完全一致**で確認。整数演算のため許容誤差 0。ズレ＝ポートのバグ。
- **② engine 差分検証**：オラクル（＝スプレッドシート）と engine を項目別比較。既知差分は v1.0.6 差分 doc に記録、想定外のみ失敗。engine 改修時の回帰ガードを兼ねる。

## コンポーネント構成

### オラクル（`tests/oracle/`）

責務ごとにファイル分割（各ファイルは1つの計算領域に対応）:

| ファイル | 責務 |
| --- | --- |
| `spreadsheetOracle.ts` | エントリ。入力 → 結果内訳を返す（`runOracle`） |
| `attributeScore.ts` | 属性値スコア（特訓判定後属性値・センター/フレンド・ブローチ・per-note 丸め） |
| `scoreUpSkill.ts` | スコアアップスキル（確率モード=期待値 / フル発動=最大） |
| `shrinkSkill.ts` | 縮小スキル（v1.0.6 式：基準スコア・先頭除外なし・カバー率分母=全曲尺・rate 加重平均ほか） |
| `rabbitNote.ts` | ラビットノート加算（キャラ単位フラグ和） |
| `knownDiffs.ts` | 既知差分の許可リスト（項目 × ケース条件 → 理由・spec 参照） |
| `oracleTypes.ts` | 入力/出力の型 |

**入力インターフェース**（engine と同一の生入力を受ける）:
```ts
runOracle(
  deck: (Card | null)[],          // フィクスチャの Card（ID 列で引く）
  song: Song,
  settings: {
    center: number; friend: number;
    trained: boolean[]; skillLevels: (1|2|3|4|5)[];
    broachs: ...; sharedBroachs: ...; rabbitNotes: ...;
    badgeRate: number; assist: boolean;
  },
  mode: 'expected' | 'max',
): OracleResult
```

**出力**（engine の `ExpectedScore` と同じ内訳キーで項目別比較を容易にする）:
```ts
interface OracleResult {
  attr: number;      // 属性値スコア
  scoreUp: number;   // スコアアップスキル
  shrink: number;    // 縮小スキル
  liveEnd: number;   // ライブ終了時
  final: number;     // 最終リザルト（バッジ適用後）
}
```

ポートの根拠：`docs/spreadsheet-spec-v1.0.5.md` と xlsx 展開済みの v1.0.6 数式
（`tmp/xlsx_extract/xl/worksheets/sheet5.xml` の `<f>` 要素）を突き合わせ、v1.0.5→v1.0.6 の
数式差分を確認して反映する。

### ゴールデンケース（`tests/fixtures/golden/spreadsheet-v1.0.6.json`）

1ケース＝全入力次元＋両モードの実採取出力。スキーマ:
```jsonc
{
  "label": "UR6枚・縮小多め",
  "deck": [1950, 1952, 1493, 1196, 1198, 1362],   // ID 列
  "center": 0, "friend": 5,
  "trained": [true,true,true,true,true,true],
  "skillLevels": [5,5,5,5,5,5],
  "broachs": [...], "sharedBroachs": [...], "rabbitNotes": {...},
  "song": { "id": ..., "notes": 461, "duration": 92 },
  "badgeRate": 16, "assist": false,
  "expected": { "attr": ..., "scoreUp": ..., "shrink": ..., "liveEnd": ..., "final": ... },
  "max":      { "attr": ..., "scoreUp": ..., "shrink": ..., "liveEnd": ..., "final": ... }
}
```

採取手順（1デッキあたり）:
1. ユーザーがコピーでデッキ・楽曲・設定を入力
2. **フル発動トグル ON** を GViz で読む → `max` に記録
3. **確率トグルに切替** → 読む → `expected` に記録
4. デッキ構成（センター/フレンド枠・特訓・スキルLV・ブローチ）も同時に読み取り記録

ケース数：5〜10 件。差分が出やすい構成を意図的に混ぜる（縮小多め / タイマー型 / 特効あり /
SR 混在 / カバー率>100% / ラビットノート有 など）。最初の数件で回路を固めてから追加する。
センター/フレンド枠・特訓・スキルLV をスプレッドシートのどのセルから読むかは実装着手時に
1件で確定する（ゴールデン #1 が読めることは調査メモ §5-3 で確認済み）。

### 比較ハーネス（`tests/unit/score/spreadsheetDiff.test.ts`）

各ゴールデンケース × 各モードについて:

**① ポート忠実性テスト**：`runOracle(入力, mode)` の各項目 === ゴールデン実採取値（完全一致）。

**② engine 差分テスト**：項目ごとに `{ oracle, engine, delta, deltaPct, classification }` を算出。
```
classification:
  match       : 一致（整数演算につき許容誤差 0）
  known-diff  : knownDiffs.ts の許可リストに合致（縮小の4点など、理由・spec 参照付き）
  unexpected  : それ以外 → test fail
```
レポートは `console.table` 風に出力し CI ログでも一覧可能にする。`match` だった項目が崩れたら
即 `unexpected` で検知（回帰ガード）。サブ C で一致させた項目は許可リストから外す。

engine 側の入力生成は既存の `computeTeam` / `flattenNotes` / `calcExpectedScore` /
`calcMaxScore` をそのまま利用（`tests/fixtures` の `findCardById` 等のヘルパーを再利用）。

## エラー処理・境界

- オラクルが engine の補助関数（`computeTeam` 等）を**呼ばない**ことを設計上の不変条件とする
  （独立性の担保）。属性値・センター・ブローチ計算もオラクル内で完結させる。
- ゴールデン値はスプレッドシートの表示（カンマ区切り整数）をパースして数値化。
- v1.0.5→v1.0.6 で数式差分が見つかった場合は調査メモと差分 doc に追記してから反映。

## テスト

- 単体テスト：上記 `spreadsheetDiff.test.ts`（Vitest、`npm run test:unit`）。
- オラクルは構成要素ごとに段階構築し、各段でゴールデンの該当項目に TDD。
  最初のマイルストーン＝「1デッキ・属性値スコアの ① 完全一致」。

## 完了条件（Done）

1. `tests/oracle/` の独立オラクルが、採取した全ゴールデンケースの両モードで **① 完全一致**。
2. `tests/unit/score/spreadsheetDiff.test.ts` が緑（② で `unexpected` ゼロ、`known-diff` は許可リスト化）。
3. `docs/spreadsheet-score-calc-diff.md` が v1.0.6 で更新され、全既知差分が根拠付きで明文化。
4. `tests/fixtures/golden/spreadsheet-v1.0.6.json` に 5〜10 ケース（両モード採取済み）。

## スコープ外

- engine 自体の計算ロジック変更（→ サブC）。
- スコア計算ページへのスプレッドシート値併記 UI（前回「たちばなロジック」として削除済み。復活させない）。
- モンテカルロ分布の検証（engine 独自・スプレッドシートに対応物なし）。
