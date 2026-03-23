# scratch-map

! Fork from [ad3m3r5/scratch-map](https://github.com/ad3m3r5/scratch-map) and run some claude code prompts over it to extend and update it. There have been no security check or code review been done on the AI generated code. I would not recommend to host it publicly.

A self-hosted, scratch-off style travel tracker. Mark countries and regions you have visited, log trip details, and watch your map fill up over time.

[![CI](https://github.com/ad3m3r5/scratch-map/actions/workflows/ci.yml/badge.svg)](https://github.com/ad3m3r5/scratch-map/actions/workflows/ci.yml)
[![GitHub Container Registry](https://img.shields.io/badge/ghcr.io-image-lightgrey?logo=github&style=plastic)](https://github.com/ad3m3r5/scratch-map/pkgs/container/scratch-map)

---

## Purpose

scratch-map lets you keep a private, visual record of everywhere you have been. Click a country or region on the interactive SVG map to log a visit. Add trip names, dates, notes, diary entries, and photo links. Your data stays on your own server — nothing is sent anywhere.

---

## Features

- **14 interactive maps** — world (countries), USA (states), Canada (provinces), Australia (states), France (regions), Mexico (states), Japan (prefectures), Spain (communities), United Kingdom (countries), Germany (states), New Zealand (regions), Brazil (states), China (provinces), India (states)
- **Drilldown navigation** — click a supported country on the world map to open its detailed regional map; the back button returns you to the world map
- **Auto-scratch on drilldown** — scratching any region of a country automatically marks that country as visited on the world map
- **Visit logging** — per-visit trip name, description, start/end dates, photo album URL, documents URL
- **Diary entries** — free-text diary entries with optional dates, attached to individual visits
- **Statistics** — countries visited count, world percentage, continent breakdown
- **Data export** — download all your trip data as a JSON file from the overview page
- **Multiple maps** — create separate maps (e.g. one per person or per travel theme), each independently password-protected
- **Password protection** — optional bcrypt-hashed password per map; share-only view links available separately
- **Custom colours** — per-map colour settings for visited/unvisited regions and continent groups
- **Lock/disable locations** — mark regions as intentionally not tracked (e.g. home country)
- **Responsive** — pan and zoom SVG maps; fullscreen mode

---

## Components

| Component | Description |
|---|---|
| **App** | Node.js + Express 5 server, Pug templates, vanilla JS frontend |
| **Database** | PostgreSQL 17 — stores maps, visits, diary entries, disabled locations |
| **SVG maps** | Static SVG files served from `public/images/`, one per map type |

### Database schema

```
maps               — one row per travel map (name, password, settings)
scratched          — one row per visited country/region (map_id, map_type, code)
visits             — one or more visits per scratched entry (trip details, dates, URLs)
diary_entries      — free-text diary entries attached to a visit
disabled_locations — regions hidden from a map
```

The schema is created and migrated automatically on startup — no migration tool required. A fresh PostgreSQL database needs no manual setup.

---

## Setup

### Docker Compose (recommended)

```yaml
services:
  postgres:
    image: postgres:17-alpine
    restart: unless-stopped
    environment:
      POSTGRES_DB:       scratchmap
      POSTGRES_USER:     scratchmap
      POSTGRES_PASSWORD: change_me
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U scratchmap -d scratchmap"]
      interval: 5s
      timeout: 5s
      retries: 10
    networks:
      - app-network

  scratch-map:
    image: ghcr.io/ad3m3r5/scratch-map:latest
    restart: unless-stopped
    depends_on:
      postgres:
        condition: service_healthy
    ports:
      - "3000:3000"
    environment:
      PG_HOST:        postgres
      PG_PORT:        5432
      PG_DATABASE:    scratchmap
      PG_USER:        scratchmap
      PG_PASSWORD:    change_me
      SESSION_SECRET: change_me_to_a_long_random_string
    networks:
      - app-network

volumes:
  postgres_data:

networks:
  app-network:
```

Then:

```bash
docker compose up -d
```

Open `http://localhost:3000`.

### Using an external database

Remove the `postgres` service and `depends_on` block. Point the app at your existing database using the environment variables below.

---

## Environment variables

| Variable | Default | Required | Notes |
|---|---|---|---|
| `PG_HOST` | `localhost` | Yes | PostgreSQL host |
| `PG_PORT` | `5432` | No | PostgreSQL port |
| `PG_DATABASE` | `scratchmap` | Yes | Database name |
| `PG_USER` | `scratchmap` | Yes | Database user |
| `PG_PASSWORD` | *(empty)* | Yes | Database password |
| `SESSION_SECRET` | `scratch-map-session-secret-change-me` | **Yes — change in production** | Express session secret |
| `ADDRESS` | `0.0.0.0` | No | Bind address |
| `PORT` | `3000` | No | HTTP port |
| `LOG_LEVEL` | `INFO` | No | `INFO` or `DEBUG` |
| `ENABLE_SHARE` | `false` | No | Enable public read-only view links at `/view/:mapId/:mapType` |

A `.env` file is also supported for local development.

---

## Docker image

Images are published to both registries on every push to `main`, tagged with `latest` and the short commit SHA (e.g. `sha-a1b2c3d`).

```
ghcr.io/ad3m3r5/scratch-map:latest
ghcr.io/ad3m3r5/scratch-map:sha-<commit>
```

Architectures: `linux/amd64`, `linux/arm64`, `linux/arm/v7`

To pin to a specific build, use the SHA tag instead of `latest`:

```yaml
image: ghcr.io/ad3m3r5/scratch-map:sha-a1b2c3d
```

---

## Tech stack

- [Node.js](https://nodejs.org/) + [Express 5](https://expressjs.com/)
- [Pug](https://pugjs.org/) templates
- [PostgreSQL](https://www.postgresql.org/)
- [node-postgres (pg)](https://node-postgres.com/)
- [SweetAlert2](https://sweetalert2.github.io/) — modals
- [svg-pan-zoom-container](https://github.com/luncheon/svg-pan-zoom-container) — map pan/zoom
- [validator.js](https://github.com/validatorjs/validator.js) — URL validation
- [bcryptjs](https://github.com/dcodeIO/bcrypt.js) — password hashing

---

## Development

```bash
# Install dependencies
yarn install

# Start with auto-reload
yarn dev

# Lint
yarn lint
```

Requires a running PostgreSQL instance. Copy `.env.example` to `.env` and fill in the database credentials, or set the environment variables directly.

```bash
# Run with Docker Compose (dev mode, with hot-reload mount)
docker compose -f docker-compose.dev.yaml up --build
```
