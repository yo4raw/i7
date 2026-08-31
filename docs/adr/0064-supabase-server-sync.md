# 0064 端末間同期のため Supabase を導入する（完全静的サイト原則の部分的上書き）

- ステータス: 承認
- 日付: 2026-08-31

## 文脈

利用者データ（所持衣装数・ラビットノート・共通ブローチ所持数・保存デッキ）はすべて localStorage に保存されており、`src/components/FooterTools.svelte` が JSON のエクスポート／インポートを提供している。これは「バックアップ」としては機能するが、**PC とスマートフォンを持ち替えて使う利用者にとっては手動の移送作業**であり、実質的に同期になっていない。

一方 `CLAUDE.md` の設計原則は「完全静的サイト」を掲げ、**バックエンド API やサーバーサイドランタイムへの依存を導入してはならない**と明記している。端末間同期はこの原則に正面から抵触する。

したがって本 ADR の主題は「同期を実装するか」ではなく、**原則をどこまで、どういう不変条件の下で緩めるか**である。

## 決定

### 1. Supabase を導入し、原則を部分的に上書きする

Supabase（Postgres + Auth + PostgREST）をホスティング型で採用する。サイトの配信形態は変わらない（Cloudflare Workers Static Assets 上の静的アセットのまま）が、機能の一部が外部 BaaS の可用性に依存することを認める。

**上書きの範囲は「同期機能に限る」。** 以下の不変条件を新たな原則として明記する。

> **同期は純粋な付加機能である。** Supabase が落ちていても、環境変数が未設定でも、利用者が未ログインでも、サイトの全機能は localStorage のみで従来通り動作しなければならない。

これは努力目標ではなく設計制約である。既存の 13 箇所の `saveJson` 呼び出しは同期の成否を一切知らず、同期層が一方的に購読する片方向依存とする。**同期層を丸ごと削除しても既存機能が無傷である**状態を保つ。

環境変数が未設定のビルドは失敗させず、同期 UI ごと非表示にする。これは Dependabot の PR が通常の Actions Variables を参照できない（[0061](0061-dependabot-target-main.md) により Dependabot は `main` 直行）ため、実運用上必須の要件である。

### 2. 認証は Google のみとする

Supabase Auth の Google プロバイダを使う。X（Twitter）は採用しない。X API は 2026-02 に無料枠が廃止され、新規開発者は従量課金のみとなった。「Sign in with X」もプロフィール取得のユーザーリードが課金対象となり、支払い方法の登録が前提となる。加えて従量課金ティアでの OAuth 認可失敗の報告が複数ある。**非公式ファンサイトの認証可用性を X の課金基盤に預ける判断は取らない。**

Supabase Auth は後からプロバイダを追加できるため、この決定は将来 X を足す余地を潰さない。

### 3. データモデルは正規化する

localStorage の値を不透明な文字列としてそのまま保存する案（スナップショット 1 行 ／ キー単位 4 行）ではなく、**ドメインごとに正規化した 5 テーブル**とする。

- `card_counts` / `rabbit_notes` / `shared_broach_counts` — `(user_id, 対象 ID)` を主キーとする値の表
- `decks` / `deck_slots` — デッキを集約とし、スロットは 1 デッキ 6 行

正規化を選ぶ理由は**将来サーバ側でデータを読む機能（デッキの公開 URL、編成の集計、所持率統計）を実施する意思があること**である。値を不透明な文字列として持つ設計では、サーバは原理的に中身をクエリできず、その時点で本番データを抱えたままの移行が必要になる。

代わりに払うコストは差分同期の複雑さであり、下記 4〜6 でその一部を構造的に削っている。

### 4. 削除の伝播が必要なのはデッキのみとする

所持数系（`card_counts` / `shared_broach_counts` / `rabbit_notes`）は**行を削除せず 0 を保持する**。「所持数 0」と「未所持」はドメイン上同じ意味であり、tombstone を別に持つ必要がない。削除は通常の値変更として同期される。

tombstone（`deleted_at`）はデッキ 1 テーブルに閉じ込める。

### 5. 同期の版管理はサーバ側の単調増加カウンタで行う

`updated_at` による増分プルは採用しない。端末時計とサーバ時計の混在で取りこぼしが起きるためである。ユーザーごとの単調増加カウンタ（`sync_cursor` テーブル + `next_rev()`）をトリガーから採番し、各行の `rev` に代入する。クライアントは `rev` を送らず、送っても上書きされる。

増分プルのカーソルは「実際に適用した行の `rev` の最大値」とする。プル中に別端末の書き込みが入っても取りこぼさない（最悪でも次回に再取得する）。

### 6. 3-way マージのベースラインをクライアントに保持する

「最後にサーバと一致していると確認できた行集合」を localStorage（`i7_sync_baseline`）に保持し、ベースライン B ／ ローカル現在 L ／ サーバ現在 S の 3 値で行ごとに判定する。これにより「自分が変えた」と「相手が変えた」を区別でき、両方変わった行だけを競合として扱える。

