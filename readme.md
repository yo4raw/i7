# IDOLiSH7 Game Database

アイドリッシュセブンの攻略データベースサイト - カード情報、スキル詳細、スコア最適化ツールを提供

🌐 **Live Site**: https://i7-rs4b.onrender.com

## 📚 Documentation

Full documentation is available in the [docs](./docs/) directory:

- 📖 [Getting Started](./docs/overview/getting-started.md)
- 🏗️ [Architecture](./docs/architecture/tech-stack.md)
- 💻 [Development Guide](./docs/development/commands.md)
- 🗄️ [Database Schema](./docs/database/schema.md)
- 🚀 [Deployment](./docs/deployment/docker.md)

## 🎯 Quick Start

```bash
# Clone repository
git clone https://github.com/yo4raw/i7.git
cd i7

# Install dependencies
npm install

# Start development with Docker
./dev.sh

# Or start locally
npm run dev
```

Visit http://localhost:5173

## 🏗️ Tech Stack

- **Framework**: SvelteKit with TypeScript
- **Database**: PostgreSQL (Neon)
- **ORM**: Drizzle
- **Styling**: Tailwind CSS
- **Deployment**: Render + Neon

## 📁 Project Structure

```
i7/
├── docs/                  # 📚 Documentation
│   ├── overview/         # Project overview and getting started
│   ├── architecture/     # System design and tech stack
│   ├── development/      # Development guides and standards
│   ├── database/         # Database schema and queries
│   ├── api/             # API documentation
│   └── deployment/       # Deployment guides
├── src/                  # Source code
│   ├── routes/          # SvelteKit routes
│   ├── lib/             # Shared libraries
│   └── app.html         # HTML template
├── static/              # Static assets
│   └── assets/cards/    # Card images (1.png～1440.png)
├── scripts/             # Data management scripts
├── sql/                 # Database schemas
└── docker-compose.yml   # Docker configuration
```

## 🎯 Features

- **Card Database**: Browse all game cards with filtering
- **Skill Details**: View detailed skill information and activation rates
- **Score Calculator**: Optimize team compositions for maximum scores
- **Event Tracking**: Track card releases and event bonuses

## 🛠️ Development

See the [Development Guide](./docs/development/commands.md) for detailed instructions.

### Quick Commands

```bash
# Development server
npm run dev

# Build for production
npm run build

# Run tests
npm test

# Database commands
npm run db:push       # Push schema changes
npm run db:studio     # Open Drizzle Studio
```

## 📊 Database

The project uses PostgreSQL with Drizzle ORM. See [Database Documentation](./docs/database/schema.md) for schema details.

## 🚢 Deployment

The application is deployed on Render with Neon database. See [Deployment Guide](./docs/deployment/production.md) for details.

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'feat: add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License.

## 🔗 Links

- [Live Site](https://i7-rs4b.onrender.com)
- [Documentation](./docs/)
- [IDOLiSH7 Official](https://idolish7.com/)

## 📊 Badge
![CodeRabbit Pull Request Reviews](https://img.shields.io/coderabbit/prs/github/yo4raw/i7?utm_source=oss&utm_medium=github&utm_campaign=yo4raw%2Fi7&labelColor=171717&color=FF570A&link=https%3A%2F%2Fcoderabbit.ai&label=CodeRabbit+Reviews)