# スプレッドシート準拠バグ修正(B1〜B14)実装プラン

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `docs/spreadsheet-score-calc-diff.md` の実装バグ候補のうちユーザーが「修正」と決定した 11 件(B1/B2/B4/B5/B6/B7/B8/B9/B10/B12/B13)を ota-life v1.0.7 スプレッドシート準拠に修正し、維持 3 件(B3/B11/B14)を ADR 0040 例外として記録する。

**Architecture:** engine(`src/lib/score/`)の該当計算を 1 defect = 1 コミットで修正。各修正の正しさは (1) `docs/spreadsheet-spec-v1.0.7.md` の数式から導いた単体テスト、(2) `tests/unit/score/spreadsheetDiff.test.ts` の oracle↔engine 差分の縮小(scoreUp は bit-exact 化して KNOWN_DIFFS から削除)で担保する。ゴールデンフィクスチャはシート実測値なので**一切変更しない**。

**Tech Stack:** TypeScript / Vitest / 既存 `tests/oracle/` 基盤 / Playwright(最終確認)

## Global Constraints

- 判定ポリシー: スプレッドシート v1.0.7 が正。例外(現行実装が正)は **I1: 縮小の発動開始位置とその算術的帰結(カバー率分母 `effectiveSeconds`・基準スコアの先頭除外)**、および本プランで追記する **B3(センター/フレンド率はレアリティ別 UR=10/SSR=7/他=6 を維持)・B11(共有ブローチのメイン/サブ排他は実装しない)・B14(デッキ初期値は特訓済み・Lv5 を維持)**
- W1(スキル Lv フォールバック)・W2(per の 100% クランプ)・W3 のうち rate 加重平均と構造キャップ・クランプは**維持**する(ADR 0036/0037 由来の意図的挙動。今回のスコープ外)
- `tests/fixtures/golden/*.json` は変更禁止(シート実測値)。`tests/oracle/` のロジックも変更禁止(シート忠実移植)
- MC シミュレーション(`runOnce`/`runSimulation`)の per-note 機構は変更しない。変更対象は解析的な期待値・理論値パス
- 各コミット末尾に `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`
- ブランチ `fix/spreadsheet-alignment-b1-b13` 上で作業(作成済み)。`npm run test:unit` を各コミット前に green にする(既知のベースライン問題: jsdom ERR_MODULE_NOT_FOUND ×6 は無視してよい)
- 数値アサーションを更新するときは、新しい期待値の導出根拠(仕様書の数式 or 手計算)をテスト内コメントに 1 行残す

**シート数式の典拠(全タスク共通リファレンス)** — `docs/spreadsheet-spec-v1.0.7.md`:
- §6-3 AM20-21(特訓ペナルティ = `sp_time × sp_value`)/ AM35-36(固有ブローチ上限 `COUNTIF($AM$9:AM$9, AM9) <= limit` = **同一カード ID 単位**)/ AM41-47(共有ブローチ検証)
- §6-4 AN67-69(ラビットノートはキャラ単位 `SUMIF(AX10:AX25,">=1",…)` でフラット加算、フレンドは AN69 で後から合算 = ラビット対象外)/ AN71(`ROUNDDOWN(AN69 × (1 + IF(center)0.1 + IF(friend)0.1), 0)` = **合算後 1 回丸め**)
- §6-5 BN22(`IF(assist, ROUNDDOWN(基準/1.2, 0), 基準)` = 縮小基準のアシスト剥離)
- §6-6 H38(スコアアップ: `ROUNDDOWN(denom/count × per/100 × value, 0)` **カード別 1 回丸め・denom/count は小数のまま**)/ H39(縮小期待秒: 同形でカード別 ROUNDDOWN、フル発動時は per 省略)/ H40(縮小スコア: 飽和時 `ROUNDDOWN(BN22 × (H39ᵢ/ΣH39) × (rateᵢ−1))`、未飽和時 `ROUNDDOWN(BN22 × H39ᵢ/D9 × (rateᵢ−1))` をカード別に合算)

---

### Task 1: B1 — 特訓ペナルティをカード別 `sp_time × sp_value` に変更

**Files:**
- Modify: `src/lib/score/teamBuilder.ts:140-148`
- Modify: `src/lib/score/constants.ts:27-34`(`TRAIN_BONUS` 削除)
- Test: `tests/unit/score/cardStrength.test.ts` / `tests/unit/score/engine.test.ts`(未特訓ケースの期待値更新)

**Interfaces:**
- Consumes: `Card.sp_time: number | null` / `Card.sp_value: number | null`(`src/lib/data/fetchCardsJson.ts:64-65` に既存。データ配管は不要)
- Produces: `computeTeam` の未特訓カード減算が `(card.sp_time || 0) * (card.sp_value || 0)` になる。`TRAIN_BONUS` は削除される(他ファイルからの import が無いことを Step 1 で確認)

- [ ] **Step 1: 影響範囲確認**

```bash
grep -rn "TRAIN_BONUS" src tests | grep -v "\.md"
grep -c "sp_time" tests/fixtures/cards.json || grep -rn "sp_time" tests/fixtures/index.ts
```

`TRAIN_BONUS` の参照が `constants.ts` / `teamBuilder.ts` / テストのみであること、カードフィクスチャに `sp_time`/`sp_value` が入っていることを確認。フィクスチャに無い場合は `npm run extract-fixtures` を実行してから進む(差分はこのタスクでコミット)。

- [ ] **Step 2: failing test を書く**

`tests/unit/score/cardStrength.test.ts`(または未特訓を扱う既存テストファイル)に追加。フィクスチャから `sp_time×sp_value ≠ 1800` の UR カード(例: sp_time=300, sp_value=5 → 1500)を 1 枚選び:

```typescript
it('未特訓ペナルティはカード別 sp_time×sp_value を使う (spec §6-3 AM20-21)', () => {
  // フィクスチャから sp_time*sp_value !== 1800 の UR カードを検索
  const card = allCards.find(c =>
    c.rarity === 'UR' && (c.sp_time || 0) * (c.sp_value || 0) > 0
    && (c.sp_time || 0) * (c.sp_value || 0) !== 1800)!;
  expect(card).toBeDefined();
  const penalty = (card.sp_time || 0) * (card.sp_value || 0);
  const deck = [card, null, null, null, null, null];
  const trained = computeTeam(deck, [], song, undefined, [true]);
  const untrained = computeTeam(deck, [], song, undefined, [false]);
  const attr = normalizeAttribute(card.attribute); // 自属性のみ減算
  // 特効なし(bonusMult=1)なので差はそのまま penalty
  expect(trained[attr] - untrained[attr]).toBe(penalty);
});
```

- [ ] **Step 3: 実行して FAIL を確認**

Run: `npx vitest run tests/unit/score/cardStrength.test.ts`
Expected: FAIL(現行は 1800 固定のため差が 1800 になる)

- [ ] **Step 4: 実装**

`teamBuilder.ts:142` の `const trainBonus = TRAIN_BONUS[card.rarity ?? ''] ?? 0;` を:

```typescript
    // 未特訓ペナルティ: カード別実データ sp_time × sp_value (spec v1.0.7 §6-3 AM20-21)
    const trainBonus = (card.sp_time || 0) * (card.sp_value || 0);
```

に置換し、import から `TRAIN_BONUS` を外す。`constants.ts` の `TRAIN_BONUS` 定義(27-34 行)を削除。

- [ ] **Step 5: テスト全体を更新して green 化**

Run: `npm run test:unit`
未特訓を扱う既存テストの期待値が変わる場合、対象カードの `sp_time×sp_value` から新期待値を導出してコメント付きで更新。ゴールデン(全カード特訓済み)には影響しないこと(= `spreadsheetDiff.test.ts` が引き続き PASS)を確認。

- [ ] **Step 6: コミット**

```bash
git add -u src tests
git commit -m "fix: 未特訓ペナルティをカード別 sp_time×sp_value に変更 (B1)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: B2 — ラビットノートをキャラ単位・フレンド除外・特効非乗算に修正

**Files:**
- Modify: `src/lib/score/teamBuilder.ts:150-157, 223-225`
- Test: `tests/unit/score/engine.test.ts` ほかラビットノートを検証するテスト

**Interfaces:**
- Consumes: `RabbitNoteMap`(キャラ名 → `{shout, beat, melody}`。キー体系は変更しない)
- Produces: `computeTeam` のラビット加算が「スロット 0-4 に存在するユニークキャラ名ごとに 1 回、特効倍率を掛けずにチーム合計へフラット加算」になる

- [ ] **Step 1: failing test を書く**

センタースキル倍率の影響を排除するため、**Shout の rn 加算を Beat/Melody 属性のカードで検証する**(センター/フレンド属性と不一致の成分にはボーナスが乗らないので、差分がそのままラビット加算値になる):

```typescript
it('ラビットノートはキャラ単位1回・フレンド除外・特効非乗算 (spec §6-4 AN67-69 / §6-7, B2)', () => {
  // Beat 属性の UR を選ぶ → Shout 成分にはセンター/フレンドボーナスが乗らず差分が裸で見える
  const card = allCards.find(c => c.rarity === 'UR' && c.name && normalizeAttribute(c.attribute) === 'Beat')!;
  const rn = { [card.name!]: { shout: 100, beat: 0, melody: 0 } };
  const tiers = ['gold', 'gold', 'none', 'none', 'none', 'gold'] as EventBonusTier[];

  // (1) 同一キャラ2枚(スロット0,1)でも加算は1回だけ・(2) 特効(×2.4)が乗らない
  const deck2 = [card, card, null, null, null, null];
  const diff2 = computeTeam(deck2, [], song, tiers, undefined, undefined, undefined, undefined, rn).Shout
              - computeTeam(deck2, [], song, tiers).Shout;
  expect(diff2).toBe(100); // 2枚×2.4=480 ではなく、フラットに 100

  // (3) フレンド枠(スロット5)だけにいるキャラには加算されない
  const other = allCards.find(c => c.rarity === 'UR' && c.name && c.name !== card.name)!;
  const deckF = [other, null, null, null, null, card];
  const diffF = computeTeam(deckF, [], song, tiers, undefined, undefined, undefined, undefined, rn).Shout
              - computeTeam(deckF, [], song, tiers).Shout;
  expect(diffF).toBe(0);
});
```

(`other` の属性が Shout の場合はセンターボーナスが Shout に乗るが、rn 有無の差分を取るため (3) の判定には影響しない — ラビット分が 0 なら差分も 0)

- [ ] **Step 2: FAIL 確認**

Run: `npx vitest run tests/unit/score/engine.test.ts -t ラビットノート`
Expected: FAIL(現行はカード単位 ×2.4 倍で 2 枚+フレンド分加算される)

- [ ] **Step 3: 実装**

`teamBuilder.ts` の per-card ループから `rn` 加算を削除(150-154 行):

```typescript
    // (ラビットノート加算はループ外でキャラ単位に行う — spec §6-4 AN68 / §6-7)
    const s = Math.round(baseShout * bonusMult);
    const b = Math.round(baseBeat * bonusMult);
    const m = Math.round(baseMelody * bonusMult);
```

ループ後(`// センター/フレンドの…` の直前)に追加:

```typescript
  // ラビットノート加算: スロット0-4(フレンド除外)に存在するキャラ単位で1回、
  // 特効倍率を掛けないフラット加算 (spec §6-4 AN67→AN68 / §6-7 AU26)
  let rabbitShout = 0, rabbitBeat = 0, rabbitMelody = 0;
  if (rabbitNotes) {
    const seen = new Set<string>();
    for (let i = 0; i < 5; i++) {
      const name = deck[i]?.name;
      if (!name || seen.has(name)) continue;
      seen.add(name);
      const rn = rabbitNotes[name];
      if (!rn) continue;
      rabbitShout += rn.shout || 0;
      rabbitBeat += rn.beat || 0;
      rabbitMelody += rn.melody || 0;
    }
  }
  rawShout += rabbitShout;
  rawBeat += rabbitBeat;
  rawMelody += rabbitMelody;
```

(センタースキル倍率の基底 `baseShout = rawShout + broachShoutTotal` にはラビット分が含まれる — AN69 が AN71 の入力になるシート構造と一致)

