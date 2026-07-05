# スプレッドシート v1.0.7 仕様再検証・実装比較 実装プラン

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ota-life.com スプレッドシート v1.0.7 を正とした仕様書 (`docs/spreadsheet-spec-v1.0.7.md`) と、現行 `src/lib/score/` (ADR 0036〜0039 適用後) との比較検証レポート・ゴールデン回帰テストを完成させる。

**Architecture:** (0) v1.0.6/v1.0.7 xlsx の機械的数式 diff → (1) Sonnet サブエージェント並列による全ドメイン独立再導出で既存仕様書を検証・v1.0.7 化 → (2) `tests/oracle/` + ゴールデンフィクスチャの v1.0.7 追随 → (3) 現行 HEAD との差分分類の棚卸しとレポート全面更新。設計書: `docs/superpowers/specs/2026-07-05-spreadsheet-v1.0.7-verification-design.md`

**Tech Stack:** Python 3 (stdlib のみ、xlsx パース) / Workflow ツール + Sonnet サブエージェント / Vitest / 既存 `tests/oracle/` 基盤

## Global Constraints

- **判定ポリシー**: スプレッドシートが正。**例外: 縮小スキルの開始位置(実際の衣装の最小発動回数に合わせる)のみ現行実装が正**(意図的差異として記録、実装は変更しない)
- 本作業では `src/lib/score/` の実装コードを**変更しない**。発見したバグ候補はレポートに記録し、修正は別タスク
- 仕様化・比較検証のサブエージェントは **model: 'sonnet'** を明示指定する
- 中間生成物(数式ダンプ等)は `tmp/spreadsheet-v107/` に置き、**コミットしない**(`tmp/` は .gitignore 済みか `git status` で要確認、追跡される場合は `git add` しない)
- 対象シート URL — v1.0.7: `https://docs.google.com/spreadsheets/d/1UiQ-i2Ofq3DJXz0BOeFsjDId3iVrhedCL1mpIsGzNWk/export?format=xlsx` / v1.0.6 (旧検証対象): `https://docs.google.com/spreadsheets/d/1PeVXmpFFhPBImJ16ZB4aDHSO1e4bmutSerpCcL09XwI/export?format=xlsx`
- ドキュメントは開発者向けのため用語は既存 docs に合わせる(「カード」可。サイト UI 文言ではないため「衣装」強制は適用外)
- 既存テストスイート (`npm run test:unit`) は常に green を維持する

---

### Task 1: xlsx 取得と数式抽出・版間 diff スクリプト

**Files:**
- Create: `tmp/spreadsheet-v107/extract_formulas.py`(コミットしない)
- Create(生成物): `tmp/spreadsheet-v107/v106/` `tmp/spreadsheet-v107/v107/` `tmp/spreadsheet-v107/diff-report.md`

**Interfaces:**
- Produces: シートごとの `<sheet名>.patterns.md`(行反復を圧縮したユニーク数式パターン)、`<sheet名>.full.md`(スコア計算・設定・ブローチ登録・固有ブローチの全セルダンプ)、`diff-report.md`(v1.0.6→v1.0.7 の数式パターン差分と設定値差分)。Task 2/3/5 がこれらを読む

- [ ] **Step 1: 作業ディレクトリ作成と xlsx ダウンロード**

```bash
mkdir -p tmp/spreadsheet-v107
curl -sL --retry 3 -o tmp/spreadsheet-v107/v107.xlsx "https://docs.google.com/spreadsheets/d/1UiQ-i2Ofq3DJXz0BOeFsjDId3iVrhedCL1mpIsGzNWk/export?format=xlsx"
curl -sL --retry 3 -o tmp/spreadsheet-v107/v106.xlsx "https://docs.google.com/spreadsheets/d/1PeVXmpFFhPBImJ16ZB4aDHSO1e4bmutSerpCcL09XwI/export?format=xlsx"
file tmp/spreadsheet-v107/*.xlsx
```

Expected: 両ファイルとも `Microsoft Excel 2007+`、サイズ約 5.8MB。0 バイトの場合は curl を再実行(初回はコネクション切断が起きることがある)。

- [ ] **Step 2: 抽出スクリプトを書く**

`tmp/spreadsheet-v107/extract_formulas.py`:

