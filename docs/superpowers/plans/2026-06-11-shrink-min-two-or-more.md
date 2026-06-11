# 判定縮小条件「2枚以上」化 実装プラン

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 編成組合計算の「判定縮小2枚編成」条件を、6 枠中ちょうど 2 枚から 2 枚以上（上限なし）に変更する。

**Architecture:** `maxScoreFinder.ts` の列挙・組合せ数・フレンド差し替えの 3 箇所を「最低枚数 SHRINK_MIN = 2」の規則に一般化する。チャンク構造（s2 = センター/フレンドペア内の縮小枚数）は不変で、メンバー 4 枠の縮小枚数 k をループ化する。スペック: `docs/superpowers/specs/2026-06-11-shrink-min-two-or-more-design.md` / ADR: `docs/adr/0003-shrink-min-two-or-more.md`

**Tech Stack:** TypeScript（純粋モジュール）/ Vitest / Svelte 5（UI 文言のみ）

---

## 検証コマンド

- 単体: `npx vitest run tests/unit/score/maxScoreFinder.test.ts`（高速）/ 全体: `npm run test:unit`
- E2E: `npm run test`（build 込み約 10 分。**dev サーバーを止めてから**実行 — playwright.config は `reuseExistingServer: true`）

### Task 0: ブランチ作成

- [ ] **Step 1:**

```bash
git checkout -b feature/shrink-min-two-or-more
```

---

### Task 1: 単体テストを新仕様に更新（RED）

**Files:**

- Modify: `tests/unit/score/maxScoreFinder.test.ts`

- [ ] **Step 1: countCombos の縮小条件テストを新期待値に書き換え**

`it('縮小2枚条件: s2 ごとのペア数 × メンバー組合せの合計', ...)`（142-149 行目）を以下に置換:

```ts
  it('縮小2枚以上条件: s2 ごとのペア数 × k=max(0,2−s2)..4 のメンバー組合せ総和', () => {
    const ctx = createSearchContext(buildInput({ shrinkPairOnly: true }));
    // S=3, T=4。k = メンバー4枠中の縮小枚数:
    //   s2=0: H(4,2)=10 ペア × Σ_{k=2..4} H(3,k)×H(4,4−k) = (6×10 + 10×4 + 15×1) = 115 → 1150
    //   s2=1: 3×4=12 ペア × Σ_{k=1..4} = (3×20 + 6×10 + 10×4 + 15×1) = 175 → 2100
    //   s2=2: H(3,2)=6 ペア × Σ_{k=0..4} = (1×35 + 3×20 + 6×10 + 10×4 + 15×1) = 210 → 1260
    expect(countCombos(ctx)).toBe(1150 + 2100 + 1260); // 4510
  });
```

- [ ] **Step 2: 列挙テストを「2 枚以上」+「3 枚以上が含まれる」に書き換え**

`it('縮小2枚条件: 列挙数 = countCombos、全デッキの縮小枚数がちょうど 2', ...)`（222-231 行目）を以下に置換:

```ts
  it('縮小2枚以上条件: 列挙数 = countCombos、全デッキの縮小枚数が 2 以上', () => {
    const input = buildInput({ shrinkPairOnly: true });
    const ctx = createSearchContext(input);
    const { count, keys, decks } = enumerateAll(input);
    expect(count).toBe(countCombos(ctx));
    expect(keys.size).toBe(count);
    for (const deck of decks) {
      expect(deck.filter((c) => isShrinkCard(c)).length).toBeGreaterThanOrEqual(2);
    }
    // 「以上」になったことで 3 枚以上の編成も列挙される
    expect(decks.some((deck) => deck.filter((c) => isShrinkCard(c)).length >= 3)).toBe(true);
  });
```

- [ ] **Step 3: 所持×縮小条件のフレンドプール検証を新規則に書き換え**

`it('所持×縮小2枚条件: ...', ...)`（252-269 行目）のデッキ検証ループ（264-268 行目）を以下に置換（ownedCounts や前段の count/keys 検証はそのまま）:

```ts
    for (const deck of decks) {
      const shrink5 = deck.slice(0, 5).filter((c) => isShrinkCard(c)).length;
      // スロット0-4 の縮小が 1 枚以下なら縮小フレンドのみ
      if (shrink5 <= 1) expect(isShrinkCard(deck[5])).toBe(true);
    }
    // own5 ≥ 2 では全フレンドが許される: 非縮小/縮小フレンド両方の編成が存在する
    const over2 = decks.filter((deck) => deck.slice(0, 5).filter((c) => isShrinkCard(c)).length >= 2);
    expect(over2.some((deck) => !isShrinkCard(deck[5]))).toBe(true);
    expect(over2.some((deck) => isShrinkCard(deck[5]))).toBe(true);
```

it 名も `'所持×縮小2枚以上条件: 列挙数 = countCombos、フレンドプール規則が守られる'` に変更。

- [ ] **Step 4: evaluateFriendSwap のテストを新規則に書き換え**

`it('縮小2枚条件: 固定5枠の縮小枚数に応じてプールが絞られる', ...)`（385-397 行目）を以下の 2 件に置換:

```ts
  it('縮小2枚以上条件: 固定5枠の縮小 ≥2 なら全候補プール', () => {
    const input = buildInput({ shrinkPairOnly: true });
    const ctx = createSearchContext(input);
    // 固定5枠 = 縮小2枚 (center 縮小 + member1 縮小) → フレンドは全候補 (7枚) から Top5
    const fixedIds = [
      shrinkUr[0].ID!, shrinkUr[1].ID!,
      nonShrinkUr[0].ID!, nonShrinkUr[1].ID!, nonShrinkUr[2].ID!,
      nonShrinkUr[3].ID!,
    ];
    const friends = evaluateFriendSwap(ctx, fixedIds);
    expect(friends.length).toBe(5); // 旧仕様 (非縮小プール=4枚) なら 4 になる
  });

  it('縮小2枚以上条件: 固定5枠の縮小 ≤1 なら縮小プールのみ', () => {
    const input = buildInput({ shrinkPairOnly: true });
    const ctx = createSearchContext(input);
    // 固定5枠 = 縮小1枚 (center のみ縮小)、フレンド枠は縮小 → プールは縮小 3 枚
    const fixedIds = [
      shrinkUr[0].ID!,
      nonShrinkUr[0].ID!, nonShrinkUr[1].ID!, nonShrinkUr[2].ID!, nonShrinkUr[3].ID!,
      shrinkUr[1].ID!,
    ];
    const friends = evaluateFriendSwap(ctx, fixedIds);
    const shrinkIds = new Set(ctx.shrink.map((c) => c.ID));
    expect(friends.length).toBe(3);
    for (const f of friends) expect(shrinkIds.has(f.cardId)).toBe(true);
  });
```

- [ ] **Step 5: テストが失敗することを確認（RED）**

Run: `npx vitest run tests/unit/score/maxScoreFinder.test.ts`
Expected: 上記 4 箇所（countCombos 4510 / 縮小 2 以上の列挙 / 所持フレンドプール / friendSwap 全候補プール）が FAIL、他は PASS

---

### Task 2: maxScoreFinder.ts の実装（GREEN）

**Files:**

- Modify: `src/lib/score/maxScoreFinder.ts`

- [ ] **Step 1: 定数のリネームと doc コメント更新（23-24 行目）**

```ts
/** デッキ6枠中の判定縮小スキル持ちの最低枚数 (shrinkPairOnly 有効時) */
export const SHRINK_MIN = 2;
```

ファイル内の `SHRINK_PAIR_TARGET` 参照（countCombos ×2、enumerateChunkDecks ×2、evaluateFriendSwap ×1）をすべて置換対象として次ステップで書き換える。`SHRINK_PAIR_TARGET` はテスト・UI から import されていないため re-export 互換は不要。

- [ ] **Step 2: countCombos 所持モード（160-180 行目付近）**

コメントと friendPool を変更:

```ts
    // 縮小2枚以上条件 (所持衣装検索): スロット0-4 の縮小枚数が SHRINK_MIN 以上なら全フレンド、
    // 1 枚以下は縮小フレンドのみを組合せる（除外はしない）
```