- [ ] **Step 4: green 確認 + 全体テスト**

Run: `npx vitest run tests/unit/score/engine.test.ts && npm run test:unit`
Expected: PASS(ゴールデンは rabbitNotes 未指定なので影響なし)

- [ ] **Step 5: コミット**

```bash
git add -u src tests
git commit -m "fix: ラビットノート加算をキャラ単位・フレンド除外・特効非乗算に修正 (B2)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: B4 — センター/フレンドボーナスを合算後 1 回丸めに変更(B3 のレアリティ別率は維持)

**Files:**
- Modify: `src/lib/score/teamBuilder.ts:216-235`
- Test: `tests/unit/score/engine.test.ts`(センタースキル関連の期待値)

**Interfaces:**
- Produces: `ComputedTeam.Shout/Beat/Melody = base + floor(base × (centerRate + friendRate)/100)`(属性一致分のみ)。表示用内訳フィールド `centerShout` 等は維持(下記の割り当て規則)

- [ ] **Step 1: failing test を書く**

センターとフレンドが**同属性**になるデッキで、合算丸めと個別丸めが 1 差になるケースを作る。`base × 0.1` が非整数になるよう調整(全 UR なら rate は両方 10%):

```typescript
it('センター/フレンドボーナスは合算後1回丸め (spec §6-4 AN71, B4)', () => {
  // deck[0](センター)と deck[5](フレンド)が同属性の UR。base×0.1 が小数になる編成を選ぶ
  const team = computeTeam(deck, [], song, undefined, undefined);
  const base = team.rawShout + team.broachShout; // 属性 Shout の例
  // シート式: ROUNDDOWN(base × (1 + 0.1 + 0.1)) = base + floor(base × 0.2)
  expect(team.Shout).toBe(base + Math.floor(base * 0.2));
});
```

期待値が現行実装(`base + floor(base×0.1) + floor(base×0.1)`)と異なる base 値(base×0.1 の小数部 ≥ 0.5 となるもの)をフィクスチャから選ぶこと。

- [ ] **Step 2: FAIL 確認**

Run: `npx vitest run tests/unit/score/engine.test.ts -t 合算後1回丸め`
Expected: FAIL(1 差)

- [ ] **Step 3: 実装**

`teamBuilder.ts:226-235` を置換:

```typescript
  // センター/フレンドボーナス: レアリティ別率(B3: 意図的にシートの一律10%とは異なる、ADR 0040)を
  // 属性一致分だけ合算し、合算後に 1 回だけ floor する (spec §6-4 AN71 / B4)。
  // base は整数なので floor(base×(1+c+f)) = base + floor(base×(c+f)) が成り立つ。
  const bonusRate = (attr: 'Shout' | 'Beat' | 'Melody'): number =>
    (centerAttr === attr ? centerRate : 0) + (friendAttr === attr ? friendRate : 0);
  const combinedShout  = Math.floor(baseShout  * bonusRate('Shout')  / 100);
  const combinedBeat   = Math.floor(baseBeat   * bonusRate('Beat')   / 100);
  const combinedMelody = Math.floor(baseMelody * bonusRate('Melody') / 100);

  // 表示用内訳: センター分は単独 floor、フレンド分は残差(合計が合算丸めと一致するように)
  const centerShout  = centerAttr === 'Shout'  ? Math.floor(baseShout  * centerRate / 100) : 0;
  const centerBeat   = centerAttr === 'Beat'   ? Math.floor(baseBeat   * centerRate / 100) : 0;
  const centerMelody = centerAttr === 'Melody' ? Math.floor(baseMelody * centerRate / 100) : 0;
  const friendShout  = combinedShout  - centerShout;
  const friendBeat   = combinedBeat   - centerBeat;
  const friendMelody = combinedMelody - centerMelody;

  const teamShout  = baseShout  + combinedShout;
  const teamBeat   = baseBeat   + combinedBeat;
  const teamMelody = baseMelody + combinedMelody;
```

(217 行の「それぞれ独立に floor する」コメントは削除)

- [ ] **Step 4: green 確認 + ゴールデン確認**

Run: `npx vitest run tests/unit/score/engine.test.ts tests/unit/score/spreadsheetDiff.test.ts && npm run test:unit`
Expected: 全 PASS。**ゴールデンは全 UR(センター/フレンド率とも 10%)なので、この変更でオラクル(シート式そのもの)との attr 一致はむしろ厳密化される**。attr が unexpected になったら実装ミス。

- [ ] **Step 5: コミット**

```bash
git add -u src tests
git commit -m "fix: センター/フレンドボーナスを合算後1回丸めに変更 (B4)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: B5 — スコアアップ期待値を H38 準拠(小数保持・カード別丸め)にし、KNOWN_DIFFS から scoreUp を削除

**Files:**
- Modify: `src/lib/score/simulation.ts:358-369`(`calcExpectedScore` 内)/ `simulation.ts:423-427`(`calcCardSkillExpected` 非縮小分岐)
- Modify: `tests/oracle/knownDiffs.ts`(`scoreUp` エントリ削除)
- Test: `tests/unit/score/spreadsheetDiff.test.ts`(既存。scoreUp が bit-exact になることが GREEN 条件)

**Interfaces:**
- Produces: `calcExpectedScore().scoreUpExpected = Σ_card floor( (denom/count) × per/100 × value )`。`calcCardSkillExpected` の非縮小分岐も同式(単カードなので同値)

- [ ] **Step 1: RED — knownDiffs から scoreUp を先に削除**

`tests/oracle/knownDiffs.ts` の `KNOWN_DIFFS` から `component: 'scoreUp'` エントリを削除する。

Run: `npx vitest run tests/unit/score/spreadsheetDiff.test.ts`
Expected: FAIL — `scoreUp(expected) は unexpected` (oracle と engine の floor 位置が違うため。これが RED)

- [ ] **Step 2: 実装**

`simulation.ts:358-369` を置換:

