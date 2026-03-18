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
// Deletes: activities (by date range), parkdays, budget, transactions, members, photos (DB + files)
// Works even if no trip_budgets entry exists — parses dates from the trip ID (trip-YYYY-MM-DD-YYYY-MM-DD)
app.delete("/api/trips/:tripId/cancel", (req, res) => {
  const tripId = req.params.tripId;

  // Try to get date range from trip_budgets first
  const trip = stmts.getTripBudget.get(tripId);
  let start_date, end_date;

  if (trip) {
    start_date = trip.start_date;
    end_date = trip.end_date;
  } else {
    // Fallback: parse dates from the trip ID format "trip-YYYY-MM-DD-YYYY-MM-DD"
    const match = tripId.match(/^trip-(\d{4}-\d{2}-\d{2})-(\d{4}-\d{2}-\d{2})$/);
    if (match) {
      start_date = match[1];
      end_date = match[2];
    } else {
      return res.status(404).json({ error: "Trip not found and could not parse dates from trip ID" });
    }
  }

  const cancelTrip = db.transaction(() => {
    // 1. Delete activities in the date range
    db.prepare("DELETE FROM activities WHERE date >= ? AND date <= ?").run(start_date, end_date);

    // 2. Delete park day assignments in the date range
    db.prepare("DELETE FROM parkdays WHERE date >= ? AND date <= ?").run(start_date, end_date);

    // 3. Find all trip_budgets rows that overlap this date range (catches mismatched trip_ids)
    //    This handles the case where history.html constructs a tripId from activity dates
    //    but the stored trip_budgets row has a different trip_id (e.g. from the planner wizard).
    const overlappingBudgets = db.prepare(
      "SELECT trip_id FROM trip_budgets WHERE start_date <= ? AND end_date >= ?"
    ).all(end_date, start_date);

    const allRelatedTripIds = new Set([tripId, ...overlappingBudgets.map(b => b.trip_id)]);

    // 4. Delete transactions for all related trip IDs
    for (const tid of allRelatedTripIds) {
      db.prepare("DELETE FROM transactions WHERE trip_id = ?").run(tid);
    }

    // 5. Delete trip members for all related trip IDs
    for (const tid of allRelatedTripIds) {
      db.prepare("DELETE FROM trip_members WHERE trip_id = ?").run(tid);
    }

    // 6. Delete photos from DB (and try to clean up files) for all related trip IDs
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

    // 7. Delete all matching trip_budgets rows (by ID and by date range)
    for (const tid of allRelatedTripIds) {
      stmts.deleteTripBudget.run(tid);
    }

    // 8. Delete user_budgets for all related trip IDs
    for (const tid of allRelatedTripIds) {
      db.prepare("DELETE FROM user_budgets WHERE trip_id = ?").run(tid);
    }

    // 9. Delete trip acknowledgments for all related trip IDs
    for (const tid of allRelatedTripIds) {
      db.prepare("DELETE FROM trip_acknowledged WHERE trip_id = ?").run(tid);
    }

    // 10. Delete budget contributions for all related trip IDs
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

// GET /api/parkdays — list all
app.get("/api/parkdays", (req, res) => {
  res.json(stmts.getAllParkDays.all());
});

// GET /api/parkdays/:date — get one
app.get("/api/parkdays/:date", (req, res) => {
  const row = stmts.getParkDay.get(req.params.date);
  if (!row) return res.status(404).json({ error: "Not found" });
  res.json(row);
});

// POST /api/parkdays — set one or many (upsert)
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

// DELETE /api/parkdays/:date — remove one
app.delete("/api/parkdays/:date", (req, res) => {
  stmts.deleteParkDay.run(req.params.date);
  res.json({ ok: true });
});

// ── VENUES ROUTES ──────────────────────────────────────────

// GET /api/venues — list all (sorted by most used)
app.get("/api/venues", (req, res) => {
  const q = req.query.q;
  if (q) {
    res.json(stmts.searchVenues.all(`%${q}%`));
  } else {
    res.json(stmts.getAllVenues.all());
  }
});

// POST /api/venues — upsert a venue (create or update if name exists)
// If user is admin, applies directly. Otherwise creates a pending change.
app.post("/api/venues", (req, res) => {
  const { name, location, url, type } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: "Name required" });

  try {
    // Check if caller is admin
    const token = (req.headers.authorization || "").replace("Bearer ", "");
    const session = token ? db.prepare("SELECT s.*, u.role FROM sessions s JOIN users u ON s.user_id = u.id WHERE s.token = ?").get(token) : null;
    const isAdmin = session && session.role === "admin";

    const existing = stmts.getVenueByName.get(name.trim());

    if (isAdmin) {
      // Admin: apply directly
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
      // Non-admin: create pending change
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

      // Still return current venues for autocomplete to work
      res.json(stmts.getAllVenues.all());
    }
  } catch (err) {
    console.error("POST /api/venues error:", err.message);
    res.status(400).json({ error: err.message });
  }
});

// DELETE /api/venues/:id
app.delete("/api/venues/:id", (req, res) => {
  stmts.deleteVenue.run(req.params.id);
  res.json({ ok: true });
});

// ── AUTH ROUTES ────────────────────────────────────────────

// POST /api/auth/login — email-based login
app.post("/api/auth/login", (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: "Email required" });

  const user = db.prepare("SELECT * FROM users WHERE LOWER(email) = LOWER(?)").get(email.trim());
  if (!user) return res.status(401).json({ error: "Email not authorized" });

  // Create session token
  const token = `session-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  db.prepare("INSERT INTO sessions (token, user_id) VALUES (?, ?)").run(token, user.id);

  res.json({
    token,
    user: { id: user.id, email: user.email, name: user.name, role: user.role },
  });
});

// GET /api/auth/me — get current user from token
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

// POST /api/auth/logout
app.post("/api/auth/logout", (req, res) => {
  const token = (req.headers.authorization || "").replace("Bearer ", "");
  if (token) db.prepare("DELETE FROM sessions WHERE token = ?").run(token);
  res.json({ ok: true });
});

// GET /api/users — public list of users (for trip member assignment)
app.get("/api/users", (req, res) => {
  res.json(db.prepare("SELECT id, name, email, role FROM users ORDER BY name").all());
});

// ── ADMIN ROUTES ───────────────────────────────────────────

// Middleware: require admin
function requireAdmin(req, res, next) {
  const token = (req.headers.authorization || "").replace("Bearer ", "");
  if (!token) return res.status(401).json({ error: "Not logged in" });

  const row = db.prepare(`
    SELECT u.role FROM sessions s JOIN users u ON s.user_id = u.id WHERE s.token = ?
  `).get(token);

  if (!row || row.role !== "admin") return res.status(403).json({ error: "Admin required" });
  next();
}

// GET /api/admin/users — list all users
app.get("/api/admin/users", requireAdmin, (req, res) => {
  res.json(db.prepare("SELECT id, email, name, role, created FROM users ORDER BY created").all());
});

// POST /api/admin/users — add a user
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

// DELETE /api/admin/users/:id
app.delete("/api/admin/users/:id", requireAdmin, (req, res) => {
  db.prepare("DELETE FROM users WHERE id = ?").run(req.params.id);
  db.prepare("DELETE FROM sessions WHERE user_id = ?").run(req.params.id);
  res.json(db.prepare("SELECT id, email, name, role, created FROM users ORDER BY created").all());
});

// GET /api/admin/pending — list pending venue changes
app.get("/api/admin/pending", requireAdmin, (req, res) => {
  res.json(db.prepare("SELECT * FROM pending_venues WHERE status = 'pending' ORDER BY created DESC").all());
});

// POST /api/admin/pending/:id/approve — approve a pending change
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

// POST /api/admin/pending/:id/reject
app.post("/api/admin/pending/:id/reject", requireAdmin, (req, res) => {
  db.prepare("UPDATE pending_venues SET status = 'rejected' WHERE id = ?").run(req.params.id);
  res.json(db.prepare("SELECT * FROM pending_venues WHERE status = 'pending' ORDER BY created DESC").all());
});

// GET /api/admin/venues — full venue management
app.get("/api/admin/venues", requireAdmin, (req, res) => {
  res.json(stmts.getAllVenues.all());
});

// PUT /api/admin/venues/:id — edit a venue directly
app.put("/api/admin/venues/:id", requireAdmin, (req, res) => {
  const { name, location, url, type, park, land, description, avg_wait, image_url, tags } = req.body;
  db.prepare(`UPDATE venues SET name=?, location=?, url=?, type=?, park=?, land=?, description=?, avg_wait=?, image_url=?, tags=?, updated=datetime('now') WHERE id=?`).run(
    name, location||"", url||"", type||"", park||"", land||"", description||"", avg_wait||0, image_url||"", tags||"", req.params.id
  );
  res.json(stmts.getAllVenues.all());
});

// POST /api/admin/venues — create a single new venue
app.post("/api/admin/venues", requireAdmin, (req, res) => {
  const { name, location, url, type, park, land, description, avg_wait, image_url, tags } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: "Name is required" });
  const id = `venue-${Date.now()}-${Math.random().toString(36).slice(2,6)}`;
  db.prepare(`INSERT INTO venues (id,name,location,url,type,park,land,description,avg_wait,image_url,tags) VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(
    id, name.trim(), location||"", url||"", type||"", park||"", land||"", description||"", avg_wait||0, image_url||"", tags||""
  );
  res.json({ id, name: name.trim() });
});

