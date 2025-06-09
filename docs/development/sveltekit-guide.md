# SvelteKit プロジェクト構造と設定

このプロジェクトはSvelteKitを使用して構築されています。

## プロジェクト構造

```
i7/
├── src/
│   ├── app.css          # グローバルスタイル
│   ├── app.html         # HTMLテンプレート
│   ├── lib/             # 共有ライブラリ
│   │   └── db.ts        # データベース接続とクエリ
│   └── routes/          # ページとAPIエンドポイント
│       ├── +layout.svelte    # 共通レイアウト
│       ├── +page.server.ts   # サーバーサイドロジック
│       ├── +page.svelte      # ホームページ
│       ├── api/              # APIエンドポイント
│       │   ├── cards/
│       │   │   ├── +server.ts
│       │   │   └── [id]/
│       │   │       └── +server.ts
│       │   └── stats/
│       │       └── +server.ts
│       ├── card/[id]/        # カード詳細ページ
│       ├── cards/            # カード一覧ページ
│       ├── characters/       # キャラクター別ページ
│       ├── rarity/           # レアリティ別ページ
│       └── search/           # 検索ページ
├── static/              # 静的ファイル
│   └── assets/cards/    # カード画像
├── svelte.config.js     # SvelteKit設定
├── vite.config.ts       # Vite設定
└── package.json         # 依存関係

```

## 主要な設定ファイル

### svelte.config.js
```javascript
import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

export default {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter({
      out: 'build',
      precompress: false,
      envPrefix: ''
    })
  }
};
```

### vite.config.ts
```typescript
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [sveltekit()]
});
```

## ルーティング

SvelteKitはファイルベースのルーティングを使用します：

- `src/routes/+page.svelte` → `/`
- `src/routes/cards/+page.svelte` → `/cards`
- `src/routes/card/[id]/+page.svelte` → `/card/123`
- `src/routes/api/cards/+server.ts` → `/api/cards` (API)

## データフェッチング

### サーバーサイド (+page.server.ts)
```typescript
export async function load({ params }) {
  const card = await db.getCardById(Number(params.id));
  return {
    card
  };
}
```

### クライアントサイド (+page.svelte)
```svelte
<script lang="ts">
  export let data;
  $: card = data.card;
</script>
```

## APIエンドポイント

### GET リクエスト (+server.ts)
```typescript
export async function GET({ url }) {
  const limit = Number(url.searchParams.get('limit')) || 50;
  const cards = await db.getCards(limit);
  return json(cards);
}
```

## 環境変数

### 静的環境変数 ($env/static/private)
- ビルド時に必要
- `.env`ファイルから読み込み

### 動的環境変数 ($env/dynamic/private)
- 実行時に解決
- Docker環境で使用

## 開発コマンド

```bash
# 開発サーバー起動
npm run dev

# ビルド
npm run build

# プレビュー
npm run preview

# 型チェック
npm run check

# テスト実行
npm run test
```

## デプロイメント

### Node.js アダプター
- `@sveltejs/adapter-node`を使用
- `build/`ディレクトリに出力
- `node build`で起動

### 環境変数
- DATABASE_URL: PostgreSQL接続文字列
- NODE_ENV: production/development
- PORT: サーバーポート（デフォルト: 3000）

## パフォーマンス最適化

1. **SSR (Server-Side Rendering)**
   - 初期表示の高速化
   - SEO対策

2. **コード分割**
   - ルートごとに自動分割
   - 必要なコードのみロード

3. **静的アセット**
   - `/static`ディレクトリから直接配信
   - CDN対応

## トラブルシューティング

### ビルドエラー
```bash
# .svelte-kitディレクトリをクリア
rm -rf .svelte-kit
npm run build
```

### 型エラー
```bash
# 型定義を再生成
npm run check
```

### 環境変数が読み込まれない
- `.env`ファイルの存在を確認
- 変数名が正しいか確認
- 再起動が必要な場合あり