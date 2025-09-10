# Environment Setup Guide

## Backend (.env)

Tạo file `/backend/.env` với nội dung:

```env
# Application
NODE_ENV=development
PORT=3001
DOMAIN=pokemon-arena.local

# Authentication
JWT_SECRET=your-super-secret-jwt-key-change-in-production
JWT_EXPIRES_IN=3600s
NONCE_TTL_SECONDS=300

# Socket.io
CORS_ORIGINS=http://localhost:3000,http://pokemon-arena.local:3000
SOCKET_PING_INTERVAL=20000
SOCKET_PING_TIMEOUT=20000

# Rate Limiting
AUTH_RATE_LIMIT_TTL=60
AUTH_RATE_LIMIT_REQUESTS=5
LOBBY_MOVE_RATE_LIMIT=20
LOBBY_CHAT_RATE_LIMIT=2
BATTLE_ACTION_RATE_LIMIT=2

# Game Configuration
MATCH_TIMEOUT_SECONDS=60
BATTLE_TIMEOUT_SECONDS=60
LOBBY_TICK_RATE=15

# Storage
STORAGE_DRIVER=memory
# For production, switch to postgres and uncomment DATABASE_URL
# DATABASE_URL=postgresql://username:password@localhost:5432/pokemon_arena

# Monitoring
LOG_LEVEL=debug
METRICS_ENABLED=true
```

## Frontend (.env.local)

Tạo file `/frontend/.env.local` với nội dung:

```env
# API Configuration
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_SOCKET_URL=http://localhost:3001

# Solana Configuration
NEXT_PUBLIC_SOLANA_NETWORK=devnet
NEXT_PUBLIC_SOLANA_RPC_URL=https://api.devnet.solana.com

# Game Configuration
NEXT_PUBLIC_DOMAIN=pokemon-arena.local

# Development
NEXT_PUBLIC_DEBUG=true
```

## Quick Setup Commands

```bash
# Copy example files
cp env.example backend/.env
cp env.example frontend/.env.local

# Install dependencies
pnpm install:all

# Start development servers
pnpm dev
```