// DELETE /api/admin/venues/:id — delete a single venue
app.delete("/api/admin/venues/:id", requireAdmin, (req, res) => {
  db.prepare("DELETE FROM venues WHERE id = ?").run(req.params.id);
  res.json({ ok: true });
});

// POST /api/admin/venues/seed — bulk seed venues
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

// GET /api/trips/:tripId/members — list members of a trip
app.get("/api/trips/:tripId/members", (req, res) => {
  res.json(stmts.getTripMembers.all(req.params.tripId));
});

// POST /api/trips/:tripId/members — add a member to a trip
app.post("/api/trips/:tripId/members", (req, res) => {
  const { user_id } = req.body;
  if (!user_id) return res.status(400).json({ error: "user_id required" });
  stmts.addTripMember.run(req.params.tripId, user_id);

  // Auto-acknowledge if the person adding is also the person being added
  // (they already know about the trip — no splash needed)
  const currentUser = getUserFromToken(req);
  if (currentUser && currentUser.id === user_id) {
    stmts.acknowledgTrip.run(req.params.tripId, user_id);
  }

  res.json(stmts.getTripMembers.all(req.params.tripId));
});

// DELETE /api/trips/:tripId/members/:userId — remove a member
app.delete("/api/trips/:tripId/members/:userId", (req, res) => {
  stmts.removeTripMember.run(req.params.tripId, req.params.userId);
  res.json(stmts.getTripMembers.all(req.params.tripId));
});

