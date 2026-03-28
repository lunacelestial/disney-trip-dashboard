// ============================================================
// Ride Recommendation Scorer
// Pure math — no LLM. Called by the background job and the
// /api/recommendations/:parkId endpoint.
//
// scoreRides(userId, parkId, userLat, userLng, db, wtdb)
//   → returns sorted array of scored ride objects
// ============================================================

/**
 * Compute haversine distance in meters between two lat/lng points.
 */
function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Approximate coordinates of each park entrance/center.
 * Used to compute a rough walking-distance penalty when user
 * location is not available.
 */
const PARK_COORDS = {
  "75ea578a-adc8-4116-a54d-dccb60765ef9": { lat: 28.4177, lng: -81.5812 }, // Magic Kingdom
  "47f90d2c-e191-4239-a466-5892ef59a88b": { lat: 28.3747, lng: -81.5494 }, // EPCOT
  "288747d1-8b4f-4a64-867e-ea7c9b27bad8": { lat: 28.3574, lng: -81.5582 }, // Hollywood Studios
  "1c84a229-8862-4648-9c71-378ddd2c7693": { lat: 28.3553, lng: -81.5901 }, // Animal Kingdom
};

/**
 * Map user ride profile thrill/avoid fields to intensity/type scores.
 * Returns a score modifier between -20 and +20.
 */
function computeStyleMatch(profile, meta) {
  if (!profile || !meta) return 0;

  let score = 0;

  // ── Thrill level match ────────────────────────────────────
  const thrill = (profile.thrill_level || "").toLowerCase();
  const intensity = (meta.intensity || "").toLowerCase();

  if (thrill.includes("full-thrill")) {
    if (intensity === "extreme") score += 15;
    else if (intensity === "high")     score += 10;
    else if (intensity === "moderate") score +=  3;
    else score -= 5;  // full thrill seeker bored by mild
  } else if (thrill.includes("moderate-thrills")) {
    if (intensity === "high")          score += 12;
    else if (intensity === "moderate") score += 15;
    else if (intensity === "extreme")  score +=  5;
    else score +=  2;
  } else if (thrill.includes("family-rides")) {
    if (intensity === "moderate")      score += 12;
    else if (intensity === "low")      score += 10;
    else if (intensity === "high")     score -=  5;
    else if (intensity === "extreme")  score -= 15;
  } else if (thrill.includes("mild-only")) {
    if (intensity === "low")           score += 15;
    else if (intensity === "moderate") score +=  3;
    else if (intensity === "high")     score -= 15;
    else if (intensity === "extreme")  score -= 20;
  }

  // ── Ride avoidance ────────────────────────────────────────
  const avoid = (profile.ride_avoid || "").toLowerCase();
  const type  = (meta.type || "").toLowerCase();
  const acc   = (meta.accessibility || "").toLowerCase();

  if (avoid.includes("water") && type === "water")    score -= 20;
  if (avoid.includes("dark")  && type === "dark")     score -= 15;
  if (avoid.includes("spinning") && acc.includes("spin")) score -= 15;
  if (avoid.includes("heights") && (intensity === "extreme" || intensity === "high")) score -= 10;
  if (avoid.includes("loud")  && (intensity === "extreme")) score -= 10;

  // ── Show preference ───────────────────────────────────────
  // pace_style "relaxed" gets a small bonus for shows, transport
  const pace = (profile.pace_style || "").toLowerCase();
  if (pace.includes("relaxed") && (type === "show" || type === "transport")) score += 5;
  if (pace.includes("rope-drop") && (intensity === "extreme" || intensity === "high")) score += 5;

  // ── Height restriction check (party children) ────────────
  // If party has toddlers/young children, penalise rides with tall
  // height requirements they can't ride.
  const partyToddlers  = parseInt(profile.party_toddlers  || 0);
  const partyChildren  = parseInt(profile.party_children  || 0);
  const heightReq      = meta.height_req;
  if ((partyToddlers > 0 || partyChildren > 0) && heightReq && heightReq >= 48) {
    score -= 10; // adults will split up — lower priority
  }

  return Math.max(-20, Math.min(20, score));
}

