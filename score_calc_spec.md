# スコア計算シミュレーター仕様書（叩き台）

## 1. 概要

IDOLiSH7 のライブスコアをモンテカルロ法で推定するクライアントサイドシミュレーター。
楽曲とデッキ（カード 5 枚 + フレンド 1 枚）を選択し、**全ノート Perfect** を前提として、
AP スキルの確率的な発動パターンを 1,000 回シミュレートし、スコアの期待値と分布を算出する。

### スコア計算式（全体像）

```
1ノートのスコア =
  (属性値(ブローチ含) + センタ/フレンド同色ボーナス) × ノート係数(白2.5%|色3%)
  × ライト倍率 × 判定縮小倍率
  + スコアアップ加算値

トータル = Σ 各ノートのスコア × バッジ効果（v2で実装）
```

### スコープ（v1）

| 含む | 含まない（v2 以降） |
|------|---------------------|
| 全 Perfect 前提のスコア計算 | Great/Good/Bad/Miss 混在の判定シミュレーション |
| AP スキル Lv5 固定での確率的発動 | コンボボーナス |
| センター/フレンド同属性ボーナス（+20%） | バッジ効果（別途実装） |
| ブローチ（固定装備）によるステータス加算 | フリーブローチの選択 |
| ライト倍率（8段階） | オートライブ時の判定分布 |
| 期待最低値・期待最高値の確定計算 | ライブスキル／MV スキル |

---

## 2. ユーザーフロー

```
Step 1: 楽曲選択
  └─ 楽曲リストから1曲選択（楽曲名・難易度・ノーツ数・属性比率を表示）

Step 2: デッキ編成（5枚 + フレンド1枚）
  ├─ スロット 1（センター）: 所持数≧1のカードから選択
  ├─ スロット 2〜5: 所持数≧1のカードから選択（重複不可）
  └─ スロット 6（フレンド）: 全カードから任意に1枚選択（未選択可）
  ※ AP スキルは全カード一律 Lv5 で計算する（レベル選択 UI は設けない）

Step 3: シミュレーション実行
  └─ 「スコア計算」ボタン押下 → 1,000回のモンテカルロシミュレーション

Step 4: 結果表示
  ├─ 期待最低値・期待最高値（確定計算、即時表示）
  ├─ MC 統計値（平均・中央値・最小・最大・標準偏差・90パーセンタイル）
  ├─ スコア分布ヒストグラム（期待最低値〜最高値の範囲で描画）
  └─ カードごとのスキル発動統計
```

---

## 3. チームアピール値の計算

### 3.1 基本アピール値

各カードの `shout_max`・`beat_max`・`melody_max` を合算する。

```
raw_shout  = Σ card[i].shout_max  (i = 0..5, card[5]はフレンド)
raw_beat   = Σ card[i].beat_max
raw_melody = Σ card[i].melody_max
```

### 3.2 ブローチ加算

自分のカード（スロット 1〜5）に紐づくブローチのステータスを加算する。
フレンドカード（スロット 6）のブローチは**適用しない**。

```
broach_shout  = Σ broach[i].shout   (i = 0..4, card_id が一致するブローチ)
broach_beat   = Σ broach[i].beat
broach_melody = Σ broach[i].melody
```

### 3.3 センター/フレンド同属性ボーナス

センターカード（スロット 1）の属性と同じ属性値に **+10%**、
フレンドカード（スロット 6）の属性と同じ属性値に **+10%** を適用する。

- センターが Shout 属性 → チーム全体の Shout 値 +10%
- フレンドが Shout 属性 → チーム全体の Shout 値 +10%
- センターとフレンドが同属性の場合、その属性値は最大 **+20%**