// GET /api/users/:userId/trips — get trips a user is assigned to
app.get("/api/users/:userId/trips", (req, res) => {
  res.json(stmts.getUserTrips.all(req.params.userId));
});

// ── USER BUDGET ROUTES (per-user, per-trip) ──────────────────

// GET /api/trips/:tripId/my-budget — get current user's personal budget
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

// PUT /api/trips/:tripId/my-budget — set/update current user's personal budget
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

// GET /api/trips/:tripId/budgets — admin/group view: all users' budgets for a trip
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

// ── TRIP ACKNOWLEDGMENT ROUTES ───────────────────────────────

// GET /api/my/unacknowledged-trips — trips the current user hasn't seen yet
app.get("/api/my/unacknowledged-trips", (req, res) => {
  const user = getUserFromToken(req);
  if (!user) return res.status(401).json({ error: "Not logged in" });
  res.json(stmts.getUnacknowledgedTrips.all(user.id));
});

// POST /api/trips/:tripId/acknowledge — mark a trip as seen by current user
app.post("/api/trips/:tripId/acknowledge", (req, res) => {
  const user = getUserFromToken(req);
  if (!user) return res.status(401).json({ error: "Not logged in" });
  stmts.acknowledgTrip.run(req.params.tripId, user.id);
  res.json({ ok: true });
});

// ── BUDGET CONTRIBUTION ROUTES ───────────────────────────────

// GET /api/trips/:tripId/my-contributions — list current user's contributions
app.get("/api/trips/:tripId/my-contributions", (req, res) => {
  const user = getUserFromToken(req);
  if (!user) return res.status(401).json({ error: "Not logged in" });
  const contributions = stmts.getContributionsByTripAndUser.all(req.params.tripId, user.id);
  const totalContributed = contributions.reduce((s, c) => s + c.amount, 0);
  res.json({ contributions, totalContributed });
});

// POST /api/trips/:tripId/contributions — add a contribution
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

// DELETE /api/contributions/:id — remove a contribution
app.delete("/api/contributions/:id", (req, res) => {
  stmts.deleteContribution.run(req.params.id);
  res.json({ ok: true });
});

// POST /api/trips/:tripId/confirm-budget — lock in budget for spending mode
app.post("/api/trips/:tripId/confirm-budget", (req, res) => {
  const user = getUserFromToken(req);
  if (!user) return res.status(401).json({ error: "Not logged in" });

  stmts.confirmUserBudget.run(req.params.tripId, user.id);

  const ub = stmts.getUserBudget.get(req.params.tripId, user.id);
  res.json({ ok: true, confirmed: true, budget: ub });
});

// ── PHOTO ROUTES ──────────────────────────────────────────

// Configure multer for photo uploads
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
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB max
  fileFilter: (req, file, cb) => {
    const allowed = /^image\/(jpeg|jpg|png|gif|webp|heic|heif)$/i;
    cb(null, allowed.test(file.mimetype));
  },
});

