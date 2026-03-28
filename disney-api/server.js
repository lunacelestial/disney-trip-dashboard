// ============================================================
// Disney Trip Dashboard — API Server
// A lightweight Express + SQLite backend that serves shared
// data for Activities, Wishlist, and Budget.
//
// Run:  node server.js
// Port: 3001 (Nginx will proxy /api/* to this)
// ============================================================

const express = require("express");
const Database = require("better-sqlite3");
const path = require("path");
const cors = require("cors");
const multer = require("multer");
const { scoreRides } = require("./ride-scorer");

const app = express();
const PORT = 3001;
// Ollama runs on motherbrain (NAS). Overrideable via env var for prod/dev parity.
const OLLAMA_URL   = process.env.OLLAMA_URL   || "http://192.168.200.100:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "qwen2.5:14b";

// ── Storage Setup ─────────────────────────────────────────
// In Docker, /storage is a bind mount to motherbrain's NAS.
// Outside Docker, fall back to a local ./storage folder.
const fs = require("fs");
const STORAGE_ROOT = fs.existsSync("/storage") ? "/storage" : path.join(__dirname, "storage");
const PHOTOS_DIR = path.join(STORAGE_ROOT, "photos");
const WISHLIST_DIR = path.join(STORAGE_ROOT, "wishlist");
const VENUES_DIR = path.join(STORAGE_ROOT, "venues");
const AVATARS_DIR = path.join(STORAGE_ROOT, "avatars");

// Ensure directories exist
fs.mkdirSync(PHOTOS_DIR, { recursive: true });
fs.mkdirSync(WISHLIST_DIR, { recursive: true });
fs.mkdirSync(VENUES_DIR, { recursive: true });
fs.mkdirSync(AVATARS_DIR, { recursive: true });

// ── Middleware ──────────────────────────────────────────────
app.use(cors());
app.use(express.json({ limit: "5mb" }));

// ── Database Setup ─────────────────────────────────────────
// In Docker, /data is a mounted volume so the DB survives container restarts.
// Outside Docker, it falls back to the current directory.
const DATA_DIR = fs.existsSync("/data") ? "/data" : __dirname;
const DB_PATH = path.join(DATA_DIR, "disney.db");
const db = new Database(DB_PATH);

// Enable WAL mode for better concurrent read performance
db.pragma("journal_mode = WAL");

// Create tables if they don't exist
db.exec(`
  CREATE TABLE IF NOT EXISTS activities (
    id        TEXT PRIMARY KEY,
    date      TEXT NOT NULL,
    time      TEXT NOT NULL,
    type      TEXT NOT NULL DEFAULT 'Ride',
    title     TEXT NOT NULL,
    location  TEXT NOT NULL,
    notes     TEXT DEFAULT '',
    image     TEXT DEFAULT '',
    url       TEXT DEFAULT '',
    created   TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS wishlist (
    id        TEXT PRIMARY KEY,
    category  TEXT NOT NULL,
    title     TEXT NOT NULL,
    created   TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS budget (
    id        INTEGER PRIMARY KEY CHECK (id = 1),
    total     REAL NOT NULL DEFAULT 0,
    updated   TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS transactions (
    id          TEXT PRIMARY KEY,
    description TEXT NOT NULL,
    amount      REAL NOT NULL,
    category    TEXT DEFAULT 'Other',
    date        TEXT DEFAULT '',
    created     TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS parkdays (
    date      TEXT PRIMARY KEY,
    park      TEXT NOT NULL,
    created   TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS venues (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    location    TEXT DEFAULT '',
    url         TEXT DEFAULT '',
    type        TEXT DEFAULT '',
    use_count   INTEGER DEFAULT 1,
    park        TEXT DEFAULT '',
    land        TEXT DEFAULT '',
    description TEXT DEFAULT '',
    avg_wait    INTEGER DEFAULT 0,
    image_url   TEXT DEFAULT '',
    tags        TEXT DEFAULT '',
    created     TEXT DEFAULT (datetime('now')),
    updated     TEXT DEFAULT (datetime('now'))
  );

  -- Migrate: add new columns to existing venues tables
  -- SQLite ignores ALTER TABLE if column already exists (wrapped in try/catch on JS side)

  CREATE TABLE IF NOT EXISTS users (
    id        TEXT PRIMARY KEY,
    email     TEXT UNIQUE NOT NULL,
    name      TEXT NOT NULL,
    role      TEXT DEFAULT 'member',
    created   TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token     TEXT PRIMARY KEY,
    user_id   TEXT NOT NULL,
    created   TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS pending_venues (
    id            TEXT PRIMARY KEY,
    venue_name    TEXT NOT NULL,
    venue_location TEXT DEFAULT '',
    venue_url     TEXT DEFAULT '',
    venue_type    TEXT DEFAULT '',
    change_type   TEXT DEFAULT 'new',
    existing_venue_id TEXT DEFAULT '',
    submitted_by  TEXT DEFAULT '',
    status        TEXT DEFAULT 'pending',
    created       TEXT DEFAULT (datetime('now'))
  );

  -- Ensure budget row exists
  INSERT OR IGNORE INTO budget (id, total) VALUES (1, 0);
`);

// Migrate: add new venue columns (safe to run multiple times)
const venueColumns = ["park", "land", "description", "avg_wait", "image_url", "tags"];
for (const col of venueColumns) {
  try {
    const type = col === "avg_wait" ? "INTEGER DEFAULT 0" : "TEXT DEFAULT ''";
    db.exec(`ALTER TABLE venues ADD COLUMN ${col} ${type}`);
    console.log(`[DB] Added column venues.${col}`);
  } catch (e) {
    // Column already exists — ignore
  }
}
db.exec(`
  CREATE TABLE IF NOT EXISTS trip_budgets (
    trip_id     TEXT PRIMARY KEY,
    label       TEXT NOT NULL,
    start_date  TEXT NOT NULL,
    end_date    TEXT NOT NULL,
    hotel       REAL NOT NULL DEFAULT 0,
    food        REAL NOT NULL DEFAULT 0,
    extras      REAL NOT NULL DEFAULT 0,
    souvenirs   REAL NOT NULL DEFAULT 0,
    created     TEXT DEFAULT (datetime('now')),
    updated     TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS trip_members (
    trip_id   TEXT NOT NULL,
    user_id   TEXT NOT NULL,
    added     TEXT DEFAULT (datetime('now')),
    PRIMARY KEY (trip_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS photos (
    id          TEXT PRIMARY KEY,
    trip_id     TEXT NOT NULL,
    filename    TEXT NOT NULL,
    caption     TEXT DEFAULT '',
    uploaded_by TEXT DEFAULT '',
    uploaded_by_name TEXT DEFAULT '',
    created     TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS dining_memories (
    id          TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL,
    venue_name  TEXT NOT NULL,
    items       TEXT DEFAULT '[]',
    rating      INTEGER DEFAULT 0,
    notes       TEXT DEFAULT '',
    visit_date  TEXT DEFAULT '',
    created     TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS favorite_rides (
    id          TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL,
    park        TEXT NOT NULL,
    ride_name   TEXT NOT NULL,
    rating      INTEGER DEFAULT 5,
    notes       TEXT DEFAULT '',
    created     TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS user_budgets (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    trip_id     TEXT NOT NULL,
    user_id     TEXT NOT NULL,
    hotel       REAL NOT NULL DEFAULT 0,
    food        REAL NOT NULL DEFAULT 0,
    extras      REAL NOT NULL DEFAULT 0,
    souvenirs   REAL NOT NULL DEFAULT 0,
    confirmed   INTEGER NOT NULL DEFAULT 0,
    created     TEXT DEFAULT (datetime('now')),
    updated     TEXT DEFAULT (datetime('now')),
    UNIQUE(trip_id, user_id),
    FOREIGN KEY (trip_id) REFERENCES trip_budgets(trip_id),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS budget_contributions (
    id              TEXT PRIMARY KEY,
    trip_id         TEXT NOT NULL,
    user_id         TEXT NOT NULL,
    amount          REAL NOT NULL,
    note            TEXT DEFAULT '',
    date            TEXT DEFAULT '',
    created         TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (trip_id) REFERENCES trip_budgets(trip_id),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS packing_items (
    id          TEXT PRIMARY KEY,
    trip_id     TEXT NOT NULL,
    user_id     TEXT NOT NULL,
    label       TEXT NOT NULL,
    checked     INTEGER NOT NULL DEFAULT 0,
    category    TEXT DEFAULT 'General',
    created     TEXT DEFAULT (datetime('now')),
    updated     TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (trip_id) REFERENCES trip_budgets(trip_id),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS trip_acknowledged (
    trip_id     TEXT NOT NULL,
    user_id     TEXT NOT NULL,
    acknowledged TEXT DEFAULT (datetime('now')),
    PRIMARY KEY (trip_id, user_id),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS user_ride_profiles (
    user_id           TEXT PRIMARY KEY,
    drops             INTEGER DEFAULT 3,
    has_young_kids    INTEGER DEFAULT 0,
    prefer_indoor     INTEGER DEFAULT 0,
    ride_or_show      TEXT    DEFAULT 'both',
    updated           TEXT    DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS attraction_metadata (
    attraction_name   TEXT PRIMARY KEY,
    park_id           TEXT NOT NULL,
    height_req        INTEGER,
    intensity         TEXT NOT NULL DEFAULT 'moderate',
    indoor            INTEGER NOT NULL DEFAULT 1,
    type              TEXT NOT NULL DEFAULT 'family',
    lightning_lane    TEXT NOT NULL DEFAULT 'none',
    accessibility     TEXT DEFAULT '',
    description       TEXT DEFAULT '',
    updated           TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS recommendation_cache (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    park_id          TEXT NOT NULL,
    attraction_name  TEXT NOT NULL,
    quips            TEXT NOT NULL DEFAULT '[]',
    context_blob     TEXT DEFAULT '',
    generated_at     TEXT DEFAULT (datetime('now')),
    UNIQUE(park_id, attraction_name)
  );
`);

// ── Budget Groups tables ───────────────────────────────────
// Each group is one shared budget pool for a trip.
// Members of the same group see and update the same budget row.
db.exec(`
  CREATE TABLE IF NOT EXISTS budget_groups (
    id        TEXT PRIMARY KEY,
    trip_id   TEXT NOT NULL,
    label     TEXT NOT NULL DEFAULT '',
    created   TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (trip_id) REFERENCES trip_budgets(trip_id)
  );

  CREATE TABLE IF NOT EXISTS budget_group_members (
    group_id  TEXT NOT NULL,
    user_id   TEXT NOT NULL,
    PRIMARY KEY (group_id, user_id),
    FOREIGN KEY (group_id) REFERENCES budget_groups(id),
    FOREIGN KEY (user_id)  REFERENCES users(id)
  );
`);

// Migrations
try { db.exec("ALTER TABLE activities ADD COLUMN url TEXT DEFAULT ''"); } catch (e) { }
try { db.exec("ALTER TABLE transactions ADD COLUMN trip_id TEXT DEFAULT ''"); } catch (e) { }
try { db.exec("ALTER TABLE transactions ADD COLUMN user_id TEXT DEFAULT ''"); } catch (e) { }
try { db.exec("ALTER TABLE user_budgets ADD COLUMN confirmed INTEGER NOT NULL DEFAULT 0"); } catch (e) { }
try { db.exec("ALTER TABLE user_budgets ADD COLUMN budget_group_id TEXT DEFAULT NULL"); } catch (e) { }
// Wishlist migrations — add new fields for rich wish cards
try { db.exec("ALTER TABLE wishlist ADD COLUMN description TEXT DEFAULT ''"); } catch (e) { }
try { db.exec("ALTER TABLE wishlist ADD COLUMN url TEXT DEFAULT ''"); } catch (e) { }
try { db.exec("ALTER TABLE wishlist ADD COLUMN image TEXT DEFAULT ''"); } catch (e) { }
try { db.exec("ALTER TABLE wishlist ADD COLUMN added_by TEXT DEFAULT ''"); } catch (e) { }
try { db.exec("ALTER TABLE wishlist ADD COLUMN added_by_name TEXT DEFAULT ''"); } catch (e) { }

// Avatar column on users table
try { db.exec("ALTER TABLE users ADD COLUMN avatar TEXT DEFAULT ''"); } catch (e) { }

// ── Flights table ──
db.exec(`
  CREATE TABLE IF NOT EXISTS flights (
    id                TEXT PRIMARY KEY,
    trip_id           TEXT NOT NULL,
    user_id           TEXT NOT NULL,
    direction         TEXT NOT NULL DEFAULT 'outbound',
    airline           TEXT DEFAULT '',
    flight_number     TEXT DEFAULT '',
    confirmation      TEXT DEFAULT '',
    departure_airport TEXT DEFAULT '',
    arrival_airport   TEXT DEFAULT '',
    departure_time    TEXT DEFAULT '',
    arrival_time      TEXT DEFAULT '',
    seat              TEXT DEFAULT '',
    notes             TEXT DEFAULT '',
    created           TEXT DEFAULT (datetime('now')),
    updated           TEXT DEFAULT (datetime('now'))
  );
`);

// ── User Profile, Favorite Restaurants, Favorite Resorts tables ──
db.exec(`
  CREATE TABLE IF NOT EXISTS user_profiles (
    user_id        TEXT PRIMARY KEY,
    birthdate      TEXT DEFAULT '',
    memberships    TEXT DEFAULT '',
    timeshare_name TEXT DEFAULT '',
    -- Party composition
    party_adults   INTEGER DEFAULT 1,
    party_children INTEGER DEFAULT 0,
    party_toddlers INTEGER DEFAULT 0,
    children_ages  TEXT DEFAULT '[]',
    -- Accessibility
    accessibility  TEXT DEFAULT '',
    -- Dining preferences
    dietary        TEXT DEFAULT '',
    dining_style   TEXT DEFAULT '',
    -- Ride preferences
    thrill_level   TEXT DEFAULT '',
    ride_avoid     TEXT DEFAULT '',
    -- Passes & memberships
    ap_type        TEXT DEFAULT 'none',
    dvc_home       TEXT DEFAULT '',
    budget_tier    TEXT DEFAULT '',
    -- Travel profile
    home_airport   TEXT DEFAULT '',
    trip_length    TEXT DEFAULT '',
    hotel_tier     TEXT DEFAULT '',
    pace_style     TEXT DEFAULT '',
    updated        TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS favorite_restaurants (
    id              TEXT PRIMARY KEY,
    user_id         TEXT NOT NULL,
    restaurant_name TEXT NOT NULL,
    park            TEXT DEFAULT '',
    notes           TEXT DEFAULT '',
    created         TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS favorite_resorts (
    id          TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL,
    resort_name TEXT NOT NULL,
    resort_type TEXT DEFAULT 'disney',
    notes       TEXT DEFAULT '',
    created     TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );
`);