```typescript
  // スコアアップスキル期待値: カード別に (denom/count 小数のまま) × per/100 × value を
  // 計算し、カード単位で 1 回だけ floor して合算する (spec §6-6 H38 / B5)
  let scoreUpExpected = 0;
  for (const dc of team.cards) {
    const skill = dc.skill;
    if (!skill || skill.isShrink) continue;
    if (skill.count <= 0) continue;
    const denom = skill.isTimer ? team.songDuration : notesCount;
    if (denom <= 0) continue;
    scoreUpExpected += Math.floor((denom / skill.count) * (skill.per / 100) * skill.value);
  }
```

(直後の `scoreUpExpected = Math.floor(scoreUpExpected);` は削除)

`calcCardSkillExpected` の非縮小分岐(423-427 行)も同形に:

```typescript
  if (!skill.isShrink) {
    const denom = skill.isTimer ? team.songDuration : notesCount;
    if (denom <= 0) return 0;
    return Math.floor((denom / skill.count) * (skill.per / 100) * skill.value);
  }
```

- [ ] **Step 3: GREEN 確認**

Run: `npx vitest run tests/unit/score/spreadsheetDiff.test.ts`
Expected: PASS — `[diff]` 出力で両ゴールデンの `scoreUp` が `delta=0 class=match` になる(bit-exact 化の証明)。ならない場合、オラクル `tests/oracle/scoreUpSkill.ts` を読んで丸め位置の差を特定する(オラクルは変更禁止 — engine 側を合わせる)。

- [ ] **Step 4: 影響テスト更新 + 全体 green**

Run: `npm run test:unit`
`engine.test.ts` / `cardSkillSingle.test.ts` / `deckSkillDistribution*.test.ts` 等の scoreUp 期待値アサーションを H38 式で再導出して更新(導出コメント必須)。

- [ ] **Step 5: コミット**

```bash
git add -u src tests
git commit -m "fix: スコアアップ期待値をシート H38 準拠に変更し scoreUp known-diff を解消 (B5)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: B6+B7 — 縮小期待値の基準スコアをアシスト剥離し、発動回数の floor 先取りを廃止

**Files:**
- Modify: `src/lib/score/simulation.ts:53-157`(`calcShrinkCoverage`: 期待秒の算出)/ `371-383`(`calcExpectedScore` 縮小部)/ `411-447`(`calcCardSkillExpected` 縮小分岐)
- Modify: `tests/oracle/knownDiffs.ts`(`shrink` の reason 更新)
- Test: 新規 `tests/unit/score/shrinkSheetAlignment.test.ts` + 既存縮小テストの期待値更新

**Interfaces:**
- Produces: 縮小の「カード別期待カバー秒」が `floor( (eligibleDenom/count) × per/100 × value )`(ノート型。タイマー型は `floor( (songDuration/count) × per/100 × value )`)に変わる(**H39 準拠: 小数のまま乗算しカード別に 1 回 floor**)。縮小基準スコアが `assist ? floor(eligibleBaseScore / 1.2) : eligibleBaseScore` に変わる(**BN22 準拠**)。I1(excluded ノート除外・effectiveSeconds 分母)と ADR 0036(rate 加重・構造キャップ・クランプ)は**維持**
- 後続 Task 6 が同じヘルパーを使う: `shrinkExpectedSeconds(skill, team, notesCount, excludeHeadCount, full: boolean): number` を `simulation.ts` 内に新設(export 不要、module 内共有)

- [ ] **Step 1: ヘルパーと failing test を書く**

新規 `tests/unit/score/shrinkSheetAlignment.test.ts`:

```typescript
// H39/BN22 準拠検証: 期待値の縮小成分が
//   floor( eligibleBase(assist剥離) × Σ(floor((eligDenom/count)×per/100×value)×(rate−1)) / effectiveSeconds )
// (非飽和・単一縮小カードの単純ケース) になることをフィクスチャ編成で検証する。
// 期待値はテスト内でシート式から明示的に手計算する(engine の内部関数を使い回さない)。
it('縮小期待値: H39 小数保持 + BN22 アシスト剥離 (B6/B7)', () => {
  // 縮小スキル持ち UR 1枚 + 非スキル5枚の編成を fixtures から構築
  // exp = calcExpectedScore(team, notes, notesCount, { scoreUpAssist: true, scoreUpBadgeRate: 0 })
  // eligibleBaseScore を notes から自前で合算(excluded 除外, assist ON の appeal)
  // strippedBase = Math.floor(eligibleBaseScore / 1.2)                        // BN22
  // eligDenom = notesCount - excludedCount
  // expSec = Math.floor((eligDenom / skill.count) * (skill.per / 100) * skill.value)  // H39
  // coverage = Math.min(expSec, capSeconds) / effectiveSeconds                // 既存キャップ維持
  // expected = Math.floor(strippedBase * coverage * (skill.rate - 1))
  // expect(exp.shrinkExpected).toBe(expected)
});
```

(コメントの擬似式を実コードに落とす。`effectiveSeconds`/`capSeconds` は `calcShrinkCoverage` の返り値ではなく仕様書 §6-6 と ADR 0036 の定義からテスト内で再計算する)

Run: `npx vitest run tests/unit/score/shrinkSheetAlignment.test.ts`
Expected: FAIL(現行は floor 先取り + アシスト込み基準)

- [ ] **Step 2: 実装 — ヘルパー新設と calcShrinkCoverage の置換**

`simulation.ts` の `calcShrinkActivationCount` の直後に追加:

```typescript
/**
 * カード別の縮小カバー秒 (spec §6-6 H39 準拠)。
 * denom/count を小数のまま per/100(full 時は 1)× value と乗算し、カード単位で 1 回だけ floor。
 * ノート型は先頭除外後の対象ノーツ数、タイマー型は songDuration を分母にする (I1 維持)。
 */