// Configure multer for wishlist image uploads
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
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max
  fileFilter: (req, file, cb) => {
    const allowed = /^image\/(jpeg|jpg|png|gif|webp|heic|heif)$/i;
    cb(null, allowed.test(file.mimetype));
  },
});

// GET /api/trips/:tripId/photos — list photos for a trip
app.get("/api/trips/:tripId/photos", (req, res) => {
  res.json(stmts.getPhotosByTrip.all(req.params.tripId));
});

// POST /api/trips/:tripId/photos — upload photos to a trip
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

// GET /api/photos/:id/file — serve the actual image file
app.get("/api/photos/:id/file", (req, res) => {
  const photo = stmts.getPhoto.get(req.params.id);
  if (!photo) return res.status(404).json({ error: "Photo not found" });

  const filePath = path.join(PHOTOS_DIR, photo.trip_id, photo.filename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: "File not found" });

  res.sendFile(filePath);
});

// DELETE /api/photos/:id — delete a photo
app.delete("/api/photos/:id", (req, res) => {
  const photo = stmts.getPhoto.get(req.params.id);
  if (!photo) return res.status(404).json({ error: "Not found" });

  // Delete file from disk
  const filePath = path.join(PHOTOS_DIR, photo.trip_id, photo.filename);
  try { fs.unlinkSync(filePath); } catch (e) { /* file may already be gone */ }

  stmts.deletePhoto.run(req.params.id);
  res.json({ ok: true });
});

// POST /api/wishlist/upload-image — upload wishlist image to motherbrain
app.post("/api/wishlist/upload-image", wishlistUpload.single("image"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No image uploaded" });
  res.json({ filename: req.file.filename });
});

// GET /api/wishlist/image/:filename — serve a wishlist image
app.get("/api/wishlist/image/:filename", (req, res) => {
  const filePath = path.join(WISHLIST_DIR, req.params.filename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: "Not found" });
  res.sendFile(filePath);
});

// ── VENUE IMAGE UPLOAD ───────────────────────────────────

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
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max
  fileFilter: (req, file, cb) => {
    const allowed = /^image\/(jpeg|jpg|png|gif|webp|heic|heif)$/i;
    cb(null, allowed.test(file.mimetype));
  },
});

// POST /api/admin/venues/:id/image — upload a venue image
app.post("/api/admin/venues/:id/image", requireAdmin, venueImageUpload.single("image"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No image uploaded" });

  const filename = req.file.filename;

  // Delete old image if exists
  const venue = stmts.getAllVenues.all().find(v => v.id === req.params.id);
  if (venue && venue.image_url) {
    const oldFile = path.join(VENUES_DIR, venue.image_url);
    try { fs.unlinkSync(oldFile); } catch (e) { /* may not exist */ }
  }

  // Store just the filename in the DB
  db.prepare("UPDATE venues SET image_url = ?, updated = datetime('now') WHERE id = ?").run(filename, req.params.id);
  res.json({ filename });
});

// GET /api/venues/image/:filename — serve a venue image
app.get("/api/venues/image/:filename", (req, res) => {
  const filePath = path.join(VENUES_DIR, req.params.filename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: "Not found" });
  res.sendFile(filePath);
});

// ── FAVORITE RIDES ROUTES ─────────────────────────────────

// GET /api/favorite-rides/:userId
app.get("/api/favorite-rides/:userId", (req, res) => {
  res.json(stmts.getFavoriteRides.all(req.params.userId));
});

// POST /api/favorite-rides
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

// DELETE /api/favorite-rides/:id
app.delete("/api/favorite-rides/:id", (req, res) => {
  stmts.deleteFavoriteRide.run(req.params.id);
  res.json({ ok: true });
});

// ── DINING MEMORY ROUTES ──────────────────────────────────

// GET /api/dining-memories/:userId — all memories for a user
app.get("/api/dining-memories/:userId", (req, res) => {
  res.json(stmts.getAllDiningMemories.all(req.params.userId));
});

// GET /api/dining-memories/:userId/:venueName — memories for a specific venue
app.get("/api/dining-memories/:userId/:venueName", (req, res) => {
  res.json(stmts.getDiningMemories.all(req.params.userId, decodeURIComponent(req.params.venueName)));
});

// POST /api/dining-memories — save a new dining memory
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

// DELETE /api/dining-memories/:id — delete a memory
app.delete("/api/dining-memories/:id", (req, res) => {
  stmts.deleteDiningMemory.run(req.params.id);
  res.json({ ok: true });
});

// ── Health check ───────────────────────────────────────────

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// ── Start server ───────────────────────────────────────────

app.listen(PORT, "0.0.0.0", () => {
  console.log(`✨ Disney API server running on http://0.0.0.0:${PORT}`);
  console.log(`📁 Database: ${DB_PATH}`);
});