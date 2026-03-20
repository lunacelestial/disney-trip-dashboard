// ============================================================
// Disney Wait Time Collector
// Polls ThemeParks.wiki live endpoint every 15 minutes for
// all 4 WDW parks and writes snapshots to waittimes.db.
//
// DB lives on ironwolf_02: /mnt/motherbrain/ironwolf_02/disney-wait-times/
// In Docker this is bind-mounted to /waittimes
//
// Run standalone: node wait-collector.js
// In Docker: started alongside server.js via start.sh
// ============================================================

const Database = require("better-sqlite3");
const path     = require("path");
const fs       = require("fs");

// ── DB path ───────────────────────────────────────────────
const WT_DIR = fs.existsSync("/waittimes")
  ? "/waittimes"
  : path.join(__dirname, "waittimes-local");

fs.mkdirSync(WT_DIR, { recursive: true });

const WT_DB_PATH = path.join(WT_DIR, "waittimes.db");
const db = new Database(WT_DB_PATH);
db.pragma("journal_mode = WAL");

// ── Schema ────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS wait_snapshots (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    park_id       TEXT NOT NULL,
    park_name     TEXT NOT NULL,
    attraction_id TEXT NOT NULL,
    attraction_name TEXT NOT NULL,
    wait_minutes  INTEGER,
    status        TEXT NOT NULL DEFAULT 'OPERATING',
    queue_type    TEXT DEFAULT '',
    sampled_at    TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Fast lookups by park + time
  CREATE INDEX IF NOT EXISTS idx_snapshots_park_time
    ON wait_snapshots (park_id, sampled_at);

  -- Fast lookups by attraction + time (for trend queries)
  CREATE INDEX IF NOT EXISTS idx_snapshots_attraction_time
    ON wait_snapshots (attraction_id, sampled_at);

  -- Summary table: one row per park per sample round
  -- Pre-aggregated avg/median for fast dashboard queries
  CREATE TABLE IF NOT EXISTS park_summaries (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    park_id       TEXT NOT NULL,
    park_name     TEXT NOT NULL,
    avg_wait      REAL,
    median_wait   REAL,
    operating_count INTEGER DEFAULT 0,
    down_count    INTEGER DEFAULT 0,
    closed_count  INTEGER DEFAULT 0,
    sampled_at    TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_summaries_park_time
    ON park_summaries (park_id, sampled_at);
`);

// ── Park definitions ──────────────────────────────────────
const PARKS = [
  { id: "75ea578a-adc8-4116-a54d-dccb60765ef9", name: "Magic Kingdom"     },
  { id: "47f90d2c-e191-4239-a466-5892ef59a88b", name: "EPCOT"             },
  { id: "288747d1-8b4f-4a64-867e-ea7c9b27bad8", name: "Hollywood Studios" },
  { id: "1c84a229-8862-4648-9c71-378ddd2c7693", name: "Animal Kingdom"    },
];

// ── Prepared statements ───────────────────────────────────
const insertSnapshot = db.prepare(`
  INSERT INTO wait_snapshots
    (park_id, park_name, attraction_id, attraction_name, wait_minutes, status, queue_type, sampled_at)
  VALUES
    (@park_id, @park_name, @attraction_id, @attraction_name, @wait_minutes, @status, @queue_type, @sampled_at)
`);

const insertSummary = db.prepare(`
  INSERT INTO park_summaries
    (park_id, park_name, avg_wait, median_wait, operating_count, down_count, closed_count, sampled_at)
  VALUES
    (@park_id, @park_name, @avg_wait, @median_wait, @operating_count, @down_count, @closed_count, @sampled_at)
`);

const insertBatch = db.transaction((rows, summary) => {
  for (const row of rows) insertSnapshot.run(row);
  insertSummary.run(summary);
});

// ── Helpers ───────────────────────────────────────────────
function median(arr) {
  if (!arr.length) return null;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

// ── Park hours check ──────────────────────────────────────
// Returns true if the given park is currently within its
// OPERATING window according to ThemeParks.wiki schedule.
// Uses a 15-minute grace buffer on each end to catch
// rope-drop and close-of-day edge samples cleanly.
const SCHEDULE_GRACE_MS = 15 * 60 * 1000; // 15 min

async function isParkOpen(park) {
  try {
    const url = `https://api.themeparks.wiki/v1/entity/${park.id}/schedule`;
    const res  = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) {
      // If we can't check, default to collecting (fail open)
      console.warn(`[schedule] Could not fetch schedule for ${park.name} (HTTP ${res.status}) — will collect anyway`);
      return true;
    }

    const data = await res.json();
    const todayET = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/New_York",
      year: "numeric", month: "2-digit", day: "2-digit",
    }).format(new Date()); // "YYYY-MM-DD" in Eastern time

    const todaySchedule = (data.schedule || []).find(
      s => s.date === todayET && s.type === "OPERATING"
    );

    if (!todaySchedule) {
      // Park has no operating hours today (e.g. hard close, special event)
      return false;
    }

    const nowMs    = Date.now();
    const openMs   = new Date(todaySchedule.openingTime).getTime()  - SCHEDULE_GRACE_MS;
    const closeMs  = new Date(todaySchedule.closingTime).getTime()  + SCHEDULE_GRACE_MS;

    return nowMs >= openMs && nowMs <= closeMs;
  } catch (err) {
    // Network error etc — fail open so we don't silently stop collecting
    console.warn(`[schedule] Error checking ${park.name} hours: ${err.message} — will collect anyway`);
    return true;
  }
}