function shrinkCoverageSeconds(
  skill: CardSkill,
  team: ComputedTeam,
  notesCount: number,
  excludeHeadCount: number,
  full: boolean,
): number {
  if (skill.count <= 0) return 0;
  const denom = isShrinkTimer(skill)
    ? team.songDuration
    : Math.max(0, notesCount - excludeHeadCount);
  if (denom <= 0) return 0;
  const perFactor = full ? 1 : skill.per / 100;
  return Math.floor((denom / skill.count) * perFactor * skill.value);
}
```

`calcShrinkCoverage` のループ(118-126 行)を置換:

```typescript
  for (const dc of shrinkCards) {
    const skill = dc.skill!;
    rawCoveredSeconds += shrinkCoverageSeconds(skill, team, notesCount, excludeHeadCount, true);
    const expSec = shrinkCoverageSeconds(skill, team, notesCount, excludeHeadCount, false);
    rawExpectedCoveredSeconds += expSec;
    rawExpectedWeightedSeconds += expSec * (skill.rate - 1.0);
    if (!isShrinkTimer(skill) && skill.count < minNoteShrinkCount) minNoteShrinkCount = skill.count;
  }
```

`calcExpectedScore` の縮小部(379-383 行)を置換:

```typescript
  let shrinkExpected = 0;
  const coverage = calcShrinkCoverage(team, notesCount, 0, excludedCount);
  if (coverage && coverage.effectiveSeconds > 0) {
    // 縮小基準スコアはアシスト剥離後を使う (spec §6-5 BN22 / B6)。I1 の excluded 除外は維持
    const shrinkBase = assist ? Math.floor(eligibleBaseScore / 1.2) : eligibleBaseScore;
    shrinkExpected = Math.floor(shrinkBase * coverage.expectedWeightedCoverageRate);
  }
```

`calcCardSkillExpected` の縮小分岐(430-446 行)も同じ 2 点(`shrinkCoverageSeconds(…, false)` と `shrinkBase`)を適用する。

- [ ] **Step 3: GREEN + 差分縮小の確認**

Run: `npx vitest run tests/unit/score/shrinkSheetAlignment.test.ts tests/unit/score/spreadsheetDiff.test.ts 2>&1 | grep -E "\[diff\]|passed|failed"`
Expected: 新テスト PASS。`[diff]` の shrink delta が修正前(golden#1: engine−oracle 参考値は §0-1 参照)より**縮小**していること(bit-exact にはならない — I1 と構造キャップが残るため)。delta が拡大したら実装ミス。

- [ ] **Step 4: knownDiffs の reason 更新**

`tests/oracle/knownDiffs.ts` の `shrink` エントリの reason を更新:

```typescript
  {
    component: 'shrink',
    reason:
      'B6(アシスト剥離)/B7(floor位置) は修正済み。残差は意図的差異のみ: ' +
      '(a) 発動開始位置の先頭除外とその帰結(カバー率分母/基準スコア範囲, ADR 0040) ' +
      '(b) rate加重の構造的到達可能秒数キャップと expected≤max クランプ (ADR 0036)。' +
      'docs/spreadsheet-score-calc-diff.md §4',
  },
```

- [ ] **Step 5: 全体 green + コミット**

Run: `npm run test:unit`(縮小系テストの期待値を H39/BN22 式で再導出して更新)

```bash
git add -u src tests
git commit -m "fix: 縮小期待値の基準スコアをアシスト剥離し発動回数の floor 先取りを廃止 (B6/B7)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: B8 — 縮小理論最大値をシート H40 の按分式に置換

**Files:**
- Modify: `src/lib/score/simulation.ts:236-335`(`calcMaxBaseTotal` を解析式化)/ `474-508`(`calcCardSkillMax`)
- Test: 新規テストを `tests/unit/score/shrinkSheetAlignment.test.ts` に追加 / `tests/unit/score/expectedInvariants.test.ts`(不変条件の再確認)/ `maxScoreFinder.test.ts` 等の期待値更新

**Interfaces:**
- Consumes: Task 5 の `shrinkCoverageSeconds(skill, team, notesCount, excludeHeadCount, full)`
- Produces: `calcMaxBaseTotal = baseScore(assist込み素点合計) + scoreUpMax + shrinkMax` の閉形式。
  - `scoreUpMax = Σ_card floor( (denom/count) × value )`(H38 の B12=TRUE 形)
  - `shrinkMax`: `secᵢ = shrinkCoverageSeconds(…, full=true)`、`totalSec = Σ secᵢ` として
    - 飽和(`totalSec ≥ effectiveSeconds`): `Σ floor( shrinkBase × (secᵢ/totalSec) × (rateᵢ−1) )`
    - 未飽和: `Σ floor( shrinkBase × secᵢ/effectiveSeconds × (rateᵢ−1) )`
    - `shrinkBase = assist ? floor(eligibleBaseScore/1.2) : eligibleBaseScore`(BN22。I1 の excluded 除外維持)
    - `effectiveSeconds = songDuration − headSeconds`(I1: シートの D9 を I1 帰結で置換)
  - キューイング機構(`enqueueShrink`/`ShrinkQueueItem` 等)は MC(`runOnce`)専用として残す。`calcMaxBaseTotal` からのみ切り離す
- `calcMaxScore` のシグネチャは不変(呼び出し側 `maxScoreFinder.ts` / `ScoreCalcResults.svelte` / `deckSkillDistribution.ts` は無改修)

- [ ] **Step 1: failing test を書く**

`shrinkSheetAlignment.test.ts` に追加。縮小 2 枚編成(rate が異なるもの)で:

```typescript
it('縮小理論最大値はシート H40 の按分式 (B8)', () => {
  // 縮小スキル持ち UR 2枚(rate異なる)+ 通常4枚の編成を構築し calcMaxScore を検証。
  // テスト内で H40 式(上記 Interfaces の shrinkMax 定義)を手計算し、
  // baseScore + scoreUpMax + shrinkMax (+applyFinalBonus) と一致することを assert。
  // 飽和ケース(totalSec >= effectiveSeconds になる長い value)と
  // 未飽和ケースの 2 ケースを必ず含める。
});
```

Run: `npx vitest run tests/unit/score/shrinkSheetAlignment.test.ts -t 按分式`
Expected: FAIL(現行はキューイング値)

- [ ] **Step 2: 実装 — calcMaxBaseTotal の置換**

`simulation.ts:237-335` の `calcMaxBaseTotal` 本体を置換:

```typescript
/** スキル全発動時のバッジ・ブローチ適用前の合計 (spec §6-6 H38(B12=TRUE)/H40(B15=TRUE) の按分式移植。B8) */
function calcMaxBaseTotal(team: ComputedTeam, notes: FlatNote[], options?: ScoreOptions): number {
  const N = notes.length;
  const assist = options?.scoreUpAssist ?? false;
  const notesCount = N;

  // 属性値素点(アシスト込み)と縮小対象素点(I1: excluded 除外)
  let baseScore = 0;
  let eligibleBaseScore = 0;
  let excludedCount = 0;
  for (const note of notes) {
    const s = calcNoteScore(getAppeal(team, note.attribute, assist), note);
    baseScore += s;
    if (note.excluded) { excludedCount++; continue; }
    eligibleBaseScore += s;
  }

  // スコアアップ理論値: カード別 floor((denom/count) × value) (H38 の B12=TRUE 形)
  let scoreUpMax = 0;
  for (const dc of team.cards) {
    const skill = dc.skill;
    if (!skill || skill.isShrink || skill.count <= 0) continue;
    const denom = skill.isTimer ? team.songDuration : notesCount;
    if (denom <= 0) continue;
    scoreUpMax += Math.floor((denom / skill.count) * skill.value);
  }

  // 縮小理論値: H40 の按分式 (B15=TRUE、BN22 基準、I1 の effectiveSeconds)
  let shrinkMax = 0;
  const shrinkCards = team.cards.filter(dc => dc.skill?.isShrink && dc.skill.count > 0);
  if (shrinkCards.length > 0) {
    const headSeconds = shrinkHeadSeconds(team.songDuration, notesCount, excludedCount);
    const effectiveSeconds = team.songDuration - headSeconds;
    if (effectiveSeconds > 0) {
      const shrinkBase = assist ? Math.floor(eligibleBaseScore / 1.2) : eligibleBaseScore;
      const secs = shrinkCards.map(dc =>
        shrinkCoverageSeconds(dc.skill!, team, notesCount, excludedCount, true));
      const totalSec = secs.reduce((a, b) => a + b, 0);
      if (totalSec > 0) {
        for (let i = 0; i < shrinkCards.length; i++) {
          const rate = shrinkCards[i].skill!.rate;
          const ratio = totalSec >= effectiveSeconds
            ? secs[i] / totalSec                 // 飽和: 秒数比按分
            : secs[i] / effectiveSeconds;        // 未飽和: 実効秒数比
          shrinkMax += Math.floor(shrinkBase * ratio * (rate - 1.0));
        }
      }
    }
  }

  return baseScore + scoreUpMax + shrinkMax;
}
```

`calcCardSkillMax`(474-508 行)の縮小分岐も同じ形(単カードなので `ratio = min(sec, effectiveSeconds)/effectiveSeconds` 相当 = 飽和判定込み)+ `shrinkBase` に変更、非縮小分岐は `Math.floor((denom / skill.count) * skill.value)` に変更する。

- [ ] **Step 3: GREEN + 不変条件の確認**

Run: `npx vitest run tests/unit/score/shrinkSheetAlignment.test.ts tests/unit/score/expectedInvariants.test.ts tests/unit/score/spreadsheetDiff.test.ts`
Expected: 全 PASS。`expectedInvariants`(expected ≤ max)が閉形式同士でも成立すること。`[diff]` の max final delta が縮小していること。

- [ ] **Step 4: 未使用コードの整理**

`calcMaxBaseTotal` から不要になった import・ローカル型があれば削除(`enqueueShrink`/`ShrinkQueueItem`/`ActiveShrink`/`timerShrinkTriggers` は `runOnce` が使い続けるため**削除しない**)。`npx tsc --noEmit` 相当のチェックは `npm run test:unit` のトランスフォームで担保。

- [ ] **Step 5: 全体 green + コミット**

Run: `npm run test:unit`(maxScoreFinder / deckSkillDistribution / cardCompare 系の理論値アサーションを按分式で再導出して更新)

```bash
git add -u src tests
git commit -m "fix: 縮小理論最大値をシート H40 の按分式に置換 (B8)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: B9+B10 — 固有ブローチ上限ゲートを「limit 付き全種類 × 同一カード ID 単位」に一本化

**Files:**
- Modify: `src/lib/score/broachResolver.ts:110-178`(コメント含む)
- Test: `tests/unit/score/broachResolver.test.ts` / `broachResolverBranches.test.ts`(仕様変更としてテスト意図を書き換え)

**Interfaces:**
- Produces: `getLimitKey` 相当のロジックが「`broach.limit != null` なら種類を問わず `card:${broach.card_id}` 単位でカウント」になる。別カードの同種類ブローチは競合しなくなり、種類 4/9 にも limit が効く

- [ ] **Step 1: failing test を書く**

`broachResolver.test.ts` に追加:

```typescript
it('上限判定は同一カードIDのみ対象: 別カードの種類6同士は競合しない (spec §6-3 AM36, B9)', () => {
  // limit=1 の種類6ブローチを持つ「別々の」カード2枚を編成
  // → 両方 active になること(現行 broach_type プールでは片方 inactive になる)
});
it('種類9(スコアUP)にも limit ゲートが効く (B10)', () => {
  // limit=1・種類9 のブローチを持つ同一カードを2枚編成
  // → active は1つだけ、calcBroachScoreBonus が1回分になること
});
```

対象ブローチは `tests/fixtures/broachs.json` から `limit` 非 null のものを検索して使う(種類9 で limit 付きが実データに無ければ、テスト内でリテラルの `FixedBroach` オブジェクトを合成してよい — resolveDeckBroachs は引数の配列で完結する)。

- [ ] **Step 2: FAIL 確認**

Run: `npx vitest run tests/unit/score/broachResolver.test.ts`
Expected: 2 件とも FAIL

- [ ] **Step 3: 実装**

`broachResolver.ts:161-170` の `getLimitKey` を置換:

```typescript
  // デッキ内発動上限 (spec §6-3 AM35-36 / B9・B10):
  // limit を持つブローチは種類を問わず「同一カード ID」単位でカウントし、
  // COUNTIF($AM$9:AM$9, AM9) <= limit と同じく limit 枚まで有効化する。
  // 別カードのブローチとは競合しない。
  const getLimitKey = (p: PendingBroach): string | null =>
    p.broach.limit != null ? `card:${p.broach.card_id}` : null;
