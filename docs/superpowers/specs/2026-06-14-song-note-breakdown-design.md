# 楽曲詳細ページのノーツ内訳表示

## 背景・目的

楽曲詳細ページ（`songs/[id].astro`）には「属性比率」の円グラフはあるが、ノーツがどのステージ（ライト点灯段階）に・どの属性で分布しているかは分からない。ユーザーは各楽曲のノーツ情報を、**属性（Shout/Beat/Melody）と倍率（ライト倍率）が分かる形**で見たい。

## ドメイン整理

楽曲のノーツは 8 ステージ（ライト点灯段階）に分かれ、各ステージに **ライト倍率** が対応する（`src/lib/score/constants.ts` の `LIGHT_MULTIPLIER`）:

| ステージキー | 倍率 | 日本語ラベル |
|---|---|---|
| `notes_20` | ×1.0 | 点灯前(約20ノーツ) |
| `light_2` | ×1.0 | ライト2つ |
| `light_3` | ×1.1 | ライト3つ |
| `light_4` | ×1.2 | ライト4つ |
| `light_5` | ×1.3 | ライト5つ |
| `light_6` | ×1.5 | ライト6つ |
| `chorus_light_5` | ×2.6 | サビ(ライト5) |
| `chorus_light_6` | ×3.0 | サビ(ライト6) |

各ステージ内のノーツ数は属性（Shout/Beat/Melody）× 始点終点（white/color）で `SongNoteGroup` に整数で格納される（`fetchSongsJson.ts`）。値は整数のノーツ数（フィクスチャ "4-ROAR" で確認: `light_3` = shout_white 20 / shout_color 6 / melody_white 32 / melody_color 3 など）。一部ステージは全属性 0 になりうる。

## スコープ

- 対象: 楽曲詳細ページに「ノーツ内訳」セクションを追加。
- 始点/終点（white/color）は合算して属性別ノーツ数として表示する（ユーザーが求めた次元は「属性」と「倍率」）。
- 既存の「属性比率」円グラフセクションは変更しない。

## 設計

### 構成（追加/変更ファイル）

1. **新規 `src/lib/songNoteBreakdown.ts`** — 表示用ロジックを集約する純粋モジュール。
   - `STAGE_LABELS: Record<string, string>` — 上表のステージキー→日本語ラベル。
   - `buildNoteBreakdown(song: Song): NoteBreakdown` — 表示用の行データと合計を組み立てる純粋関数。
     - ステージ順は既存の `SONG_NOTE_GROUP_KEYS`（`fetchSongsJson.ts`）。倍率は既存の `LIGHT_MULTIPLIER`（`score/constants.ts`）を再利用し、新規定義しない。
     - 各ステージの各属性セル = `${attr}_white + ${attr}_color`（始点終点合算）。
     - **全属性 0 のステージ行は除外**する。
     - 属性別合計（全ステージ合算）を返す。
   - 返却型:
     ```ts
     interface NoteBreakdownRow {
       key: string;        // ステージキー
       label: string;      // 日本語ラベル
       multiplier: number; // LIGHT_MULTIPLIER 由来
       shout: number;
       beat: number;
       melody: number;
     }
     interface NoteBreakdown {
       rows: NoteBreakdownRow[];          // ゼロ行除外済み・ステージ順
       totals: { shout: number; beat: number; melody: number };
       hasNotes: boolean;                 // rows.length > 0
     }
     ```

2. **`src/pages/songs/[id].astro`** — 「属性比率」セクションの下に「ノーツ内訳」セクションを追加。`buildNoteBreakdown(song)` を呼び、`hasNotes` が true のときのみ静的テーブルを描画する。クライアント JS は追加しない（ビルド時静的生成、既存の属性比率セクションと同方式）。

### テーブル仕様

| 列 | 内容 |
|----|------|
| ステージ | `label`（点灯前(約20ノーツ)／ライト2つ…／サビ(ライト6)） |
| 倍率 | `×{multiplier}`（`×1.0`〜`×3.0`、小数1桁） |
| Shout / Beat / Melody | ノーツ数（始点+終点合算）。列ヘッダは `ATTR_BADGE_BG` の属性色を使用 |
| 合計（最終行） | 属性別総ノーツ数（`totals`） |

- ダークモードは `dark:` ペアで指定。既存テーブルの `divide-y divide-gray-100 dark:divide-slate-800` スタイルに合わせる。
- セクション全体を `bg-white dark:bg-slate-800 rounded-lg shadow p-6 mb-6` の既存カードスタイルで包む。

### データ流れ

ビルド時: `song` props → `buildNoteBreakdown()` → 静的 HTML テーブル。新規フェッチなし。

### エラー・欠損ハンドリング

- 全ステージのノーツが 0、またはノートグループが欠損している楽曲では `hasNotes === false` となり、セクション自体を描画しない。
- 欠損サブキーは `?? 0` で 0 として扱う。

## テスト

- 単体（Vitest, `tests/unit/songNoteBreakdown.test.ts`）: `buildNoteBreakdown` を検証 — 始点終点合算、ゼロ行除外、属性別合計、倍率対応、全ゼロ楽曲で `hasNotes === false`。
- E2E（`tests/song-detail.test.ts` に追記）: ノーツ内訳テーブルの見出し・倍率・属性列ヘッダが表示されること。

## 用語・命名

- ユーザー可視テキストは属性名（Shout/Beat/Melody）・「ノーツ内訳」「ステージ」「倍率」を用いる。
- 内部識別子はステージキー（`notes_20` 等）・`song` を引き続き使用する。

## ADR

表示仕様の追加、および「全ゼロステージ行の除外」「始点終点の合算表示」「倍率は LIGHT_MULTIPLIER 再利用」の意思決定を含むため、`docs/adr/0009-song-note-breakdown.md` を追加し、`docs/adr/README.md` に追記する。