```typescript
// センター/フレンドボーナス算出（属性ごと）
let shoutBonusRate = 0;
let beatBonusRate = 0;
let melodyBonusRate = 0;

// センターの属性と一致する属性値に +10%
if (team.cards[0].attribute === 'shout')  shoutBonusRate  += 10;
if (team.cards[0].attribute === 'beat')   beatBonusRate   += 10;
if (team.cards[0].attribute === 'melody') melodyBonusRate += 10;

// フレンドの属性と一致する属性値に +10%
if (team.cards[5]?.attribute === 'shout')  shoutBonusRate  += 10;
if (team.cards[5]?.attribute === 'beat')   beatBonusRate   += 10;
if (team.cards[5]?.attribute === 'melody') melodyBonusRate += 10;

// 最終チームアピール値
const team_shout  = Math.floor((raw_shout + broach_shout) * (100 + shoutBonusRate) / 100);
const team_beat   = Math.floor((raw_beat + broach_beat) * (100 + beatBonusRate) / 100);
const team_melody = Math.floor((raw_melody + broach_melody) * (100 + melodyBonusRate) / 100);
```

---

## 4. ノートごとのスコア計算式

### 4.1 ノート係数（白 / 色）

各ノートには属性（Shout / Beat / Melody）とタイプ（白 / 色）がある。

| ノートタイプ | 係数 | 参照する属性値 |
|-------------|------|---------------|
| 白ノート | **2.5%**（×0.025） | 該当属性のチームアピール値 |
| 色ノート | **3.0%**（×0.030） | 該当属性のチームアピール値 |

```typescript
const NOTE_RATE = { white: 0.025, color: 0.030 };

// 1ノートあたりのベーススコア
const baseScore = team[note.attribute] * NOTE_RATE[note.type];
```

### 4.2 ライト倍率

楽曲データの 8 つのノートグループに対応する確定済み倍率テーブル:

| グループキー | 名称 | ライト倍率 |
|-------------|------|-----------|
| `notes_20` | Notes 2.0 | ×1.0 |
| `light_2` | Light 2 | ×1.1 |
| `light_3` | Light 3 | ×1.2 |
| `light_4` | Light 4 | ×1.3 |
| `light_5` | Light 5 | ×1.4 |
| `light_6` | Light 6 | ×1.5 |
| `chorus_light_5` | Chorus Light 5 | ×2.6 |
| `chorus_light_6` | Chorus Light 6 | ×3.0 |

```typescript
const LIGHT_MULTIPLIER: Record<string, number> = {
  notes_20: 1.0,
  light_2: 1.1,
  light_3: 1.2,
  light_4: 1.3,
  light_5: 1.4,
  light_6: 1.5,
  chorus_light_5: 2.6,
  chorus_light_6: 3.0,
};
```

### 4.3 1 ノートあたりのスコア計算

```typescript
// スキル未発動時
note_score = team[note.attribute] * NOTE_RATE[note.type] * LIGHT_MULTIPLIER[note.group]

// 判定縮小スキル発動時
note_score = team[note.attribute] * NOTE_RATE[note.type] * LIGHT_MULTIPLIER[note.group] * 1.6

// スコアアップスキル発動時（加算）
note_score = team[note.attribute] * NOTE_RATE[note.type] * LIGHT_MULTIPLIER[note.group]
           + ap_skill_5_value
```

### 4.4 トータルスコア

```
total_score = Σ note_score  (全ノートの合計)
```

### 4.5 確定スコア（期待最低値・期待最高値）

モンテカルロシミュレーションとは**別に**、スキル発動の境界条件でスコアを確定計算する。

#### 期待最低値（スキル全不発）

全ノート Perfect かつ **AP スキルが一度も発動しない** 場合のスコア。

```typescript
function calcMinScore(team: ComputedTeam, notes: FlatNote[]): number {
  let total = 0;
  for (const note of notes) {
    total += team[note.attribute] * NOTE_RATE[note.type] * LIGHT_MULTIPLIER[note.group];
  }
  return Math.floor(total);
}
```

#### 期待最高値（スキル全発動）

全ノート Perfect かつ **AP スキルが発動可能な全タイミングで必ず発動** した場合のスコア。

