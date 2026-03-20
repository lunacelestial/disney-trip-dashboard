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

const app = express();
const PORT = 3001;

// ── Storage Setup ─────────────────────────────────────────
// In Docker, /storage is a bind mount to motherbrain's NAS.
// Outside Docker, fall back to a local ./storage folder.
const fs = require("fs");
const STORAGE_ROOT = fs.existsSync("/storage") ? "/storage" : path.join(__dirname, "storage");
const PHOTOS_DIR = path.join(STORAGE_ROOT, "photos");
const WISHLIST_DIR = path.join(STORAGE_ROOT, "wishlist");
const VENUES_DIR = path.join(STORAGE_ROOT, "venues");

// Ensure directories exist
fs.mkdirSync(PHOTOS_DIR, { recursive: true });
fs.mkdirSync(WISHLIST_DIR, { recursive: true });
fs.mkdirSync(VENUES_DIR, { recursive: true });

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
`);

// Migrations
try { db.exec("ALTER TABLE activities ADD COLUMN url TEXT DEFAULT ''"); } catch (e) { }
try { db.exec("ALTER TABLE transactions ADD COLUMN trip_id TEXT DEFAULT ''"); } catch (e) { }
try { db.exec("ALTER TABLE transactions ADD COLUMN user_id TEXT DEFAULT ''"); } catch (e) { }
try { db.exec("ALTER TABLE user_budgets ADD COLUMN confirmed INTEGER NOT NULL DEFAULT 0"); } catch (e) { }
// Wishlist migrations — add new fields for rich wish cards
try { db.exec("ALTER TABLE wishlist ADD COLUMN description TEXT DEFAULT ''"); } catch (e) { }
try { db.exec("ALTER TABLE wishlist ADD COLUMN url TEXT DEFAULT ''"); } catch (e) { }
try { db.exec("ALTER TABLE wishlist ADD COLUMN image TEXT DEFAULT ''"); } catch (e) { }
try { db.exec("ALTER TABLE wishlist ADD COLUMN added_by TEXT DEFAULT ''"); } catch (e) { }
try { db.exec("ALTER TABLE wishlist ADD COLUMN added_by_name TEXT DEFAULT ''"); } catch (e) { }

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
      const ub = stmts.getUserBudget.get(tb.trip_id, user.id);
      if (ub) {
        myBudget = ub;
        myTotal = ub.hotel + ub.food + ub.extras + ub.souvenirs;
      }
      const myTx = stmts.getTransactionsByTripAndUser.all(tb.trip_id, user.id);
      mySpent = myTx.reduce((s, t) => s + t.amount, 0);
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
    SELECT u.id, u.email, u.name, u.role FROM sessions s
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

// ── USER BUDGET ROUTES ────────────────────────────────────

app.get("/api/trips/:tripId/my-budget", (req, res) => {
  const user = getUserFromToken(req);
  if (!user) return res.status(401).json({ error: "Not logged in" });

  const ub = stmts.getUserBudget.get(req.params.tripId, user.id);
  const myTx = stmts.getTransactionsByTripAndUser.all(req.params.tripId, user.id);
  const mySpent = myTx.reduce((s, t) => s + t.amount, 0);
  const contributions = stmts.getContributionsByTripAndUser.all(req.params.tripId, user.id);
  const totalContributed = contributions.reduce((s, c) => s + c.amount, 0);

  if (!ub) {
    return res.json({
      trip_id: req.params.tripId,
      user_id: user.id,
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
    exists: true,
  });
});

app.put("/api/trips/:tripId/my-budget", (req, res) => {
  const user = getUserFromToken(req);
  if (!user) return res.status(401).json({ error: "Not logged in" });

  const { hotel, food, extras, souvenirs } = req.body;
  stmts.upsertUserBudget.run({
    trip_id:    req.params.tripId,
    user_id:    user.id,
    hotel:      hotel || 0,
    food:       food || 0,
    extras:     extras || 0,
    souvenirs:  souvenirs || 0,
  });

  const ub = stmts.getUserBudget.get(req.params.tripId, user.id);
  const myTx = stmts.getTransactionsByTripAndUser.all(req.params.tripId, user.id);
  const mySpent = myTx.reduce((s, t) => s + t.amount, 0);
  const total = ub.hotel + ub.food + ub.extras + ub.souvenirs;
  res.json({ ...ub, total, spent: mySpent, transactions: myTx, exists: true });
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

// GET /api/wait-times/trends/:parkId
app.get("/api/wait-times/trends/:parkId", (req, res) => {
  const wtdb = getWtDb();
  if (!wtdb) return res.json({ available: false, trend: [] });

  const date = req.query.date || new Date().toISOString().slice(0, 10);

  try {
    const trend = wtdb.prepare(`
      SELECT
        strftime('%H', sampled_at) AS hour,
        ROUND(AVG(avg_wait), 1)    AS avg_wait,
        ROUND(AVG(median_wait), 1) AS median_wait,
        COUNT(*)                   AS sample_count
      FROM park_summaries
      WHERE park_id = ?
        AND date(sampled_at) = ?
        AND avg_wait IS NOT NULL
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

    const results = PARK_IDS.map(parkId => {
      const morning = wtdb.prepare(`
        SELECT ROUND(AVG(avg_wait), 1) AS avg
        FROM park_summaries
        WHERE park_id = ?
          AND date(sampled_at) = ?
          AND CAST(strftime('%H', sampled_at) AS INTEGER) BETWEEN 8 AND 12
          AND avg_wait IS NOT NULL
      `).get(parkId, today);

      const current = wtdb.prepare(`
        SELECT ROUND(AVG(avg_wait), 1) AS avg, park_name
        FROM park_summaries
        WHERE park_id = ?
          AND avg_wait IS NOT NULL
        ORDER BY sampled_at DESC
        LIMIT 3
      `).get(parkId);

      const historical = wtdb.prepare(`
        SELECT ROUND(AVG(avg_wait), 1) AS avg
        FROM park_summaries
        WHERE park_id = ?
          AND date(sampled_at) < ?
          AND date(sampled_at) >= date(?, '-30 days')
          AND CAST(strftime('%w', sampled_at) AS INTEGER) = ?
          AND ABS(CAST(strftime('%H', sampled_at) AS INTEGER) - ?) <= 2
          AND avg_wait IS NOT NULL
      `).get(parkId, today, today, dowNow, hourNow);

      const cur  = current?.avg  ?? null;
      const hist = historical?.avg ?? null;

      const crowd_score = (cur !== null && hist !== null && hist > 0)
        ? Math.round((cur / hist) * 100) / 100
        : null;

      return {
        park_id:        parkId,
        park_name:      current?.park_name ?? "",
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

    const ranked = PARKS_META.map(park => {
      const recent = wtdb.prepare(`
        SELECT avg_wait, sampled_at FROM park_summaries
        WHERE park_id = ? AND avg_wait IS NOT NULL
        ORDER BY sampled_at DESC LIMIT 3
      `).all(park.id);

      const older = wtdb.prepare(`
        SELECT avg_wait FROM park_summaries
        WHERE park_id = ?
          AND avg_wait IS NOT NULL
          AND sampled_at <= datetime('now', '-2 hours')
        ORDER BY sampled_at DESC LIMIT 1
      `).get(park.id);

      const historical = wtdb.prepare(`
        SELECT ROUND(AVG(avg_wait), 1) AS avg
        FROM park_summaries
        WHERE park_id = ?
          AND date(sampled_at) < ?
          AND date(sampled_at) >= date(?, '-30 days')
          AND CAST(strftime('%w', sampled_at) AS INTEGER) = ?
          AND ABS(CAST(strftime('%H', sampled_at) AS INTEGER) - ?) <= 2
          AND avg_wait IS NOT NULL
      `).get(park.id, today, today, dowNow, hourNow);

      const current_avg = recent.length
        ? Math.round(recent.reduce((s, r) => s + r.avg_wait, 0) / recent.length)
        : null;

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

// ── Start server ───────────────────────────────────────────

app.listen(PORT, "0.0.0.0", () => {
  console.log(`✨ Disney API server running on http://0.0.0.0:${PORT}`);
  console.log(`📁 Database: ${DB_PATH}`);
});