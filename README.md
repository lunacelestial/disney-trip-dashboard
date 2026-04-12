# Disney Trip Dashboard

A self-hosted web app for planning, tracking, and enjoying a Walt Disney World trip with family and friends. The project is built as a small two-container stack — a static site served by nginx and an Express + SQLite API — and is designed to run on a home server.

## Stack

- **Frontend:** vanilla HTML / CSS / JS, no build step. Served as static files by nginx.
- **Backend:** Node.js + Express, SQLite (via `better-sqlite3`), `multer` for uploads, `sharp` for image processing.
- **Deploy:** Docker Compose (`nginx:alpine` + custom Node image).
- **AI assist:** Optional Ollama endpoint for LLM-powered helpers (model + URL configurable in `docker-compose.yml`).

## Features

### Dashboard (`index.html`)
- Live countdown to the next trip
- Today/next itinerary card with "wrapping up" nudges
- Chaser Spotlight / Pin Spotlight — drag-and-swipe marquee of your favorited pins plus the current year's chaser/super-chaser pins
- Weather badge, trip switcher, and quick links into all major sections

### Trip Planning
- **Itinerary** (`itinerary.html`) — daily plan with rides, dining, shows, shopping, breaks
- **Planner** (`planner.html`) — higher-level trip scaffolding
- **Trip Calendar** (`tripcalendar.html`) — calendar view of multiple trips
- **Pre-trip checklist** (`pretrip.html`)
- **Packing list** (`packing.html`)
- **Park Hopper / Park Pulse** (`parkhopper.js`, `parkpulse.js`) — park wait-time collector + dashboards backed by a local cache

### Collections & Extras
- **Pin Collector** (`pins.html`)
  - Paginated, filterable grid (year / series / search / status / priority)
  - Mobile-specific collapsible filter bar with active-filter count
  - Collect / uncollect, favorite (gold star), and full detail modal
  - "How to Obtain" section with tagged sources (Parks Open Edition, Cast Member Trading, Hot Topic, BoxLunch, Disney Pin Blog, shopDisney, Other) and optional notes
  - Favorites and chasers surface first in the listing and on the dashboard marquee
- **Wishlist** (`wishlist.html`) — rich wish cards with description, image, URL, and "added by"
- **Budget** (`budget.html`) — user/group budgets, transactions, and confirmation flow
- **Photos** (`photos.html`) — trip photo gallery
- **Trip TV** (`tv.html`) — passive kiosk view for a big screen
- **History** (`history.html`) — post-trip archive

### Admin (`admin.html`)
- User management, pin management (single + bulk upload, rarity, obtain sources), content moderation

## Repository layout

```
disney-site-dev/
├── docker-compose.yml      # nginx + disney-api services
├── nginx.conf              # Static site + /api proxy
├── disney-api/             # Express API
│   ├── server.js           # All routes, DB schema, migrations
│   ├── package.json
│   └── Dockerfile
└── site-content/           # Static frontend
    ├── *.html              # One page per feature
    ├── assets/
    │   ├── css/            # Per-feature stylesheets (base, header, nav, cards, modals, wizard, budget, pins, …)
    │   ├── js/             # Per-feature scripts (dashboard, pins, planner, admin, …)
    │   └── images/
```

The API container mounts two external storage paths for media and wait-time data:

```yaml
volumes:
  - disney-db-dev:/data                                        # SQLite DB
  - /mnt/motherbrain/ironwolf_01/disney-site/storage:/storage  # Images, pins, etc.
  - /mnt/motherbrain/ironwolf_02/disney-wait-times:/waittimes  # Park Pulse cache
```

## Running locally

```bash
# From the repo root
docker compose up -d --build

# Frontend
open http://localhost:8081

# API (proxied through nginx at /api, or direct on the container network)
```

The nginx service exposes port **8081**. The API container exposes **3001** internally and is reachable from nginx via the `/api` proxy.

### Environment variables (`disney-api`)

| Var            | Default                         | Purpose                                      |
| -------------- | ------------------------------- | -------------------------------------------- |
| `OLLAMA_URL`   | `http://192.168.200.100:11435`  | Host for LLM-backed helpers                  |
| `OLLAMA_MODEL` | `qwen2.5:7b`                    | Model name passed to Ollama                  |

Set these in `docker-compose.yml` or override via your own compose file.

## Database

SQLite, auto-migrated on boot. Tables include (non-exhaustive):

- `users`, `sessions`
- `trips`, `trip_days`, `activities`
- `pins`, `user_pin_collection`, `user_pin_favorites`
- `wishlist`, `transactions`, `user_budgets`
- `photos`, `park_wait_times`

Migrations are applied via `ALTER TABLE … ADD COLUMN` statements wrapped in `try/catch` blocks near the top of `server.js` — safe to run repeatedly.

## Frontend conventions

- No bundler. Scripts are loaded with `?v=N` query strings for cache busting — bump the version in the referencing HTML when you change a CSS/JS file.
- Each page has its own top-level script that calls into `script.js` (`apiFetch`, auth helpers).
- Styles are organized by feature in `assets/css/*.css` and loaded per-page.
- The design system is lightweight: Phosphor Icons for iconography, `Mouse Memoirs` + `Nunito` fonts, and a Disney-themed palette defined via CSS custom properties (e.g. `--castle-blue`, `--pixie-gold`, `--magic-red`).

## API surface (high level)

All routes are rooted at `/api`:

- `GET /pins`, `GET /pins/chasers`, `GET /pins/filters` — browse
- `POST|DELETE /pins/:id/collect` — mark collected
- `POST|DELETE /pins/:id/favorite` — mark favorite
- `GET /my/pins/stats`, `GET /my/pins/favorites` — per-user state
- `POST /admin/pins`, `POST /admin/pins/bulk`, `PUT /admin/pins/:id`, `DELETE /admin/pins/:id` — admin management
- Plus equivalent endpoints for trips, itinerary, wishlist, budget, photos, users, and wait times

See `disney-api/server.js` for the full list — it's intentionally a single-file server for easy greppability.

## Development notes

- Database migrations live inline in `server.js` and run on every boot.
- When you add a new column or table, wrap the `ALTER TABLE` / `CREATE TABLE IF NOT EXISTS` in the existing `try` block so re-runs are idempotent.
- To test a backend change: `docker compose restart disney-api`.
- To test a frontend change: hard-refresh (or bump the `?v=` query).
- Admin-only routes require an authenticated session with the admin flag; see `requireAdmin` in `server.js`.