```ts
        const own5 = cs + j; // スロット0-4 の縮小枚数
        const friendPool = own5 >= SHRINK_MIN ? ctx.candidates.length : ctx.shrink.length;
```

- [ ] **Step 3: countCombos 通常モード（188-198 行目付近）**

```ts
  // 縮小2枚以上条件: (center, friend) ペア内の縮小枚数 s2 ごとに、
  // メンバー4枠の縮小枚数 k を max(0, SHRINK_MIN−s2) 〜 4 の範囲で総和する
  const S = ctx.shrink.length;
  const T = ctx.nonShrink.length;
  let total = 0;
  for (let s2 = 0; s2 <= 2; s2++) {
    const pairs = s2 === 0 ? multichoose(T, 2) : s2 === 1 ? S * T : multichoose(S, 2);
    if (pairs === 0) continue;
    for (let k = Math.max(0, SHRINK_MIN - s2); k <= 4; k++) {
      total += pairs * multichoose(S, k) * multichoose(T, 4 - k);
    }
  }
  return total;
```

関数 doc コメント（143-144 行目）の「6枠合計でちょうど SHRINK_PAIR_TARGET 枚になる組合せのみ数える」→「6枠合計で SHRINK_MIN 枚以上になる組合せを数える」。

- [ ] **Step 4: enumerateChunkDecks の shrinkPair 分岐（267-276 行目付近）**

`const k = SHRINK_PAIR_TARGET - chunk.s2; ...` ブロックを以下に置換:

```ts
    // メンバー4枠中の縮小枚数 k を、6枠合計が SHRINK_MIN 以上になる範囲でループ
    // (縮小候補が k 枚に満たない場合は多重集合の列挙が空になるだけ)
    const kMin = Math.max(0, SHRINK_MIN - chunk.s2);
    for (let k = kMin; k <= 4; k++) {
      for (const sm of multisetIndicesOrEmpty(S.length, k)) {
        for (const nm of multisetIndicesOrEmpty(T.length, 4 - k)) {
          for (let i = 0; i < k; i++) deck[1 + i] = S[sm[i]];
          for (let i = 0; i < 4 - k; i++) deck[1 + k + i] = T[nm[i]];
          yield deck;
        }
      }
    }
    return;
```

`ChunkDescriptor` の doc コメント（204-205 行目）「縮小2枚条件。s2 = ペア内の縮小枚数。…」→「縮小2枚以上条件。s2 = ペア内の縮小枚数 (0/1/2)。メンバー4枠の縮小枚数は max(0, SHRINK_MIN−s2)〜4 を列挙」。

- [ ] **Step 5: enumerateChunkDecks の center 分岐（302-311 行目付近）**

```ts
    // 縮小2枚以上条件: スロット0-4 の縮小が SHRINK_MIN 以上なら全フレンド、
    // 1 枚以下は縮小フレンドのみ（組合せ自体は除外しない）
    let friendPool = ctx.candidates;
    if (ctx.input.shrinkPairOnly) {
      let shrinkCount5 = 0;
      for (let i = 0; i < 5; i++) {
        if (isShrinkCard(deck[i])) shrinkCount5++;
      }
      friendPool = shrinkCount5 >= SHRINK_MIN ? ctx.candidates : ctx.shrink;
    }
```

- [ ] **Step 6: evaluateFriendSwap（455-465 行目付近）**

doc コメント「shrinkPairOnly 時はスロット0-4 の縮小枚数に応じてプールを絞る (探索時と同じ規則)」は据え置きで、プール選択を変更:

```ts
    pool = fixedShrink >= SHRINK_MIN ? ctx.candidates : ctx.shrink;
```

- [ ] **Step 7: SearchInput の shrinkPairOnly doc コメント（95 行目付近）を更新**

```ts
  /** デッキ6枠中の判定縮小持ちを SHRINK_MIN 枚以上に絞る（所持モードはフレンドプール規則） */
  shrinkPairOnly: boolean;
```

- [ ] **Step 8: テストがすべて通ることを確認（GREEN）**

Run: `npx vitest run tests/unit/score/maxScoreFinder.test.ts`
Expected: 全件 PASS

Run: `npm run test:unit`
Expected: 全件 PASS（他モジュールに影響なし）

