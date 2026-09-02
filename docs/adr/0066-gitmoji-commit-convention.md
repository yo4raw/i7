# 0066 コミットメッセージを gitmoji に統一する

- ステータス: 承認
- 日付: 2026-09-02

## 文脈

このリポジトリのコミットメッセージは Conventional Commits 風の書式（`feat(events): イベント詳細に対象楽曲セクションを追加する`）で運用してきた。ただし明文化された規約はなく、CLAUDE.md にも記載がない。慣習として揃っていただけで、type や scope の付け方に判断基準がなかった。

現状には次の問題がある。

- **規約がどこにも書かれていない**。人・エージェントを問わず、直近の `git log` を見て真似るしかない。scope（`(events)` `(compare)` `(data)` など）の粒度は都度の判断で、揺れている
- **`type(scope):` の英字 prefix が日本語の説明と混在して読みづらい**。件名の先頭 15〜20 文字が英字の分類語で埋まり、`git log --oneline` で内容が視認しづらい
- **自動生成コミットが別書式**。cron の 4 本は `Add card images: 3891` / `Update event DB CSV` という英語の自由文で、人手のコミットと並ぶと統一感がない
- **検証がない**。書式を外したコミットが入っても誰も気づかない

## 決定

**コミットの件名を `<gitmoji> <日本語の説明>` に統一する。** Conventional Commits の `type(scope):` prefix は廃止する。

```
✨ イベント詳細に対象楽曲セクションを追加する
🐛 特効未選択時に曲の先頭グループが消えるのを直す
📝 ADR 0065 イベント対象楽曲をイベント単位で管理する
♻️ fetchSongsJson から旧 API を削除する
```

決定の内訳は次の 4 点。

### 1. 絵文字は Unicode 文字で書く（`:sparkles:` などのショートコードは使わない）

GitHub・ターミナル・`git log` のいずれでもそのまま絵文字として見える。ショートコードはターミナルで変換されず文字列のまま残る。異体字セレクタ（U+FE0F）の有無は検証で吸収するため、`♻️` でも `♻` でも通る。

### 2. type / scope の prefix は付けない

絵文字が type を担うため重複する。件名の先頭から日本語の説明が始まるほうが `git log --oneline` での可読性が高い。scope は説明文の中で自然に表現する（「イベント詳細に〜」「衣装比較で〜」）。

既存の履歴は書き換えない。Conventional Commits 形式のコミットはそのまま残る。

### 3. PR タイトルにも同じ規約を適用する

`develop` / `main` への統合は squash マージで行うため、履歴に残る件名は PR タイトル（または単一コミットのメッセージ）に由来する。PR タイトルを規約から外すと、フックで守っている作業ブランチの書式が統合時に失われる。

### 4. husky の `commit-msg` フックで検証する

`scripts/check-commit-msg.mjs` が件名を検証し、違反時はコミットを中断して理由と早見表を日本語で表示する。外部依存を持たない Node スクリプトで、既存の husky（`prepare` スクリプトで導入済み）から呼ぶ。検証ロジックは `tests/unit/checkCommitMsg.test.ts` で固定する。

次の件名は書式を選べないため検証を通す。

- `Merge …` / `Revert …`（git が生成）
- `fixup!` / `squash!` / `amend!`（`git commit --fixup` 等が生成）
- `chore(deps): Bump …` / `build(deps-dev): bump …`（Dependabot）

### 適用範囲

| 対象 | 適用 |
| ---- | ---- |
| 人手のコミット | する（`commit-msg` フックで強制） |
| 人手の PR タイトル | する（フックでは検証できないため運用で守る） |
| cron 4 本の自動コミット・PR タイトル | する（workflow の `commit-message` / `title` を日本語 + gitmoji に変更） |
| Dependabot の PR | しない（後述） |
| 既存の履歴 | しない（書き換えない） |

Dependabot は `commit-message.prefix` で prefix を変えられるが、件名の本体（`Bump vitest from 4.1.9 to 4.1.10`）は Dependabot が生成し、書式を制御できない。prefix にだけ絵文字を入れても「gitmoji + 英語の自動生成文」という中途半端な形になるため、対象外として検証の例外に置く。

## 検討した代替案

- **絵文字を Conventional Commits の前に足す（`✨ feat(events): …`）**: 既存履歴と互換で、`git log --grep '^feat'` のような検索も残せる。ただし分類情報が絵文字と type で二重になり、件名がさらに長くなる。gitmoji を入れる利点（先頭で種別が一目で分かる）が prefix に打ち消される
- **type の後ろに絵文字を置く（`feat(events): ✨ …`）**: ソートと grep は最も安定するが、絵文字が件名の中に埋もれて視認性が落ちる。gitmoji を導入する意味が薄い
- **commitlint + `commitlint-config-gitmoji` を導入する**: 設定が宣言的になる代わりに devDependency が 3〜4 個増える。検証したいのは「先頭が許可リストの絵文字か」だけで、依存を増やすほどの複雑さがない
- **ドキュメントだけ書いて強制しない**: 導入コストは最小だが、これまで規約が明文化されていなかった状態と実質変わらず、揺れが再発する

## 影響

- `scripts/check-commit-msg.mjs`: 新規。gitmoji 許可リスト（gitmoji 公式 73 種）と検証ロジック、フックの CLI
- `.husky/commit-msg`: 新規。上記スクリプトを呼ぶ
- `tests/unit/checkCommitMsg.test.ts`: 新規。検証ロジックとエラー表示を固定
- `CLAUDE.md`: 「コミットメッセージ規約」セクションを新設し、早見表と PR タイトルへの適用を明記
- `.github/workflows/fetch-new-cards.yml` / `fetch-gap-cards.yml` / `fetch-event-db.yml` / `fetch-new-songs.yml`: `commit-message` と `title` を gitmoji + 日本語へ変更
- 追加する npm 依存はない
- 早見表を変更するときは `COMMON_GITMOJIS`（`scripts/check-commit-msg.mjs`）と CLAUDE.md の表を揃えること