/**
 * Main scoring function.
 *
 * @param {string}  userId   - user ID (from sessions/token)
 * @param {string}  parkId   - ThemeParks.wiki park UUID
 * @param {number|null} userLat - user GPS latitude (or null)
 * @param {number|null} userLng - user GPS longitude (or null)
 * @param {Database} db      - better-sqlite3 handle to disney.db
 * @param {Database} wtdb    - better-sqlite3 handle to waittimes.db
 * @returns {Array}           ranked rides, best first
 */
function scoreRides(userId, parkId, userLat, userLng, db, wtdb) {
  // ── 1. Fetch user ride profile ────────────────────────────
  const profile = db.prepare(
    "SELECT * FROM user_ride_profiles WHERE user_id = ?"
  ).get(userId) || {};

  // ── 2. Fetch user's favorited rides for this park ─────────
  const favRows = db.prepare(
    "SELECT ride_name FROM favorite_rides WHERE user_id = ? AND park = ?"
  ).all(userId, _parkSlugFromId(parkId));
  const favSet = new Set(favRows.map(r => r.ride_name.toLowerCase()));

  // ── 3. Fetch live wait times for this park ────────────────
  let liveWaits = [];
  try {
    liveWaits = wtdb.prepare(`
      SELECT attraction_name, wait_minutes, status, queue_type
      FROM wait_snapshots
      WHERE park_id = ?
        AND status = 'OPERATING'
        AND sampled_at >= datetime('now', '-24 hours')
      -- NOTE: tighten back to '-20 minutes' for production
      GROUP BY attraction_name
      HAVING sampled_at = MAX(sampled_at)
    `).all(parkId);
  } catch (e) {
    console.warn("[scorer] waittimes query failed:", e.message);
  }

  if (liveWaits.length === 0) return [];

  // ── 4. Fetch historical avg for same day-of-week + hour ───
  const now        = new Date();
  const dayOfWeek  = now.getDay();   // 0=Sun … 6=Sat
  const hour       = now.getHours();

  let historicalMap = {};
  try {
    // Fetch raw per-attraction wait samples for the same day-of-week and
    // ±2 hour window over the past 30 days. We compute a trimmed mean in JS
    // (drop top/bottom 10%) to filter outlier spikes and data errors.
    const hist = wtdb.prepare(`
      SELECT
        attraction_name,
        wait_minutes
      FROM wait_snapshots
      WHERE park_id = ?
        AND status = 'OPERATING'
        AND wait_minutes IS NOT NULL
        AND wait_minutes <= 180
        AND strftime('%w', sampled_at) = ?
        AND CAST(strftime('%H', sampled_at) AS INTEGER) BETWEEN ? AND ?
        AND sampled_at < datetime('now', '-1 day')
      ORDER BY attraction_name
    `).all(parkId, String(dayOfWeek), hour - 2, hour + 2);

    // Group by attraction and compute trimmed mean
    const grouped = {};
    hist.forEach(r => {
      const key = r.attraction_name.toLowerCase();
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(r.wait_minutes);
    });
    for (const [key, waits] of Object.entries(grouped)) {
      if (waits.length < 3) {
        // Too few samples — use simple average
        historicalMap[key] = Math.round(waits.reduce((a, b) => a + b, 0) / waits.length * 10) / 10;
      } else {
        // Trimmed mean: drop top/bottom 10%
        waits.sort((a, b) => a - b);
        const trim = Math.max(1, Math.floor(waits.length * 0.1));
        const trimmed = waits.slice(trim, waits.length - trim);
        historicalMap[key] = Math.round(trimmed.reduce((a, b) => a + b, 0) / trimmed.length * 10) / 10;
      }
    }
  } catch (e) {
    console.warn("[scorer] historical query failed:", e.message);
  }

  // ── 5. Fetch attraction metadata ──────────────────────────
  const metaRows = db.prepare(
    "SELECT * FROM attraction_metadata WHERE park_id = ?"
  ).all(parkId);
  const metaMap = {};
  metaRows.forEach(r => {
    metaMap[r.attraction_name.toLowerCase()] = r;
  });

  // ── 6. Fetch recommendation cache (cached quips) ──────────
  let cacheMap = {};
  try {
    const cached = db.prepare(`
      SELECT attraction_name, quips, generated_at
      FROM recommendation_cache
      WHERE park_id = ?
        AND generated_at >= datetime('now', '-20 minutes')
    `).all(parkId);
    cached.forEach(r => {
      cacheMap[r.attraction_name.toLowerCase()] = JSON.parse(r.quips || "[]");
    });
  } catch (e) {
    // table may not exist yet on first run
  }

  // ── 7. Score each ride ────────────────────────────────────
  const parkCenter = PARK_COORDS[parkId] || { lat: 28.3852, lng: -81.5639 };

  const scored = liveWaits.map(ride => {
    // Strip any surrounding quotes ThemeParks.wiki sometimes wraps names in
    const cleanName  = ride.attraction_name.replace(/^["']|["']$/g, "").trim();
    const nameLower  = cleanName.toLowerCase();
    const live       = ride.wait_minutes ?? 0;
    const histAvg     = historicalMap[nameLower] ?? live; // fallback: assume average
    const meta        = metaMap[_fuzzyMatch(nameLower, metaMap)] || null;
    const isFav       = favSet.has(nameLower);

    // ── Wait delta: positive = shorter than usual (good) ──
    const waitDelta = histAvg - live;

    // ── Style match ────────────────────────────────────────
    const styleScore = computeStyleMatch(profile, meta);

    // ── Favorite boost ─────────────────────────────────────
    const favBoost = isFav ? 12 : 0;

    // ── Walking distance penalty ───────────────────────────
    // We don't have per-attraction coordinates, so we use
    // park-center as a neutral baseline (penalty = 0 unless
    // user location is available and park coords are extended).
    let distPenalty = 0;
    if (userLat !== null && userLng !== null) {
      const distMeters = haversine(userLat, userLng, parkCenter.lat, parkCenter.lng);
      // Rough penalty: 0 at park center, -5 at 1km away
      distPenalty = Math.min(5, (distMeters / 1000) * 2.5);
    }

    const totalScore = waitDelta + styleScore + favBoost - distPenalty;

    return {
      attraction_name:  cleanName,
      park_id:          parkId,
      live_wait:        live,
      hist_avg:         Math.round(histAvg),
      wait_delta:       Math.round(waitDelta),
      style_score:      Math.round(styleScore),
      fav_boost:        favBoost,
      dist_penalty:     Math.round(distPenalty),
      total_score:      Math.round(totalScore),
      is_favorite:      isFav,
      status:           ride.status,
      queue_type:       ride.queue_type,
      height_req:       meta?.height_req ?? null,
      intensity:        meta?.intensity  ?? "unknown",
      indoor:           meta?.indoor     ?? null,
      type:             meta?.type       ?? "unknown",
      lightning_lane:   meta?.lightning_lane ?? "none",
      description:      meta?.description ?? "",
      quips:            cacheMap[nameLower] || [],
    };
  });

  // ── 8. Sort by total score descending ─────────────────────
  scored.sort((a, b) => b.total_score - a.total_score);

  return scored;
}

/**
 * Convert a ThemeParks.wiki park UUID to the park slug used in
 * favorite_rides table (e.g. "magic-kingdom").
 */
function _parkSlugFromId(parkId) {
  const map = {
    "75ea578a-adc8-4116-a54d-dccb60765ef9": "magic-kingdom",
    "47f90d2c-e191-4239-a466-5892ef59a88b": "epcot",
    "288747d1-8b4f-4a64-867e-ea7c9b27bad8": "hollywood-studios",
    "1c84a229-8862-4648-9c71-378ddd2c7693": "animal-kingdom",
  };
  return map[parkId] || "";
}

/**
 * Simple fuzzy match: look for a key in metaMap that contains
 * the attraction name, or vice versa. Falls back to exact match.
 * Returns the matching key or the original name if no match.
 */
function _fuzzyMatch(nameLower, metaMap) {
  if (metaMap[nameLower]) return nameLower;

  // Try: does any metadata key contain the live name?
  for (const key of Object.keys(metaMap)) {
    if (key.includes(nameLower) || nameLower.includes(key)) return key;
  }

  // Try stripped (remove punctuation, articles)
  const stripped = nameLower.replace(/[^a-z0-9 ]/g, "").replace(/\b(the|a|an|of)\b/g, "").trim();
  for (const key of Object.keys(metaMap)) {
    const keyStripped = key.replace(/[^a-z0-9 ]/g, "").replace(/\b(the|a|an|of)\b/g, "").trim();
    if (keyStripped === stripped) return key;
    if (keyStripped.includes(stripped) || stripped.includes(keyStripped)) return key;
  }

  return nameLower;
}

module.exports = { scoreRides };