```typescript
function calcMaxScore(team: ComputedTeam, notes: FlatNote[]): number {
  const N = notes.length;

  // --- タイマースキル: 全タイミングで必ず発動（確率判定なし） ---
  const timerBonus = new Array(N).fill(0);
  for (let c = 0; c < 6; c++) {
    const skill = team.cards[c].skill;
    if (!skill || !skill.isTimer) continue;

    const maxAct = Math.floor(team.songDuration / skill.count);
    for (let a = 1; a <= maxAct; a++) {
      const t = a * skill.count;
      const startNote = Math.floor(t / team.songDuration * N);
      const endNote = Math.min(
        Math.floor((t + skill.spTime) / team.songDuration * N), N
      );
      for (let n = startNote; n < endNote; n++) {
        timerBonus[n] += skill.value;
      }
    }
  }

  // --- 通常スキル: 全タイミングで必ず発動（確率判定なし） ---
  let total = 0;
  const counters = new Array(6).fill(0);

  for (let n = 0; n < N; n++) {
    const note = notes[n];
    let shrinkActive = false;
    let scoreUpSum = timerBonus[n];

    for (let c = 0; c < 6; c++) {
      const skill = team.cards[c].skill;
      if (!skill || skill.isTimer) continue;

      counters[c]++;
      if (counters[c] >= skill.count) {
        counters[c] = 0;
        if (skill.isShrink) shrinkActive = true;
        else scoreUpSum += skill.value;
      }
    }

    const shrinkMult = shrinkActive ? 1.6 : 1.0;
    const base = team[note.attribute] * NOTE_RATE[note.type] * LIGHT_MULTIPLIER[note.group];
    total += base * shrinkMult + scoreUpSum;
  }
  return Math.floor(total);
}
```

> **表示**: 結果画面では「期待最低値」「MC 平均」「期待最高値」を並べて表示し、
> ヒストグラム上にも最低値・最高値を境界線として描画する。

---

## 5. AP スキル発動メカニクス（モンテカルロの核心）

### 5.1 スキルタイプと効果の分類

`fetchCardsJson.ts` の正規化後の `ap_skill_type` 値:

| ap_skill_type | 効果 | 計算方式 | MC 対象 |
|---------------|------|---------|---------|
| `スコアアップ` | `ap_skill_5_value` を加算 | **加算** | ✅ |
| `スコアアップ（タイマー）` | 一定時間 `ap_skill_5_value` を加算 | **加算**（持続） | ✅ |
| `判定縮小スコアアップ` | ベーススコアを ×1.6 | **乗算** | ✅ |
| `MISS→Good` | MISS を Good に変換 | — | ❌（全 Perfect 前提） |

**重要な区別**:
- **スコアアップ系**: `ap_skill_5_value` の値をノートスコアに **加算**
- **判定縮小系**: ベーススコア（属性値×ノート係数×ライト倍率）に **×1.6 乗算**

### 5.2 スキル発動判定

各カードは独立したノートカウンターを持つ。
**スキルレベルは全カード一律 Lv5 固定**（`ap_skill_5_*` の値を使用）。

#### 通常スキル（`スコアアップ`・`判定縮小スコアアップ`）— ノート数ベース

```typescript
const count = card.ap_skill_5_count;  // 発動間隔（ノート数）
const per   = card.ap_skill_5_per;    // 発動確率（%）
const value = card.ap_skill_5_value;  // スコアアップ加算値

noteCounter[c]++;
if (noteCounter[c] >= count) {
  noteCounter[c] = 0;
  if (rng.next() * 100 < per) {
    // スキル発動！
  }
}
```

#### タイマースキル（`スコアアップ（タイマー）`）— 秒数ベース

タイマースキルはノート数ではなく **経過秒数** で発動判定する。

```typescript
const interval = card.ap_skill_5_count;  // 発動間隔（秒）
const per      = card.ap_skill_5_per;    // 発動確率（%）
const value    = card.ap_skill_5_value;  // スコアアップ加算値

// 最大発動回数 = floor(楽曲秒数 / 発動間隔秒数)
const maxActivations = Math.floor(song.duration / interval);

// 期待発動回数 = 最大発動回数 × 発動確率
const expectedActivations = maxActivations * (per / 100);
```