```python
#!/usr/bin/env python3
"""xlsx から数式・値を抽出。行反復をパターン圧縮し、2版間の diff を出す。
usage: python3 extract_formulas.py <v106.xlsx> <v107.xlsx> <outdir>
"""
import sys, re, json, zipfile
import xml.etree.ElementTree as ET
from collections import defaultdict
from pathlib import Path

NS = '{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'
FULL_SHEETS = ['スコア計算', '設定', 'ブローチ登録', '固有ブローチ', '所有カード登録']
ROWNUM = re.compile(r'(?<=[A-Z$])(\d+)')

def load(path):
    z = zipfile.ZipFile(path)
    wb = z.read('xl/workbook.xml').decode()
    rels = z.read('xl/_rels/workbook.xml.rels').decode()
    rel = dict(re.findall(r'Id="(rId\d+)"[^>]*Target="(worksheets/[^"]+)"', rels))
    sheets = re.findall(r'<sheet[^>]*name="([^"]+)"[^>]*r:id="(rId\d+)"', wb)
    try:
        ss = ET.fromstring(z.read('xl/sharedStrings.xml'))
        strs = [''.join(t.text or '' for t in si.iter(NS + 't')) for si in ss]
    except KeyError:
        strs = []
    out = {}
    for name, rid in sheets:
        root = ET.fromstring(z.read('xl/' + rel[rid]))
        cells = {}
        for c in root.iter(NS + 'c'):
            addr = c.get('r')
            f = c.find(NS + 'f')
            v = c.find(NS + 'v')
            val = None
            if v is not None and v.text is not None:
                val = strs[int(v.text)] if c.get('t') == 's' else v.text
            formula = f.text if f is not None and f.text else None
            if formula or val not in (None, ''):
                cells[addr] = {'f': formula, 'v': val}
        out[name] = cells
    return out

def col_of(a): return re.match(r'([A-Z]+)', a).group(1)
def row_of(a): return int(re.search(r'(\d+)', a).group(1))

def patterns(cells):
    """(列, 行番号を # に正規化した数式) → 行リスト"""
    pat = defaultdict(list)
    for addr, cv in cells.items():
        if cv['f']:
            pat[(col_of(addr), ROWNUM.sub('#', cv['f']))].append(row_of(addr))
    return pat

def write_sheet(outdir, name, cells):
    safe = name.replace('/', '_')
    pat = patterns(cells)
    with open(outdir / f'{safe}.patterns.md', 'w') as w:
        w.write(f'# {name} — ユニーク数式パターン ({len(pat)} 種 / 全 {sum(len(r) for r in pat.values())} セル)\n\n')
        for (col, nf), rows in sorted(pat.items(), key=lambda kv: (kv[0][0], min(kv[1]))):
            rows.sort()
            ex = f'{col}{rows[0]}'
            w.write(f'## {col} 列 rows {rows[0]}..{rows[-1]} ({len(rows)} セル) 例セル {ex}\n')
            w.write(f'```\n={cells[ex]["f"]}\n```\n\n')
    if name in FULL_SHEETS:
        with open(outdir / f'{safe}.full.md', 'w') as w:
            w.write(f'# {name} — 全セルダンプ\n\n| セル | 数式 | 値 |\n|---|---|---|\n')
            for addr in sorted(cells, key=lambda a: (row_of(a), col_of(a))):
                cv = cells[addr]
                f = ('`=' + cv['f'].replace('|', '\\|') + '`') if cv['f'] else ''
                v = str(cv['v']).replace('|', '\\|').replace('\n', ' ') if cv['v'] is not None else ''
                w.write(f'| {addr} | {f} | {v} |\n')

def diff(a, b, w):
    names = sorted(set(a) | set(b))
    for name in names:
        ca, cb = a.get(name, {}), b.get(name, {})
        pa, pb = set(patterns(ca)), set(patterns(cb))
        only_a, only_b = pa - pb, pb - pa
        w.write(f'## {name}\n')
        w.write(f'- v106 のみの数式パターン: {len(only_a)} / v107 のみ: {len(only_b)}\n')
        for col, nf in sorted(only_a): w.write(f'  - [v106のみ] {col}: `={nf[:200]}`\n')
        for col, nf in sorted(only_b): w.write(f'  - [v107のみ] {col}: `={nf[:200]}`\n')
        if name in ('設定',):  # 定数値の差分(数式なしセル)
            keys = sorted(set(ca) | set(cb), key=lambda x: (row_of(x), col_of(x)))
            for k in keys:
                va = (ca.get(k) or {}).get('v'); vb = (cb.get(k) or {}).get('v')
                if va != vb:
                    w.write(f'  - [値差分] {k}: v106={va!r} → v107={vb!r}\n')
        w.write('\n')

def main():
    p106, p107, outdir = sys.argv[1], sys.argv[2], Path(sys.argv[3])
    a, b = load(p106), load(p107)
    for tag, book in (('v106', a), ('v107', b)):
        d = outdir / tag
        d.mkdir(parents=True, exist_ok=True)
        for name, cells in book.items():
            write_sheet(d, name, cells)
    with open(outdir / 'diff-report.md', 'w') as w:
        w.write('# v1.0.6 → v1.0.7 数式パターン・設定値 diff\n\n')
        diff(a, b, w)
    print('done:', outdir)

if __name__ == '__main__':
    main()
```