// ── Migrations for user_profiles new columns ─────────────
// Must run BEFORE prepared statements are compiled.
const profileCols = [
  ["party_adults",   "INTEGER DEFAULT 1"],
  ["party_children", "INTEGER DEFAULT 0"],
  ["party_toddlers", "INTEGER DEFAULT 0"],
  ["children_ages",  "TEXT DEFAULT '[]'"],
  ["accessibility",  "TEXT DEFAULT ''"],
  ["dietary",        "TEXT DEFAULT ''"],
  ["dining_style",   "TEXT DEFAULT ''"],
  ["thrill_level",   "TEXT DEFAULT ''"],
  ["ride_avoid",     "TEXT DEFAULT ''"],
  ["ap_type",        "TEXT DEFAULT 'none'"],
  ["dvc_home",       "TEXT DEFAULT ''"],
  ["budget_tier",    "TEXT DEFAULT ''"],
  ["home_airport",   "TEXT DEFAULT ''"],
  ["trip_length",    "TEXT DEFAULT ''"],
  ["hotel_tier",     "TEXT DEFAULT ''"],
  ["pace_style",     "TEXT DEFAULT ''"],
];
for (const [col, type] of profileCols) {
  try { db.exec(`ALTER TABLE user_profiles ADD COLUMN ${col} ${type}`); } catch (e) { /* already exists */ }
}

// ── Migrations for user_ride_profiles ────────────────────────
const rideProfileCols = [
  ["drops",          "INTEGER DEFAULT 3"],
  ["has_young_kids", "INTEGER DEFAULT 0"],
  ["prefer_indoor",  "INTEGER DEFAULT 0"],
  ["ride_or_show",   "TEXT DEFAULT 'both'"],
];
for (const [col, type] of rideProfileCols) {
  try { db.exec(`ALTER TABLE user_ride_profiles ADD COLUMN ${col} ${type}`); } catch (e) { /* already exists */ }
}

// ── Seed default admin user if no users exist ──────────────
const userCount = db.prepare("SELECT COUNT(*) as cnt FROM users").get();
if (userCount.cnt === 0) {
  console.log("📋 No users found — seeding default admin. Edit the users table to add your family!");
  db.prepare(`INSERT INTO users (id, email, name, role) VALUES (?, ?, ?, ?)`).run(
    "user-admin-001", "admin@disney.local", "Admin", "admin"
  );
}

// ── Helper: extract user from auth token ──────────────────
function getUserFromToken(req) {
  const token = (req.headers.authorization || "").replace("Bearer ", "");
  if (!token) return null;
  return db.prepare(`
    SELECT u.id, u.email, u.name, u.role FROM sessions s
    JOIN users u ON s.user_id = u.id WHERE s.token = ?
  `).get(token) || null;
}

// ── Prepared Statements (faster than inline queries) ───────
const stmts = {
  // Activities
  getAllActivities: db.prepare("SELECT * FROM activities ORDER BY date, time"),
  getActivity:     db.prepare("SELECT * FROM activities WHERE id = ?"),
  insertActivity:  db.prepare(`
    INSERT INTO activities (id, date, time, type, title, location, notes, image, url)
    VALUES (@id, @date, @time, @type, @title, @location, @notes, @image, @url)
  `),
  updateActivity:  db.prepare(`
    UPDATE activities
    SET date = @date, time = @time, type = @type, title = @title,
        location = @location, notes = @notes, image = @image, url = @url
    WHERE id = @id
  `),
  deleteActivity:  db.prepare("DELETE FROM activities WHERE id = ?"),
  clearActivities: db.prepare("DELETE FROM activities"),

  // Wishlist
  getAllWishlist:  db.prepare("SELECT * FROM wishlist ORDER BY created DESC"),
  insertWishlist: db.prepare(`
    INSERT INTO wishlist (id, category, title, description, url, image, added_by, added_by_name)
    VALUES (@id, @category, @title, @description, @url, @image, @added_by, @added_by_name)
  `),
  deleteWishlist: db.prepare("DELETE FROM wishlist WHERE id = ?"),

  // Budget (legacy single-row — kept for backwards compat)
  getBudget:         db.prepare("SELECT total FROM budget WHERE id = 1"),
  setBudgetTotal:    db.prepare("UPDATE budget SET total = ?, updated = datetime('now') WHERE id = 1"),
  getAllTransactions: db.prepare("SELECT * FROM transactions ORDER BY created DESC"),
  getTransactionsByTrip: db.prepare("SELECT * FROM transactions WHERE trip_id = ? ORDER BY created DESC"),
  insertTransaction: db.prepare(`
    INSERT INTO transactions (id, description, amount, category, date, trip_id, user_id)
    VALUES (@id, @description, @amount, @category, @date, @trip_id, @user_id)
  `),
  deleteTransaction: db.prepare("DELETE FROM transactions WHERE id = ?"),

  // Per-trip budgets
  getAllTripBudgets:  db.prepare("SELECT * FROM trip_budgets ORDER BY start_date DESC"),
  getTripBudget:     db.prepare("SELECT * FROM trip_budgets WHERE trip_id = ?"),
  upsertTripBudget:  db.prepare(`
    INSERT INTO trip_budgets (trip_id, label, start_date, end_date, hotel, food, extras, souvenirs, updated)
    VALUES (@trip_id, @label, @start_date, @end_date, @hotel, @food, @extras, @souvenirs, datetime('now'))
    ON CONFLICT(trip_id) DO UPDATE SET
      label=excluded.label, hotel=excluded.hotel, food=excluded.food,
      extras=excluded.extras, souvenirs=excluded.souvenirs, updated=datetime('now')
  `),
  deleteTripBudget:  db.prepare("DELETE FROM trip_budgets WHERE trip_id = ?"),

  // Park Days
  getAllParkDays:   db.prepare("SELECT * FROM parkdays ORDER BY date"),
  getParkDay:       db.prepare("SELECT * FROM parkdays WHERE date = ?"),
  upsertParkDay:    db.prepare("INSERT OR REPLACE INTO parkdays (date, park) VALUES (@date, @park)"),
  deleteParkDay:    db.prepare("DELETE FROM parkdays WHERE date = ?"),
  clearParkDays:    db.prepare("DELETE FROM parkdays"),

  // Venues
  getAllVenues:     db.prepare("SELECT * FROM venues ORDER BY use_count DESC, name"),
  searchVenues:     db.prepare("SELECT * FROM venues WHERE name LIKE ? ORDER BY use_count DESC LIMIT 10"),
  getVenueByName:   db.prepare("SELECT * FROM venues WHERE LOWER(name) = LOWER(?)"),
  insertVenue:      db.prepare(`
    INSERT INTO venues (id, name, location, url, type, use_count)
    VALUES (@id, @name, @location, @url, @type, 1)
  `),
  updateVenue:      db.prepare(`
    UPDATE venues SET location = @location, url = @url, type = @type,
    use_count = use_count + 1, updated = datetime('now')
    WHERE id = @id
  `),
  deleteVenue:      db.prepare("DELETE FROM venues WHERE id = ?"),

  // Trip Members
  getTripMembers:   db.prepare(`
    SELECT tm.trip_id, tm.user_id, u.name, u.email, tm.added
    FROM trip_members tm JOIN users u ON tm.user_id = u.id
    WHERE tm.trip_id = ? ORDER BY tm.added
  `),
  addTripMember:    db.prepare("INSERT OR IGNORE INTO trip_members (trip_id, user_id) VALUES (?, ?)"),
  removeTripMember: db.prepare("DELETE FROM trip_members WHERE trip_id = ? AND user_id = ?"),
  getUserTrips:     db.prepare(`
    SELECT tb.* FROM trip_members tm
    JOIN trip_budgets tb ON tm.trip_id = tb.trip_id
    WHERE tm.user_id = ? ORDER BY tb.start_date DESC
  `),

  // Photos
  getPhotosByTrip:  db.prepare("SELECT * FROM photos WHERE trip_id = ? ORDER BY created DESC"),
  getPhoto:         db.prepare("SELECT * FROM photos WHERE id = ?"),
  insertPhoto:      db.prepare(`
    INSERT INTO photos (id, trip_id, filename, caption, uploaded_by, uploaded_by_name)
    VALUES (@id, @trip_id, @filename, @caption, @uploaded_by, @uploaded_by_name)
  `),
  deletePhoto:      db.prepare("DELETE FROM photos WHERE id = ?"),

  // Dining Memories
  getDiningMemories:      db.prepare("SELECT * FROM dining_memories WHERE user_id = ? AND LOWER(venue_name) = LOWER(?) ORDER BY created DESC"),
  getAllDiningMemories:    db.prepare("SELECT * FROM dining_memories WHERE user_id = ? ORDER BY created DESC"),
  insertDiningMemory:     db.prepare(`
    INSERT INTO dining_memories (id, user_id, venue_name, items, rating, notes, visit_date)
    VALUES (@id, @user_id, @venue_name, @items, @rating, @notes, @visit_date)
  `),
  deleteDiningMemory:     db.prepare("DELETE FROM dining_memories WHERE id = ?"),

  // Favorite Rides
  getFavoriteRides:       db.prepare("SELECT * FROM favorite_rides WHERE user_id = ? ORDER BY park, rating DESC"),
  insertFavoriteRide:     db.prepare(`
    INSERT INTO favorite_rides (id, user_id, park, ride_name, rating, notes)
    VALUES (@id, @user_id, @park, @ride_name, @rating, @notes)
  `),
  deleteFavoriteRide:     db.prepare("DELETE FROM favorite_rides WHERE id = ?"),

  // User Budgets (per-user, per-trip)
  getUserBudget:          db.prepare("SELECT * FROM user_budgets WHERE trip_id = ? AND user_id = ?"),
  getUserBudgetsByTrip:   db.prepare(`
    SELECT ub.*, u.name as user_name, u.email as user_email
    FROM user_budgets ub JOIN users u ON ub.user_id = u.id
    WHERE ub.trip_id = ? ORDER BY u.name
  `),
  upsertUserBudget:       db.prepare(`
    INSERT INTO user_budgets (trip_id, user_id, hotel, food, extras, souvenirs, updated)
    VALUES (@trip_id, @user_id, @hotel, @food, @extras, @souvenirs, datetime('now'))
    ON CONFLICT(trip_id, user_id) DO UPDATE SET
      hotel=excluded.hotel, food=excluded.food,
      extras=excluded.extras, souvenirs=excluded.souvenirs, updated=datetime('now')
  `),
  deleteUserBudget:       db.prepare("DELETE FROM user_budgets WHERE trip_id = ? AND user_id = ?"),
  deleteUserBudgetsByTrip: db.prepare("DELETE FROM user_budgets WHERE trip_id = ?"),

  // Transaction queries filtered by user
  getTransactionsByTripAndUser: db.prepare("SELECT * FROM transactions WHERE trip_id = ? AND user_id = ? ORDER BY created DESC"),

  // Trip Acknowledgment
  getTripAcknowledged:    db.prepare("SELECT * FROM trip_acknowledged WHERE trip_id = ? AND user_id = ?"),
  getUnacknowledgedTrips: db.prepare(`
    SELECT tb.* FROM trip_members tm
    JOIN trip_budgets tb ON tm.trip_id = tb.trip_id
    LEFT JOIN trip_acknowledged ta ON ta.trip_id = tm.trip_id AND ta.user_id = tm.user_id
    WHERE tm.user_id = ? AND ta.trip_id IS NULL
    ORDER BY tb.start_date
  `),
  acknowledgTrip:         db.prepare("INSERT OR IGNORE INTO trip_acknowledged (trip_id, user_id) VALUES (?, ?)"),

  // Budget Contributions (pre-trip savings)
  getContributionsByTripAndUser: db.prepare("SELECT * FROM budget_contributions WHERE trip_id = ? AND user_id = ? ORDER BY created DESC"),
  getContributionsByTrip:        db.prepare("SELECT * FROM budget_contributions WHERE trip_id = ? ORDER BY created DESC"),
  insertContribution:            db.prepare(`
    INSERT INTO budget_contributions (id, trip_id, user_id, amount, note, date)
    VALUES (@id, @trip_id, @user_id, @amount, @note, @date)
  `),
  deleteContribution:            db.prepare("DELETE FROM budget_contributions WHERE id = ?"),
  deleteContributionsByTrip:     db.prepare("DELETE FROM budget_contributions WHERE trip_id = ?"),

  // Confirm user budget (flip from saving mode to spending mode)
  confirmUserBudget:             db.prepare("UPDATE user_budgets SET confirmed = 1, updated = datetime('now') WHERE trip_id = ? AND user_id = ?"),

  // Packing List
  getPackingItems:      db.prepare("SELECT * FROM packing_items WHERE trip_id = ? AND user_id = ? ORDER BY category, created"),
  insertPackingItem:    db.prepare(`
    INSERT INTO packing_items (id, trip_id, user_id, label, checked, category)
    VALUES (@id, @trip_id, @user_id, @label, 0, @category)
  `),
  updatePackingChecked: db.prepare("UPDATE packing_items SET checked = @checked, updated = datetime('now') WHERE id = @id AND user_id = @user_id"),
  deletePackingItem:    db.prepare("DELETE FROM packing_items WHERE id = ? AND user_id = ?"),
  clearPackingItems:    db.prepare("DELETE FROM packing_items WHERE trip_id = ? AND user_id = ?"),

  // Budget Groups
  getBudgetGroupsByTrip:         db.prepare("SELECT * FROM budget_groups WHERE trip_id = ? ORDER BY created"),
  getBudgetGroup:                db.prepare("SELECT * FROM budget_groups WHERE id = ?"),
  upsertBudgetGroup:             db.prepare(`
    INSERT INTO budget_groups (id, trip_id, label)
    VALUES (@id, @trip_id, @label)
    ON CONFLICT(id) DO UPDATE SET label = excluded.label
  `),
  deleteBudgetGroupsByTrip:      db.prepare("DELETE FROM budget_groups WHERE trip_id = ?"),
  getBudgetGroupMembers:         db.prepare("SELECT * FROM budget_group_members WHERE group_id = ?"),
  getBudgetGroupForUser:         db.prepare(`
    SELECT bg.* FROM budget_group_members bgm
    JOIN budget_groups bg ON bgm.group_id = bg.id
    WHERE bg.trip_id = ? AND bgm.user_id = ?
    LIMIT 1
  `),
  addBudgetGroupMember:          db.prepare("INSERT OR IGNORE INTO budget_group_members (group_id, user_id) VALUES (?, ?)"),
  clearBudgetGroupMembers:       db.prepare("DELETE FROM budget_group_members WHERE group_id = ?"),
  clearBudgetGroupMembersByTrip: db.prepare(`
    DELETE FROM budget_group_members WHERE group_id IN (
      SELECT id FROM budget_groups WHERE trip_id = ?
    )
  `),
  // Fetch the shared budget row by group_id (all group members read the same row)
  getUserBudgetByGroup:          db.prepare("SELECT * FROM user_budgets WHERE trip_id = ? AND budget_group_id = ? LIMIT 1"),

  // User Profiles
  getUserProfile:    db.prepare("SELECT * FROM user_profiles WHERE user_id = ?"),
  upsertUserProfile: db.prepare(`
    INSERT INTO user_profiles (
      user_id, birthdate, memberships, timeshare_name,
      party_adults, party_children, party_toddlers, children_ages,
      accessibility, dietary, dining_style,
      thrill_level, ride_avoid,
      ap_type, dvc_home, budget_tier,
      home_airport, trip_length, hotel_tier, pace_style,
      updated
    ) VALUES (
      @user_id, @birthdate, @memberships, @timeshare_name,
      @party_adults, @party_children, @party_toddlers, @children_ages,
      @accessibility, @dietary, @dining_style,
      @thrill_level, @ride_avoid,
      @ap_type, @dvc_home, @budget_tier,
      @home_airport, @trip_length, @hotel_tier, @pace_style,
      datetime('now')
    )
    ON CONFLICT(user_id) DO UPDATE SET
      birthdate=excluded.birthdate,
      memberships=excluded.memberships,
      timeshare_name=excluded.timeshare_name,
      party_adults=excluded.party_adults,
      party_children=excluded.party_children,
      party_toddlers=excluded.party_toddlers,
      children_ages=excluded.children_ages,
      accessibility=excluded.accessibility,
      dietary=excluded.dietary,
      dining_style=excluded.dining_style,
      thrill_level=excluded.thrill_level,
      ride_avoid=excluded.ride_avoid,
      ap_type=excluded.ap_type,
      dvc_home=excluded.dvc_home,
      budget_tier=excluded.budget_tier,
      home_airport=excluded.home_airport,
      trip_length=excluded.trip_length,
      hotel_tier=excluded.hotel_tier,
      pace_style=excluded.pace_style,
      updated=datetime('now')
  `),

  // Favorite Restaurants
  getFavoriteRestaurants:    db.prepare("SELECT * FROM favorite_restaurants WHERE user_id = ? ORDER BY created DESC"),
  insertFavoriteRestaurant:  db.prepare(`
    INSERT INTO favorite_restaurants (id, user_id, restaurant_name, park, notes)
    VALUES (@id, @user_id, @restaurant_name, @park, @notes)
  `),
  deleteFavoriteRestaurant:  db.prepare("DELETE FROM favorite_restaurants WHERE id = ?"),

  // Favorite Resorts
  getFavoriteResorts:    db.prepare("SELECT * FROM favorite_resorts WHERE user_id = ? ORDER BY resort_type, created DESC"),
  insertFavoriteResort:  db.prepare(`
    INSERT INTO favorite_resorts (id, user_id, resort_name, resort_type, notes)
    VALUES (@id, @user_id, @resort_name, @resort_type, @notes)
  `),
  deleteFavoriteResort:  db.prepare("DELETE FROM favorite_resorts WHERE id = ?"),

  // Ride Profiles
  getRideProfile:    db.prepare("SELECT * FROM user_ride_profiles WHERE user_id = ?"),
  upsertRideProfile: db.prepare(`
    INSERT INTO user_ride_profiles (user_id, drops, has_young_kids, prefer_indoor, ride_or_show, updated)
    VALUES (@user_id, @drops, @has_young_kids, @prefer_indoor, @ride_or_show, datetime('now'))
    ON CONFLICT(user_id) DO UPDATE SET
      drops          = excluded.drops,
      has_young_kids = excluded.has_young_kids,
      prefer_indoor  = excluded.prefer_indoor,
      ride_or_show   = excluded.ride_or_show,
      updated        = datetime('now')
  `),

  // Recommendation Cache
  getCachedRecommendations: db.prepare(`
    SELECT * FROM recommendation_cache
    WHERE park_id = ? AND generated_at >= datetime('now', '-20 minutes')
    ORDER BY rowid ASC
  `),
  upsertRecommendationCache: db.prepare(`
    INSERT INTO recommendation_cache (park_id, attraction_name, quips, context_blob, generated_at)
    VALUES (@park_id, @attraction_name, @quips, @context_blob, datetime('now'))
    ON CONFLICT(park_id, attraction_name) DO UPDATE SET
      quips        = excluded.quips,
      context_blob = excluded.context_blob,
      generated_at = datetime('now')
  `),
  clearRecommendationCache: db.prepare("DELETE FROM recommendation_cache WHERE park_id = ?"),
};