副産物として「未同期の変更あり」フラグが不要になる。ベースラインとの差分そのものが未同期の変更を表すため、**同期処理全体がべき等**になり、オフライン中の変更も自然に持ち越される。

**ベースラインの更新は行単位に限る。** サーバへの反映が確認できた行だけを更新し、一括更新は禁止する。部分失敗時の再送はこの粒度に依存している。

### 7. デッキの書き込みは Postgres の関数（RPC）で行う

デッキ 1 件の書き込みは `decks` 1 行 + `deck_slots` 6 行であり、PostgREST 経由で HTTP を分けると原子性がない。`upsert_deck(payload jsonb)` を `security invoker` で定義し、1 回の呼び出しを 1 トランザクションとする。RLS はそのまま効く。

所持数系は配列 upsert が単一文なので原子的であり、RPC は用いない。

### 8. Drizzle ORM はスキーマと migration の単一情報源としてのみ使う

**実行時のクエリには使わない。** ブラウザから Postgres へ直接接続するには DB 資格情報をクライアントに埋め込む必要があり、かつ RLS が機能しない。実行時は supabase-js（PostgREST、JWT で RLS が効く）を通す。

Drizzle の役割は 3 つに限る。

1. テーブル定義
2. **RLS ポリシー定義** — `drizzle-orm/supabase` の `authUid` / `authenticatedRole` を用い、ポリシーをスキーマ内に宣言する
3. migration SQL の生成（`drizzle-kit generate`、DB 接続不要）

RLS をスキーマに同居させるのが採用の主目的である。テーブルとアクセス制御が同じファイル・同じ migration で動くため、**テーブルを足したのにポリシーを忘れる**という正規化構成で最も危険な事故を構造的に防げる。

`drizzle-orm` / `drizzle-kit` は devDependencies とし、`src/` からは `import type` のみで参照する。クライアントバンドルには含めない。

TS のプロパティ名は列名と一致させ snake_case とする（`casing: 'snake_case'` オプションは使わない）。実行時のレスポンスは PostgREST の snake_case であり、camelCase にすると `InferSelectModel` の型と実際の値が食い違って変換層が増える。**命名の見た目より型の正しさを取る。**

### 9. migration の適用は手動とし、CI から切り離す

`drizzle-kit generate` はオフラインで動くのでリポジトリ内で完結させる。適用（`drizzle-kit migrate`）は手動実行のみとし、`DATABASE_URL` はローカルの `.env` にのみ置く。

毎時 cron が `main` へマージする構成（[0060](0060-sync-back-merge-on-cron-merge.md)）で、DB スキーマを破壊しうる権限を CI に置くのは危険度が釣り合わない。

`schemaFilter: ['public']` を必ず設定する。これがないと drizzle-kit が Supabase 管理下の `auth` スキーマを管理対象と解釈し、migration に破壊的変更が混入しうる。生成された SQL は適用前に必ず目視確認する。

### 10. 同期メタ情報はバックアップの対象から除外する

`STORAGE_KEYS` に `SYNC_META` / `SYNC_BASELINE` を追加するが、`FooterTools` のエクスポート対象からは除外する。別端末のベースラインを取り込むと、同期エンジンが「同期済み」と誤認して未同期の変更を取りこぼす。

`CLAUDE.md` の「新しいキーは必ず `STORAGE_KEYS` に追記する（バックアップ対象に含めるため）」に対する初めての例外となるため、`BACKUP_EXCLUDED_KEYS` という明示的な集合を `src/lib/storage.ts` に置く。

併せて**バックアップのインポート後は同期状態をリセットする**（ベースライン破棄 + カーソル 0 → 初回リンク扱い）。除外を忘れた将来の変更に対しても安全側に倒れる。

### 11. 勝手なマージはしない

ベースラインが無い状態（初回ログイン、別アカウントへの切替、バックアップ復元後）は 3-way の基準がない。この場合は自動マージせず、データ種別ごとに、両方に値があるときだけ 1 回だけ利用者に選ばせる。片方が空なら自動で解決する。

競合の提示粒度は、所持数系は**データ種別ごとに 1 回**、デッキは**デッキ単位**（名前を出せるので利用者が判断できる）とする。行単位での提示はしない（所持数が数百行競合すると操作不能になる）。

### 12. アカウント自体の削除は問い合わせ対応とする

フッターから同期データは全削除できるが、`auth.users` の行の削除には `service_role` 権限が必要でクライアントからは実行できない。Edge Function を置けば可能だが、それは**サーバーサイドランタイムの追加導入**であり本 ADR の上書き範囲を超える。

データ全削除後に残るのは `auth.users` の 1 行（メールアドレスと識別子）のみである。この扱いをプライバシーポリシーに明記する。

## 検討した代替案

### Google Drive の appDataFolder に保存する（却下）

利用者自身の Drive の隠しフォルダにデータを置く案。**費用ゼロで上限がなく、プロジェクトの自動停止もなく、ログイン機能自体が不要**（`drive.appdata` スコープのみでよく、メールアドレスも識別子も保持しない）で、完全静的サイト原則をほぼ壊さない。端末間同期だけを見れば最も安く最も壊れにくい。