- [ ] **Step 3: 実行して生成物を確認**

```bash
python3 tmp/spreadsheet-v107/extract_formulas.py tmp/spreadsheet-v107/v106.xlsx tmp/spreadsheet-v107/v107.xlsx tmp/spreadsheet-v107
ls tmp/spreadsheet-v107/v107/ && head -50 tmp/spreadsheet-v107/diff-report.md
```

Expected: `v106/` `v107/` に各シートの `.patterns.md`(+ FULL_SHEETS の `.full.md`)、`diff-report.md` が生成される。

- [ ] **Step 4: diff-report.md を読み、ロジック変更有無を判定して記録**

`diff-report.md` を全文読み、以下を `tmp/spreadsheet-v107/phase0-conclusion.md` に記録する:
- 数式パターン差分が「データ行の増減(行範囲の変化)」に還元できるか、計算ロジック式の変更を含むか
- `設定` シートの値差分一覧(更新履歴の「所有ブローチ初期値変更」に対応するはず)
- ロジック式変更があった場合: 該当ドメインを列挙(Task 3 のエージェントプロンプトと Task 5 のオラクル更新で重点対象にする)

Expected(更新履歴からの予想): ロジック式変更なし、データ追加 + 設定初期値変更のみ。**予想と異なってもこの時点では記録のみ**。

- [ ] **Step 5: コミット(スクリプト生成物はコミットしない)**

```bash
git status --short
```

Expected: `tmp/` 配下が untracked に出ないこと(.gitignore 済みの場合)。出る場合も add しない。このタスクでは何もコミットしない。

---

### Task 2: v1.0.7 スコア計算シート状態の抽出(ゴールデン素材)

**Files:**
- Create: `tmp/spreadsheet-v107/golden-draft.json`(コミットしない。Task 5 で正式フィクスチャ化)
- 参照: `tmp/spreadsheet-v107/v107/スコア計算.full.md` / `docs/spreadsheet-spec-v1.0.5.md` §6 / `tests/fixtures/golden/spreadsheet-v1.0.6.json`

**Interfaces:**
- Consumes: Task 1 の `.full.md` ダンプ
- Produces: `golden-draft.json` — `GoldenCase` 型(`tests/fixtures/golden/loadGolden.ts`)に準拠した v1.0.7 ゴールデンケース 1 件(`label: "UR6枚#2(v1.0.7)"` 等、`version: "1.0.7"`)

- [ ] **Step 1: 結果セルの位置と意味を確定する**

`docs/spreadsheet-spec-v1.0.5.md` の §6 によると結果セルは `B20/D20`(属性値スコア)〜`B24/D24`(最終リザルト)。`tmp/spreadsheet-v107/v107/スコア計算.full.md` で B19/D19 付近のヘッダーラベル(「理論値」「期待値」等)を読み、**B 列と D 列のどちらが expected / max か**を確定し、`tmp/spreadsheet-v107/golden-notes.md` に根拠セルとともに記録する。

- [ ] **Step 2: 入力状態を抽出する**

`スコア計算.full.md` と `docs/spreadsheet-spec-v1.0.5.md` §6 の入力セルマップを突き合わせ、エクスポート時点の入力を読み取る:
- デッキ 6 枠のカード(シート上はカード名。`衣装データ.patterns.md` と値ダンプから **master ID(本リポジトリの `Card.ID` に対応する ID 列)** に解決する。v1.0.6 ゴールデンのときと同じ ID 体系)
- センター枠 index / フレンド枠 index、トレーニング済フラグ、スキル Lv、カード別特効ランク
- 選択楽曲(→ `songId`: `tests/fixtures/` の楽曲 fixture の id。曲名で照合)、notes、duration
- バッジ倍率(`設定` シート)、アシスト ON/OFF、ブローチ・ラビットノートの設定状態

すべて `golden-notes.md` に「値 + 根拠セル」形式で記録する。

- [ ] **Step 3: golden-draft.json を作成**

`tests/fixtures/golden/spreadsheet-v1.0.6.json` と同じスキーマで作成。`expected` / `max` の 5 成分(attr/scoreUp/shrink/liveEnd/final)は Step 1 で確定した列の B20〜B24 / D20〜D24 の**値**(数式でなく計算済み値)を転記する。