// ── ACTIVITIES ROUTES ──────────────────────────────────────

// GET /api/activities — list all
app.get("/api/activities", (req, res) => {
  const rows = stmts.getAllActivities.all();
  res.json(rows);
});

// GET /api/activities/:id — get one
app.get("/api/activities/:id", (req, res) => {
  const row = stmts.getActivity.get(req.params.id);
  if (!row) return res.status(404).json({ error: "Not found" });
  res.json(row);
});

// POST /api/activities — create one or many
app.post("/api/activities", (req, res) => {
  const body = req.body;
  const items = Array.isArray(body) ? body : [body];

  const insertMany = db.transaction((activities) => {
    for (const a of activities) {
      stmts.insertActivity.run({
        id:       a.id,
        date:     a.date || "",
        time:     a.time || "",
        type:     a.type || "Ride",
        title:    a.title || "",
        location: a.location || "",
        notes:    a.notes || "",
        image:    a.image || "",
        url:      a.url || "",
      });
    }
  });

  try {
    insertMany(items);
    const all = stmts.getAllActivities.all();
    res.json(all);
  } catch (err) {
    console.error("POST /api/activities error:", err.message);
    res.status(400).json({ error: err.message });
  }
});

// PUT /api/activities/:id — update one
app.put("/api/activities/:id", (req, res) => {
  const a = { ...req.body, id: req.params.id };
  try {
    const result = stmts.updateActivity.run({
      id:       a.id,
      date:     a.date || "",
      time:     a.time || "",
      type:     a.type || "Ride",
      title:    a.title || "",
      location: a.location || "",
      notes:    a.notes || "",
      image:    a.image || "",
      url:      a.url || "",
    });
    if (result.changes === 0) return res.status(404).json({ error: "Not found" });
    res.json(stmts.getActivity.get(a.id));
  } catch (err) {
    console.error("PUT /api/activities error:", err.message);
    res.status(400).json({ error: err.message });
  }
});

// DELETE /api/activities/:id — delete one
app.delete("/api/activities/:id", (req, res) => {
  stmts.deleteActivity.run(req.params.id);
  res.json({ ok: true });
});

// DELETE /api/activities — clear all
app.delete("/api/activities", (req, res) => {
  stmts.clearActivities.run();
  res.json({ ok: true });
});

// ── WISHLIST ROUTES ────────────────────────────────────────

app.get("/api/wishlist", (req, res) => {
  res.json(stmts.getAllWishlist.all());
});

