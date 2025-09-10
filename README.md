# Pokémon Summon Arena MVP

A Pokemon-themed PvP turn-based 2D game with Solana authentication.

## Tech Stack

- **Frontend**: Next.js 15 + Phaser 3 + Socket.io client + Solana wallet adapter
- **Backend**: NestJS + Socket.io + Storage Adapter (Memory → Postgres)
- **Authentication**: Sign-In with Solana (SIWS) 
- **Package Manager**: pnpm

## Project Structure

```
pokemon-arena-mvp/
├── backend/                    # NestJS backend
├── frontend/                   # Next.js frontend
├── DEVELOPMENT_PLAN.md         # Development roadmap and progress
├── pokemon-summon-arena-mvp-srs-final.md  # Full requirements
└── env.example                 # Environment configuration template
```

## Quick Start

### Prerequisites

- Node.js >= 18.0.0
- pnpm >= 8.0.0

### Installation

1. Clone the repository
2. Copy environment configuration:
   ```bash
   cp env.example .env
   ```

3. Install dependencies:
   ```bash
   pnpm install
   ```

### Development

Start both backend and frontend in development mode:
```bash
pnpm run dev
```

Or run them separately:
```bash
# Backend (NestJS)
pnpm run dev:backend

# Frontend (Next.js)
pnpm run dev:frontend
```

### Available Scripts

- `pnpm run dev` - Start both backend and frontend in development mode
- `pnpm run build` - Build both applications for production
- `pnpm run start` - Start both applications in production mode
- `pnpm run test` - Run tests for both applications
- `pnpm run lint` - Run linting for both applications
- `pnpm run format` - Format code for both applications

## Development Progress

Check `DEVELOPMENT_PLAN.md` for detailed development roadmap and current progress.

## Features (MVP)

- ✅ **SIWS Authentication**: Mandatory Sign-In with Solana
- ⏳ **Real-time Multiplayer**: Lobby movement + turn-based battles
- ⏳ **Matchmaking**: FIFO queue with fairness algorithm
- ⏳ **Battle System**: Turn-based combat with random damage/crit
- ⏳ **Storage Adapter**: Memory (MVP) → Postgres (Final) via ENV switch
- ⏳ **Level Progression**: Winner +1 level, loser faint → revive HP=1

## Architecture

```
[Next.js + Phaser + Wallet] -- REST --> [NestJS Auth]
         |                                     |
         |<---- Socket.io (JWT) --------> [Socket Gateway]
                                              |         |
                                              v         v
                                      [Domain Services] [Storage Adapter]
                                                              |
                                                              v
                                                    [Memory] ← MVP
                                                    [Postgres] ← Final
```

## Environment Variables

See `env.example` for all available configuration options.

Key variables:
- `STORAGE_DRIVER`: `memory` (MVP) or `postgres` (Final)
- `JWT_SECRET`: Secret for JWT token signing
- `CORS_ORIGINS`: Allowed origins for CORS
- `DATABASE_URL`: PostgreSQL connection string (when using postgres driver)

## Contributing

1. Check current phase in `DEVELOPMENT_PLAN.md`
2. Update task status when completing work
3. Follow the Storage Adapter pattern for data access
4. Use TypeScript everywhere
5. Follow NestJS best practices for backend
6. Use pnpm for package management

## License

Private project for MVP development.
