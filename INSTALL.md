# SpaceOS Knowledge Service - Telepítési útmutató

## Előfeltételek

- Node.js 20+ (ajánlott: 22 LTS)
- npm 10+
- SQLite3 (opcionális, beágyazott better-sqlite3)

## Telepítés

```bash
# 1. Függőségek telepítése
npm install

# 2. TypeScript fordítás
npm run build

# 3. Konfiguráció
cp .env.example .env
# Szerkeszd a .env fájlt a saját beállításaiddal

# 4. Indítás
npm start
# vagy fejlesztéshez:
npm run dev
```

## Konfiguráció (.env)

```env
# Szerver
PORT=3456
NODE_ENV=production

# SpaceOS útvonalak (állítsd be a saját telepítésedhez!)
SPACEOS_ROOT=/opt/spaceos
TERMINALS_PATH=/opt/spaceos/terminals
DOCS_PATH=/opt/spaceos/docs

# Opcionális: Telegram botok
# TELEGRAM_BOT_TOKEN_ROOT=...
# TELEGRAM_BOT_TOKEN_CONDUCTOR=...

# Opcionális: Datahaven integráció
# DATAHAVEN_URL=https://your-dashboard.example.com
# DATAHAVEN_TOKEN=...
```

## Könyvtár struktúra

```
knowledge-service-clean/
├── src/              # TypeScript forráskód
├── dist/             # Fordított JavaScript (npm run build után)
├── config/           # YAML konfigurációk (terminals.yaml, agents.yaml)
├── data/             # SQLite adatbázisok (automatikusan létrejön)
├── logs/             # Log fájlok
├── bin/              # CLI scriptek
├── scripts/          # Shell scriptek
└── prompts/          # LLM prompt sablonok
```

## API Endpointok

- `GET /api/dashboard` - Terminál állapotok
- `GET /api/health` - Health check
- `POST /api/session/start` - Session indítás
- `GET /api/graph/epics` - Epic dependency gráf
- ... (lásd README.md)

## MCP Server mód

```bash
# stdio bridge-ként (Claude Code-hoz)
node bin/stdio-bridge.js
```

## Tesztelés

```bash
# Health check
curl http://localhost:3456/api/health

# Dashboard
curl http://localhost:3456/api/dashboard
```

## Terminál struktúra

A `terminals/` mappa tartalmazza a 9 terminál konfigurációját:

| Terminál | Szerep |
|----------|--------|
| **root** | Stratégiai döntések, agent infrastruktúra |
| **conductor** | Feladatkiosztás, pipeline koordináció |
| **backend** | .NET + Node.js backend fejlesztés |
| **frontend** | React/TS portál fejlesztés |
| **architect** | Konzultatív architekturális partner |
| **librarian** | Tudásbázis gondozó |
| **explorer** | Codebase kutatás |
| **designer** | UI/UX, Figma integráció |
| **monitor** | Health check, rendszer monitoring |

Minden terminál könyvtára:
```
terminals/<terminal>/
├── CLAUDE.md    # Terminál identity és szabályok
├── inbox/       # Bejövő feladatok
├── outbox/      # DONE/BLOCKED üzenetek
└── archive/     # Lezárt üzenetek
```

## Gyors teszt

```bash
# Telepítés után
cd /home/gabor/knowledge-service-clean
npm install
npm run build

# Indítás
PORT=3457 TERMINALS_PATH=$(pwd)/terminals npm start

# Teszt
curl http://localhost:3457/api/dashboard
```