app.post("/api/wishlist", (req, res) => {
  try {
    stmts.insertWishlist.run({
      id:            req.body.id,
      category:      req.body.category || "Other",
      title:         req.body.title || "",
      description:   req.body.description || "",
      url:           req.body.url || "",
      image:         req.body.image || "",
      added_by:      req.body.added_by || "",
      added_by_name: req.body.added_by_name || "",
    });
    res.json(stmts.getAllWishlist.all());
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete("/api/wishlist/:id", (req, res) => {
  stmts.deleteWishlist.run(req.params.id);
  res.json(stmts.getAllWishlist.all());
});

// ── BUDGET ROUTES ──────────────────────────────────────────

app.get("/api/budget", (req, res) => {
  const budget = stmts.getBudget.get();
  const transactions = stmts.getAllTransactions.all();
  res.json({
    totalBudget: budget ? budget.total : 0,
    transactions,
  });
});

app.put("/api/budget", (req, res) => {
  if (req.body.totalBudget !== undefined) {
    stmts.setBudgetTotal.run(req.body.totalBudget);
  }
  const budget = stmts.getBudget.get();
  const transactions = stmts.getAllTransactions.all();
  res.json({ totalBudget: budget.total, transactions });
});

app.post("/api/budget/transactions", (req, res) => {
  try {
    const user = getUserFromToken(req);
    stmts.insertTransaction.run({
      id:          req.body.id,
      description: req.body.description || "",
      amount:      req.body.amount || 0,
      category:    req.body.category || "Other",
      date:        req.body.date || "",
      trip_id:     req.body.trip_id || "",
      user_id:     req.body.user_id || (user ? user.id : ""),
    });
    const budget = stmts.getBudget.get();
    const trip_id = req.body.trip_id || "";
    const transactions = trip_id
      ? stmts.getTransactionsByTrip.all(trip_id)
      : stmts.getAllTransactions.all();
    res.json({ totalBudget: budget.total, transactions });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete("/api/budget/transactions/:id", (req, res) => {
  // Find the transaction first so we can return the right trip's transactions
  const tx = db.prepare("SELECT trip_id FROM transactions WHERE id = ?").get(req.params.id);
  stmts.deleteTransaction.run(req.params.id);
  const budget = stmts.getBudget.get();
  const trip_id = tx?.trip_id || "";
  const transactions = trip_id
    ? stmts.getTransactionsByTrip.all(trip_id)
    : stmts.getAllTransactions.all();
  res.json({ totalBudget: budget.total, transactions });
});

// ── TRIP BUDGET ROUTES ─────────────────────────────────────

// GET /api/trip-budgets — list all trip budgets
app.get("/api/trip-budgets", (req, res) => {
  const user = getUserFromToken(req);
  const tripBudgets = stmts.getAllTripBudgets.all();
  const result = tripBudgets.map(tb => {
    const transactions = stmts.getTransactionsByTrip.all(tb.trip_id);
    const spent = transactions.reduce((s, t) => s + t.amount, 0);
    // Legacy: trip-level total from the trip_budgets row (for backwards compat)
    const total = tb.hotel + tb.food + tb.extras + tb.souvenirs;

    // Per-user budget: if the current user has a personal budget, include it
    let myBudget = null;
    let mySpent = 0;
    let myTotal = 0;
    if (user) {
      // Check group membership first — group members share one budget row
      const group = stmts.getBudgetGroupForUser.get(tb.trip_id, user.id);
      const ub = group
        ? stmts.getUserBudgetByGroup.get(tb.trip_id, group.id)
        : stmts.getUserBudget.get(tb.trip_id, user.id);
      if (ub) {
        myBudget = { ...ub, group_label: group ? group.label : null };
        myTotal = ub.hotel + ub.food + ub.extras + ub.souvenirs;
      }
      if (group) {
        const members = stmts.getBudgetGroupMembers.all(group.id).map(m => m.user_id);
        const myTx = members.flatMap(uid => stmts.getTransactionsByTripAndUser.all(tb.trip_id, uid));
        mySpent = myTx.reduce((s, t) => s + t.amount, 0);
      } else {
        const myTx = stmts.getTransactionsByTripAndUser.all(tb.trip_id, user.id);
        mySpent = myTx.reduce((s, t) => s + t.amount, 0);
      }
    }

    return { ...tb, total, spent, transactions, myBudget, mySpent, myTotal };
  });
  res.json(result);
});

// GET /api/trip-budgets/:trip_id — get one trip budget with transactions
app.get("/api/trip-budgets/:trip_id", (req, res) => {
  const tb = stmts.getTripBudget.get(req.params.trip_id);
  if (!tb) return res.status(404).json({ error: "Trip budget not found" });
  const transactions = stmts.getTransactionsByTrip.all(tb.trip_id);
  const spent = transactions.reduce((s, t) => s + t.amount, 0);
  const total = tb.hotel + tb.food + tb.extras + tb.souvenirs;
  res.json({ ...tb, total, spent, transactions });
});

// PUT /api/trip-budgets/:trip_id — create or update a trip budget
app.put("/api/trip-budgets/:trip_id", (req, res) => {
  const { label, start_date, end_date, hotel, food, extras, souvenirs } = req.body;
  if (!label || !start_date || !end_date) {
    return res.status(400).json({ error: "label, start_date, end_date required" });
  }
  stmts.upsertTripBudget.run({
    trip_id:    req.params.trip_id,
    label,
    start_date,
    end_date,
    hotel:      hotel || 0,
    food:       food || 0,
    extras:     extras || 0,
    souvenirs:  souvenirs || 0,
  });
  const tb = stmts.getTripBudget.get(req.params.trip_id);
  const transactions = stmts.getTransactionsByTrip.all(req.params.trip_id);
  const spent = transactions.reduce((s, t) => s + t.amount, 0);
  const total = tb.hotel + tb.food + tb.extras + tb.souvenirs;
  res.json({ ...tb, total, spent, transactions });
});

// DELETE /api/trip-budgets/:trip_id — delete a trip budget and its transactions
app.delete("/api/trip-budgets/:trip_id", (req, res) => {
  db.prepare("DELETE FROM transactions WHERE trip_id = ?").run(req.params.trip_id);
  stmts.deleteTripBudget.run(req.params.trip_id);
  res.json({ ok: true });
});

// PUT /api/trips/:tripId/resize — change trip start/end dates
// Migrates all related records to the new trip_id (which encodes dates).
// Removes parkdays and activities that fall outside the new date range.
app.put("/api/trips/:tripId/resize", (req, res) => {
  const oldTripId = req.params.tripId;
  const { start_date, end_date } = req.body;

  if (!start_date || !end_date) {
    return res.status(400).json({ error: "start_date and end_date required" });
  }
  if (start_date > end_date) {
    return res.status(400).json({ error: "start_date must be before or equal to end_date" });
  }

  const oldTrip = stmts.getTripBudget.get(oldTripId);
  if (!oldTrip) return res.status(404).json({ error: "Trip not found" });

  if (oldTrip.start_date === start_date && oldTrip.end_date === end_date) {
    return res.json({ ok: true, trip_id: oldTripId, changed: false });
  }

  const newTripId = `trip-${start_date}-${end_date}`;

  // Don't overwrite a different existing trip
  if (newTripId !== oldTripId) {
    const existing = stmts.getTripBudget.get(newTripId);
    if (existing) {
      return res.status(409).json({ error: "A trip with those dates already exists" });
    }
  }

  // Build a human-readable label
  const fmtDate = d => {
    const dt = new Date(d + "T12:00:00");
    return dt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  };
  const newLabel = `${fmtDate(start_date)} – ${fmtDate(end_date)}`;

  const resize = db.transaction(() => {
    if (newTripId !== oldTripId) {
      // Create new trip row, copy budget amounts
      db.prepare(`
        INSERT INTO trip_budgets (trip_id, label, start_date, end_date, hotel, food, extras, souvenirs, created, updated)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      `).run(newTripId, newLabel, start_date, end_date,
             oldTrip.hotel, oldTrip.food, oldTrip.extras, oldTrip.souvenirs, oldTrip.created);

      // Migrate all related tables
      const migrateTables = [
        "trip_members", "transactions", "user_budgets",
        "budget_contributions", "trip_acknowledged", "photos",
      ];
      for (const tbl of migrateTables) {
        db.prepare(`UPDATE ${tbl} SET trip_id = ? WHERE trip_id = ?`).run(newTripId, oldTripId);
      }
      db.prepare("UPDATE budget_groups SET trip_id = ? WHERE trip_id = ?").run(newTripId, oldTripId);

      // Remove old trip budget row
      stmts.deleteTripBudget.run(oldTripId);
    } else {
      // Same trip_id (shouldn't happen given the early return, but defensive)
      db.prepare("UPDATE trip_budgets SET label = ?, start_date = ?, end_date = ?, updated = datetime('now') WHERE trip_id = ?")
        .run(newLabel, start_date, end_date, oldTripId);
    }

    // Remove parkdays + activities that fall outside the new date range
    if (start_date > oldTrip.start_date) {
      db.prepare("DELETE FROM parkdays WHERE date >= ? AND date < ?").run(oldTrip.start_date, start_date);
      db.prepare("DELETE FROM activities WHERE date >= ? AND date < ?").run(oldTrip.start_date, start_date);
    }
    if (end_date < oldTrip.end_date) {
      db.prepare("DELETE FROM parkdays WHERE date > ? AND date <= ?").run(end_date, oldTrip.end_date);
      db.prepare("DELETE FROM activities WHERE date > ? AND date <= ?").run(end_date, oldTrip.end_date);
    }
  });

  try {
    resize();
    // Rename photo directory if trip_id changed
    if (newTripId !== oldTripId) {
      const oldDir = path.join(PHOTOS_DIR, oldTripId);
      const newDir = path.join(PHOTOS_DIR, newTripId);
      try { if (fs.existsSync(oldDir)) fs.renameSync(oldDir, newDir); } catch (e) { /* ok */ }
    }
    res.json({ ok: true, old_trip_id: oldTripId, trip_id: newTripId, changed: newTripId !== oldTripId });
  } catch (err) {
    console.error("Trip resize error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/trips/:tripId/cancel — full trip cancellation
app.delete("/api/trips/:tripId/cancel", (req, res) => {
  const tripId = req.params.tripId;

  const trip = stmts.getTripBudget.get(tripId);
  let start_date, end_date;

  if (trip) {
    start_date = trip.start_date;
    end_date = trip.end_date;
  } else {
    const match = tripId.match(/^trip-(\d{4}-\d{2}-\d{2})-(\d{4}-\d{2}-\d{2})$/);
    if (match) {
      start_date = match[1];
      end_date = match[2];
    } else {
      return res.status(404).json({ error: "Trip not found and could not parse dates from trip ID" });
    }
  }

  const cancelTrip = db.transaction(() => {
    db.prepare("DELETE FROM activities WHERE date >= ? AND date <= ?").run(start_date, end_date);
    db.prepare("DELETE FROM parkdays WHERE date >= ? AND date <= ?").run(start_date, end_date);

    const overlappingBudgets = db.prepare(
      "SELECT trip_id FROM trip_budgets WHERE start_date <= ? AND end_date >= ?"
    ).all(end_date, start_date);

    const allRelatedTripIds = new Set([tripId, ...overlappingBudgets.map(b => b.trip_id)]);

    for (const tid of allRelatedTripIds) {
      db.prepare("DELETE FROM transactions WHERE trip_id = ?").run(tid);
    }
    for (const tid of allRelatedTripIds) {
      db.prepare("DELETE FROM trip_members WHERE trip_id = ?").run(tid);
    }
    for (const tid of allRelatedTripIds) {
      const photos = db.prepare("SELECT * FROM photos WHERE trip_id = ?").all(tid);
      for (const photo of photos) {
        const filePath = path.join(PHOTOS_DIR, tid, photo.filename);
        try { fs.unlinkSync(filePath); } catch (e) { /* file may be gone */ }
      }
      db.prepare("DELETE FROM photos WHERE trip_id = ?").run(tid);
      const tripPhotoDir = path.join(PHOTOS_DIR, tid);
      try { fs.rmdirSync(tripPhotoDir); } catch (e) { /* may not be empty or exist */ }
    }
    for (const tid of allRelatedTripIds) {
      stmts.deleteTripBudget.run(tid);
    }
    for (const tid of allRelatedTripIds) {
      db.prepare("DELETE FROM user_budgets WHERE trip_id = ?").run(tid);
    }
    for (const tid of allRelatedTripIds) {
      db.prepare("DELETE FROM trip_acknowledged WHERE trip_id = ?").run(tid);
    }
    for (const tid of allRelatedTripIds) {
      db.prepare("DELETE FROM budget_contributions WHERE trip_id = ?").run(tid);
    }
    // Clean up budget groups
    for (const tid of allRelatedTripIds) {
      db.prepare(`
        DELETE FROM budget_group_members WHERE group_id IN (
          SELECT id FROM budget_groups WHERE trip_id = ?
        )
      `).run(tid);
      db.prepare("DELETE FROM budget_groups WHERE trip_id = ?").run(tid);
    }
  });

  try {
    cancelTrip();
    res.json({ ok: true, deleted: { trip_id: tripId, start_date, end_date } });
  } catch (err) {
    console.error("Trip cancellation error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── PARK DAYS ROUTES ───────────────────────────────────────

app.get("/api/parkdays", (req, res) => {
  res.json(stmts.getAllParkDays.all());
});

app.get("/api/parkdays/:date", (req, res) => {
  const row = stmts.getParkDay.get(req.params.date);
  if (!row) return res.status(404).json({ error: "Not found" });
  res.json(row);
});

app.post("/api/parkdays", (req, res) => {
  const body = req.body;
  const items = Array.isArray(body) ? body : [body];

  const upsertMany = db.transaction((days) => {
    for (const d of days) {
      if (d.date && d.park) {
        stmts.upsertParkDay.run({ date: d.date, park: d.park });
      }
    }
  });

  try {
    upsertMany(items);
    res.json(stmts.getAllParkDays.all());
  } catch (err) {
    console.error("POST /api/parkdays error:", err.message);
    res.status(400).json({ error: err.message });
  }
});

app.delete("/api/parkdays/:date", (req, res) => {
  stmts.deleteParkDay.run(req.params.date);
  res.json({ ok: true });
});

// ── VENUES ROUTES ──────────────────────────────────────────

app.get("/api/venues", (req, res) => {
  const q = req.query.q;
  if (q) {
    res.json(stmts.searchVenues.all(`%${q}%`));
  } else {
    res.json(stmts.getAllVenues.all());
  }
});

app.post("/api/venues", (req, res) => {
  const { name, location, url, type } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: "Name required" });

  try {
    const token = (req.headers.authorization || "").replace("Bearer ", "");
    const session = token ? db.prepare("SELECT s.*, u.role FROM sessions s JOIN users u ON s.user_id = u.id WHERE s.token = ?").get(token) : null;
    const isAdmin = session && session.role === "admin";

    const existing = stmts.getVenueByName.get(name.trim());

    if (isAdmin) {
      if (existing) {
        stmts.updateVenue.run({
          id: existing.id,
          location: location || existing.location,
          url: url || existing.url,
          type: type || existing.type,
        });
      } else {
        stmts.insertVenue.run({
          id: `venue-${Date.now()}-${Math.floor(Math.random() * 100000)}`,
          name: name.trim(),
          location: (location || "").trim(),
          url: (url || "").trim(),
          type: (type || "").trim(),
        });
      }
      res.json(stmts.getAllVenues.all());
    } else {
      const changeType = existing ? "update" : "new";
      const userName = session ? db.prepare("SELECT name FROM users WHERE id = ?").get(session.user_id)?.name || "Unknown" : "Anonymous";

      db.prepare(`INSERT INTO pending_venues (id, venue_name, venue_location, venue_url, venue_type, change_type, existing_venue_id, submitted_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
        `pending-${Date.now()}-${Math.floor(Math.random() * 100000)}`,
        name.trim(),
        (location || "").trim(),
        (url || "").trim(),
        (type || "").trim(),
        changeType,
        existing ? existing.id : "",
        userName
      );

      res.json(stmts.getAllVenues.all());
    }
  } catch (err) {
    console.error("POST /api/venues error:", err.message);
    res.status(400).json({ error: err.message });
  }
});

app.delete("/api/venues/:id", (req, res) => {
  stmts.deleteVenue.run(req.params.id);
  res.json({ ok: true });
});

// ── AUTH ROUTES ────────────────────────────────────────────

app.post("/api/auth/login", (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: "Email required" });

  const user = db.prepare("SELECT * FROM users WHERE LOWER(email) = LOWER(?)").get(email.trim());
  if (!user) return res.status(401).json({ error: "Email not authorized" });

  const token = `session-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  db.prepare("INSERT INTO sessions (token, user_id) VALUES (?, ?)").run(token, user.id);

  res.json({
    token,
    user: { id: user.id, email: user.email, name: user.name, role: user.role },
  });
});

app.get("/api/auth/me", (req, res) => {
  const token = (req.headers.authorization || "").replace("Bearer ", "");
  if (!token) return res.status(401).json({ error: "Not logged in" });

  const row = db.prepare(`
    SELECT u.id, u.email, u.name, u.role, u.avatar FROM sessions s
    JOIN users u ON s.user_id = u.id WHERE s.token = ?
  `).get(token);

  if (!row) return res.status(401).json({ error: "Invalid session" });
  res.json(row);
});

app.post("/api/auth/logout", (req, res) => {
  const token = (req.headers.authorization || "").replace("Bearer ", "");
  if (token) db.prepare("DELETE FROM sessions WHERE token = ?").run(token);
  res.json({ ok: true });
});

app.get("/api/users", (req, res) => {
  res.json(db.prepare("SELECT id, name, email, role FROM users ORDER BY name").all());
});

// ── ADMIN ROUTES ───────────────────────────────────────────

function requireAdmin(req, res, next) {
  const token = (req.headers.authorization || "").replace("Bearer ", "");
  if (!token) return res.status(401).json({ error: "Not logged in" });

  const row = db.prepare(`
    SELECT u.role FROM sessions s JOIN users u ON s.user_id = u.id WHERE s.token = ?
  `).get(token);

  if (!row || row.role !== "admin") return res.status(403).json({ error: "Admin required" });
  next();
}

app.get("/api/admin/users", requireAdmin, (req, res) => {
  res.json(db.prepare("SELECT id, email, name, role, created FROM users ORDER BY created").all());
});

app.post("/api/admin/users", requireAdmin, (req, res) => {
  const { email, name, role } = req.body;
  if (!email || !name) return res.status(400).json({ error: "Email and name required" });

  try {
    db.prepare("INSERT INTO users (id, email, name, role) VALUES (?, ?, ?, ?)").run(
      `user-${Date.now()}-${Math.floor(Math.random() * 100000)}`,
      email.trim().toLowerCase(),
      name.trim(),
      role || "member"
    );
    res.json(db.prepare("SELECT id, email, name, role, created FROM users ORDER BY created").all());
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete("/api/admin/users/:id", requireAdmin, (req, res) => {
  db.prepare("DELETE FROM users WHERE id = ?").run(req.params.id);
  db.prepare("DELETE FROM sessions WHERE user_id = ?").run(req.params.id);
  res.json(db.prepare("SELECT id, email, name, role, created FROM users ORDER BY created").all());
});

app.post("/api/admin/users/:id/revoke-sessions", requireAdmin, (req, res) => {
  const result = db.prepare("DELETE FROM sessions WHERE user_id = ?").run(req.params.id);
  res.json({ ok: true, revoked: result.changes });
});

app.get("/api/admin/pending", requireAdmin, (req, res) => {
  res.json(db.prepare("SELECT * FROM pending_venues WHERE status = 'pending' ORDER BY created DESC").all());
});

app.post("/api/admin/pending/:id/approve", requireAdmin, (req, res) => {
  const pending = db.prepare("SELECT * FROM pending_venues WHERE id = ?").get(req.params.id);
  if (!pending) return res.status(404).json({ error: "Not found" });

  if (pending.change_type === "new") {
    stmts.insertVenue.run({
      id: `venue-${Date.now()}-${Math.floor(Math.random() * 100000)}`,
      name: pending.venue_name,
      location: pending.venue_location,
      url: pending.venue_url,
      type: pending.venue_type,
    });
  } else if (pending.change_type === "update" && pending.existing_venue_id) {
    const existing = db.prepare("SELECT * FROM venues WHERE id = ?").get(pending.existing_venue_id);
    if (existing) {
      stmts.updateVenue.run({
        id: existing.id,
        location: pending.venue_location || existing.location,
        url: pending.venue_url || existing.url,
        type: pending.venue_type || existing.type,
      });
    }
  }

  db.prepare("UPDATE pending_venues SET status = 'approved' WHERE id = ?").run(req.params.id);
  res.json(db.prepare("SELECT * FROM pending_venues WHERE status = 'pending' ORDER BY created DESC").all());
});

app.post("/api/admin/pending/:id/reject", requireAdmin, (req, res) => {
  db.prepare("UPDATE pending_venues SET status = 'rejected' WHERE id = ?").run(req.params.id);
  res.json(db.prepare("SELECT * FROM pending_venues WHERE status = 'pending' ORDER BY created DESC").all());
});

app.get("/api/admin/venues", requireAdmin, (req, res) => {
  res.json(stmts.getAllVenues.all());
});

app.put("/api/admin/venues/:id", requireAdmin, (req, res) => {
  const { name, location, url, type, park, land, description, avg_wait, image_url, tags } = req.body;
  db.prepare(`UPDATE venues SET name=?, location=?, url=?, type=?, park=?, land=?, description=?, avg_wait=?, image_url=?, tags=?, updated=datetime('now') WHERE id=?`).run(
    name, location||"", url||"", type||"", park||"", land||"", description||"", avg_wait||0, image_url||"", tags||"", req.params.id
  );
  res.json(stmts.getAllVenues.all());
});

app.post("/api/admin/venues", requireAdmin, (req, res) => {
  const { name, location, url, type, park, land, description, avg_wait, image_url, tags } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: "Name is required" });
  const id = `venue-${Date.now()}-${Math.random().toString(36).slice(2,6)}`;
  db.prepare(`INSERT INTO venues (id,name,location,url,type,park,land,description,avg_wait,image_url,tags) VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(
    id, name.trim(), location||"", url||"", type||"", park||"", land||"", description||"", avg_wait||0, image_url||"", tags||""
  );
  res.json({ id, name: name.trim() });
});

app.delete("/api/admin/venues/:id", requireAdmin, (req, res) => {
  db.prepare("DELETE FROM venues WHERE id = ?").run(req.params.id);
  res.json({ ok: true });
});

app.post("/api/admin/venues/seed", requireAdmin, (req, res) => {
  const venues = req.body;
  if (!Array.isArray(venues)) return res.status(400).json({ error: "Array expected" });

  const insertOrSkip = db.transaction((items) => {
    let added = 0;
    for (const v of items) {
      const existing = stmts.getVenueByName.get(v.name.trim());
      if (!existing) {
        stmts.insertVenue.run({
          id: `venue-${Date.now()}-${Math.floor(Math.random() * (added + 1) * 100000)}`,
          name: v.name.trim(),
          location: (v.location || "").trim(),
          url: (v.url || "").trim(),
          type: (v.type || "").trim(),
        });
        added++;
      }
    }
    return added;
  });

  try {
    const added = insertOrSkip(venues);
    res.json({ added, total: stmts.getAllVenues.all().length });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ── TRIP MEMBER ROUTES ─────────────────────────────────────

app.get("/api/trips/:tripId/members", (req, res) => {
  res.json(stmts.getTripMembers.all(req.params.tripId));
});

app.post("/api/trips/:tripId/members", (req, res) => {
  const { user_id } = req.body;
  if (!user_id) return res.status(400).json({ error: "user_id required" });
  stmts.addTripMember.run(req.params.tripId, user_id);

  const currentUser = getUserFromToken(req);
  if (currentUser && currentUser.id === user_id) {
    stmts.acknowledgTrip.run(req.params.tripId, user_id);
  }

  res.json(stmts.getTripMembers.all(req.params.tripId));
});

app.delete("/api/trips/:tripId/members/:userId", (req, res) => {
  stmts.removeTripMember.run(req.params.tripId, req.params.userId);
  res.json(stmts.getTripMembers.all(req.params.tripId));
});

app.get("/api/users/:userId/trips", (req, res) => {
  res.json(stmts.getUserTrips.all(req.params.userId));
});

// ── BUDGET GROUP ROUTES ────────────────────────────────────

// POST /api/trips/:tripId/budget-groups
// Called by the planner wizard on save. Replaces all existing groups for this trip.
// Body: { groups: [ { id, memberIds[] } ] }
app.post("/api/trips/:tripId/budget-groups", (req, res) => {
  const user = getUserFromToken(req);
  if (!user) return res.status(401).json({ error: "Not logged in" });

  const tripId = req.params.tripId;
  const { groups } = req.body;
  if (!Array.isArray(groups)) return res.status(400).json({ error: "groups array required" });

  // Build name map so labels are human-readable (first names joined)
  const nameMap = {};
  db.prepare("SELECT id, name FROM users").all().forEach(u => { nameMap[u.id] = u.name; });

  const save = db.transaction(() => {
    stmts.clearBudgetGroupMembersByTrip.run(tripId);
    stmts.deleteBudgetGroupsByTrip.run(tripId);
    for (const g of groups) {
      if (!g.id || !Array.isArray(g.memberIds) || g.memberIds.length === 0) continue;
      const label = g.memberIds.map(uid => (nameMap[uid] || uid).split(" ")[0]).join(" & ");
      stmts.upsertBudgetGroup.run({ id: g.id, trip_id: tripId, label });
      for (const uid of g.memberIds) stmts.addBudgetGroupMember.run(g.id, uid);
    }
  });

  try {
    save();
    const saved = stmts.getBudgetGroupsByTrip.all(tripId).map(g => ({
      ...g,
      memberIds: stmts.getBudgetGroupMembers.all(g.id).map(m => m.user_id),
    }));
    res.json({ ok: true, groups: saved });
  } catch (err) {
    console.error("POST /budget-groups error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/trips/:tripId/budget-groups
// Returns all budget groups for the trip with their member lists.
app.get("/api/trips/:tripId/budget-groups", (req, res) => {
  const groups = stmts.getBudgetGroupsByTrip.all(req.params.tripId).map(g => ({
    ...g,
    memberIds: stmts.getBudgetGroupMembers.all(g.id).map(m => m.user_id),
  }));
  res.json(groups);
});

// Helper: resolve budget identity for a user on a trip.
// Returns group-keyed budget when user is in a budget group, solo budget otherwise.
function resolveBudget(tripId, userId) {
  const group = stmts.getBudgetGroupForUser.get(tripId, userId);
  const ub = group
    ? stmts.getUserBudgetByGroup.get(tripId, group.id)
    : stmts.getUserBudget.get(tripId, userId);

  let myTx;
  if (group) {
    const members = stmts.getBudgetGroupMembers.all(group.id).map(m => m.user_id);
    myTx = members.flatMap(uid => stmts.getTransactionsByTripAndUser.all(tripId, uid));
    myTx.sort((a, b) => (b.created || "").localeCompare(a.created || ""));
  } else {
    myTx = stmts.getTransactionsByTripAndUser.all(tripId, userId);
  }

  const contributions = group
    ? stmts.getBudgetGroupMembers.all(group.id).map(m => m.user_id)
        .flatMap(uid => stmts.getContributionsByTripAndUser.all(tripId, uid))
    : stmts.getContributionsByTripAndUser.all(tripId, userId);

  return { ub, group, myTx, contributions };
}

app.get("/api/trips/:tripId/my-budget", (req, res) => {
  const user = getUserFromToken(req);
  if (!user) return res.status(401).json({ error: "Not logged in" });

  const tripId = req.params.tripId;
  const { ub, group, myTx, contributions } = resolveBudget(tripId, user.id);
  const mySpent = myTx.reduce((s, t) => s + t.amount, 0);
  const totalContributed = contributions.reduce((s, c) => s + c.amount, 0);

  if (!ub) {
    return res.json({
      trip_id: tripId,
      user_id: user.id,
      budget_group_id: group ? group.id : null,
      group_label: group ? group.label : null,
      hotel: 0, food: 0, extras: 0, souvenirs: 0,
      total: 0, spent: mySpent, transactions: myTx,
      contributions, totalContributed, confirmed: 0,
      exists: false,
    });
  }

  const total = ub.hotel + ub.food + ub.extras + ub.souvenirs;
  res.json({
    ...ub, total, spent: mySpent, transactions: myTx,
    contributions, totalContributed, confirmed: ub.confirmed || 0,
    budget_group_id: group ? group.id : null,
    group_label: group ? group.label : null,
    exists: true,
  });
});

app.put("/api/trips/:tripId/my-budget", (req, res) => {
  const user = getUserFromToken(req);
  if (!user) return res.status(401).json({ error: "Not logged in" });

  const tripId = req.params.tripId;
  const { hotel, food, extras, souvenirs } = req.body;
  const group = stmts.getBudgetGroupForUser.get(tripId, user.id);

  if (group) {
    // Write the same amounts to every member in the group so all see the same budget
    const members = stmts.getBudgetGroupMembers.all(group.id).map(m => m.user_id);
    db.transaction(() => {
      for (const uid of members) {
        db.prepare(`
          INSERT INTO user_budgets (trip_id, user_id, budget_group_id, hotel, food, extras, souvenirs, updated)
          VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
          ON CONFLICT(trip_id, user_id) DO UPDATE SET
            hotel=excluded.hotel, food=excluded.food,
            extras=excluded.extras, souvenirs=excluded.souvenirs,
            budget_group_id=excluded.budget_group_id, updated=datetime('now')
        `).run(tripId, uid, group.id, hotel || 0, food || 0, extras || 0, souvenirs || 0);
      }
    })();
  } else {
    // Solo — original behaviour
    stmts.upsertUserBudget.run({
      trip_id:   tripId,
      user_id:   user.id,
      hotel:     hotel || 0,
      food:      food || 0,
      extras:    extras || 0,
      souvenirs: souvenirs || 0,
    });
  }

  const { ub, myTx } = resolveBudget(tripId, user.id);
  const mySpent = myTx.reduce((s, t) => s + t.amount, 0);
  const total = ub ? ub.hotel + ub.food + ub.extras + ub.souvenirs : 0;
  res.json({
    ...(ub || {}), total, spent: mySpent, transactions: myTx,
    budget_group_id: group ? group.id : null,
    group_label: group ? group.label : null,
    exists: true,
  });
});

app.get("/api/trips/:tripId/budgets", (req, res) => {
  const userBudgets = stmts.getUserBudgetsByTrip.all(req.params.tripId);
  const result = userBudgets.map(ub => {
    const myTx = stmts.getTransactionsByTripAndUser.all(ub.trip_id, ub.user_id);
    const mySpent = myTx.reduce((s, t) => s + t.amount, 0);
    const total = ub.hotel + ub.food + ub.extras + ub.souvenirs;
    return { ...ub, total, spent: mySpent, transactionCount: myTx.length };
  });
  res.json(result);
});

// ── TRIP ACKNOWLEDGMENT ROUTES ────────────────────────────

app.get("/api/my/unacknowledged-trips", (req, res) => {
  const user = getUserFromToken(req);
  if (!user) return res.status(401).json({ error: "Not logged in" });
  res.json(stmts.getUnacknowledgedTrips.all(user.id));
});

app.post("/api/trips/:tripId/acknowledge", (req, res) => {
  const user = getUserFromToken(req);
  if (!user) return res.status(401).json({ error: "Not logged in" });
  stmts.acknowledgTrip.run(req.params.tripId, user.id);
  res.json({ ok: true });
});

// ── BUDGET CONTRIBUTION ROUTES ────────────────────────────

app.get("/api/trips/:tripId/my-contributions", (req, res) => {
  const user = getUserFromToken(req);
  if (!user) return res.status(401).json({ error: "Not logged in" });
  const contributions = stmts.getContributionsByTripAndUser.all(req.params.tripId, user.id);
  const totalContributed = contributions.reduce((s, c) => s + c.amount, 0);
  res.json({ contributions, totalContributed });
});

app.post("/api/trips/:tripId/contributions", (req, res) => {
  const user = getUserFromToken(req);
  if (!user) return res.status(401).json({ error: "Not logged in" });

  const { amount, note, date } = req.body;
  if (!amount || amount <= 0) return res.status(400).json({ error: "Amount must be positive" });

  stmts.insertContribution.run({
    id:      `contrib-${Date.now()}-${Math.floor(Math.random() * 100000)}`,
    trip_id: req.params.tripId,
    user_id: user.id,
    amount:  amount,
    note:    note || "",
    date:    date || new Date().toISOString().split("T")[0],
  });

  const contributions = stmts.getContributionsByTripAndUser.all(req.params.tripId, user.id);
  const totalContributed = contributions.reduce((s, c) => s + c.amount, 0);
  res.json({ contributions, totalContributed });
});

app.delete("/api/contributions/:id", (req, res) => {
  stmts.deleteContribution.run(req.params.id);
  res.json({ ok: true });
});

app.post("/api/trips/:tripId/confirm-budget", (req, res) => {
  const user = getUserFromToken(req);
  if (!user) return res.status(401).json({ error: "Not logged in" });

  stmts.confirmUserBudget.run(req.params.tripId, user.id);

  const ub = stmts.getUserBudget.get(req.params.tripId, user.id);
  res.json({ ok: true, confirmed: true, budget: ub });
});

// ── PHOTO ROUTES ──────────────────────────────────────────

const photoUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const tripDir = path.join(PHOTOS_DIR, req.params.tripId);
      fs.mkdirSync(tripDir, { recursive: true });
      cb(null, tripDir);
    },
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname) || ".jpg";
      const name = `photo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`;
      cb(null, name);
    },
  }),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = /^image\//i;
    cb(null, allowed.test(file.mimetype) || file.mimetype === "application/octet-stream");
  },
});

const wishlistUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      fs.mkdirSync(WISHLIST_DIR, { recursive: true });
      cb(null, WISHLIST_DIR);
    },
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname) || ".jpg";
      const name = `wl-${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`;
      cb(null, name);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = /^image\//i;
    cb(null, allowed.test(file.mimetype) || file.mimetype === "application/octet-stream");
  },
});

app.get("/api/trips/:tripId/photos", (req, res) => {
  res.json(stmts.getPhotosByTrip.all(req.params.tripId));
});

// GET /api/my/photos — all photos uploaded by the current user, grouped by trip
app.get("/api/my/photos", (req, res) => {
  const user = getUserFromToken(req);
  if (!user) return res.status(401).json({ error: "Not logged in" });

  const photos = db.prepare(
    "SELECT p.*, tb.label AS trip_label, tb.start_date, tb.end_date FROM photos p LEFT JOIN trip_budgets tb ON p.trip_id = tb.trip_id WHERE p.uploaded_by = ? ORDER BY p.created DESC"
  ).all(user.id);

  // Group by trip
  const byTrip = {};
  for (const p of photos) {
    if (!byTrip[p.trip_id]) {
      byTrip[p.trip_id] = {
        trip_id: p.trip_id,
        trip_label: p.trip_label || p.trip_id,
        start_date: p.start_date || "",
        end_date: p.end_date || "",
        photos: [],
      };
    }
    byTrip[p.trip_id].photos.push(p);
  }

  // Sort trips: most recent first
  const trips = Object.values(byTrip).sort((a, b) => b.start_date.localeCompare(a.start_date));
  res.json({ total: photos.length, trips });
});

app.post("/api/trips/:tripId/photos", photoUpload.array("photos", 20), (req, res) => {
  try {
    const results = [];
    for (const file of (req.files || [])) {
      const photo = {
        id: `photo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        trip_id: req.params.tripId,
        filename: file.filename,
        caption: req.body.caption || "",
        uploaded_by: req.body.uploaded_by || "",
        uploaded_by_name: req.body.uploaded_by_name || "",
      };
      stmts.insertPhoto.run(photo);
      results.push(photo);
    }
    res.json(results);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get("/api/photos/:id/file", (req, res) => {
  const photo = stmts.getPhoto.get(req.params.id);
  if (!photo) return res.status(404).json({ error: "Photo not found" });

  const filePath = path.join(PHOTOS_DIR, photo.trip_id, photo.filename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: "File not found" });

  res.sendFile(filePath);
});

app.delete("/api/photos/:id", (req, res) => {
  const photo = stmts.getPhoto.get(req.params.id);
  if (!photo) return res.status(404).json({ error: "Not found" });

  const filePath = path.join(PHOTOS_DIR, photo.trip_id, photo.filename);
  try { fs.unlinkSync(filePath); } catch (e) { /* file may already be gone */ }

  stmts.deletePhoto.run(req.params.id);
  res.json({ ok: true });
});

app.post("/api/wishlist/upload-image", wishlistUpload.single("image"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No image uploaded" });
  res.json({ filename: req.file.filename });
});

app.get("/api/wishlist/image/:filename", (req, res) => {
  const filePath = path.join(WISHLIST_DIR, req.params.filename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: "Not found" });
  res.sendFile(filePath);
});

// ── VENUE IMAGE UPLOAD ────────────────────────────────────

const venueImageUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      fs.mkdirSync(VENUES_DIR, { recursive: true });
      cb(null, VENUES_DIR);
    },
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname) || ".jpg";
      const name = `venue-${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`;
      cb(null, name);
    },
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = /^image\//i;
    cb(null, allowed.test(file.mimetype) || file.mimetype === "application/octet-stream");
  },
});

app.post("/api/admin/venues/:id/image", requireAdmin, venueImageUpload.single("image"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No image uploaded" });

  const filename = req.file.filename;

  const venue = stmts.getAllVenues.all().find(v => v.id === req.params.id);
  if (venue && venue.image_url) {
    const oldFile = path.join(VENUES_DIR, venue.image_url);
    try { fs.unlinkSync(oldFile); } catch (e) { /* may not exist */ }
  }

  db.prepare("UPDATE venues SET image_url = ?, updated = datetime('now') WHERE id = ?").run(filename, req.params.id);
  res.json({ filename });
});

app.get("/api/venues/image/:filename", (req, res) => {
  const filePath = path.join(VENUES_DIR, req.params.filename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: "Not found" });
  res.sendFile(filePath);
});

// ── FAVORITE RIDES ROUTES ─────────────────────────────────

app.get("/api/favorite-rides/:userId", (req, res) => {
  res.json(stmts.getFavoriteRides.all(req.params.userId));
});

app.post("/api/favorite-rides", (req, res) => {
  try {
    stmts.insertFavoriteRide.run({
      id:        req.body.id || `fav-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      user_id:   req.body.user_id || "",
      park:      req.body.park || "",
      ride_name: req.body.ride_name || "",
      rating:    req.body.rating || 5,
      notes:     req.body.notes || "",
    });
    res.json(stmts.getFavoriteRides.all(req.body.user_id));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete("/api/favorite-rides/:id", (req, res) => {
  stmts.deleteFavoriteRide.run(req.params.id);
  res.json({ ok: true });
});

// ── DINING MEMORY ROUTES ──────────────────────────────────

app.get("/api/dining-memories/:userId", (req, res) => {
  res.json(stmts.getAllDiningMemories.all(req.params.userId));
});

app.get("/api/dining-memories/:userId/:venueName", (req, res) => {
  res.json(stmts.getDiningMemories.all(req.params.userId, decodeURIComponent(req.params.venueName)));
});

app.post("/api/dining-memories", (req, res) => {
  try {
    stmts.insertDiningMemory.run({
      id:          req.body.id || `dm-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      user_id:     req.body.user_id || "",
      venue_name:  req.body.venue_name || "",
      items:       JSON.stringify(req.body.items || []),
      rating:      req.body.rating || 0,
      notes:       req.body.notes || "",
      visit_date:  req.body.visit_date || new Date().toISOString().split("T")[0],
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete("/api/dining-memories/:id", (req, res) => {
  stmts.deleteDiningMemory.run(req.params.id);
  res.json({ ok: true });
});

// ── PACKING LIST ROUTES ───────────────────────────────────

app.get("/api/trips/:tripId/packing", (req, res) => {
  const user = getUserFromToken(req);
  if (!user) return res.status(401).json({ error: "Not logged in" });
  res.json(stmts.getPackingItems.all(req.params.tripId, user.id));
});

app.post("/api/trips/:tripId/packing", (req, res) => {
  const user = getUserFromToken(req);
  if (!user) return res.status(401).json({ error: "Not logged in" });

  const { label, category } = req.body;
  if (!label || !label.trim()) return res.status(400).json({ error: "Label required" });

  stmts.insertPackingItem.run({
    id:       `pack-${Date.now()}-${Math.floor(Math.random() * 100000)}`,
    trip_id:  req.params.tripId,
    user_id:  user.id,
    label:    label.trim(),
    category: category || "General",
  });
  res.json(stmts.getPackingItems.all(req.params.tripId, user.id));
});

app.patch("/api/packing/:id", (req, res) => {
  const user = getUserFromToken(req);
  if (!user) return res.status(401).json({ error: "Not logged in" });

  const { checked } = req.body;
  stmts.updatePackingChecked.run({ id: req.params.id, checked: checked ? 1 : 0, user_id: user.id });
  res.json({ ok: true });
});

app.delete("/api/packing/:id", (req, res) => {
  const user = getUserFromToken(req);
  if (!user) return res.status(401).json({ error: "Not logged in" });
  stmts.deletePackingItem.run(req.params.id, user.id);
  res.json({ ok: true });
});

app.delete("/api/trips/:tripId/packing", (req, res) => {
  const user = getUserFromToken(req);
  if (!user) return res.status(401).json({ error: "Not logged in" });
  stmts.clearPackingItems.run(req.params.tripId, user.id);
  res.json({ ok: true });
});

// ── Session Cleanup ────────────────────────────────────────
function cleanupSessions() {
  const result = db.prepare("DELETE FROM sessions WHERE created < datetime('now', '-30 days')").run();
  if (result.changes > 0) console.log(`[Sessions] Cleaned up ${result.changes} expired session(s).`);
}
cleanupSessions();
setInterval(cleanupSessions, 24 * 60 * 60 * 1000);

// ── Health check ───────────────────────────────────────────

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// ============================================================
// WAIT TIMES API
// Serves data from waittimes.db (ironwolf_02 bind mount).
// All endpoints are read-only — writes are handled exclusively
// by wait-collector.js.
// ============================================================

const WT_DIR_API = fs.existsSync("/waittimes")
  ? "/waittimes"
  : path.join(__dirname, "waittimes-local");

const WT_DB_PATH_API = path.join(WT_DIR_API, "waittimes.db");

// Lazily open the wait times DB — it may not exist yet if the
// collector hasn't run. Return null if unavailable.
let wtDb = null;
function getWtDb() {
  if (wtDb) return wtDb;
  try {
    if (!fs.existsSync(WT_DB_PATH_API)) return null;
    wtDb = new Database(WT_DB_PATH_API, { readonly: true });
    return wtDb;
  } catch (e) {
    console.warn("[waittimes] Could not open waittimes.db:", e.message);
    return null;
  }
}

// GET /api/wait-times/latest
app.get("/api/wait-times/latest", (req, res) => {
  const wtdb = getWtDb();
  if (!wtdb) return res.json({ available: false, parks: [] });

  try {
    const rows = wtdb.prepare(`
      SELECT ps.*
      FROM park_summaries ps
      INNER JOIN (
        SELECT park_id, MAX(sampled_at) AS latest
        FROM park_summaries
        GROUP BY park_id
      ) newest ON ps.park_id = newest.park_id AND ps.sampled_at = newest.latest
      ORDER BY ps.park_name
    `).all();

    res.json({ available: true, parks: rows, fetched_at: new Date().toISOString() });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/wait-times/live/:parkId
app.get("/api/wait-times/live/:parkId", (req, res) => {
  const wtdb = getWtDb();
  if (!wtdb) return res.json({ available: false, attractions: [] });

  try {
    const latest = wtdb.prepare(`
      SELECT MAX(sampled_at) AS ts FROM wait_snapshots WHERE park_id = ?
    `).get(req.params.parkId);

    if (!latest?.ts) return res.json({ available: false, attractions: [] });

    const attractions = wtdb.prepare(`
      SELECT attraction_name, wait_minutes, status, queue_type
      FROM wait_snapshots
      WHERE park_id = ? AND sampled_at = ?
      ORDER BY
        CASE status WHEN 'OPERATING' THEN 0 WHEN 'DOWN' THEN 1 ELSE 2 END,
        wait_minutes DESC NULLS LAST
    `).all(req.params.parkId, latest.ts);

    res.json({
      available:  true,
      park_id:    req.params.parkId,
      sampled_at: latest.ts,
      attractions,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/wait-times/rides/:parkId
// Returns only actual rides/attractions (not restaurants, meet-and-greets, etc.)
// by joining wait_snapshots with attraction_metadata. Sorted by wait time ASC.
app.get("/api/wait-times/rides/:parkId", (req, res) => {
  const wtdb = getWtDb();
  if (!wtdb) return res.json({ available: false, rides: [] });

  try {
    // Find the most recent sample that has actual wait times (not null/closed)
    const latest = wtdb.prepare(`
      SELECT sampled_at AS ts FROM wait_snapshots
      WHERE park_id = ? AND status = 'OPERATING' AND wait_minutes IS NOT NULL
      ORDER BY sampled_at DESC LIMIT 1
    `).get(req.params.parkId);

    if (!latest?.ts) return res.json({ available: false, rides: [] });

    // Get all operating attractions from that sample
    const liveRows = wtdb.prepare(`
      SELECT attraction_name, wait_minutes, status, queue_type
      FROM wait_snapshots
      WHERE park_id = ? AND sampled_at = ? AND status = 'OPERATING' AND wait_minutes IS NOT NULL
    `).all(req.params.parkId, latest.ts);

    // Get metadata for this park (only entries with ride-like types)
    const metaRows = db.prepare(`
      SELECT attraction_name, type, intensity, indoor, height_req, lightning_lane
      FROM attraction_metadata
      WHERE park_id = ?
    `).all(req.params.parkId);

    const metaMap = {};
    metaRows.forEach(r => { metaMap[r.attraction_name.toLowerCase()] = r; });

    // Match live waits to metadata — only include actual rides/attractions
    const rides = [];
    for (const row of liveRows) {
      const cleanName = row.attraction_name.replace(/^["']|["']$/g, "").trim();
      const key = cleanName.toLowerCase();

      // Try exact match first, then fuzzy
      let meta = metaMap[key];
      if (!meta) {
        for (const [mk, mv] of Object.entries(metaMap)) {
          if (mk.includes(key) || key.includes(mk)) { meta = mv; break; }
        }
      }

      // Skip anything without metadata (restaurants, meet-and-greets, etc.)
      if (!meta) continue;

      rides.push({
        attraction_name: cleanName,
        wait_minutes:    row.wait_minutes,
        queue_type:      row.queue_type,
        type:            meta.type,
        intensity:       meta.intensity,
        indoor:          meta.indoor,
        height_req:      meta.height_req,
        lightning_lane:  meta.lightning_lane,
      });
    }

    // Sort by wait time ascending (shortest first)
    rides.sort((a, b) => a.wait_minutes - b.wait_minutes);

    res.json({
      available:  true,
      park_id:    req.params.parkId,
      sampled_at: latest.ts,
      rides,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/wait-times/trends/:parkId
app.get("/api/wait-times/trends/:parkId", (req, res) => {
  const wtdb = getWtDb();
  if (!wtdb) return res.json({ available: false, trend: [] });

  const date = req.query.date || new Date().toISOString().slice(0, 10);

  try {
    const trend = wtdb.prepare(`
      SELECT
        strftime('%H', sampled_at) AS hour,
        ROUND(AVG(wait_minutes), 1)   AS avg_wait,
        COUNT(DISTINCT attraction_name) AS ride_count,
        COUNT(*)                        AS sample_count
      FROM wait_snapshots
      WHERE park_id = ?
        AND date(sampled_at) = ?
        AND status = 'OPERATING'
        AND wait_minutes IS NOT NULL
        AND wait_minutes <= 180
      GROUP BY hour
      ORDER BY hour
    `).all(req.params.parkId, date);

    res.json({ available: true, park_id: req.params.parkId, date, trend });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/wait-times/compare
app.get("/api/wait-times/compare", (req, res) => {
  const wtdb = getWtDb();
  if (!wtdb) return res.json({ available: false, parks: [] });

  try {
    const now      = new Date();
    const today    = now.toISOString().slice(0, 10);
    const hourNow  = now.getUTCHours();
    const dowNow   = now.getUTCDay();

    const PARK_IDS = [
      "75ea578a-adc8-4116-a54d-dccb60765ef9",
      "47f90d2c-e191-4239-a466-5892ef59a88b",
      "288747d1-8b4f-4a64-867e-ea7c9b27bad8",
      "1c84a229-8862-4648-9c71-378ddd2c7693",
    ];

    // Find the latest sample timestamp to anchor "current" window
    const latestRow = wtdb.prepare(`
      SELECT MAX(sampled_at) AS latest FROM wait_snapshots
      WHERE status = 'OPERATING' AND wait_minutes IS NOT NULL
    `).get();
    const latestTs = latestRow?.latest;

    const results = PARK_IDS.map(parkId => {
      // Morning average: raw snapshots 8am–12pm today
      const morning = wtdb.prepare(`
        SELECT ROUND(AVG(wait_minutes), 1) AS avg
        FROM wait_snapshots
        WHERE park_id = ?
          AND date(sampled_at) = ?
          AND CAST(strftime('%H', sampled_at) AS INTEGER) BETWEEN 8 AND 12
          AND status = 'OPERATING'
          AND wait_minutes IS NOT NULL
          AND wait_minutes <= 180
      `).get(parkId, today);

      // Current average: raw snapshots from last 45 min (3 sample rounds)
      const current = wtdb.prepare(`
        SELECT ROUND(AVG(wait_minutes), 1) AS avg
        FROM wait_snapshots
        WHERE park_id = ?
          AND status = 'OPERATING'
          AND wait_minutes IS NOT NULL
          AND wait_minutes <= 180
          AND sampled_at >= datetime(?, '-45 minutes')
      `).get(parkId, latestTs || 'now');

      // Park name from most recent snapshot
      const nameRow = wtdb.prepare(`
        SELECT park_name FROM wait_snapshots
        WHERE park_id = ? ORDER BY sampled_at DESC LIMIT 1
      `).get(parkId);

      // Historical average: raw snapshots, same day-of-week, ±2 hours, past 30 days
      const historical = wtdb.prepare(`
        SELECT ROUND(AVG(wait_minutes), 1) AS avg
        FROM wait_snapshots
        WHERE park_id = ?
          AND date(sampled_at) < ?
          AND date(sampled_at) >= date(?, '-30 days')
          AND CAST(strftime('%w', sampled_at) AS INTEGER) = ?
          AND ABS(CAST(strftime('%H', sampled_at) AS INTEGER) - ?) <= 2
          AND status = 'OPERATING'
          AND wait_minutes IS NOT NULL
          AND wait_minutes <= 180
      `).get(parkId, today, today, dowNow, hourNow);

      const cur  = current?.avg  ?? null;
      const hist = historical?.avg ?? null;

      const crowd_score = (cur !== null && hist !== null && hist > 0)
        ? Math.round((cur / hist) * 100) / 100
        : null;

      return {
        park_id:        parkId,
        park_name:      nameRow?.park_name ?? "",
        morning_avg:    morning?.avg ?? null,
        current_avg:    cur,
        historical_avg: hist,
        crowd_score,
      };
    });

    res.json({ available: true, parks: results, as_of: now.toISOString() });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/wait-times/hop-ranking
app.get("/api/wait-times/hop-ranking", (req, res) => {
  const wtdb = getWtDb();
  if (!wtdb) return res.json({ available: false, ranking: [] });

  try {
    const now     = new Date();
    const today   = now.toISOString().slice(0, 10);
    const dowNow  = now.getUTCDay();
    const hourNow = now.getUTCHours();

    const PARKS_META = [
      { id: "75ea578a-adc8-4116-a54d-dccb60765ef9", name: "Magic Kingdom"     },
      { id: "47f90d2c-e191-4239-a466-5892ef59a88b", name: "EPCOT"             },
      { id: "288747d1-8b4f-4a64-867e-ea7c9b27bad8", name: "Hollywood Studios" },
      { id: "1c84a229-8862-4648-9c71-378ddd2c7693", name: "Animal Kingdom"    },
    ];

    // Find the latest sample timestamp to anchor "current" window
    const latestRow = wtdb.prepare(`
      SELECT MAX(sampled_at) AS latest FROM wait_snapshots
      WHERE status = 'OPERATING' AND wait_minutes IS NOT NULL
    `).get();
    const latestTs = latestRow?.latest;

    const ranked = PARKS_META.map(park => {
      // Current average: raw snapshots from last 45 min
      const recentAvg = wtdb.prepare(`
        SELECT ROUND(AVG(wait_minutes), 1) AS avg
        FROM wait_snapshots
        WHERE park_id = ?
          AND status = 'OPERATING'
          AND wait_minutes IS NOT NULL
          AND wait_minutes <= 180
          AND sampled_at >= datetime(?, '-45 minutes')
      `).get(park.id, latestTs || 'now');

      // Older average: snapshot from ~2 hours ago for trend detection
      const older = wtdb.prepare(`
        SELECT ROUND(AVG(wait_minutes), 1) AS avg_wait
        FROM wait_snapshots
        WHERE park_id = ?
          AND status = 'OPERATING'
          AND wait_minutes IS NOT NULL
          AND wait_minutes <= 180
          AND sampled_at BETWEEN datetime('now', '-150 minutes') AND datetime('now', '-90 minutes')
      `).get(park.id);

      // Historical average: raw snapshots, same day-of-week, ±2 hours, past 30 days
      const historical = wtdb.prepare(`
        SELECT ROUND(AVG(wait_minutes), 1) AS avg
        FROM wait_snapshots
        WHERE park_id = ?
          AND date(sampled_at) < ?
          AND date(sampled_at) >= date(?, '-30 days')
          AND CAST(strftime('%w', sampled_at) AS INTEGER) = ?
          AND ABS(CAST(strftime('%H', sampled_at) AS INTEGER) - ?) <= 2
          AND status = 'OPERATING'
          AND wait_minutes IS NOT NULL
          AND wait_minutes <= 180
      `).get(park.id, today, today, dowNow, hourNow);

      const current_avg = recentAvg?.avg !== null ? Math.round(recentAvg.avg) : null;

      const hist_avg    = historical?.avg ?? null;

      const crowd_score = (current_avg !== null && hist_avg !== null && hist_avg > 0)
        ? Math.round((current_avg / hist_avg) * 100) / 100
        : null;

      let trend = "stable";
      if (older?.avg_wait != null && current_avg !== null) {
        const delta = current_avg - older.avg_wait;
        if (delta > 8)       trend = "rising";
        else if (delta < -8) trend = "falling";
      }

      let verdict = "Normal crowds";
      if (crowd_score !== null) {
        if (crowd_score < 0.7)       verdict = "Very light — great time to visit";
        else if (crowd_score < 0.85) verdict = "Lighter than usual";
        else if (crowd_score < 1.15) verdict = "Normal crowds";
        else if (crowd_score < 1.35) verdict = "Busier than usual";
        else                         verdict = "Heavy crowds — consider another park";
      }

      return { park_id: park.id, park_name: park.name, current_avg, hist_avg, crowd_score, trend, verdict };
    });

    ranked.sort((a, b) => {
      if (a.current_avg === null) return 1;
      if (b.current_avg === null) return -1;
      return a.current_avg - b.current_avg;
    });

    ranked.forEach((p, i) => p.rank = i + 1);

    res.json({ available: true, ranking: ranked, as_of: now.toISOString() });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/wait-times/status — admin health/stats endpoint
// Returns collector health, data age, row counts, per-park today coverage.
// Helper: next :00/:15/:30/:45 boundary in Eastern Time
function nextSampleTimeET() {
  const nowET = new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));
  const minsToNext = 15 - (nowET.getMinutes() % 15);
  const next = new Date(nowET.getTime() + minsToNext * 60000);
  next.setSeconds(0, 0);
  return next.toLocaleTimeString("en-US", {
    timeZone: "America/New_York",
    hour: "numeric", minute: "2-digit", hour12: true,
  }) + " ET";
}

app.get("/api/wait-times/status", (req, res) => {
  const wtdb = getWtDb();
  if (!wtdb) return res.json({ available: false, next_sample_at: nextSampleTimeET() });

  try {
    // Oldest and newest summary rows
    const bounds = wtdb.prepare(`
      SELECT MIN(sampled_at) AS oldest, MAX(sampled_at) AS newest
      FROM park_summaries
    `).get();

    if (!bounds?.newest) return res.json({ available: false, next_sample_at: nextSampleTimeET() });

    // Minutes since last sample
    const minsAgo = bounds.newest
      ? (Date.now() - new Date(bounds.newest).getTime()) / 60000
      : null;

    // Total row counts
    const summaryCount  = wtdb.prepare("SELECT COUNT(*) AS n FROM park_summaries").get();
    const snapshotCount = wtdb.prepare("SELECT COUNT(*) AS n FROM wait_snapshots").get();

    // Days of history
    const daysHistory = bounds.oldest
      ? Math.round((Date.now() - new Date(bounds.oldest).getTime()) / (1000 * 60 * 60 * 24))
      : null;

    // Per-park: today's sample count + total sample count
    const todayET = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/New_York",
      year: "numeric", month: "2-digit", day: "2-digit",
    }).format(new Date());

    const PARK_IDS = [
      { id: "75ea578a-adc8-4116-a54d-dccb60765ef9", name: "Magic Kingdom"     },
      { id: "47f90d2c-e191-4239-a466-5892ef59a88b", name: "EPCOT"             },
      { id: "288747d1-8b4f-4a64-867e-ea7c9b27bad8", name: "Hollywood Studios" },
      { id: "1c84a229-8862-4648-9c71-378ddd2c7693", name: "Animal Kingdom"    },
    ];

    const parks = PARK_IDS.map(park => {
      const todaySamples = wtdb.prepare(`
        SELECT COUNT(*) AS n FROM park_summaries
        WHERE park_id = ? AND date(sampled_at) = ?
      `).get(park.id, todayET);

      const totalSamples = wtdb.prepare(`
        SELECT COUNT(*) AS n FROM park_summaries WHERE park_id = ?
      `).get(park.id);

      return {
        park_id:       park.id,
        park_name:     park.name,
        today_samples: todaySamples?.n ?? 0,
        total_samples: totalSamples?.n ?? 0,
      };
    });

    res.json({
      available:              true,
      oldest_sample:          bounds.oldest,
      last_sample_at:         bounds.newest,
      mins_since_last_sample: minsAgo !== null ? Math.round(minsAgo * 10) / 10 : null,
      total_summary_rows:     summaryCount?.n  ?? 0,
      total_snapshot_rows:    snapshotCount?.n ?? 0,
      days_of_history:        daysHistory,
      parks,
      next_sample_at:         nextSampleTimeET(),
      as_of:                  new Date().toISOString(),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});


// GET /api/wait-times/attractions/:parkId
// Returns all distinct attraction names for a park that have snapshot data.
// Used to populate the ride picker in the data viewer.
app.get("/api/wait-times/attractions/:parkId", (req, res) => {
  const wtdb = getWtDb();
  if (!wtdb) return res.json({ available: false, attractions: [] });

  try {
    const rows = wtdb.prepare(`
      SELECT DISTINCT attraction_name
      FROM wait_snapshots
      WHERE park_id = ?
        AND status = 'OPERATING'
      ORDER BY attraction_name
    `).all(req.params.parkId);

    res.json({ available: true, attractions: rows.map(r => r.attraction_name) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/wait-times/attraction-history/:parkId
// Query params: name (attraction name), from (YYYY-MM-DD), to (YYYY-MM-DD)
// Returns hourly avg wait per day for a specific attraction over a date range.
// Grouped by date + hour for charting.
app.get("/api/wait-times/attraction-history/:parkId", (req, res) => {
  const wtdb = getWtDb();
  if (!wtdb) return res.json({ available: false, data: [] });

  const { name, from, to } = req.query;
  if (!name) return res.status(400).json({ error: "name param required" });

  // Default to last 7 days if no range given
  const toDate   = to   || new Date().toISOString().slice(0, 10);
  const fromDate = from || (() => {
    const d = new Date(toDate);
    d.setDate(d.getDate() - 6);
    return d.toISOString().slice(0, 10);
  })();

  try {
    // Daily avg — one data point per day
    const daily = wtdb.prepare(`
      SELECT
        date(sampled_at)                      AS day,
        ROUND(AVG(wait_minutes), 1)           AS avg_wait,
        MIN(wait_minutes)                     AS min_wait,
        MAX(wait_minutes)                     AS max_wait,
        COUNT(*)                              AS sample_count
      FROM wait_snapshots
      WHERE park_id = ?
        AND LOWER(attraction_name) = LOWER(?)
        AND status = 'OPERATING'
        AND wait_minutes IS NOT NULL
        AND date(sampled_at) BETWEEN ? AND ?
      GROUP BY day
      ORDER BY day
    `).all(req.params.parkId, name, fromDate, toDate);

    // Hourly detail for a single day (if from == to, return intra-day breakdown)
    let hourly = [];
    if (fromDate === toDate) {
      hourly = wtdb.prepare(`
        SELECT
          strftime('%H', sampled_at)            AS hour,
          ROUND(AVG(wait_minutes), 1)           AS avg_wait,
          MIN(wait_minutes)                     AS min_wait,
          MAX(wait_minutes)                     AS max_wait,
          COUNT(*)                              AS sample_count
        FROM wait_snapshots
        WHERE park_id = ?
          AND LOWER(attraction_name) = LOWER(?)
          AND status = 'OPERATING'
          AND wait_minutes IS NOT NULL
          AND date(sampled_at) = ?
        GROUP BY hour
        ORDER BY hour
      `).all(req.params.parkId, name, fromDate);
    }

    res.json({
      available:   true,
      park_id:     req.params.parkId,
      attraction:  name,
      from:        fromDate,
      to:          toDate,
      is_single_day: fromDate === toDate,
      daily,
      hourly,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── USER PROFILE ROUTES ───────────────────────────────────

// GET /api/user-profile/:userId — get profile (birthdate, memberships, timeshare_name)
app.get("/api/user-profile/:userId", (req, res) => {
  const row = stmts.getUserProfile.get(req.params.userId);
  // Return empty defaults when no row exists yet — not a 404
  res.json(row || { user_id: req.params.userId, birthdate: "", memberships: "", timeshare_name: "" });
});

// PUT /api/user-profile/:userId — upsert profile fields
app.put("/api/user-profile/:userId", (req, res) => {
  const user = getUserFromToken(req);
  if (!user) return res.status(401).json({ error: "Not logged in" });
  if (user.id !== req.params.userId && user.role !== "admin") {
    return res.status(403).json({ error: "Forbidden" });
  }

  // Merge with existing row so partial PUTs don't wipe unrelated fields
  const existing = stmts.getUserProfile.get(req.params.userId) || {};
  const b = req.body;

  // Helper: pick body value if present, else fall back to existing DB value, else use default
  function pick(key, def = "") {
    return b[key] !== undefined ? b[key] : (existing[key] !== undefined ? existing[key] : def);
  }

  try {
    stmts.upsertUserProfile.run({
      user_id:        req.params.userId,
      birthdate:      pick("birthdate"),
      memberships:    pick("memberships"),
      timeshare_name: pick("timeshare_name"),
      party_adults:   pick("party_adults",   1),
      party_children: pick("party_children", 0),
      party_toddlers: pick("party_toddlers", 0),
      children_ages:  pick("children_ages",  "[]"),
      accessibility:  pick("accessibility"),
      dietary:        pick("dietary"),
      dining_style:   pick("dining_style"),
      thrill_level:   pick("thrill_level"),
      ride_avoid:     pick("ride_avoid"),
      ap_type:        pick("ap_type",    "none"),
      dvc_home:       pick("dvc_home"),
      budget_tier:    pick("budget_tier"),
      home_airport:   pick("home_airport"),
      trip_length:    pick("trip_length"),
      hotel_tier:     pick("hotel_tier"),
      pace_style:     pick("pace_style"),
    });
    res.json(stmts.getUserProfile.get(req.params.userId));
  } catch (err) {
    console.error("PUT /api/user-profile error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── FLIGHT ROUTES ─────────────────────────────────────────

// GET /api/trips/:tripId/flights — list flights for a trip (for current user)
app.get("/api/trips/:tripId/flights", (req, res) => {
  const user = getUserFromToken(req);
  if (!user) return res.status(401).json({ error: "Not logged in" });
  const rows = db.prepare(
    "SELECT * FROM flights WHERE trip_id = ? AND user_id = ? ORDER BY direction, departure_time"
  ).all(req.params.tripId, user.id);
  res.json(rows);
});

// POST /api/trips/:tripId/flights — add a flight
app.post("/api/trips/:tripId/flights", (req, res) => {
  const user = getUserFromToken(req);
  if (!user) return res.status(401).json({ error: "Not logged in" });
  const b = req.body;
  const flight = {
    id: `flight-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    trip_id: req.params.tripId,
    user_id: user.id,
    direction: b.direction || "outbound",
    airline: b.airline || "",
    flight_number: b.flight_number || "",
    confirmation: b.confirmation || "",
    departure_airport: b.departure_airport || "",
    arrival_airport: b.arrival_airport || "",
    departure_time: b.departure_time || "",
    arrival_time: b.arrival_time || "",
    seat: b.seat || "",
    notes: b.notes || "",
  };
  db.prepare(`
    INSERT INTO flights (id, trip_id, user_id, direction, airline, flight_number, confirmation, departure_airport, arrival_airport, departure_time, arrival_time, seat, notes)
    VALUES (@id, @trip_id, @user_id, @direction, @airline, @flight_number, @confirmation, @departure_airport, @arrival_airport, @departure_time, @arrival_time, @seat, @notes)
  `).run(flight);
  res.json(flight);
});

// PUT /api/flights/:id — update a flight
app.put("/api/flights/:id", (req, res) => {
  const user = getUserFromToken(req);
  if (!user) return res.status(401).json({ error: "Not logged in" });
  const existing = db.prepare("SELECT * FROM flights WHERE id = ? AND user_id = ?").get(req.params.id, user.id);
  if (!existing) return res.status(404).json({ error: "Flight not found" });
  const b = req.body;
  db.prepare(`
    UPDATE flights SET airline = ?, flight_number = ?, confirmation = ?, departure_airport = ?, arrival_airport = ?,
    departure_time = ?, arrival_time = ?, seat = ?, notes = ?, updated = datetime('now') WHERE id = ?
  `).run(b.airline ?? existing.airline, b.flight_number ?? existing.flight_number, b.confirmation ?? existing.confirmation,
    b.departure_airport ?? existing.departure_airport, b.arrival_airport ?? existing.arrival_airport,
    b.departure_time ?? existing.departure_time, b.arrival_time ?? existing.arrival_time,
    b.seat ?? existing.seat, b.notes ?? existing.notes, req.params.id);
  res.json(db.prepare("SELECT * FROM flights WHERE id = ?").get(req.params.id));
});

// DELETE /api/flights/:id — delete a flight
app.delete("/api/flights/:id", (req, res) => {
  const user = getUserFromToken(req);
  if (!user) return res.status(401).json({ error: "Not logged in" });
  const existing = db.prepare("SELECT * FROM flights WHERE id = ? AND user_id = ?").get(req.params.id, user.id);
  if (!existing) return res.status(404).json({ error: "Flight not found" });
  db.prepare("DELETE FROM flights WHERE id = ?").run(req.params.id);
  res.json({ ok: true });
});

// ── AVATAR ROUTES ─────────────────────────────────────────

const avatarUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, AVATARS_DIR),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname) || ".jpg";
      cb(null, `${req.params.userId}${ext}`);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, file.mimetype.startsWith("image/")),
});

// POST /api/users/:userId/avatar — upload avatar image
app.post("/api/users/:userId/avatar", avatarUpload.single("avatar"), (req, res) => {
  const user = getUserFromToken(req);
  if (!user) return res.status(401).json({ error: "Not logged in" });
  if (user.id !== req.params.userId && user.role !== "admin") {
    return res.status(403).json({ error: "Forbidden" });
  }
  if (!req.file) return res.status(400).json({ error: "No image uploaded" });

  // Remove any old avatar with a different extension
  try {
    const files = fs.readdirSync(AVATARS_DIR);
    for (const f of files) {
      if (f.startsWith(req.params.userId) && f !== req.file.filename) {
        fs.unlinkSync(path.join(AVATARS_DIR, f));
      }
    }
  } catch (e) { /* ok */ }

  // Save avatar filename to user record
  db.prepare("UPDATE users SET avatar = ? WHERE id = ?").run(req.file.filename, req.params.userId);
  res.json({ ok: true, filename: req.file.filename });
});

// GET /api/users/:userId/avatar — serve avatar image
app.get("/api/users/:userId/avatar", (req, res) => {
  const row = db.prepare("SELECT avatar FROM users WHERE id = ?").get(req.params.userId);
  if (!row?.avatar) return res.status(404).json({ error: "No avatar" });

  const filePath = path.join(AVATARS_DIR, row.avatar);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: "File not found" });

  res.sendFile(filePath);
});

// DELETE /api/users/:userId/avatar — remove avatar
app.delete("/api/users/:userId/avatar", (req, res) => {
  const user = getUserFromToken(req);
  if (!user) return res.status(401).json({ error: "Not logged in" });
  if (user.id !== req.params.userId && user.role !== "admin") {
    return res.status(403).json({ error: "Forbidden" });
  }

  const row = db.prepare("SELECT avatar FROM users WHERE id = ?").get(req.params.userId);
  if (row?.avatar) {
    try { fs.unlinkSync(path.join(AVATARS_DIR, row.avatar)); } catch (e) { /* ok */ }
    db.prepare("UPDATE users SET avatar = '' WHERE id = ?").run(req.params.userId);
  }
  res.json({ ok: true });
});

// ── FAVORITE RESTAURANTS ROUTES ───────────────────────────

// GET /api/favorite-restaurants/:userId
app.get("/api/favorite-restaurants/:userId", (req, res) => {
  res.json(stmts.getFavoriteRestaurants.all(req.params.userId));
});

// POST /api/favorite-restaurants
app.post("/api/favorite-restaurants", (req, res) => {
  const { user_id, restaurant_name, park, notes } = req.body;
  if (!user_id || !restaurant_name) {
    return res.status(400).json({ error: "user_id and restaurant_name required" });
  }
  try {
    stmts.insertFavoriteRestaurant.run({
      id:              `favr-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      user_id:         user_id,
      restaurant_name: restaurant_name,
      park:            park  || "",
      notes:           notes || "",
    });
    res.json(stmts.getFavoriteRestaurants.all(user_id));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// DELETE /api/favorite-restaurants/:id
app.delete("/api/favorite-restaurants/:id", (req, res) => {
  stmts.deleteFavoriteRestaurant.run(req.params.id);
  res.json({ ok: true });
});

// ── FAVORITE RESORTS ROUTES ───────────────────────────────

// GET /api/favorite-resorts/:userId
app.get("/api/favorite-resorts/:userId", (req, res) => {
  res.json(stmts.getFavoriteResorts.all(req.params.userId));
});

// POST /api/favorite-resorts
app.post("/api/favorite-resorts", (req, res) => {
  const { user_id, resort_name, resort_type, notes } = req.body;
  if (!user_id || !resort_name) {
    return res.status(400).json({ error: "user_id and resort_name required" });
  }
  try {
    stmts.insertFavoriteResort.run({
      id:          `favrs-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      user_id:     user_id,
      resort_name: resort_name,
      resort_type: resort_type || "disney",
      notes:       notes || "",
    });
    res.json(stmts.getFavoriteResorts.all(user_id));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// DELETE /api/favorite-resorts/:id
app.delete("/api/favorite-resorts/:id", (req, res) => {
  stmts.deleteFavoriteResort.run(req.params.id);
  res.json({ ok: true });
});

// ── RIDE PROFILE ROUTES ──────────────────────────────────────

// GET /api/my/ride-profile
app.get("/api/my/ride-profile", (req, res) => {
  const user = getUserFromToken(req);
  if (!user) return res.status(401).json({ error: "Not logged in" });
  const row = stmts.getRideProfile.get(user.id) || {
    user_id: user.id, drops: 3, has_young_kids: 0, prefer_indoor: 0, ride_or_show: "both",
  };
  res.json(row);
});

// PUT /api/my/ride-profile
app.put("/api/my/ride-profile", (req, res) => {
  const user = getUserFromToken(req);
  if (!user) return res.status(401).json({ error: "Not logged in" });
  const { drops, has_young_kids, prefer_indoor, ride_or_show } = req.body;
  try {
    stmts.upsertRideProfile.run({
      user_id:        user.id,
      drops:          drops          ?? 3,
      has_young_kids: has_young_kids ?? 0,
      prefer_indoor:  prefer_indoor  ?? 0,
      ride_or_show:   ride_or_show   ?? "both",
    });
    res.json(stmts.getRideProfile.get(user.id));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── RECOMMENDATIONS ROUTES ────────────────────────────────────

// GET /api/recommendations/:parkId
// Scores + ranks rides for the given park for the current user.
// Pulls cached quips from recommendation_cache if fresh (<20 min).
app.get("/api/recommendations/:parkId", (req, res) => {
  const user = getUserFromToken(req);
  if (!user) return res.status(401).json({ error: "Not logged in" });

  const { parkId } = req.params;
  const userLat = req.query.lat ? parseFloat(req.query.lat) : null;
  const userLng = req.query.lng ? parseFloat(req.query.lng) : null;

  const wtdb = getWtDb();
  if (!wtdb) return res.json({ available: false, rides: [] });

  try {
    const rides = scoreRides(user.id, parkId, userLat, userLng, db, wtdb);
    res.json({
      available: true,
      park_id:   parkId,
      as_of:     new Date().toISOString(),
      rides,
    });
  } catch (err) {
    console.error("[recommendations] score error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Start server ───────────────────────────────────────────

app.listen(PORT, "0.0.0.0", () => {
  console.log(`✨ Disney API server running on http://0.0.0.0:${PORT}`);
  console.log(`📁 Database: ${DB_PATH}`);
});

// ══════════════════════════════════════════════════════════════
// RECOMMENDATION CACHE BACKGROUND JOB
// Runs every 15 minutes. Scores all 4 parks, generates quips
// for top-5 rides via Ollama, caches to recommendation_cache.
// ══════════════════════════════════════════════════════════════

const RECOMMENDATION_PARKS = [
  "75ea578a-adc8-4116-a54d-dccb60765ef9", // Magic Kingdom
  "47f90d2c-e191-4239-a466-5892ef59a88b", // EPCOT
  "288747d1-8b4f-4a64-867e-ea7c9b27bad8", // Hollywood Studios
  "1c84a229-8862-4648-9c71-378ddd2c7693", // Animal Kingdom
];

async function generateQuipsForRide(ride) {
  const context = {
    ride:           ride.attraction_name,
    live_wait:      ride.live_wait,
    hist_avg_now:   ride.hist_avg,
    wait_delta:     ride.wait_delta,
    intensity:      ride.intensity,
    type:           ride.type,
    indoor:         ride.indoor === 1,
    height_req:     ride.height_req,
    lightning_lane: ride.lightning_lane,
    is_favorite:    ride.is_favorite,
    description:    ride.description,
  };

  const prompt = `You are a cheerful Disney cast member giving a guest a quick tip about a ride.
Given this ride data: ${JSON.stringify(context)}

Write exactly 3 short punchy reasons to ride it RIGHT NOW.
Rules:
- Max 8 words each
- Warm, fun, Disney cast member tone
- Reference specific data (wait time, indoors, etc.)
- No punctuation at the end of each line
- Return ONLY a JSON array of 3 strings. No other text, no markdown backticks.

Example output: ["Only a 12 minute wait right now","Great break from the Florida heat","Your favorite ride is basically a walk-on"]`;

  try {
    const resp = await fetch(`${OLLAMA_URL}/api/generate`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model:  OLLAMA_MODEL,
        prompt: prompt,
        stream: false,
        options: { temperature: 0.7, num_predict: 120 },
      }),
      signal: AbortSignal.timeout(30000),
    });

    if (!resp.ok) throw new Error(`Ollama HTTP ${resp.status}`);

    const data    = await resp.json();
    const raw     = (data.response || "").trim();
    const match   = raw.match(/\[[\s\S]*?\]/);
    if (!match) throw new Error("No JSON array found in response");
    const cleaned = match[0].replace(/```json|```/g, "").trim();
    const quips   = JSON.parse(cleaned);
    if (!Array.isArray(quips)) throw new Error("Response not an array");
    return quips.slice(0, 5).map(q => String(q).slice(0, 80));

  } catch (err) {
    console.warn(`[recs] Ollama quip failed for "${ride.attraction_name}": ${err.message}`);
    return _buildFallbackQuips(ride);
  }
}

function _buildFallbackQuips(ride) {
  const quips = [];
  const delta    = ride.wait_delta;
  const wait     = ride.live_wait;
  const name     = ride.attraction_name || "this one";

  // ── Line 1: wait-time hook ────────────────────────────────
  if (delta >= 30)          quips.push(`${delta} min shorter than usual — rare window`);
  else if (delta >= 15)     quips.push(`Wait is ${delta} min below average right now`);
  else if (delta > 0)       quips.push(`Shorter than normal — good time to go`);
  else if (wait !== null && wait <= 10)  quips.push(`${wait} min wait — practically a walk-on`);
  else if (wait !== null && wait <= 20)  quips.push(`Only ${wait} minutes — well worth it`);
  else if (wait !== null && wait <= 40)  quips.push(`${wait} min wait — about average for this one`);
  else if (wait !== null)   quips.push(`Long line but one of the park's best`);
  else                      quips.push(`One of the top picks in this park`);

  // ── Line 2: ride character / context ─────────────────────
  if (ride.is_favorite)                             quips.push(`A personal favorite — you rated it highly`);
  else if (ride.lightning_lane === "individual")    quips.push(`Skips the LL line — saves you real money`);
  else if (ride.lightning_lane === "standard")      quips.push(`Grab a Lightning Lane if the line climbs`);
  else if (ride.intensity === "extreme")            quips.push(`The park's biggest thrill — don't leave without it`);
  else if (ride.intensity === "high")               quips.push(`High energy — great for the whole crew`);
  else if (ride.type === "dark")                    quips.push(`Classic dark ride — a Disney staple`);
  else if (ride.type === "family")                  quips.push(`Everyone in the group can ride this one`);
  else if (ride.type === "show")                    quips.push(`Great chance to sit down and recharge`);
  else                                              quips.push(`A crowd favorite in this area of the park`);

  // ── Line 3: environment / timing tip ─────────────────────
  if (ride.indoor === 1 && ride.prefer_indoor)      quips.push(`Air-conditioned — perfect break from the heat`);
  else if (ride.indoor === 1)                       quips.push(`Fully indoors — cool and comfortable`);
  else if (ride.height_req && ride.height_req >= 48) quips.push(`Height req: ${ride.height_req}" — thrill seekers only`);
  else if (ride.height_req && ride.height_req >= 40) quips.push(`${ride.height_req}" height req — most of the crew qualifies`);
  else if (delta < 0 && Math.abs(delta) >= 10)     quips.push(`Busier than usual — go early or late in the day`);
  else                                              quips.push(`Scores well for this time of day`);

  return quips.slice(0, 3);
}

async function runRecommendationJob() {
  console.log("[recs] Starting recommendation cache update...");
  const wtdb = getWtDb();
  if (!wtdb) {
    console.log("[recs] waittimes DB not available — skipping");
    return;
  }

  for (const parkId of RECOMMENDATION_PARKS) {
    try {
      const adminUser = db.prepare("SELECT id FROM users WHERE role = 'admin' LIMIT 1").get();
      const userId    = adminUser?.id || "user-admin-001";

      const rides = scoreRides(userId, parkId, null, null, db, wtdb);
      if (rides.length === 0) continue;

      stmts.clearRecommendationCache.run(parkId);

      const top5 = rides.slice(0, 5);
      for (const ride of top5) {
        const quips = await generateQuipsForRide(ride);
        stmts.upsertRecommendationCache.run({
          park_id:         parkId,
          attraction_name: ride.attraction_name,
          quips:           JSON.stringify(quips),
          context_blob:    JSON.stringify({ live_wait: ride.live_wait, hist_avg: ride.hist_avg }),
        });
        console.log(`[recs] ✓ ${ride.attraction_name} (score: ${ride.total_score})`);
      }
    } catch (err) {
      console.error(`[recs] Park ${parkId} failed: ${err.message}`);
    }
  }
  console.log("[recs] Cache update complete.");
}

// Delay 15s on startup (let DB settle), then every 15 min
setTimeout(() => {
  runRecommendationJob().catch(e => console.error("[recs] startup job error:", e.message));
}, 15000);
setInterval(() => {
  runRecommendationJob().catch(e => console.error("[recs] interval job error:", e.message));
}, 15 * 60 * 1000);