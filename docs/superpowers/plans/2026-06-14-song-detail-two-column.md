# 楽曲詳細 属性比率/ノーツ内訳 横並び Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (inline, trivial single-file change). Steps use checkbox (`- [ ]`) syntax.

**Goal:** 楽曲詳細ページで「属性比率」と「ノーツ内訳」を PC（lg 以上）で 2:3 の横並びにする。

**Architecture:** 既存の 2 セクションを 5 カラムグリッドでラップし、col-span で 2:3 に分割。片方のみ存在する楽曲では全幅にフォールバック。表示のみの変更。

**Tech Stack:** Astro 6 / Tailwind CSS v4

---

## Task 1: 2 セクションをグリッドでラップ

**Files:**
- Modify: `src/pages/songs/[id].astro`

現状（108-170 行付近）: 「属性比率」`<section ... mb-6>` と「ノーツ内訳」`<section ... mb-6>` が縦に並ぶ。

- [ ] **Step 1: グリッドラッパーを追加し、各セクションの mb-6 を col-span に置換**

「属性比率」`<section>` の開始タグの直前に追加:
```astro
  <!-- 属性比率 / ノーツ内訳（PC で横並び） -->
  <div class="grid grid-cols-1 lg:grid-cols-5 gap-6 mb-6">
```

属性比率セクションの開始タグを変更（`mb-6` を削除し col-span を追加）:
- 変更前: `<section class="bg-white dark:bg-slate-800 rounded-lg shadow p-6 mb-6">`
- 変更後: `<section class={`bg-white dark:bg-slate-800 rounded-lg shadow p-6 ${noteBreakdown.hasNotes ? 'lg:col-span-2' : 'lg:col-span-5'}`}>`

ノーツ内訳セクションの開始タグを変更:
- 変更前: `<section class="bg-white dark:bg-slate-800 rounded-lg shadow p-6 mb-6">`
- 変更後: `<section class={`bg-white dark:bg-slate-800 rounded-lg shadow p-6 ${totalRatio > 0 ? 'lg:col-span-3' : 'lg:col-span-5'}`}>`

ノーツ内訳セクションの閉じ `)}` の直後（共通ブローチセクションのコメント `<!-- 共通ブローチ スコア寄与 TOP10 -->` の直前）にラッパーを閉じる:
```astro
  </div>
```

注意:
- グリッドラッパーは無条件で出力してよい（両方無い楽曲ではグリッドが空になるだけ。実害なし）。
- 「共通ブローチ スコア寄与 TOP10」セクションはラッパーの外（全幅）に残す。
- 属性比率/ノーツ内訳の内部マークアップ（ドーナツ・凡例・表）は変更しない。

- [ ] **Step 2: typecheck**

Run: `npm run typecheck`
Expected: 0 errors。

- [ ] **Step 3: dev サーバーで目視（制御側が実施）**

`npm run dev` で `/songs/1/`（属性比率・ノーツ内訳の両方を持つ楽曲）を開き:
- PC 幅（≥1024px）で属性比率（左・狭）とノーツ内訳（右・広）が 2:3 で横並びになること。
- モバイル幅（<1024px）で縦積みになること。
スクショを `tmp/` に保存。

- [ ] **Step 4: コミット**

```bash
git add "src/pages/songs/[id].astro"
git commit -m "feat: 楽曲詳細の属性比率とノーツ内訳を PC で横並びに

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 2: ADR 0011 を追加

**Files:**
- Create: `docs/adr/0011-song-detail-two-column.md`
- Modify: `docs/adr/README.md`

- [ ] **Step 1: ADR 本文を作成**

```markdown
# 0011. 楽曲詳細の属性比率／ノーツ内訳を PC で横並びにする

- ステータス: 承認
- 日付: 2026-06-14

## 背景

楽曲詳細ページの「属性比率」と「ノーツ内訳」は縦積みで、PC では縦の余白が冗長だった。

## 決定

両セクションを 5 カラムグリッドでラップし、lg（1024px〜）以上で属性比率 `col-span-2`・ノーツ内訳 `col-span-3`（2:3）の横並びにする。lg 未満は従来どおり縦積み。片方のみ存在する楽曲ではそのセクションを `col-span-5`（全幅）にフォールバックする。

## 検討した代替案

- **50/50 均等分割**: 単純だが属性比率カード（ドーナツ+凡例）の余白が大きく、5 列の表が窮屈。2:3 を採用。
- **md（768px）から横並び**: タブレット幅で 5 列表+ドーナツが窮屈になりうるため lg を採用。

## 影響

- 変更は `songs/[id].astro` のみ。表示のみで、ロジック・データは不変。
```

- [ ] **Step 2: README.md に追記**

`docs/adr/README.md` の `0010` 行の下に追加:
```markdown
| [0011](0011-song-detail-two-column.md) | 楽曲詳細の属性比率／ノーツ内訳を PC で横並びにする | 承認 |
```

- [ ] **Step 3: コミット**

```bash
git add docs/adr/0011-song-detail-two-column.md docs/adr/README.md
git commit -m "docs: ADR 0011 楽曲詳細の属性比率/ノーツ内訳横並びを追加

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 3: PR 作成（リリースは制御側）

- [ ] **Step 1: push + PR**

```bash
git push -u origin feature/song-detail-two-column
gh pr create --title "feat: 楽曲詳細の属性比率／ノーツ内訳を PC で横並びに (ADR 0011)" --body "..."
```

---

## Self-Review

- **Spec coverage**: グリッド化+2:3+フォールバック=Task 1、ADR=Task 2、PR/リリース=Task 3。
- **整合**: span 切替条件は属性比率=`noteBreakdown.hasNotes`、ノーツ内訳=`totalRatio > 0`。両 true で 2+3=5。
- **回帰**: 内部マークアップ不変、共通ブローチは全幅据え置き。
- **プレースホルダ**: なし。