```

ファイル先頭のドキュメンテーションコメント(110-115 行の「種類 6/7: broach_type 単位…」)も新仕様の記述に更新する。

- [ ] **Step 4: 既存テストの意図書き換え + green**

Run: `npx vitest run tests/unit/score/broachResolver.test.ts tests/unit/score/broachResolverBranches.test.ts tests/unit/score/broachAssignment*.test.ts`
`broachResolverBranches.test.ts` の broach_type プール前提のテストは、期待値の差し替えではなく「同一カード重複ケース」に**シナリオごと書き換える**(テスト名も新仕様を表すものに)。

Run: `npm run test:unit`
Expected: 全 PASS(ゴールデンは固有ブローチ 1 件のみで上限に無関係 — spreadsheetDiff 不変)

- [ ] **Step 5: コミット**

```bash
git add -u src tests
git commit -m "fix: 固有ブローチ上限ゲートを limit 付き全種類×同一カードID単位に一本化 (B9/B10)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 8: B12 — 共有ブローチ重複ルールの実態調査と対応

**背景(プラン作成時の重要発見):** シートの「同名重複禁止」`COUNTIF($H$26:$L$27, 名前) > 1` は**カタログ名の重複ではなくインスタンス名の重複**を検出するもの。シートのブローチ登録カタログは所持インスタンスごとに `ALL500①` `ALL500②` のような**連番付きユニーク名**で登録される(v1.0.7 ゴールデンのデッキは `ALL500①` と別インスタンスを同時装備しており、シート自身が加算している = カタログ名単位の重複禁止は**存在しない**)。つまりシートのルールの実質は「**同一の所持インスタンスを 2 箇所に装備できない**」= 本サイトのモデルでは「**カタログ id ごとの装備数 ≤ 所持数(`i7_shared_broach_counts`)**」に対応する。

**Files:**
- 調査: `src/components/score/CardPickerModal.svelte` / `DeckSlots.svelte` / `src/components/MaxScoreFinder.svelte` / `src/lib/score/maxScoreFinder.ts`(共有ブローチ選択 UI と探索が所持数上限を守っているか)
- Modify(調査結果次第): 上限を守っていない箇所への所持数キャップ追加、または `docs/spreadsheet-score-calc-diff.md` の B12 行の訂正のみ
- Test: 上限を守っていない箇所があった場合のみ、該当モジュールの単体テスト追加

- [ ] **Step 1: 調査**

共有ブローチを装備选択できる全 UI/ロジック(`grep -rln "sharedBroach\|SharedBroach" src/components src/lib`)を読み、「デッキ全体で同一カタログ id の装備数が所持数を超えられるか」を判定する。判定結果と根拠(file:line)を `tmp/b12-investigation.md` に記録。

- [ ] **Step 2A(超えられる場合): 所持数キャップを実装**

装備選択時に「デッキ内の同 id 装備数 < 所持数」を強制するガードを選択 UI(および編成組合計算の探索側が共有ブローチを自動割当している場合はそこ)に追加。TDD: ガード関数を純関数として切り出し、所持数 2・装備試行 3 のケースで 3 個目が拒否される failing test → 実装 → green。

- [ ] **Step 2B(既に守られている場合): ドキュメント訂正のみ**

コード変更なし。Task 10 で `docs/spreadsheet-score-calc-diff.md` の B12 を「誤判定(シートのルールはインスタンス単位であり、本サイトの所持数モデルで既に等価に担保済み)」として ✅ に訂正するための根拠を `tmp/b12-investigation.md` に記録。

- [ ] **Step 3: green + コミット(コード変更があった場合のみ)**

```bash
npm run test:unit
git add -u src tests
git commit -m "fix: 共有ブローチの装備数を所持数以内に制限 (B12)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 9: B13 — 共有ブローチカタログに Shout1150 を追加

**Files:**
- Modify: `src/lib/data/sharedBroachs.ts`
- Test: `tests/unit/score/`(SHARED_BROACHS を参照する既存テストが壊れないこと)

**Interfaces:**
- Produces: `SHARED_BROACHS` に `{ id: 27, name: 'Shout1150', shout: 1150, beat: 0, melody: 0 }` が追加される(v1.0.7 ブローチ登録シート B23 実測値 1150)。**BW2022Shout/Beat/Melody は追加しない** — シート実測(ブローチ登録 B3-B5: 種類3=属性カウント、値300)より、既存の id 24/25/26(`S属性枚数分Shout+300` 等)と機能同値であることが確認済み(表示名が違うだけ)。この同値性は Task 10 で diff doc の B13 行に記録する

- [ ] **Step 1: 追加**

`sharedBroachs.ts` の id 26 の行の後に:

```typescript
  { id: 27, name: 'Shout1150', shout: 1150, beat: 0, melody: 0 },
```

> 並び順は既存が「ALL → Shout → Beat → Melody → 属性カウント」のグループ順のため、`Shout1150` は id 6 `Shout1100` の**直前の行**に置く(id は末尾採番 27 のまま。配列順は表示順、id は永続識別子で独立)。

- [ ] **Step 2: 検証 + コミット**

```bash
npm run test:unit
npm run dev &   # 起動後 http://localhost:4321/shared-broach/ で Shout1150 が登録欄に出ることを Playwright MCP で確認しスクショを tmp/ に保存
git add -u src
git commit -m "feat: 共有ブローチカタログに Shout1150 を追加 (B13)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

(dev サーバーは確認後 TaskStop で停止)

---

### Task 10: ドキュメント整合 — diff レポート更新・ADR 0040 追記・ADR 0041 新規

**Files:**
- Modify: `docs/spreadsheet-score-calc-diff.md`(§0-2 の B 表ほか該当ドメイン節)
- Modify: `docs/adr/0040-spreadsheet-v107-reference-policy.md`(例外追記)
- Create: `docs/adr/0041-spreadsheet-alignment-fixes.md`
- Modify: `docs/adr/README.md`(0041 行追加)
- Modify(必要時): `tests/oracle/knownDiffs.ts` の reason に ADR 0041 参照を追記

- [ ] **Step 1: diff レポート更新**