**条件分岐**: v1.0.7 のエクスポート状態でブローチ/ラビットノートが設定されている場合(更新履歴の「所有ブローチ初期値変更」により可能性が高い)、シートが計算したブローチ属性合計セル(スコア計算シート内。§6 の該当セルを確認)の値を `golden-notes.md` に記録しておく。Task 5 で `buildOracleInput` の `broachAttr`/`rabbitAttr` に渡すために使う。

- [ ] **Step 4: 楽曲 fixture の存在確認**

`tests/fixtures/index.ts` を Read して楽曲 fixture のロード方法(`findSongById` の参照先 JSON)を確認し、その JSON を Grep して Step 2 の楽曲(songId / 曲名)が存在するか確認する。存在しない場合(v1.0.7 で追加された新曲が選択されている場合)は `npm run extract-fixtures` で再生成し、差分をこのタスクでコミットする:

```bash
npm run extract-fixtures
git add tests/fixtures/ && git commit -m "test: 楽曲フィクスチャを最新マスターに更新"
```

---

### Task 3: 仕様の全ドメイン独立再導出(Sonnet サブエージェント並列)

**Files:**
- Create(生成物): `tmp/spreadsheet-v107/reports/<domain>.md` × 9(コミットしない)
- 参照: `tmp/spreadsheet-v107/v107/*.patterns.md` `*.full.md` / `docs/spreadsheet-spec-v1.0.5.md`

**Interfaces:**
- Consumes: Task 1 のダンプ
- Produces: ドメイン別レポート(独立再導出した仕様 + 既存仕様書との相違点リスト)。Task 4 が統合する

- [ ] **Step 1: Workflow を起動する**

Workflow ツールで以下のスクリプトを実行する(`model: 'sonnet'` 必須)。ドメイン定義とプロンプトはそのまま使う:

```javascript
export const meta = {
  name: 'spreadsheet-v107-spec-rederive',
  description: 'v1.0.7 数式ダンプから各計算ドメインの仕様を独立再導出し既存仕様書と突合',
  phases: [
    { title: 'Rederive', detail: '9ドメイン×盲目的再導出' },
    { title: 'Verify', detail: '既存仕様書との突合 + 相互検証' },
  ],
}
const BASE = 'tmp/spreadsheet-v107'
const DOMAINS = [
  { key: 'team-attr', title: 'チーム属性値計算(衣装ステータス→編成属性値、特効倍率、トレーニング)', files: ['スコア計算', '衣装データ', '設定'] },
  { key: 'center-skill', title: 'センタースキル(発動条件・倍率・丸め)', files: ['スコア計算', '衣装データ'] },
  { key: 'score-up', title: 'スコアアップスキル(発動率・回数・期待値/理論値)', files: ['スコア計算', '衣装データ', '設定'] },
  { key: 'shrink', title: '縮小スキル(基準スコア・カバー率・rate・期待値/理論値)', files: ['スコア計算', '衣装データ', '設定'] },
  { key: 'broach', title: 'ブローチ(固有/共有/メイン・サブ枠、属性値加算)', files: ['スコア計算', 'ブローチ登録', '固有ブローチ', '設定'] },
  { key: 'rabbit-event', title: 'ラビットノートとイベント特効(設定シート定数含む)', files: ['スコア計算', '設定'] },
  { key: 'song-notes', title: '楽曲・ノーツ(ライト倍率、白/色レート、ステージ展開)', files: ['スコア計算', '楽曲データ', '楽曲リスト'] },
  { key: 'per-note-final', title: 'per-note スコア式・ライブ終了時・バッジ・最終リザルト', files: ['スコア計算', '設定'] },
  { key: 'registry', title: '所有カード登録・ブローチ登録シートの入力解決ロジック', files: ['所有カード登録', 'ブローチ登録', '衣装データ'] },
]
const rederivePrompt = (d) => `IDOLiSH7 スコア計算スプレッドシート v1.0.7 の数式ダンプから、担当ドメイン「${d.title}」の計算仕様を再導出せよ。
入力: ${d.files.map(f => `${BASE}/v107/${f}.patterns.md と(あれば)${BASE}/v107/${f}.full.md`).join(' / ')} を Read すること。
必要なら他シートのダンプ(${BASE}/v107/ 配下)も参照してよい。
【重要な制約】docs/spreadsheet-spec-v1.0.5.md 等の既存仕様書は絶対に読むな。数式だけから導出する(独立検証のため)。
出力(最終テキスト、Markdown):
1. 計算フロー(どのセルからどのセルへ、どの順序で)
2. 各ステップの数式(一般化した形)と、ROUNDDOWN/ROUND/FLOOR 等の丸め位置・桁
3. 参照する定数(設定シート等)とその値
4. エッジケース(IF 分岐、IFERROR、空欄時の挙動)
5. 導出に自信がない箇所(要確認リスト)`
const verifyPrompt = (d, spec) => `以下は v1.0.7 数式から独立再導出された「${d.title}」の仕様である。
---
${spec}
---
検証タスク:
1. ${d.files.map(f => `${BASE}/v107/${f}.patterns.md`).join(' / ')} を Read し、上記仕様の各数式・丸め位置が数式ダンプと一致するか確認(誤読の指摘)
2. docs/spreadsheet-spec-v1.0.5.md の該当セクションを Read し、既存仕様書との相違点を列挙(v1.0.7 で変わった点 or 既存文書の誤り。区別して記載)
3. ${BASE}/diff-report.md を Read し、このドメインに関わる v1.0.6→v1.0.7 差分があれば整合を確認
出力(Markdown): 検証済み仕様(修正済み全文) / 既存仕様書との相違点リスト / 未解決の要確認事項`
const results = await pipeline(
  DOMAINS,
  (d) => agent(rederivePrompt(d), { label: `rederive:${d.key}`, phase: 'Rederive', model: 'sonnet' }),
  (spec, d) => agent(verifyPrompt(d, spec), { label: `verify:${d.key}`, phase: 'Verify', model: 'sonnet' }),
)
return DOMAINS.map((d, i) => ({ key: d.key, report: results[i] }))
```