MC シミュレーションでは、各発動タイミング（`interval`, `2*interval`, ...）で `per`% の確率判定を行う。

### 5.3 スキル効果の適用

#### スコアアップ（`スコアアップ`）

発動判定が成功したノートに `ap_skill_5_value` を加算。

```typescript
noteScore += card.ap_skill_5_value;
```

#### 判定縮小スコアアップ（`判定縮小スコアアップ`）

発動判定が成功したノートのベーススコアを ×1.6。

```typescript
noteScore = baseScore * 1.6;
```

#### タイマースコアアップ（`スコアアップ（タイマー）`）

発動判定が成功した時点から `sp_time` 秒間、効果が持続する。
持続中の各ノートに `ap_skill_5_value` を加算し続ける。

```typescript
// 発動タイミング（秒数ベース）
const activationTimes = [];
for (let t = interval; t <= song.duration; t += interval) {
  activationTimes.push(t);
}
// → 最大発動回数 = floor(duration / interval)

// MC: 各タイミングで確率判定
for (const t of activationTimes) {
  if (rng.next() * 100 < per) {
    // t 秒〜 (t + sp_time) 秒の間のノートに value を加算
    const startNote = Math.floor(t / song.duration * notes.length);
    const endNote = Math.floor((t + sp_time) / song.duration * notes.length);
    for (let n = startNote; n < endNote && n < notes.length; n++) {
      timerBonus[n] += value;
    }
  }
}
```

### 5.4 スキル効果の重複

同一ノートで複数カードのスキルが同時発動した場合:

- **スコアアップ同士**: `value` を合算して加算
- **判定縮小同士**: ×1.6 は重複しない（1回分のみ適用） ※要検証
- **スコアアップ + 判定縮小**: 両方適用（乗算 + 加算）

```typescript
// 1ノートの最終スコア
const shrinkMult = anyShrinkActive ? 1.6 : 1.0;
const totalScoreUp = sumOfActiveScoreUpValues;

noteScore = baseScore * shrinkMult + totalScoreUp;
```

---

## 6. モンテカルロシミュレーション設計

### 6.1 ノートリストの平坦化

楽曲の 8 つのノートグループ × 6 サブカラムを、1 次元の配列に展開する。

```typescript
interface FlatNote {
  attribute: 'shout' | 'beat' | 'melody';
  type: 'white' | 'color';
  group: string;  // ノートグループキー（ライト倍率参照用）
}

function flattenNotes(song: Song): FlatNote[] {
  const notes: FlatNote[] = [];
  for (const groupKey of Object.keys(LIGHT_MULTIPLIER)) {
    const group = song[groupKey] as SongNoteGroup;
    for (let i = 0; i < group.shout_white; i++)
      notes.push({ attribute: 'shout', type: 'white', group: groupKey });
    for (let i = 0; i < group.shout_color; i++)
      notes.push({ attribute: 'shout', type: 'color', group: groupKey });
    // beat, melody も同様
  }
  return notes;
}
```

> **ノート順序**: データソースにノート出現順の情報はない。
> v1 ではシャッフル（一様分布）で近似する。
> タイマースキルの効果範囲に影響するため、精度が必要であれば要改善。

### 6.2 シミュレーション 1 回の流れ

2 段階で処理する:
1. **タイマースキル**: 秒数ベースで発動判定し、ノートごとのボーナス配列を事前計算
2. **通常スキル + スコア集計**: ノートを順に処理し、通常スキルの発動判定とスコア計算