// ── Fetch one park ────────────────────────────────────────
async function fetchPark(park) {
  const url = `https://api.themeparks.wiki/v1/entity/${park.id}/live`;
  const res  = await fetch(url, { signal: AbortSignal.timeout(15000) });

  if (!res.ok) throw new Error(`HTTP ${res.status} for ${park.name}`);

  const data = await res.json();
  const now  = new Date().toISOString();

  const rows = [];
  const waits = [];
  let operating = 0, down = 0, closed = 0;

  for (const entity of (data.liveData || [])) {
    // Only attractions with a queue (rides, shows with standby)
    if (!entity.queue && entity.entityType !== "ATTRACTION") continue;

    const status     = entity.status || "UNKNOWN";
    const wait_mins  = entity.queue?.STANDBY?.waitTime ?? null;
    const queue_type = entity.queue?.PAID_RETURN_TIME ? "LIGHTNING_LANE"
                     : entity.queue?.RETURN_TIME      ? "VIRTUAL_QUEUE"
                     : "STANDBY";

    rows.push({
      park_id:          park.id,
      park_name:        park.name,
      attraction_id:    entity.id,
      attraction_name:  entity.name,
      wait_minutes:     wait_mins,
      status,
      queue_type,
      sampled_at:       now,
    });

    if (status === "OPERATING") {
      operating++;
      if (wait_mins !== null) waits.push(wait_mins);
    } else if (status === "DOWN") {
      down++;
    } else {
      closed++;
    }
  }

  const avg_wait = waits.length
    ? Math.round(waits.reduce((a, b) => a + b, 0) / waits.length)
    : null;

  const summary = {
    park_id:         park.id,
    park_name:       park.name,
    avg_wait,
    median_wait:     median(waits),
    operating_count: operating,
    down_count:      down,
    closed_count:    closed,
    sampled_at:      now,
  };

  insertBatch(rows, summary);

  console.log(
    `[${now}] ${park.name.padEnd(20)} ` +
    `avg: ${String(avg_wait ?? "—").padStart(3)} min  ` +
    `operating: ${operating}  down: ${down}`
  );
}

// ── Purge old data ────────────────────────────────────────
// Keep 30 days of snapshots, 90 days of summaries
function purgeOldData() {
  const snapResult = db.prepare(
    "DELETE FROM wait_snapshots WHERE sampled_at < datetime('now', '-30 days')"
  ).run();
  const sumResult = db.prepare(
    "DELETE FROM park_summaries WHERE sampled_at < datetime('now', '-90 days')"
  ).run();
  if (snapResult.changes > 0 || sumResult.changes > 0) {
    console.log(`[purge] Removed ${snapResult.changes} snapshots, ${sumResult.changes} summaries`);
  }
}

// ── Main collection loop ──────────────────────────────────
async function collect() {
  const now = new Date().toISOString();
  console.log(`\n⏰ [${now}] Checking park hours before collecting...`);

  // Check all parks concurrently — each gets an independent open/closed verdict
  const openChecks = await Promise.all(
    PARKS.map(async park => ({
      park,
      open: await isParkOpen(park),
    }))
  );

  const openParks   = openChecks.filter(c => c.open).map(c => c.park);
  const closedParks = openChecks.filter(c => !c.open).map(c => c.park);

  if (closedParks.length > 0) {
    console.log(`💤 Skipping (closed): ${closedParks.map(p => p.name).join(", ")}`);
  }

  if (openParks.length === 0) {
    console.log(`🌙 All parks closed — skipping this sample entirely.\n`);
    return;
  }

  console.log(`🎢 Collecting: ${openParks.map(p => p.name).join(", ")}`);

  const results = await Promise.allSettled(openParks.map(fetchPark));

  for (const result of results) {
    if (result.status === "rejected") {
      console.error(`[error] ${result.reason}`);
    }
  }

  // Purge old data once a day (roughly — every 96 collections @ 15min)
  if (Math.random() < 0.011) purgeOldData();
}

// ── Start ─────────────────────────────────────────────────
const INTERVAL_MS = 15 * 60 * 1000; // 15 minutes

console.log("⏱  Disney Wait Time Collector starting...");
console.log(`📁 DB path: ${WT_DB_PATH}`);
console.log(`🔄 Polling every 15 minutes`);
console.log(`🏰 Parks: ${PARKS.map(p => p.name).join(", ")}\n`);

// Collect immediately on start, then on interval
collect();
setInterval(collect, INTERVAL_MS);