- [ ] **Step 2: 結果をレポートファイルに保存**

Workflow の戻り値(ドメイン別レポート)を `tmp/spreadsheet-v107/reports/<key>.md` に Write する(9 ファイル)。

- [ ] **Step 3: 要確認事項の解消**

各レポートの「未解決の要確認事項」を集約し、ダンプを直接 Read して自力解消するか、解消不能なら `tmp/spreadsheet-v107/open-questions.md` に記録して Task 4 の仕様書に「⚠️要確認」として明記する。

---

### Task 4: v1.0.7 仕様書の統合・コミット

**Files:**
- Create: `docs/spreadsheet-spec-v1.0.7.md`
- 参照: `tmp/spreadsheet-v107/reports/*.md` / `docs/spreadsheet-spec-v1.0.5.md`(構成の踏襲元)

**Interfaces:**
- Consumes: Task 3 のドメイン別レポート
- Produces: v1.0.7 仕様書(Task 6 の比較検証の基準文書)

- [ ] **Step 1: 仕様書を統合執筆する**

`docs/spreadsheet-spec-v1.0.5.md` の章構成(§0 基本情報〜§13 固有ブローチ)を踏襲し、Task 3 の 9 レポートを統合する。必須要件:
- 冒頭に対象コピー ID `1UiQ-i2Ofq3DJXz0BOeFsjDId3iVrhedCL1mpIsGzNWk`・バージョン 1.0.7・採取日 2026-07-05・採取方法(`export?format=xlsx` の `<f>` 要素抽出)を明記
- v1.0.5 版仕様書との相違点(= v1.0.6/1.0.7 での変更 + 既存文書の誤りの訂正)を独立セクション「§変更履歴・旧版からの訂正」にまとめる
- 数式ごとに丸め関数(ROUNDDOWN/ROUND/FLOOR)の位置と桁を明記
- Task 3 Step 3 の未解決事項は「⚠️要確認」として本文に残す

- [ ] **Step 2: コミット**

```bash
git checkout -b docs/spreadsheet-v107-verification
git add docs/spreadsheet-spec-v1.0.7.md
git commit -m "docs: スプレッドシート v1.0.7 完全仕様書を追加(全ドメイン独立再導出による検証済み)"
```

---

### Task 5: オラクル v1.0.7 追随 + ゴールデンフィクスチャ追加(TDD)

**Files:**
- Create: `tests/fixtures/golden/spreadsheet-v1.0.7.json`
- Modify: `tests/fixtures/golden/loadGolden.ts`
- Modify(条件付き): `tests/oracle/*.ts`(Phase 0 でロジック式変更が見つかった場合のみ)/ `tests/unit/score/helpers/buildOracleInput.ts`(ブローチ/ラビット入力が非空の場合のみ)
- Test: `tests/unit/score/spreadsheetDiff.test.ts`(既存。ゴールデン追加で自動的にケースが増える)