- [ ] **Step 9: コミット**

```bash
git add src/lib/score/maxScoreFinder.ts tests/unit/score/maxScoreFinder.test.ts
git commit -m "feat(max-score-finder): 判定縮小条件をちょうど2枚から2枚以上に変更

ADR-0003。所持モードは own5>=2 で全フレンド / own5<=1 で縮小フレンドのみ。
フレンド差し替え Top5 も同規則。SHRINK_PAIR_TARGET は SHRINK_MIN にリネーム。

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: UI 文言の更新

**Files:**

- Modify: `src/components/MaxScoreFinder.svelte:153,361-362`

- [ ] **Step 1: 0 件時メッセージ（153 行目）**

```ts
      : shrinkPairOnly && comboCount === 0 ? '判定縮小2枚以上編成の条件を満たす組合せが作れません（縮小持ち特効候補の不足など）'
```

- [ ] **Step 2: チェックボックスラベルと説明（362 行目）**

```svelte
      <span><b>判定縮小2枚以上編成</b> — 縮小スキル持ちが合計2枚以上になる編成のみ探索します。センター+メンバーの縮小が1枚以下の場合はフレンドを縮小持ちに絞り、2枚以上なら全フレンドを組合せます（縮小持ち候補 {shrinkCandidates.length} 枚）</span>
```

- [ ] **Step 3: dev サーバーで確認**

`npm run dev` をバックグラウンド起動 → `http://localhost:4321/score-calc/max-score-finder/` を開き:

1. チェックボックス文言が新しいこと
2. 条件 ON で組合せ数表示が旧仕様より増えること（縮小候補 ≥3 の楽曲・イベント条件時）
3. スクリーンショットを `tmp/` に保存

確認後 dev サーバーを停止（E2E が同ポートを使うため）。

- [ ] **Step 4: コミット**

```bash
git add src/components/MaxScoreFinder.svelte
git commit -m "feat(max-score-finder): UI 文言を判定縮小2枚以上編成に更新

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: 最終検証とリリース

**Files:** なし（検証・リリース作業）

- [ ] **Step 1: E2E テスト（dev サーバー停止状態で、timeout 900000ms 以上）**

```bash
npm run test
```

Expected: 全件 PASS（`max-score-finder.test.ts` の探索完走テストを含む）

- [ ] **Step 2: スクリーンショットをユーザーに提示**

`tmp/` の UI スクリーンショットを提示（CLAUDE.md Workflow）。

- [ ] **Step 3: push・PR 作成・マージ・リリース**

```bash
git push -u origin feature/shrink-min-two-or-more
gh pr create --title "feat(max-score-finder): 判定縮小条件を2枚以上に変更" --body "$(cat <<'EOF'
## 概要
編成組合計算の「判定縮小2枚編成」を 6 枠中ちょうど 2 枚 → 2 枚以上（上限なし）に変更。

- ADR: docs/adr/0003-shrink-min-two-or-more.md
- スペック: docs/superpowers/specs/2026-06-11-shrink-min-two-or-more-design.md
- 所持衣装縛り: own5 ≥ 2 → 全フレンド / own5 ≤ 1 → 縮小フレンドのみ（最良の縮小フレンドを推薦）
- フレンド差し替え Top5 も同規則

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
gh pr merge --squash --delete-branch
```

マージ後、最新タグを確認してマイナーバージョンを上げてリリース:

```bash
git checkout main && git pull
git tag -l 'v*' --sort=-v:refname | head -1   # 現行バージョン確認
git tag v<次のマイナーバージョン> && git push origin v<次のマイナーバージョン>
```

---

## 自己レビュー結果

- スペック全要件（定数リネーム / countCombos 両モード / 列挙 k ループ / center 分岐 / friendSwap / UI 文言 / テスト 4 箇所 + 3 枚以上ケース）にタスクあり
- countCombos 期待値 4510 は H 値から手計算で検証済み（s2=0: 1150, s2=1: 2100, s2=2: 1260）
- friendSwap テストはプールサイズ差（全候補 7 → Top5 / 縮小 3 → 3 件）で新旧規則を判別できる設計