却下の理由は単一である。**サーバ側でデータを読む機能（デッキの公開、集計、統計）が原理的に作れない。** これを将来実施する意思があるため、二度作ることを避けた。

なお欠点として、アクセストークンが 1 時間でリフレッシュトークンを持たないため、Safari の ITP 等でサイレント更新が失敗し明示的な再同意が必要になる場面がある。

### X（Twitter）認証を使う（却下）

決定 2 に記載。

### 値を不透明な文字列として保存する（スナップショット 1 行／キー単位 4 行）（却下）

実装が大幅に小さく、`FooterTools` のシリアライズをそのまま流用でき、差分算出・tombstone・同期カーソルという 3 つの新概念が一切不要になる。確定要件（持ち替え型・後勝ち）に対しては必要十分だった。

却下の理由は決定 3 に記載の通り、サーバがデータの意味を理解できず将来の共有機能に繋がらないこと。後からの移行は不可能ではないが、本番データを抱えた状態での移行になる。

### Firebase（Firestore + Auth）を使う（却下）

Supabase と同型でクライアント直アクセスが可能。ただし 2026-02-03 に Cloud Storage が無料 Spark プランから削除された実績があり、無料枠の継続性の見通しが立てにくい。また Postgres ではないため、将来の集計系機能で SQL が使えない。

### Cloudflare D1 + Workers に自前 API を置く（却下）

既存のデプロイ先の中で完結し、外部サービスを 1 つも増やさない。無料枠も個人サイト規模では余裕がある。

却下の理由は、認証（Google ID トークンの JWKS 検証）から同期エンドポイントまで自前実装になり、実装量と自前運用責任が最大になること。RLS 相当のアクセス制御も自前で書くことになる。

### local-first sync 系サービス（InstantDB / Jazz など）を使う（却下）

要件との相性は良いが、Triplit が 2025 年に Supabase に買収され独立サービスとして消えた例がある。個人サイトの蓄積データを預ける先としてサービス自体の永続性リスクを取る必要がない。

### Drizzle で実行時クエリも行う（却下・技術的に不可）

決定 8 に記載。ブラウザから Postgres への直接接続は DB 資格情報の埋め込みを要し、RLS も効かない。

## 影響

- `package.json` に `@supabase/supabase-js`（dependencies）、`drizzle-orm` / `drizzle-kit`（devDependencies）を追加する。
- `db/schema.ts`（Drizzle スキーマ）、`drizzle.config.ts`、`drizzle/`（生成された migration、commit する）を新設する。`db/**` は実行時に import されないため `vitest.config.ts` の coverage exclude に追加する。
- `src/lib/sync/` を新設する（`supabaseClient.ts` / `projection/` / `diff.ts` / `baseline.ts` / `cursor.ts` / `syncEngine.ts`）。`syncEngine.ts` は Supabase client を注入で受け取り、実 Supabase なしで単体テストできるようにする。
- `src/components/SyncPanel.svelte` を新設し、`BaseLayout.astro` のフッターで `FooterTools` の隣に並べる。全ページに存在するため OAuth コールバック（`?code=`）の処理もここが担い、専用ページは作らない。
- `src/components/ui/ModalDialog.svelte` に `choose`（3 択、Esc / バックドロップ / 「あとで」はすべて「何もしない」に解決）を**加算的に**追加する。既存の `confirm` / `prompt` の挙動は変えないため `DeckList` / `FooterTools` への影響はない。
- `src/lib/storage.ts` に `saveJson` の変更通知フック（書き込み成功後にのみ通知）、`STORAGE_KEYS` への `SYNC_META` / `SYNC_BASELINE` 追加、`BACKUP_EXCLUDED_KEYS` を追加する。
- `src/components/FooterTools.svelte` はインポート復元後に同期状態をリセットする。
- **プライバシーポリシーページ (`src/pages/privacy/index.astro` → `/privacy/`) を新設する。** [0057](0057-focus-indexable-pages.md) の `noindex` 対象には**せず**、index 対象として sitemap にも含める（法的ページは検索から到達できる必要がある）。0057 の一覧に追記する。
- 環境変数 `PUBLIC_SUPABASE_URL` / `PUBLIC_SUPABASE_PUBLISHABLE_KEY` を追加する。どちらも公開前提の値なので GitHub Actions では Secrets ではなく **Variables** に置く。
- 週次の GitHub Actions cron を追加し、Supabase へ軽い REST リクエストを送って 7 日間無アクセスによる自動停止を防ぐ。publishable key しか使わないため CI に秘密情報は増えない。
- Supabase プロジェクトは**東京リージョン（ap-northeast-1）**とし、Redirect URL 許可リストに本番 URL と `http://localhost:4321/**` を登録する。
- `CLAUDE.md` に以下を追記する: 設計原則への同期の例外と不変条件 / `BACKUP_EXCLUDED_KEYS` の存在理由 / Drizzle は実行時クエリに使わないこと / migration を CI から切り離す運用。
- 設計の詳細は `docs/superpowers/specs/2026-08-31-supabase-deck-sync-design.md` を参照。