**Interfaces:**
- Consumes: Task 2 の `golden-draft.json` / `golden-notes.md`、Task 1 の `phase0-conclusion.md`
- Produces: `goldenCases` に v1.0.7 ケースが追加され、`runOracle(input, mode)` がシート実測値と bit-exact 一致する状態

- [ ] **Step 1: ゴールデン JSON を追加(= failing test の作成)**

`tmp/spreadsheet-v107/golden-draft.json` を `tests/fixtures/golden/spreadsheet-v1.0.7.json` としてコピーし整形する(配列形式、`version: "1.0.7"`)。

- [ ] **Step 2: loadGolden.ts を両版ロードに変更**

```typescript
import goldenV106 from './spreadsheet-v1.0.6.json';
import goldenV107 from './spreadsheet-v1.0.7.json';
```

末尾の export を:

```typescript
export const goldenCases: GoldenCase[] = [
  ...(goldenV106 as GoldenCase[]),
  ...(goldenV107 as GoldenCase[]),
];
```

- [ ] **Step 3: テスト実行(①ポート忠実性がこの時点の検証)**

```bash
npx vitest run tests/unit/score/spreadsheetDiff.test.ts
```

Expected: v1.0.6 ケースは従来どおり PASS。v1.0.7 ケースの「①ポート忠実性」5 成分 × 2 モードが **PASS すれば Phase 0 の「ロジック変更なし」判定の数値的裏付け完了**。FAIL の場合は Step 4 へ。

- [ ] **Step 4(条件付き): オラクル/入力ビルダーの修正**

FAIL した場合のみ。原因を成分単位で切り分ける:
- ブローチ/ラビットノートが v1.0.7 状態で非空 → `buildOracleInput.ts` に `golden-notes.md` に記録したブローチ属性合計を `broachAttr`/`rabbitAttr` として渡す分岐を追加(GoldenCase の `broachs`/`sharedBroachs`/`rabbitNotes` フィールドから構築)
- Phase 0 でロジック式変更が検出されたドメイン → `tests/oracle/` の該当ファイル(`attributeScore.ts` / `scoreUpSkill.ts` / `shrinkSkill.ts` / `spreadsheetOracle.ts`)を v1.0.7 数式に合わせて修正。修正内容は必ず `docs/spreadsheet-spec-v1.0.7.md` の該当数式を根拠として引用コメントを付ける
- 転記ミスの可能性 → `golden-notes.md` の根拠セルとダンプを再照合

修正のたびに Step 3 のコマンドを再実行し、bit-exact 一致まで繰り返す。

- [ ] **Step 5: 全体テストとコミット**

```bash
npm run test:unit
```

Expected: 全 green(②差分分類の unexpected が出た場合は Task 6 で扱うため、まず console の `[diff]` 出力を保存して原因を記録する。unexpected による FAIL をこのタスクで握りつぶす knownDiffs 変更はしない)。

```bash
git add tests/fixtures/golden/ tests/unit/score/helpers/ tests/oracle/
git commit -m "test: スプレッドシート v1.0.7 ゴールデンフィクスチャを追加しオラクルを追随"
```

---

### Task 6: 現行実装との比較検証 + knownDiffs 棚卸し + 差分レポート全面更新

**Files:**
- Modify: `docs/spreadsheet-score-calc-diff.md`(全面更新)
- Modify: `tests/oracle/knownDiffs.ts`(分類・理由の棚卸し)
- 参照: `docs/spreadsheet-spec-v1.0.7.md` / `src/lib/score/` / `docs/adr/0036〜0039`

**Interfaces:**
- Consumes: Task 4 の仕様書、Task 5 のテスト出力(`[diff]` コンソール行)
- Produces: 判定表(✅一致 / ❌不一致=実装バグ候補 / ⚠️要確認 / 🔵意図的差異)を含む更新済みレポート

- [ ] **Step 1: 現時点の数値差分を採取**

```bash
npx vitest run tests/unit/score/spreadsheetDiff.test.ts 2>&1 | grep '\[diff\]' > tmp/spreadsheet-v107/engine-diff-output.txt
cat tmp/spreadsheet-v107/engine-diff-output.txt
```

Expected: 成分別の oracle/engine/delta/class 行。ADR 0036(期待値の縮小 rate 加重化)等で v1.0.6 採取時から delta が変わっている可能性が高い。

- [ ] **Step 2: コード比較を Sonnet サブエージェントで並列実行**

Workflow ツールで以下を実行(`model: 'sonnet'`)。ドメインは Task 3 と同じ 9 分割、プロンプト:

```javascript
export const meta = {
  name: 'spreadsheet-v107-impl-compare',
  description: 'v1.0.7 仕様書と src/lib/score/ 実装の項目別突合',
  phases: [{ title: 'Compare' }],
}
const DOMAINS = [
  { key: 'team-attr', title: 'チーム属性値計算(衣装ステータス→編成属性値、特効倍率、トレーニング)' },
  { key: 'center-skill', title: 'センタースキル(発動条件・倍率・丸め)' },
  { key: 'score-up', title: 'スコアアップスキル(発動率・回数・期待値/理論値)' },
  { key: 'shrink', title: '縮小スキル(基準スコア・カバー率・rate・期待値/理論値)' },
  { key: 'broach', title: 'ブローチ(固有/共有/メイン・サブ枠、属性値加算)' },
  { key: 'rabbit-event', title: 'ラビットノートとイベント特効(設定シート定数含む)' },
  { key: 'song-notes', title: '楽曲・ノーツ(ライト倍率、白/色レート、ステージ展開)' },
  { key: 'per-note-final', title: 'per-note スコア式・ライブ終了時・バッジ・最終リザルト' },
  { key: 'registry', title: '所有カード登録・ブローチ登録シートの入力解決ロジック' },
]
const comparePrompt = (d) => `docs/spreadsheet-spec-v1.0.7.md の「${d.title}」に該当するセクションを Read し、
本リポジトリの実装 src/lib/score/(teamBuilder.ts / simulation.ts / broachResolver.ts / constants.ts / noteFlattener.ts / shrinkExclusion.ts 等)の対応コードと突き合わせよ。
tests/oracle/knownDiffs.ts と docs/adr/0036〜0039 も Read し、既知差分・最近の実装変更を踏まえること。
仕様項目ごとに次の形式で判定表を出力(Markdown テーブル):
| 仕様項目 | シート側仕様(数式要約) | 実装箇所(file:line) | 判定 | 差異の内容 |
判定は ✅一致 / ❌不一致 / ⚠️要確認 のいずれか。
【判定基準】スプレッドシートが正。ただし「縮小スキルの開始位置(実際の衣装の最小発動回数に合わせる)」だけは現行実装が正なので、そこは ❌ ではなく 🔵意図的差異 と判定する。
丸め位置の違い・適用順序の違いも必ず差異として拾うこと。`
const results = await parallel(DOMAINS.map(d => () =>
  agent(comparePrompt(d), { label: `compare:${d.key}`, model: 'sonnet' })))
return DOMAINS.map((d, i) => ({ key: d.key, report: results[i] }))
```

結果を `tmp/spreadsheet-v107/compare/<key>.md` に保存する。

- [ ] **Step 3: ❌不一致 判定の裏取り**

各 ❌ について自分で該当コードと仕様書を読み、誤判定(エージェントの読み違い)を除外する。確定した ❌ は「実装バグ候補」として次 Step のレポートに残す。

- [ ] **Step 4: docs/spreadsheet-score-calc-diff.md を全面更新**

既存の構成(§0 サマリー〜)を踏襲しつつ:
- 比較対象を「v1.0.7(コピー ID `1UiQ-...GzNWk`、2026-07-05 採取)↔ 現行 HEAD」に更新
- §0 サマリー表を Step 2/3 の判定表で書き直す(4 分類: ✅/❌/⚠️/🔵)
- Step 1 の数値差分(engine-diff-output.txt)を数値証跡として掲載
- ❌(実装バグ候補)には「修正は別タスク」と明記し、修正時に参照すべき仕様書セクションを付記

- [ ] **Step 5: knownDiffs.ts の棚卸し**

`KNOWN_DIFFS` 各エントリの `reason` を v1.0.7 仕様書・ADR 0036〜0039 後の実態に合わせて更新する。特に:
- ADR 0036 で期待値が縮小 rate 加重になったため、`shrink` の差分内容が v1.0.6 採取時の記述から変わっていないか
- 縮小開始位置は「意図的差異(現行実装が正、ADR 0040)」であることを reason に明記
- 実態が bit-exact 一致になった成分があれば KNOWN_DIFFS から削除する(classify が match を返すので削除しても green のはず)

```bash
npx vitest run tests/unit/score/spreadsheetDiff.test.ts
```

Expected: PASS(unexpected なし)。

- [ ] **Step 6: コミット**

```bash
git add docs/spreadsheet-score-calc-diff.md tests/oracle/knownDiffs.ts
git commit -m "docs: スプレッドシート差分レポートを v1.0.7 × 現行 HEAD で全面更新し既知差分を棚卸し"
```