```typescript
function runOnce(team: ComputedTeam, notes: FlatNote[], rng: SeededRNG): number {
  const N = notes.length;

  // --- Phase 1: タイマースキルの秒数ベース発動判定（事前計算） ---
  const timerBonus = new Array(N).fill(0);  // ノートごとの加算値

  for (let c = 0; c < 6; c++) {
    const skill = team.cards[c].skill;
    if (!skill || !skill.isTimer) continue;

    const maxAct = Math.floor(team.songDuration / skill.count);
    for (let a = 1; a <= maxAct; a++) {
      if (rng.next() * 100 < skill.per) {
        // 発動: t秒 〜 (t + sp_time)秒 のノートに value を加算
        const t = a * skill.count;
        const startNote = Math.floor(t / team.songDuration * N);
        const endNote = Math.min(
          Math.floor((t + skill.spTime) / team.songDuration * N), N
        );
        for (let n = startNote; n < endNote; n++) {
          timerBonus[n] += skill.value;
        }
      }
    }
  }

  // --- Phase 2: ノート順処理（通常スキル + スコア集計） ---
  let totalScore = 0;
  const counters = new Array(6).fill(0);

  for (let n = 0; n < N; n++) {
    const note = notes[n];
    let shrinkActive = false;
    let scoreUpSum = timerBonus[n];  // タイマースキル分を初期値に

    for (let c = 0; c < 6; c++) {
      const skill = team.cards[c].skill;
      if (!skill || skill.isTimer) continue;  // タイマーは Phase 1 で処理済み

      counters[c]++;
      if (counters[c] >= skill.count) {
        counters[c] = 0;
        if (rng.next() * 100 < skill.per) {
          if (skill.isShrink) shrinkActive = true;
          else scoreUpSum += skill.value;
        }
      }
    }

    const base = team[note.attribute]
      * NOTE_RATE[note.type]
      * LIGHT_MULTIPLIER[note.group];
    const shrinkMult = shrinkActive ? 1.6 : 1.0;

    totalScore += base * shrinkMult + scoreUpSum;
  }

  return Math.floor(totalScore);
}
```

### 6.3 バッチ実行と UI レスポンシブ性

1,000 回のシミュレーションをメインスレッドでブロッキング実行すると UI が固まるため、
チャンク分割で `setTimeout` を挟む。

```typescript
async function runSimulation(
  engine: SimulationEngine,
  iterations: number,
  onProgress: (percent: number) => void
): Promise<number[]> {
  const results: number[] = [];
  const CHUNK_SIZE = 50;

  for (let i = 0; i < iterations; i += CHUNK_SIZE) {
    const end = Math.min(i + CHUNK_SIZE, iterations);
    for (let j = i; j < end; j++) {
      results.push(engine.runOnce());
    }
    onProgress(end / iterations);
    await new Promise(r => setTimeout(r, 0));  // ブラウザに制御を返す
  }

  return results;
}
```

> **将来拡張**: パフォーマンスが不足する場合は Web Worker への移行を検討。

### 6.4 シード付き疑似乱数

再現性のため `Math.random()` ではなくシード付き PRNG を使用する。

```typescript
// xorshift128+ アルゴリズム（高速・十分な品質）
class XorShift128Plus {
  constructor(seed: number) { /* 初期化 */ }
  next(): number { /* 0.0〜1.0 の浮動小数点数を返す */ }
}
```

デフォルトでは `Date.now()` をシード、ユーザーが固定すれば再現可能。

---

## 7. 出力仕様

### 7.1 確定スコア（境界値）

モンテカルロシミュレーションの前に即座に表示する確定値。

| 項目 | 計算方法 | 表示例 |
|------|---------|--------|
| 期待最低値（スキル全不発） | 全 Perfect・スキル発動なし（4.5 章参照） | 980,000 |
| 期待最高値（スキル全発動） | 全 Perfect・スキル毎回発動（4.5 章参照） | 1,350,000 |

> これらは確率に依存しないため、デッキ確定時点で即座に計算・表示できる。

### 7.2 モンテカルロ統計テーブル

| 項目 | 表示例 |
|------|--------|
| 期待最低値（スキル全不発） | 980,000 |
| MC 平均スコア | 1,234,567 |
| MC 中央値 | 1,230,000 |
| MC 最小スコア | 1,180,000 |
| MC 最大スコア | 1,290,000 |
| MC 標準偏差 | 25,000 |
| MC 90 パーセンタイル | 1,270,000 |
| 期待最高値（スキル全発動） | 1,350,000 |
| 試行回数 | 1,000 |

