# Technology Stack

## Architecture Overview
モダンなフルスタックWebアプリケーション。SvelteKitによるSSR/CSRハイブリッドアーキテクチャを採用し、PostgreSQLデータベースとDrizzle ORMによる型安全なデータ層を実装。Dockerによる開発環境の統一とRender/Neonによるクラウドデプロイメント。

## Frontend Technologies
- **Framework**: SvelteKit 2.0+
  - Server-Side Rendering (SSR) 対応
  - Client-Side Routing
  - Built-in API Routes
- **Language**: TypeScript 5.0+
  - 完全な型安全性
  - 最新ECMAScript機能
- **Styling**: Tailwind CSS 3.0+
  - Utility-first CSS
  - レスポンシブデザイン
  - カスタムコンポーネント
- **UI Components**: 
  - Shadcn/ui ベースのコンポーネント
  - カスタムSvelteコンポーネント
- **State Management**: Svelte Stores
- **Data Visualization**: Chart.js (円グラフ等)

## Backend Technologies
- **Runtime**: Node.js 20 LTS
- **Framework**: SvelteKit (統合バックエンド)
  - API Routes
  - Form Actions
  - Load Functions
- **Database**: PostgreSQL 16
  - リレーショナルデータモデル
  - 高度なクエリ機能
  - トランザクション管理
- **ORM**: Drizzle ORM
  - TypeScript型安全性
  - マイグレーション管理
  - クエリビルダー
- **External APIs**: 
  - Google Sheets API (データインポート)

## Development Environment

### Prerequisites
```bash
# Required versions
Node.js: 20.x LTS
npm: 10.x
Docker: 24.x
Docker Compose: 2.x
```

### Environment Variables
```env
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/i7_db
DATABASE_URL_PROD=postgresql://...

# Google API
GOOGLE_SHEETS_API_KEY=...
SPREADSHEET_ID_SONGS=...
SPREADSHEET_ID_CARDS=...
SPREADSHEET_ID_BROOCHES=...

# App Config
PUBLIC_BASE_URL=http://localhost:5173
NODE_ENV=development
```

### Common Commands
```bash
# Development
npm install              # 依存関係のインストール
npm run dev             # 開発サーバー起動 (http://localhost:5173)
npm run build           # プロダクションビルド
npm run preview         # ビルドのプレビュー

# Database
npm run db:generate     # Drizzleスキーマ生成
npm run db:migrate      # マイグレーション実行
npm run db:push         # スキーマ同期
npm run db:studio       # Drizzle Studio起動

# Docker
docker-compose up -d    # サービス起動
docker-compose down     # サービス停止
docker-compose logs -f  # ログ確認

# Testing
npm run test            # Vitestテスト実行
npm run test:ui         # テストUIモード
npm run test:coverage   # カバレッジレポート

# Linting & Formatting
npm run lint            # ESLint実行
npm run format          # Prettier実行
npm run check           # SvelteKit診断
```

### Port Configuration
- **Development Server**: 5173
- **Preview Server**: 4173
- **PostgreSQL**: 5432
- **Drizzle Studio**: 3000

## Infrastructure & Deployment

### Development
- **Containerization**: Docker & Docker Compose
  - PostgreSQLコンテナ
  - 開発環境の一貫性
- **Version Control**: Git
- **Package Manager**: npm

### Production
- **Web Hosting**: Render.com
  - 自動デプロイ
  - SSL証明書
  - CDN統合
- **Database**: Neon (Serverless PostgreSQL)
  - 自動スケーリング
  - バックアップ
  - 接続プーリング
- **Asset Storage**: 
  - 静的ファイル: `/static`
  - カード画像: `/static/assets/cards/`

## Testing & Quality Assurance
- **Unit Testing**: Vitest
- **Integration Testing**: Playwright (予定)
- **Type Checking**: TypeScript strict mode
- **Linting**: ESLint + Svelte ESLint
- **Formatting**: Prettier

## Security Considerations
- **Environment Variables**: 機密情報の分離
- **CORS**: SvelteKit内蔵設定
- **SQL Injection**: Drizzle ORMによる防御
- **XSS Protection**: SvelteKitの自動エスケープ

## Performance Optimization
- **SSR/CSR Hybrid**: 初期表示の高速化
- **Image Optimization**: 遅延読み込み
- **Database Indexing**: 検索性能の最適化
- **Caching Strategy**: 
  - ブラウザキャッシュ
  - APIレスポンスキャッシュ

## Monitoring & Logging
- **Error Tracking**: Console logging (開発)
- **Performance Monitoring**: Web Vitals
- **Database Monitoring**: PostgreSQLログ