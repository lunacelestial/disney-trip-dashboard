# Disney Trip Dashboard — Project Documentation

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Infrastructure & Environments](#2-infrastructure--environments)
   - 2.1 Host: moonpi1
   - 2.2 Storage Architecture
   - 2.3 Directory Layout
   - 2.4 Dev vs Prod
   - 2.5 Cloudflare & Public Access
3. [Architecture](#3-architecture)
4. [File Structure](#4-file-structure)
5. [Pages & Features](#5-pages--features)
   - 5.1 Dashboard (index.html)
   - 5.2 Itinerary (itinerary.html)
   - 5.3 Budget (budget.html)
   - 5.4 Wishlist (wishlist.html)
   - 5.5 Photos (photos.html)
   - 5.6 Planner (planner.html)
   - 5.7 Admin (admin.html)
   - 5.8 Profile (profile.html)
   - 5.9 TV Dashboard (tv.html)
   - 5.10 Pre-Trip Dashboard (pretrip.html)
   - 5.11 Trip History (history.html)
   - 5.12 Trip Calendar (tripcalendar.html)
6. [Backend API](#6-backend-api)
   - 6.1 Activities
   - 6.2 Wishlist
   - 6.3 Budget & Transactions (Legacy)
   - 6.4 Per-Trip Budgets
   - 6.5 Park Days
   - 6.6 Venues
   - 6.7 Trip Members
   - 6.8 Photos
   - 6.9 Authentication
   - 6.10 Admin Routes
   - 6.11 Dining Memories
   - 6.12 Favorite Rides
   - 6.13 Venue Images
   - 6.14 Trip Cancellation
   - 6.15 Budget Contributions
   - 6.16 Personal User Budgets
   - 6.17 Trip Acknowledgment
7. [Database Schema](#7-database-schema)
8. [Frontend JavaScript Modules](#8-frontend-javascript-modules)
9. [Design Language & Styling](#9-design-language--styling)
10. [Authentication & User Roles](#10-authentication--user-roles)
11. [Deployment & Operations](#11-deployment--operations)
    - 11.1 Docker Compose
    - 11.2 Deploy Script (disney-deploy.sh)
    - 11.3 Rollback Script (disney-rollback.sh)
    - 11.4 Scrub Dev Environment (scrub-dev.sh)
    - 11.5 Common Workflows
12. [Data Seeding](#12-data-seeding)
13. [Known Gaps & Backlog](#13-known-gaps--backlog)
14. [Working with Claude on This Project](#14-working-with-claude-on-this-project)

---

## 1. Project Overview

**Disney Trip Dashboard** is a collaborative, family-friendly web application for planning, tracking, and enjoying a Walt Disney World vacation together. It's a full-stack app with a Node.js/SQLite backend and a multi-page vanilla HTML/JS/CSS frontend, all served behind Nginx via Docker on a Raspberry Pi homelab.

All data — activities, wishlists, budgets, photos, and park schedules — is **shared in real time** across all devices. Everyone in the travel party sees the same dashboard. The site is publicly accessible at **lunarvoid.dev** via Cloudflare.

**Key capabilities:**

- Live countdown to the next scheduled activity with smart travel-type icons (✈️ flights, 🚌 bus, 🚗 rideshare, 🚙 rental)
- Week-at-a-glance itinerary with per-day park assignments and horizontally scrollable e-ticket cards
- **Per-user personal budget tracking** — each person sets their own budget goal, saves toward it pre-trip, and tracks their own spending during the trip
- Budget lifecycle: set goal → contribute savings → confirm at trip start → track spending
- A shared wishlist with screenshots, links, descriptions, and who added each item — images stored on NAS
- A trip photo sharing page — upload, browse, lightbox view, and download — images stored on NAS (motherbrain)
- Trip member assignments — assign family members to trips via the Planner or Edit Trip flow
- Trip member gating — unassigned users see a "Not Assigned to This Trip" message
- **"You're going to Disney World!" splash screen** — animated full-screen announcement when a user is newly assigned to a trip
- **Trip state-aware dashboard** — auto-redirects to pretrip countdown for upcoming trips, shows memories view for past-only users
- **Trip calendar page** — week-at-a-glance grid showing parks, dining, and activities per day
- **Budget confirmation at trip start** — auto-prompts "You've saved $X — is that right?" when trip dates begin
- A step-by-step trip planner wizard with airport transport selection, resort, park days, dining, Lightning Lane, extras, and **venue autocomplete on all entry fields**
- Personalized dashboard greeting ("Hi! {Name}") for logged-in users
- Real-time weather badge (Orlando, FL) with 6-hour forecast window and 5-day forecast modal (Open-Meteo API)
- Park day banner with centered park logo images and floating animation, live hours from ThemeParks.wiki API
- Activity detail modals with embedded Google Maps, walk-time estimation, and dining memory logging
- Dining memories — log what you ate, rate it, review later on your profile
- User profile page with collapsible sections for trips, dining history, and favorite rides
- TV Dashboard — a full-screen, auto-rotating E-ticket marquee display for hotel room TVs
- An admin panel for managing users, venues (with image upload, park filters, and rich editing), and pending venue changes
- Undo for activity deletion (8-second toast with golden Undo button)
- "Happening now" activity duration tracking with auto-advance
- Trip cancellation with full cascade delete (activities, parkdays, budget, user_budgets, contributions, transactions, members, photos)
- Live park hours fetched from ThemeParks.wiki API

---

## 2. Infrastructure & Environments

### 2.1 Host: moonpi1

The application runs on **moonpi1**, a Raspberry Pi running Ubuntu Server. The Pi has two storage devices:

- **Micro SD card** — Boots Ubuntu, holds the OS
- **Crucial P3 1TB NVMe SSD** — Mounted at `/mnt/crucial_01`. Holds all project files and Docker data

A separate machine, **motherbrain** (`192.168.200.100`), is used for:
- **Backups** — Prod backups are rsynced there before each deploy (via SSH as `laluna@motherbrain`)
- **Photo & image storage** — Trip photos, wishlist images, and venue images are stored on motherbrain's Seagate IronWolf NAS drive, mounted on the Pi via SMB

### 2.2 Storage Architecture

```
moonpi1 (Raspberry Pi)
├── /mnt/crucial_01/                     ← Crucial P3 1TB SSD (ext4)
│   ├── docker/                          ← Docker data-root (images, containers, volumes)
│   └── homelab/                         ← Project files (symlinked from ~/homelab)
│       ├── disney-site/                 ← Production
│       └── disney-site-dev/             ← Development
│
└── /mnt/motherbrain/ironwolf_01/        ← SMB mount to motherbrain NAS
    └── disney-site/
        └── storage/                     ← All uploaded image files
            ├── photos/{trip_id}/        ← Trip photos (uploaded via Photos page)
            ├── wishlist/                ← Wishlist screenshot images
            └── venues/                  ← Venue images (uploaded via Admin panel)
```

### 2.3 Directory Layout

```
~/homelab/  →  symlink to /mnt/crucial_01/homelab/
├── README.md                  ← You are here (this file)
├── disney-site/               ← PRODUCTION — served live at lunarvoid.dev
│   ├── docker-compose.yml
│   ├── nginx.conf
│   ├── site-content/          ← Static HTML/CSS/JS files (served by Nginx)
│   │   ├── index.html
│   │   ├── itinerary.html
│   │   ├── budget.html
│   │   ├── wishlist.html
│   │   ├── photos.html
│   │   ├── planner.html
│   │   ├── admin.html
│   │   ├── profile.html
│   │   ├── tv.html
│   │   ├── pretrip.html
│   │   ├── history.html
│   │   ├── tripcalendar.html  ← NEW: Trip calendar week grid
│   │   └── assets/
│   │       ├── css/           ← Split CSS: base, header, nav, cards, eticket, modals, budget, wizard, venues, wishlist, photos
│   │       ├── js/            ← Split JS: script, dashboard, itinerary, header, budget, modals, wishlist, photos, planner, admin
│   │       └── images/
│   └── disney-api/
│       ├── Dockerfile
│       ├── server.js
│       ├── package.json
│       ├── seed.js
│       └── seed-venues.json
│
└── disney-site-dev/           ← DEVELOPMENT — identical structure
```

### 2.4 Dev vs Prod

| Aspect | Dev (`disney-site-dev`) | Prod (`disney-site`) |
|---|---|---|
| Purpose | Test changes safely | Live site for the family |
| Port | 8081 | 8080 |
| Container names | `disney_itinerary_dev`, `disney_api_dev` | `disney_itinerary`, `disney_api` |
| Docker volume | `disney-db-dev` | `disney-db` |
| URL | Internal only (LAN) | lunarvoid.dev (public via Cloudflare) |
| Database | Disposable — can be wiped with `scrub-dev.sh` | Persistent — backed up before every deploy |

### 2.5 Cloudflare & Public Access

The production site is served at **lunarvoid.dev** through Cloudflare. The deploy script purges the Cloudflare cache after every promotion.

---

## 3. Architecture

```
Browser (any device)
       │
       ▼
  Cloudflare CDN (lunarvoid.dev)
       │
       ▼
   moonpi1 (Raspberry Pi)
       │
       ▼
   Nginx (port 8080)
   ├── Serves static HTML/CSS/JS from ./site-content
   └── Proxies /api/* → Node.js Express (port 3001)
                                │
                          ┌─────┴─────┐
                          ▼           ▼
                    SQLite DB    motherbrain NAS
                    (/data)      (/storage via SMB)
                    Metadata     Photos, wishlist &
                                 venue images
```

**Technology Stack:**

| Layer | Technology |
|---|---|
| CDN / DNS | Cloudflare |
| Host machine | Raspberry Pi (moonpi1) with Crucial P3 1TB SSD |
| Web server | Nginx (Alpine Docker image) |
| API server | Node.js + Express 4 + Multer (file uploads) |
| Database | SQLite via `better-sqlite3` |
| Image storage | motherbrain NAS (Seagate IronWolf) via SMB mount |
| Frontend | Vanilla HTML5, CSS3, JavaScript (ES2020+) |
| Icons | Phosphor Icons (CDN) |
| Fonts | Mouse Memoirs + Nunito (Google Fonts) |
| External APIs | Open-Meteo (weather), ThemeParks.wiki (park hours) |
| Container orchestration | Docker Compose |
| Backups | rsync to motherbrain |

---

## 4. File Structure

### Frontend JavaScript (Split Architecture)

The frontend JS was split from a monolithic `script.js` into 8 focused modules:

| File | Lines | Contents |
|------|-------|----------|
| `script.js` | ~1300 | API client, DB wrappers (ItineraryDB/WishlistDB/BudgetDB/ParkDaysDB/VenuesDB), Auth + login modal, shared helpers (showToast, escapeHtml, formatTimeForDisplay, haversineDistance, attachVenueAutocomplete), E-ticket config, trip separation logic, confirm dialog, animations, trip splash, budget confirmation, `initApp()` |
| `dashboard.js` | ~590 | Next Activity hero + countdown, Later Today row, budget/wishlist snapshot cards, trip switcher, trip state routing (active/upcoming/past), memories view, `initializeDashboardPage()` |
| `itinerary.js` | ~850 | Day-by-day rendering, activity form CRUD, undo toast, venue autocomplete + browser, edit trip modal, `initializeItineraryPage()` |
| `header.js` | ~800 | Weather widget (badge + modal + hourly), park day banner + config + character swap + live hours, nav pill, budget quick-add pill |
| `budget.js` | ~540 | Personal per-user budget page, transactions, budget wizard (per-user), cancel trip, `DISNEY_PROMPTS` |
| `modals.js` | ~380 | Activity detail modal (map, walk time, navigate), dining memories, dining feedback modal |
| `wishlist.js` | ~180 | Wishlist page rendering + add form with image upload |
| `photos.js` | ~290 | Photos page + trip selector, upload zone with drag/drop, lightbox |
| `planner.js` | ~1080 | Trip planner wizard with venue autocomplete on all steps |
| `admin.js` | ~500 | Admin panel JS with venue management |

**Key design:** `initApp()` uses `typeof` guards for all page-specific functions so each page only runs inits for scripts it loads.

### HTML Script Tags (per page)

| Page | Scripts |
|------|---------|
| index.html | script → dashboard → modals → header → budget |
| itinerary.html | script → dashboard → itinerary → modals → header → budget |
| budget.html | script → header → budget |
| wishlist.html | script → wishlist → header → budget |
| photos.html | script → photos → header → budget |
| profile.html | script → header → budget |
| history.html | script → header → budget |
| pretrip.html | script → header → budget |
| tripcalendar.html | script → header → budget |
| tv.html | script → dashboard → header → budget |
| admin.html | script → header → budget → admin |
| planner.html | script → header → budget → planner |

---

## 5. Pages & Features

### 5.1 Dashboard (`index.html`)

The home page with **trip-state-aware routing**:

- **Active trip** (today within trip dates) → Normal dashboard: Next Activity hero, Later Today, budget/wishlist cards
- **Upcoming trip** (assigned to a future trip) → Auto-redirects to `pretrip.html` countdown page
- **No future trips** (all past or none) → "Your Disney Memories" view with past trip cards, photo counts, and links to calendar/photos

**Normal Dashboard Sections:**
- Utility Bar, Site Header, Nav Tray, Budget Quick-Add Pill, Park Day Banner
- Next Activity Card with smart travel icons and countdown
- Later Today timeline
- Wishlist Spotlight Card

### 5.2 Itinerary (`itinerary.html`)

Full week schedule view with E-ticket styled activity cards. Trip switcher uses `buildTripsFromBudgets()` as single source of truth.

### 5.3 Budget (`budget.html`)

**Personal per-user budget tracking.** Each user sets and tracks their own budget for each trip.

- Trip selector dropdown
- If user has no personal budget: "Hey [Name]! Set Your Personal Budget" prompt
- If budget exists: "[Name]'s Remaining" hero card with progress bar, 4 category cards (Hotel, Dining, Extras, Souvenirs)
- "[Name]'s Transactions" list filtered to the logged-in user's spending only
- Budget wizard saves to `/api/trips/:tripId/my-budget` (per-user endpoint)
- Admin-only cancel trip button

### 5.4 Wishlist (`wishlist.html`)

Shared bucket list with screenshot upload to motherbrain NAS.

### 5.5 Photos (`photos.html`)

Shared photo gallery with trip picker, drag & drop upload, lightbox, and download.

### 5.6 Planner (`planner.html`)

Multi-step wizard with **venue autocomplete on all entry fields**:

1. **Dates & Travel** — First/last day, flying vs driving, arrival/departure times, MCO transport selector
2. **Who's Going?** — Select family members
3. **Resort** — Resort name with autocomplete (filtered to travel-type venues), optional mid-trip change
4. **Park Days** — Assign park/rest/travel day to each date
5. **Dining** — Add dining reservations with autocomplete (filtered to dining-type venues, auto-fills location)
6. **Lightning Lane** — Add LL reservations with autocomplete (filtered to ride-type venues, auto-fills land/area)
7. **Other Activities** — Shows, shopping, breaks with autocomplete (auto-fills location + type)
8. **Review & Save** — Full summary

### 5.7–5.9 Admin, Profile, TV Dashboard

(Unchanged from previous documentation)

### 5.10 Pre-Trip Dashboard (`pretrip.html`)

Dark, TV-mode inspired dashboard for the weeks/months leading up to a trip. Uses `trip_budgets` as data source (not `splitIntoTrips`).

**Sections:** Countdown Hero, Quick Links, Step Training Card, Trip Fund Card (with contribution tracking via `/api/trips/:tripId/contributions`).

### 5.11 Trip History (`history.html`)

Uses `buildTripsFromBudgets()` as single source of truth — shows ALL trips including those with zero activities. Expandable Dining, Park Days, Photos pills. Admin-only Delete Trip.

### 5.12 Trip Calendar (`tripcalendar.html`) — NEW

Simple week-at-a-glance grid for viewing a trip's schedule at a glance.

**Features:**
- Each day shown as a card with day name, date, and trip day number
- Park assignment shown as a color-coded banner (Magic Kingdom=blue, EPCOT=purple, etc.)
- Key events displayed: dining reservations, shows, travel activities
- Ride count shown as summary ("3 rides planned")
- Today highlighted with gold border and "Today" badge; past days dimmed
- Trip selector dropdown to switch between trips
- Responsive: grid on desktop, single column on mobile
- Legend showing event type icons
- Link to full itinerary for detailed editing
- Accessible from trip splash screen ("View My Trip" button) and memories dashboard

---

## 6. Backend API

### 6.1–6.14

(Unchanged from previous documentation)

### 6.15 Budget Contributions

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/trips/:tripId/my-contributions` | Current user's contributions |
| `POST` | `/api/trips/:tripId/contributions` | Add contribution (`{ amount, note, date }`) — user auto-detected from auth token |
| `DELETE` | `/api/contributions/:id` | Delete a contribution |

### 6.16 Personal User Budgets — NEW

Each user has their own budget per trip. The budget goes through a lifecycle: set goal → save contributions → confirm at trip start → track spending.

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/trips/:tripId/my-budget` | Get current user's personal budget, contributions, transactions, confirmed status |
| `PUT` | `/api/trips/:tripId/my-budget` | Set/update current user's budget categories (hotel, food, extras, souvenirs) |
| `GET` | `/api/trips/:tripId/budgets` | Admin/group view: all users' budgets for a trip |
| `POST` | `/api/trips/:tripId/confirm-budget` | Lock budget for spending mode (sets `confirmed = 1`) |

The `GET /api/trip-budgets` endpoint now also returns `myBudget`, `mySpent`, and `myTotal` for the current user when authenticated.

Transaction creation (`POST /api/budget/transactions`) now auto-attaches the user's ID from the auth token.

### 6.17 Trip Acknowledgment — NEW

Controls the "You're going to Disney World!" splash screen.

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/my/unacknowledged-trips` | Trips the user hasn't seen the splash for yet |
| `POST` | `/api/trips/:tripId/acknowledge` | Mark trip as seen (splash won't show again) |

**Auto-acknowledge rules:**
- When a user adds themselves to a trip (self-assignment), the trip is auto-acknowledged
- Admins never see the splash (client-side skip)

---

## 7. Database Schema

The SQLite database (`disney.db`) contains 18 tables. WAL mode is enabled.

### New tables (March 16, 2026):

### `user_budgets`
| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER PK | Auto-increment |
| `trip_id` | TEXT FK | References trip_budgets |
| `user_id` | TEXT FK | References users |
| `hotel` | REAL | Personal hotel budget |
| `food` | REAL | Personal food budget |
| `extras` | REAL | Personal extras budget |
| `souvenirs` | REAL | Personal souvenirs budget |
| `confirmed` | INTEGER | 0 = saving mode, 1 = spending mode |
| `created` / `updated` | TEXT | Timestamps |

UNIQUE constraint on `(trip_id, user_id)`.

### `budget_contributions`
| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | |
| `trip_id` | TEXT FK | References trip_budgets |
| `user_id` | TEXT FK | References users |
| `amount` | REAL | Contribution amount |
| `note` | TEXT | Optional note |
| `date` | TEXT | Date of contribution |
| `created` | TEXT | Auto timestamp |

### `trip_acknowledged`
| Column | Type | Notes |
|---|---|---|
| `trip_id` | TEXT | Composite PK |
| `user_id` | TEXT | Composite PK |
| `acknowledged` | TEXT | Timestamp |

### Modified tables:

- **`transactions`** — Added `user_id` column (TEXT, default '') to track which user made each expense

### Existing tables (unchanged):
`activities`, `venues`, `dining_memories`, `favorite_rides`, `wishlist`, `trip_budgets`, `trip_members`, `photos`, `budget` (legacy), `parkdays`, `users`, `sessions`, `pending_venues`

---

## 8. Frontend JavaScript Modules

### Trip Splash System — NEW

- **`checkTripSplash()`** — Runs at end of `initApp()`. Checks `/api/my/unacknowledged-trips`. Skips admins.
- **`showTripSplash(trip)`** — Full-screen animated modal: castle emoji, sparkles, "You're going to Disney World!", countdown, three buttons: View Trip (→ calendar), Set My Budget (→ wizard), Skip.

### Budget Confirmation System — NEW

- **`checkBudgetConfirmation()`** — Runs after splash check. Finds active trips with unconfirmed personal budgets (`confirmed = 0`).
- **`showBudgetConfirmation(trip, myBudget)`** — Modal showing saved amount vs goal. Three options: confirm (locks budget), edit (opens wizard), remind later.

### Reusable Venue Autocomplete — NEW

- **`attachVenueAutocomplete(inputEl, options)`** — Shared helper in `script.js`. Attaches typeahead to any text input. Options: `filterType` (boosts matching venue types), `onSelect(venue)` callback for auto-filling related fields. Used by planner wizard (all 4 entry steps) and itinerary add activity form.

### Dashboard Trip State Routing — NEW

- **`initializeDashboardPage()`** now checks the user's trip state before rendering
- Active trip → normal dashboard
- Upcoming trip → redirect to `pretrip.html`
- No future trips → `renderMemoriesDashboard()` showing past trip cards with photo counts

### Trip System (Unified)

All pages now use `buildTripsFromBudgets()` as the single source of truth for trip boundaries. `splitIntoTrips()` is deprecated (still defined in script.js but no longer called anywhere).

Pages unified: history.html, pretrip.html, dashboard.js, itinerary.js, budget.js — all use `trip_budgets` as primary data source.

---

## 9. Design Language & Styling

(Unchanged, with one addition:)

**Park Day Banner responsive positioning:** Per-park logo positioning uses desktop-only overrides via `@media (min-width: 601px)` to give Magic Kingdom, Hollywood Studios, and Animal Kingdom logos more breathing room below the budget pill on wide screens. Mobile uses tighter positioning. EPCOT uses default values at all sizes.

---

## 10. Authentication & User Roles

(Unchanged)

---

## 11. Deployment & Operations

(Unchanged, with note:)

**server.js changes require Docker rebuild:** `docker compose up -d --build disney-api`

**Frontend JS changes:** Copy files to `site-content/assets/js/` — no rebuild needed, just Cloudflare cache purge.

---

## 12. Data Seeding

(Unchanged)

---

## 13. Known Gaps & Backlog

| Area | Status | What's Needed |
|---|---|---|
| **Legacy budget cleanup** | Both exist | Deprecate `/api/budget` routes and singleton `budget` table |
| **splitIntoTrips deprecation** | Unused but defined | Remove from script.js once confirmed no consumers |
| **Nav duplication** | All pages duplicate nav HTML | Extract into shared include or web component |
| **Cache-bust versioning** | Manual `?v=N` bumps (currently `v=15`) | Automate in deploy script |
| **Photo access control** | All users see all trips | Restrict to trip members |
| **Wishlist base64 migration** | Old items use base64 | Migration script to extract to files |
| **Trip member avatars** | Members assigned but not shown visually | Show avatars on trip bubbles/headers |
| **Pre-trip < 7 days mode** | Planned | Different pre-trip dashboard for final week before trip |
| **Shared expense splitting** | Personal budgets only | Allow "I paid for everyone's dinner" later |

---

## 14. Working with Claude on This Project

**Always share the current files** when starting a new conversation. The split JS architecture means multiple files may be relevant:
- `script.js` + `server.js` — always needed
- `dashboard.js`, `budget.js`, `header.js` — for budget/dashboard work
- `itinerary.js`, `planner.js` — for trip planning features
- `header.css` — for park banner/positioning work

**Frontend is vanilla JS** — no React, no build step. JS is split into 8+ focused modules loaded per-page.

**Trip boundaries** — Determined by the planner wizard, stored in `trip_budgets` table. `buildTripsFromBudgets()` is the single source of truth everywhere.

**Budget system** — Per-user personal budgets. Each user sets their own budget per trip. Lifecycle: set goal → save contributions → confirm at trip start → track spending. The trip-level `trip_budgets` row stores trip dates/labels but budget amounts are now in `user_budgets`.

**Key changes in the March 16, 2026 session:**
- Split monolithic `script.js` (4710 lines) into 8 focused JS modules with per-page script tags
- Built personal per-user budget system replacing shared budget pool: `user_budgets` table, `budget_contributions` table, `confirmed` flag for saving→spending mode transition
- New API endpoints: `/trips/:tripId/my-budget` (GET/PUT), `/trips/:tripId/budgets` (group view), `/trips/:tripId/confirm-budget`, `/my/unacknowledged-trips`, `/trips/:tripId/acknowledge`, `/trips/:tripId/contributions` (GET/POST), `/contributions/:id` (DELETE)
- "You're going to Disney World!" splash screen for newly assigned users with animated full-screen modal
- Auto-acknowledge for admins and self-assignment
- Budget confirmation auto-prompt at trip start ("You've saved $X — lock it in?")
- Trip calendar page (`tripcalendar.html`) — week grid with park banners, dining/shows/travel events, ride counts, today highlighting
- Dashboard trip-state routing: active → normal dashboard, upcoming → pretrip redirect, past-only → memories view with photo links
- Unified all pages on `buildTripsFromBudgets()` as single source of truth (history.html, pretrip.html, dashboard.js)
- Deprecated `splitIntoTrips()` — no longer called anywhere
- Venue autocomplete in planner wizard on all 4 entry steps (resort, dining, lightning lane, extras)
- Reusable `attachVenueAutocomplete()` shared helper in script.js
- Fixed park day banner positioning: per-park desktop overrides via `@media (min-width: 601px)` for Magic Kingdom, Hollywood Studios, and Animal Kingdom logos
- Transactions now track `user_id` from auth token
- Cancel trip cascade now also deletes `user_budgets`, `budget_contributions`, `trip_acknowledged`
- Budget pill shows personal remaining balance (falls back to trip-level if no personal budget)
- Cache bust version bumped to `v=15`

---

*Documentation last updated: March 16, 2026 (evening session)*