`docs/spreadsheet-score-calc-diff.md` §0-2 の各 B 行を更新:
- B1/B2/B4/B5/B6/B7/B8/B9/B10/B13: 判定を「✅ 修正済み(2026-07-05, ADR 0041)」に変更し、該当ドメイン節(§1〜§9)の対応行も同期
- B3/B11/B14: 判定を「🔵 意図的差異(ADR 0040 追記)」に変更
- B12: Task 8 の調査結果に応じて「✅ 修正済み」または「✅ 誤判定訂正(インスタンス単位ルールで、所持数モデルにより等価担保済み)」
- B13 行に BW2022 系列と id 24-26 の機能同値性の注記を追加
- §0-1 の数値証跡を最新の `[diff]` 出力で差し替え: `npx vitest run tests/unit/score/spreadsheetDiff.test.ts 2>&1 | grep '\[diff\]'`

- [ ] **Step 2: ADR 0040 追記**

決定セクションに例外 3 件を追記(既存の縮小開始位置の例外に並べる):

```markdown
3. 上記に加え、比較検証(B1〜B14)の個別判断として以下 3 点も現行実装を正とする(2026-07-05 追記):
   - センター/フレンドボーナス率はレアリティ別(UR=10%/SSR=7%/他=6%)を維持する(シートの一律 10% は UR 専用ツールとしての簡略化と判断。B3)
   - 共有ブローチのメイン/サブ区分・排他ルールは実装しない(B11)
   - デッキ編成の初期値は特訓済み・スキル Lv5 を維持する(完凸前提で理論値を確認する本サイトの UX。B14)
```

- [ ] **Step 3: ADR 0041 新規作成**

`docs/adr/0041-spreadsheet-alignment-fixes.md`(0040 と同フォーマット、`## 背景` 見出し):

```markdown
# 0041 スプレッドシート v1.0.7 準拠のスコア計算修正(B1〜B13)

- ステータス: 承認
- 日付: 2026-07-05

## 背景

ADR 0040 のリファレンスポリシーに基づく比較検証(docs/spreadsheet-score-calc-diff.md)で
確定した実装バグ候補 B1〜B14 について、ユーザーが 1 件ずつ採否を判断した。

## 決定

以下をシート準拠に修正する: B1(特訓ペナルティ=sp_time×sp_value)、B2(ラビットノートの
キャラ単位化・フレンド除外・特効非乗算)、B4(センター/フレンドボーナスの合算後 1 回丸め)、
B5(スコアアップ期待値の小数保持・カード別丸め。KNOWN_DIFFS から scoreUp を削除)、
B6(縮小基準スコアのアシスト剥離)、B7(縮小発動回数の小数保持)、B8(縮小理論最大値の
按分式化)、B9/B10(固有ブローチ上限ゲートの同一カードID単位・全種類化)、B12(調査結果
に基づく対応)、B13(Shout1150 追加)。
B3/B11/B14 は現状維持とし ADR 0040 の例外に追記した。
I1(縮小開始位置)と ADR 0036 の rate 加重・構造キャップ・クランプは維持する。

## 検討した代替案

- 全件をシート準拠にする案: B3/B11/B14 は実機挙動・UX 意図を優先して不採用。
- 理論最大値のキューイングモデル維持案(B8): シートとの数値一致性を優先して按分式を採用。
```

- [ ] **Step 4: コミット**

```bash
npx vitest run tests/unit/score/spreadsheetDiff.test.ts   # reason 変更後も green を確認
git add docs tests/oracle/knownDiffs.ts
git commit -m "docs: 差分レポート・ADR 0040/0041 を B1〜B14 修正結果に同期

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 11: 最終検証と PR 作成

**Files:** なし(検証と Git 操作のみ)

- [ ] **Step 1: 全単体テスト + E2E**

```bash
npm run test:unit
npm run dev &    # バックグラウンド起動、ready を待つ
npx playwright test tests/score-calc-spec.test.ts tests/card-compare.test.ts
```

Expected: unit 全 green(jsdom ×6 エラーはベースライン既知)。E2E green(dev サーバー再利用、build 不要)。

- [ ] **Step 2: 画面確認**

Playwright MCP で `http://localhost:4321/score-calc/` を開き、編成を組んで期待値・理論値が表示されることを確認、スクリーンショットを `tmp/` に保存。確認後 dev サーバーを停止。

- [ ] **Step 3: 差分確認と PR 作成**

```bash
git log --oneline main..HEAD          # Task 1〜10 の 9〜11 コミット
git diff main --stat                  # tmp/ が含まれないこと
git push -u origin fix/spreadsheet-alignment-b1-b13
gh pr create --title "fix: スコア計算をスプレッドシート v1.0.7 準拠に修正 (B1〜B13)" --body "(§0-2 の判定表更新内容・各修正の1行サマリー・数値影響(B6 +20%級など)・ADR 0040/0041 参照・テスト結果を記載し、末尾に 🤖 Generated with [Claude Code](https://claude.com/claude-code))"
```

- [ ] **Step 4: ユーザーへ報告**

修正 11 件(+維持 3 件)の結果、`[diff]` 数値証跡の before/after、スコアへの体感影響(特に B6/B8 で理論値・期待値が変わること)、**リリース(タグ push)は PR マージ後に別途**(ユーザー指示は PR 作成まで)である旨を報告する。

---

## 実行順序と依存関係

Task 1→2→3(teamBuilder 系、順不同可だがこの順を推奨)→ 4 → 5 → 6(5 のヘルパーに依存)→ 7 → 8 → 9 → 10(全修正の結果に依存)→ 11。

## リスクと安全網

- **ゴールデン回帰ガード**: 全タスクで `spreadsheetDiff.test.ts` が動く。attr は KNOWN_DIFFS 外なので、teamBuilder 系修正(Task 1-3)で attr が 1 でもズレたら即 FAIL する
- **期待値 ≤ 理論値**: `expectedInvariants.test.ts` が Task 5/6 の閉形式化後も成立することを検証
- **数値が大きく変わるのは仕様**: B6(+20% 級)/B8/B5 は「正しい値に変わる」修正。既存テストの期待値更新は導出根拠コメント必須