---

### Task 7: ADR 0040(判定ポリシー)

**Files:**
- Create: `docs/adr/0040-spreadsheet-v107-reference-policy.md`
- Modify: `docs/adr/README.md`(一覧表に 1 行追加)

- [ ] **Step 1: ADR を書く**

`docs/adr/0040-spreadsheet-v107-reference-policy.md`(既存 ADR のフォーマットを `docs/adr/README.md` で確認して合わせる):

```markdown
# 0040 スコア計算検証は ota-life v1.0.7 スプレッドシートを正とする(縮小開始位置を除く)

- ステータス: 承認
- 日付: 2026-07-05

## 文脈

スコア計算ロジックの正しさを検証する外部リファレンスとして、ota-life.com 配布のスコア計算
スプレッドシート v1.0.7(コピー ID `1UiQ-i2Ofq3DJXz0BOeFsjDId3iVrhedCL1mpIsGzNWk`)を採用
した。v1.0.6 時代のオラクル(`tests/oracle/`)・ゴールデン(`tests/fixtures/golden/`)を v1.0.7 に
追随させ、仕様書(`docs/spreadsheet-spec-v1.0.7.md`)と差分レポート
(`docs/spreadsheet-score-calc-diff.md`)を全面更新した。

## 決定

1. スプレッドシート v1.0.7 とエンジンの計算結果が食い違う場合、原則スプレッドシートを正とし、
   実装側のバグ候補として扱う。
2. 例外として「縮小スキルの開始位置」は、実際の衣装の最小発動回数に合わせる現行実装の挙動を
   正とする(ゲーム実機挙動への準拠を優先)。この項目は意図的差異として
   `tests/oracle/knownDiffs.ts` に分類を維持し、実装は変更しない。

## 検討した代替案

- 全項目でスプレッドシートを正とする: 縮小開始位置はスプレッドシート側が実機と乖離している
  ことが既知のため不採用。
- 項目ごとにケースバイケースで判断: 判定が属人化しレポートの一貫性が失われるため不採用。
```

- [ ] **Step 2: README 一覧表に追記してコミット**

`docs/adr/README.md` の一覧表末尾に 0040 の行を追加(既存行の書式を踏襲)。

```bash
git add docs/adr/
git commit -m "docs: ADR 0040 スプレッドシート v1.0.7 リファレンスポリシーを追加"
```

---

### Task 8: 最終検証・PR 作成

**Files:**
- なし(検証と Git 操作のみ)

- [ ] **Step 1: 全単体テスト実行**

```bash
npm run test:unit
```

Expected: 全 green。FAIL があれば該当タスクに戻って修正(このタスクで新規変更はしない)。

- [ ] **Step 2: 差分の最終確認**

```bash
git log --oneline main..HEAD && git diff main --stat
```

Expected: コミットは Task 4/5/6/7 の 4〜5 件。`tmp/` 配下が diff に含まれないこと。`src/lib/score/` に変更がないこと(Global Constraints)。

- [ ] **Step 3: push と PR 作成**

```bash
git push -u origin docs/spreadsheet-v107-verification
gh pr create --title "docs: スプレッドシート v1.0.7 仕様再検証と実装比較レポート" --body "$(cat <<'EOF'
## 概要
- ota-life スプレッドシート v1.0.7 の完全仕様書を追加(9 ドメインを Sonnet サブエージェントで独立再導出し既存文書を検証)
- v1.0.6→v1.0.7 の数式レベル機械 diff で「ロジック変更なし」を確認(データ・設定初期値のみ)※結果が異なった場合はここを書き換える
- v1.0.7 ゴールデンフィクスチャを追加しオラクルの bit-exact 一致を確認
- 現行 HEAD(ADR 0036〜0039 適用後)との差分レポートを全面更新、knownDiffs を棚卸し
- ADR 0040: シートを正とする判定ポリシー(縮小開始位置のみ現行実装が正)

## 設計書
docs/superpowers/specs/2026-07-05-spreadsheet-v1.0.7-verification-design.md

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 4: 結果サマリーをユーザーに報告**

以下を報告して完了:
- Phase 0 の結論(ロジック変更有無)
- ①ポート忠実性(オラクル vs v1.0.7 シート実測値)の結果
- 判定表サマリー(✅/❌/⚠️/🔵 の件数)と ❌(実装バグ候補)の一覧
- 本作業はドキュメント + テストのみでサイト挙動に変更がないため、**リリース(タグ push)は不要**。❌ の修正を行う場合は別タスクとして起票する