### 7.3 スコア分布ヒストグラム

X 軸の範囲を **期待最低値〜期待最高値** に固定し、その区間内でモンテカルロの結果がどのように分布するかを可視化する。

```
  度数
   ▲
   │          ┌──┐
   │       ┌──┤  ├──┐
   │    ┌──┤  │  │  ├──┐
   │ ┌──┤  │  │  │  │  ├──┐
   │ │  │  │  │  │  │  │  │
   ├─┴──┴──┴──┴──┴──┴──┴──┴──────────────► スコア
   ▼                                  ▼
   期待最低値                          期待最高値
   (スキル全不発)    ↑ MC平均          (スキル全発動)
```

#### 描画仕様

- SVG ベースのヒストグラム（既存の SVG パイチャートパターンに準拠）
- **X 軸の左端 = 期待最低値、右端 = 期待最高値**（確定計算値で固定）
- ヒストグラムの範囲を期待最低値〜期待最高値で等分割（20〜30 ビン）
- MC シミュレーション結果の各スコアをビンに振り分けて度数を描画
- **期待最低値**・**期待最高値**の位置に破線の境界線ラベル付き
- MC 平均値の位置に実線マーカーライン表示
- 分布の偏りでスキル構成の安定度が一目でわかる

> **意図**: 期待最低値と期待最高値で「スコアが取りうる全範囲」を定義し、
> モンテカルロの分布で「実際にどのあたりに着地しやすいか」を表現する。

### 7.4 スキル発動サマリー（カードごと）

| カード名 | スキルタイプ | 理論発動率 | 平均発動回数 | スコア寄与 |
|----------|-------------|-----------|-------------|-----------|
| UR 七瀬陸 | スコアアップ | 35% | 12.3回 | +45,000 |
| SSR 和泉一織 | 判定縮小スコアアップ | 28% | 8.1回 | +32,000 |

---

## 8. 要検証項目

確定済みの計算式に対して、まだ検証が必要な項目:

| # | 項目 | 現在の仮定 | 検証方法 |
|---|------|-----------|---------|
| 1 | 楽曲属性の判定方法 | shout/beat/melody_ratio の最大値 | 楽曲データの属性フィールド確認 |
| 2 | 判定縮小の重複時挙動 | ×1.6 は重複しない | 複数枚発動時のスコア観測 |
| 3 | ブローチの `score` フィールド | 未使用（v1） | フラットボーナスか倍率か確認 |
| 4 | SP スキル (`sp_time`, `sp_value`) | タイマースキルの持続時間に使用 | sp_time がタイマー用か確認 |
| 5 | ノート順序のスコアへの影響度 | シャッフルで近似 | タイマースキル構成での誤差評価 |

---

## 9. 実装ファイル構成案

既存のコードベースパターン（ビルド時 JSON 埋め込み + クライアントサイド処理）に準拠。

```
src/
  pages/
    score/
      index.astro           # スコア計算ページ（メイン UI）
  lib/
    score/
      types.ts              # シミュレーション用の型定義
      engine.ts             # SimulationEngine（MC コアロジック）
      noteFlattener.ts      # SongNoteGroup → FlatNote[] 変換
      rng.ts                # シード付き疑似乱数生成器
      constants.ts          # ライト倍率テーブル、ノート係数等の定数
```

### ページ構成（`src/pages/score/index.astro`）

- ビルド時: `fetchCardsJson()`・`fetchSongsJson()`・`fetchFixedBroachsJson()` で全データ取得し JSON 埋め込み
- クライアントサイド: 楽曲選択 → デッキ編成 → シミュレーション実行 → 結果描画
- localStorage: 選択したデッキ構成の保存・復元
- ナビゲーション: `BaseLayout.astro` のヘッダーに「スコア計算」リンクを追加