// ============================================================
// API Client — all data lives on the server (SQLite on the Pi)
// so every visitor sees the same shared itinerary/wishlist/budget.
// ============================================================

const API_BASE = "/api"; // Nginx proxies this to Node.js on port 3001

async function apiFetch(path, options = {}) {
  const url = `${API_BASE}${path}`;
  const token = localStorage.getItem("disney-auth-token") || "";
  const headers = { "Content-Type": "application/json", ...options.headers };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(url, { ...options, headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    console.error(`[API] ${options.method || "GET"} ${path} → ${res.status}`, err);
    throw new Error(err.error || res.statusText);
  }
  return res.json();
}

// ============================================================
// ItineraryDB — Activities CRUD via the API
// ============================================================

const ItineraryDB = {
  async getAll() {
    try {
      const rows = await apiFetch("/activities");
      console.log(`[ItineraryDB] loaded ${rows.length} activities`);
      return rows;
    } catch (err) {
      console.error("[ItineraryDB] getAll failed:", err);
      return [];
    }
  },

  async add(activity) {
    try {
      return await apiFetch("/activities", {
        method: "POST",
        body: JSON.stringify(activity),
      });
    } catch (err) {
      console.error("[ItineraryDB] add failed:", err);
      return await this.getAll();
    }
  },

  async addMany(activities) {
    try {
      return await apiFetch("/activities", {
        method: "POST",
        body: JSON.stringify(activities),
      });
    } catch (err) {
      console.error("[ItineraryDB] addMany failed:", err);
      return await this.getAll();
    }
  },

  async update(id, changes) {
    try {
      await apiFetch(`/activities/${id}`, {
        method: "PUT",
        body: JSON.stringify(changes),
      });
      return await this.getAll();
    } catch (err) {
      console.error("[ItineraryDB] update failed:", err);
      return await this.getAll();
    }
  },

  async delete(id) {
    try {
      await apiFetch(`/activities/${id}`, { method: "DELETE" });
      return await this.getAll();
    } catch (err) {
      console.error("[ItineraryDB] delete failed:", err);
      return await this.getAll();
    }
  },

  async clearAll() {
    try {
      await apiFetch("/activities", { method: "DELETE" });
      const check = await this.getAll();
      return check.length === 0;
    } catch (err) {
      console.error("[ItineraryDB] clearAll failed:", err);
      return false;
    }
  },

  async findById(id) {
    try {
      return await apiFetch(`/activities/${id}`);
    } catch {
      return null;
    }
  },
};

// Thin wrapper kept for backward-compat with existing call sites
async function getStoredItinerary() { return ItineraryDB.getAll(); }

// ============================================================
// WishlistDB — Wishlist CRUD via the API
// ============================================================

const WishlistDB = {
  async getAll() {
    try {
      return await apiFetch("/wishlist");
    } catch (err) {
      console.error("[WishlistDB] getAll failed:", err);
      return [];
    }
  },

  async add(item) {
    try {
      const user = Auth.getUser();
      return await apiFetch("/wishlist", {
        method: "POST",
        body: JSON.stringify({
          ...item,
          added_by: user ? user.id : "",
          added_by_name: user ? user.name : "Guest",
        }),
      });
    } catch (err) {
      console.error("[WishlistDB] add failed:", err);
      return await this.getAll();
    }
  },

  async remove(id) {
    try {
      return await apiFetch(`/wishlist/${id}`, { method: "DELETE" });
    } catch (err) {
      console.error("[WishlistDB] remove failed:", err);
      return await this.getAll();
    }
  },
};

// ============================================================
// BudgetDB — Budget data via the API
// ============================================================

const BudgetDB = {
  async get() {
    try {
      return await apiFetch("/budget");
    } catch (err) {
      console.error("[BudgetDB] get failed:", err);
      return { totalBudget: 0, transactions: [] };
    }
  },

  async set(data) {
    try {
      return await apiFetch("/budget", {
        method: "PUT",
        body: JSON.stringify(data),
      });
    } catch (err) {
      console.error("[BudgetDB] set failed:", err);
      return false;
    }
  },

  async addTransaction(transaction) {
    try {
      return await apiFetch("/budget/transactions", {
        method: "POST",
        body: JSON.stringify(transaction),
      });
    } catch (err) {
      console.error("[BudgetDB] addTransaction failed:", err);
      return await this.get();
    }
  },
};

// ============================================================
// ParkDaysDB — Park day assignments via the API
// Each entry: { date: "2026-05-01", park: "magic-kingdom" }
// ============================================================

const ParkDaysDB = {
  async getAll() {
    try {
      return await apiFetch("/parkdays");
    } catch (err) {
      console.error("[ParkDaysDB] getAll failed:", err);
      return [];
    }
  },

  async getByDate(date) {
    try {
      return await apiFetch(`/parkdays/${date}`);
    } catch {
      return null;
    }
  },

  async saveMany(parkDays) {
    // parkDays = [{ date: "2026-05-01", park: "magic-kingdom" }, ...]
    try {
      return await apiFetch("/parkdays", {
        method: "POST",
        body: JSON.stringify(parkDays),
      });
    } catch (err) {
      console.error("[ParkDaysDB] saveMany failed:", err);
      return [];
    }
  },

  async remove(date) {
    try {
      await apiFetch(`/parkdays/${date}`, { method: "DELETE" });
      return true;
    } catch (err) {
      console.error("[ParkDaysDB] remove failed:", err);
      return false;
    }
  },
};

// ============================================================
// VenuesDB — Saved venues/locations for autocomplete
// ============================================================

const VenuesDB = {
  _cache: null,

  async getAll() {
    try {
      this._cache = await apiFetch("/venues");
      return this._cache;
    } catch (err) {
      console.error("[VenuesDB] getAll failed:", err);
      return this._cache || [];
    }
  },

  async search(query) {
    try {
      return await apiFetch(`/venues?q=${encodeURIComponent(query)}`);
    } catch (err) {
      console.error("[VenuesDB] search failed:", err);
      return [];
    }
  },

  async save(venue) {
    try {
      this._cache = await apiFetch("/venues", {
        method: "POST",
        body: JSON.stringify(venue),
      });
      return this._cache;
    } catch (err) {
      console.error("[VenuesDB] save failed:", err);
      return [];
    }
  },
};

// ============================================================
// SHARED HELPERS
// ============================================================

// ── Reusable Venue Autocomplete ──────────────────────────────
// Attaches typeahead to any text input. When a suggestion is picked,
// calls onSelect(venue) so the caller can fill in related fields.
//
// Usage: attachVenueAutocomplete(inputEl, { onSelect: (venue) => { ... } })

function attachVenueAutocomplete(inputEl, options = {}) {
  if (!inputEl || inputEl._venueACAttached) return;
  inputEl._venueACAttached = true;

  const onSelect = options.onSelect || (() => {});
  const filterType = options.filterType || null; // e.g. "Dining" to only show restaurants

  let dropdown = document.createElement("div");
  dropdown.className = "venue-autocomplete hidden";
  dropdown.style.cssText = "position:absolute; top:100%; left:0; right:0; z-index:1000;";

  // Ensure parent is positioned
  if (getComputedStyle(inputEl.parentNode).position === "static") {
    inputEl.parentNode.style.position = "relative";
  }
  inputEl.parentNode.appendChild(dropdown);

  let debounceTimer = null;

  inputEl.addEventListener("input", () => {
    clearTimeout(debounceTimer);
    const query = inputEl.value.trim();
    if (query.length < 2) { dropdown.classList.add("hidden"); return; }
    debounceTimer = setTimeout(async () => {
      let results = await VenuesDB.search(query);
      if (filterType) {
        // Boost matching types to the top but still show others
        results.sort((a, b) => {
          const aMatch = (a.type || "").toLowerCase() === filterType.toLowerCase() ? 0 : 1;
          const bMatch = (b.type || "").toLowerCase() === filterType.toLowerCase() ? 0 : 1;
          return aMatch - bMatch;
        });
      }
      if (results.length === 0) { dropdown.classList.add("hidden"); return; }

      dropdown.innerHTML = results.slice(0, 8).map(v => `
        <button type="button" class="venue-suggestion" data-venue='${JSON.stringify(v).replace(/'/g, "&#39;")}'>
          <span class="venue-suggestion-name">${escapeHtml(v.name)}</span>
          ${v.location ? `<span class="venue-suggestion-location">${escapeHtml(v.location)}</span>` : ""}
        </button>
      `).join("");
      dropdown.classList.remove("hidden");

      dropdown.querySelectorAll(".venue-suggestion").forEach(btn => {
        btn.addEventListener("mousedown", (e) => {
          e.preventDefault();
          const venue = JSON.parse(btn.dataset.venue);
          inputEl.value = venue.name;
          dropdown.classList.add("hidden");
          onSelect(venue);
        });
      });
    }, 200);
  });

  inputEl.addEventListener("blur", () => {
    setTimeout(() => dropdown.classList.add("hidden"), 200);
  });

  inputEl.addEventListener("focus", () => {
    const query = inputEl.value.trim();
    if (query.length >= 2) inputEl.dispatchEvent(new Event("input"));
  });
}

function showToast(message) {
  let toast = document.getElementById("disney-toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "disney-toast";
    toast.style.cssText = `
      position:fixed; bottom:2rem; left:50%; transform:translateX(-50%) translateY(80px);
      background:#1a1a2e; color:#fff; padding:0.75rem 1.5rem; border-radius:999px;
      font-weight:700; font-size:0.95rem; box-shadow:0 4px 24px rgba(0,0,0,0.25);
      transition:transform 0.3s ease, opacity 0.3s ease; opacity:0; z-index:9999;
    `;
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.style.transform = "translateX(-50%) translateY(0)";
  toast.style.opacity = "1";
  setTimeout(() => {
    toast.style.transform = "translateX(-50%) translateY(80px)";
    toast.style.opacity = "0";
  }, 3000);
}

function generateId() {
  return `activity-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

// Returns today's date as "YYYY-MM-DD" in local time
function getTodayString() {
  const now = new Date();
  return now.getFullYear() + '-' +
    String(now.getMonth() + 1).padStart(2, '0') + '-' +
    String(now.getDate()).padStart(2, '0');
}

// Sorts by Date, and then by Time
function sortItineraryByTime(itinerary) {
  return [...itinerary].sort((a, b) => {
    const dateCompare = (a.date || "").localeCompare(b.date || "");
    if (dateCompare !== 0) return dateCompare;
    return (a.time || "").localeCompare(b.time || "");
  });
}

function formatTimeForDisplay(time24) {
  if (!time24 || !time24.includes(":")) {
    return time24;
  }
  const [hourString, minute] = time24.split(":");
  const hour = Number(hourString);
  const suffix = hour >= 12 ? "PM" : "AM";
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${hour12}:${minute} ${suffix}`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function timeStringToMinutes(time24) {
  const [hours, minutes] = time24.split(":").map(Number);
  return hours * 60 + minutes;
}

// Build display notes — auto-adds "Arrive 15 minutes early" for dining
function getDisplayNotes(activity) {
  const isDining = (activity.type || "").toLowerCase() === "dining";
  const diningNote = "Arrive 15 minutes early.";
  const userNotes = (activity.notes || "").trim();

  if (isDining) {
    if (userNotes.toLowerCase().includes("arrive") && userNotes.toLowerCase().includes("early")) {
      return userNotes;
    }
    return userNotes ? `${diningNote} ${userNotes}` : diningNote;
  }
  return userNotes;
}

// Haversine distance between two lat/lng points (returns meters)
function haversineDistance(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1 * Math.PI/180) * Math.cos(lat2 * Math.PI/180) * Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

// ============================================================
// E-TICKET CARD CONFIG
// Inspired by the vintage Walt Disney World A–E coupon ticket books (1971–1982).
// ============================================================

function getTicketParkBranding(location) {
  if (!location) return { mark: "Walt Disney World", coupon: "" };
  const loc = location.toLowerCase();
  
  const parks = [
    { keys: ["magic kingdom", "fantasyland", "tomorrowland", "main street", "liberty square", "adventureland", "frontierland"], mark: "Walt Disney World", coupon: "MAGIC KINGDOM" },
    { keys: ["epcot", "world showcase", "world celebration", "world discovery", "world nature", "france", "japan", "mexico", "germany", "italy", "canada", "morocco", "china", "norway", "united kingdom"], mark: "Walt Disney World", coupon: "EPCOT" },
    { keys: ["hollywood studios", "galaxy's edge", "toy story land", "sunset boulevard", "echo lake", "commissary", "hollywood boulevard", "star wars"], mark: "Walt Disney World", coupon: "HOLLYWOOD STUDIOS" },
    { keys: ["animal kingdom", "pandora", "africa", "asia", "dinoland", "tree of life"], mark: "Walt Disney World", coupon: "ANIMAL KINGDOM" },
    { keys: ["disney springs", "the landing", "marketplace", "west side", "town center"], mark: "Walt Disney World", coupon: "DISNEY SPRINGS" },
  ];

  for (const park of parks) {
    for (const key of park.keys) {
      if (loc.includes(key)) return { mark: park.mark, coupon: park.coupon };
    }
  }
  return { mark: "Walt Disney World", coupon: "" };
}

function getETicketConfig(type, title) {
  const t = (type || "").toLowerCase();
  
  let travelIcon = "🚌";
  if (t === "travel" && title) {
    const lowerTitle = title.toLowerCase();
    if (lowerTitle.includes("✈️") || lowerTitle.includes("flight") || lowerTitle.includes("mco") || lowerTitle.includes("airport") || lowerTitle.includes("depart") || lowerTitle.includes("arrive at mco")) {
      travelIcon = "✈️";
    } else if (lowerTitle.includes("🚌") || lowerTitle.includes("bus") || lowerTitle.includes("magical express")) {
      travelIcon = "🚌";
    } else if (lowerTitle.includes("🚗") || lowerTitle.includes("uber") || lowerTitle.includes("lyft") || lowerTitle.includes("driving")) {
      travelIcon = "🚗";
    } else if (lowerTitle.includes("🚙") || lowerTitle.includes("rental")) {
      travelIcon = "🚙";
    } else if (lowerTitle.includes("resort change") || lowerTitle.includes("hotel")) {
      travelIcon = "🏨";
    }
  }

  const configs = {
    ride: {
      letter: "R", label: "RIDE", icon: "🎢",
      bg: "linear-gradient(170deg, #1a3a7a 0%, #1e4ea0 40%, #1a3a7a 100%)",
      border: "#0f2b5e", text: "#e8eef8", accent: "#7eb8f0",
      labelBg: "rgba(255,255,255,0.15)", stripe: "#4a90d9"
    },
    dining: {
      letter: "D", label: "DINING", icon: "🍽️",
      bg: "linear-gradient(170deg, #c45e10 0%, #d97718 40%, #c45e10 100%)",
      border: "#8a3f08", text: "#fff5e6", accent: "#ffe0a8",
      labelBg: "rgba(255,255,255,0.15)", stripe: "#e89030"
    },
    show: {
      letter: "S", label: "SHOW", icon: "🎭",
      bg: "linear-gradient(170deg, #9b1b30 0%, #c22845 40%, #9b1b30 100%)",
      border: "#6e1222", text: "#ffe8ec", accent: "#ffb3c0",
      labelBg: "rgba(255,255,255,0.15)", stripe: "#e04060"
    },
    shopping: {
      letter: "S", label: "SHOPPING", icon: "🛍️",
      bg: "linear-gradient(170deg, #a08520 0%, #c8a828 40%, #a08520 100%)",
      border: "#6e5a10", text: "#fffde8", accent: "#fff3a0",
      labelBg: "rgba(255,255,255,0.15)", stripe: "#d4b830"
    },
    merch: {
      letter: "S", label: "SHOPPING", icon: "🛍️",
      bg: "linear-gradient(170deg, #a08520 0%, #c8a828 40%, #a08520 100%)",
      border: "#6e5a10", text: "#fffde8", accent: "#fff3a0",
      labelBg: "rgba(255,255,255,0.15)", stripe: "#d4b830"
    },
    travel: {
      letter: "T", label: "TRAVEL", icon: travelIcon,
      bg: "linear-gradient(170deg, #1a6838 0%, #22884a 40%, #1a6838 100%)",
      border: "#0f4a25", text: "#e8f8ee", accent: "#90e8b0",
      labelBg: "rgba(255,255,255,0.15)", stripe: "#40c070"
    },
    break: {
      letter: "B", label: "BREAK", icon: "☀️",
      bg: "linear-gradient(170deg, #1a6838 0%, #22884a 40%, #1a6838 100%)",
      border: "#0f4a25", text: "#e8f8ee", accent: "#90e8b0",
      labelBg: "rgba(255,255,255,0.15)", stripe: "#40c070"
    },
  };
  return configs[t] || configs.ride;
}

// ============================================================
// TRIP SEPARATION
// ============================================================

const GAP_DAYS = 2;
let selectedTripIndex = -1; // -1 means "auto-detect current trip"
let _tripBudgetsCache = null;

async function loadTripBudgets() {
  if (_tripBudgetsCache) return _tripBudgetsCache;
  try {
    _tripBudgetsCache = await apiFetch("/trip-budgets");
  } catch (e) {
    _tripBudgetsCache = [];
  }
  return _tripBudgetsCache;
}

function invalidateTripBudgetsCache() {
  _tripBudgetsCache = null;
}

function buildTripsFromBudgets(sortedActivities, tripBudgets) {
  const budgets = [...tripBudgets].sort((a, b) => a.start_date.localeCompare(b.start_date));

  const tripGroups = budgets.map(tb => ({
    start: tb.start_date,
    end: tb.end_date,
    trip_id: tb.trip_id,
    label: tb.label || "",
    activities: [],
  }));

  const unmatched = [];

  for (const act of sortedActivities) {
    const d = act.date || "";
    let matched = false;
    for (const tg of tripGroups) {
      if (d >= tg.start && d <= tg.end) {
        tg.activities.push(act);
        matched = true;
        break;
      }
    }
    if (!matched) unmatched.push(act);
  }

  const fallbackTrips = [];
  if (unmatched.length > 0) {
    let current = [unmatched[0]];
    for (let i = 1; i < unmatched.length; i++) {
      const prevDate = new Date((unmatched[i - 1].date || "2099-01-01") + "T12:00:00");
      const currDate = new Date((unmatched[i].date || "2099-01-01") + "T12:00:00");
      if ((currDate - prevDate) / (1000 * 60 * 60 * 24) > GAP_DAYS) {
        fallbackTrips.push(current);
        current = [];
      }
      current.push(unmatched[i]);
    }
    fallbackTrips.push(current);
  }

  for (const group of fallbackTrips) {
    const start = group[0].date || "";
    const end = group[group.length - 1].date || "";
    tripGroups.push({
      start,
      end,
      trip_id: `trip-${start}-${end}`,
      label: "",
      activities: group,
    });
  }

  tripGroups.sort((a, b) => a.start.localeCompare(b.start));
  return tripGroups;
}

// Legacy splitIntoTrips — still used by history page and other consumers
function splitIntoTrips(sortedActivities) {
  if (sortedActivities.length === 0) return [];
  const trips = [];
  let currentTrip = [sortedActivities[0]];
  for (let i = 1; i < sortedActivities.length; i++) {
    const prevDate = new Date((sortedActivities[i - 1].date || "2099-01-01") + "T12:00:00");
    const currDate = new Date((sortedActivities[i].date || "2099-01-01") + "T12:00:00");
    if ((currDate - prevDate) / (1000 * 60 * 60 * 24) > GAP_DAYS) {
      trips.push(currentTrip);
      currentTrip = [];
    }
    currentTrip.push(sortedActivities[i]);
  }
  trips.push(currentTrip);
  return trips;
}

function detectCurrentTripGroupIndex(tripGroups) {
  if (tripGroups.length <= 1) return 0;
  const todayStr = getTodayString();
  for (let i = 0; i < tripGroups.length; i++) {
    if (todayStr >= tripGroups[i].start && todayStr <= tripGroups[i].end) return i;
  }
  for (let i = 0; i < tripGroups.length; i++) {
    if (tripGroups[i].start > todayStr) return i;
  }
  return tripGroups.length - 1;
}

function detectCurrentTripIndex(trips) {
  if (trips.length <= 1) return 0;
  const todayStr = getTodayString();
  for (let i = 0; i < trips.length; i++) {
    const firstDate = trips[i][0].date || "";
    const lastDate = trips[i][trips[i].length - 1].date || "";
    if (todayStr >= firstDate && todayStr <= lastDate) return i;
  }
  for (let i = 0; i < trips.length; i++) {
    if ((trips[i][0].date || "") > todayStr) return i;
  }
  return trips.length - 1;
}

async function filterToCurrentTrip(sortedActivities) {
  const tripBudgets = await loadTripBudgets();
  const tripGroups = buildTripsFromBudgets(sortedActivities, tripBudgets);

  if (tripGroups.length === 0) return [];

  const idx = selectedTripIndex >= 0 ? selectedTripIndex : detectCurrentTripGroupIndex(tripGroups);
  const group = tripGroups[Math.min(idx, tripGroups.length - 1)];

  if (group && group.activities.length > 0) return group.activities;
  if (group) {
    return sortedActivities.filter(a => a.date >= group.start && a.date <= group.end);
  }
  return [];
}

function getTripGroupLabel(tg) {
  const [fy, fm, fd] = tg.start.split("-").map(Number);
  const [ly, lm, ld] = tg.end.split("-").map(Number);
  const start = new Date(fy, fm - 1, fd);
  const end = new Date(ly, lm - 1, ld);
  const days = Math.round((end - start) / (1000 * 60 * 60 * 24)) + 1;
  const startStr = start.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const endStr = end.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return `${startStr} – ${endStr} (${days}d)`;
}

function getTripLabel(trip) {
  if (!trip || trip.length === 0) return "Trip";
  const firstDate = trip[0].date || "";
  const lastDate = trip[trip.length - 1].date || "";
  const [fy, fm, fd] = firstDate.split("-").map(Number);
  const [ly, lm, ld] = lastDate.split("-").map(Number);
  const start = new Date(fy, fm - 1, fd);
  const end = new Date(ly, lm - 1, ld);
  const days = Math.round((end - start) / (1000 * 60 * 60 * 24)) + 1;
  const startStr = start.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const endStr = end.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return `${startStr} – ${endStr} (${days}d)`;
}

function getTripGroupStatus(tg) {
  const todayStr = getTodayString();
  if (todayStr > tg.end) return "past";
  if (todayStr >= tg.start && todayStr <= tg.end) return "active";
  return "upcoming";
}

function getTripStatus(trip) {
  if (!trip || trip.length === 0) return "upcoming";
  const todayStr = getTodayString();
  const firstDate = trip[0].date || "";
  const lastDate = trip[trip.length - 1].date || "";
  if (todayStr > lastDate) return "past";
  if (todayStr >= firstDate && todayStr <= lastDate) return "active";
  return "upcoming";
}

// ============================================================
// TRIP MEMBER GATING
// ============================================================

async function checkTripMembership(tripId) {
  const user = Auth.getUser();
  if (!user) return true;
  if (user.role === "admin") return true;

  try {
    const members = await apiFetch(`/trips/${tripId}/members`);
    if (members.length === 0) return true;
    return members.some(m => m.user_id === user.id);
  } catch {
    return true;
  }
}

function showTripGatingMessage(containerEl, tripLabel) {
  const user = Auth.getUser();
  containerEl.innerHTML = `
    <div style="text-align:center; padding:2.5rem 1.5rem; background:rgba(255,253,244,0.92); border-radius:20px; border:2px dashed #fca5a5; margin-bottom:1.5rem;">
      <div style="font-size:2.5rem; margin-bottom:0.75rem;">🚫</div>
      <h3 style="font-family:'Mouse Memoirs',sans-serif; font-size:1.5rem; color:var(--castle-blue); margin:0 0 0.5rem;">Not Assigned to This Trip</h3>
      <p style="color:var(--slate); margin:0 0 1rem; line-height:1.6;">
        Hey ${user ? user.name.split(" ")[0] : "there"}! You're not listed as a member of <strong>${escapeHtml(tripLabel || "this trip")}</strong>.
      </p>
      <p style="color:var(--muted); font-size:0.9rem; margin:0;">
        Ask a trip organizer to add you, or choose a trip you're assigned to.
      </p>
    </div>
  `;
}

// ============================================================
// CUSTOM CONFIRM DIALOG
// ============================================================

function showConfirmDialog(message) {
  return new Promise((resolve) => {
    document.getElementById("disney-confirm-overlay")?.remove();

    const overlay = document.createElement("div");
    overlay.id = "disney-confirm-overlay";
    overlay.style.cssText = `
      position:fixed; inset:0; background:rgba(0,0,0,0.55);
      display:flex; align-items:center; justify-content:center;
      z-index:99999;
    `;

    overlay.innerHTML = `
      <div style="
        background:#fff; border-radius:20px; padding:2rem 2rem 1.5rem;
        max-width:360px; width:90%; box-shadow:0 20px 60px rgba(0,0,0,0.3);
        text-align:center;
      ">
        <div style="font-size:2rem; margin-bottom:0.75rem;">🗑️</div>
        <p style="font-size:1rem; font-weight:600; color:#1a1a2e; margin:0 0 1.5rem; line-height:1.4;">${message}</p>
        <div style="display:flex; gap:0.75rem; justify-content:center;">
          <button id="confirm-cancel-btn" style="
            flex:1; padding:0.7rem 1rem; border-radius:999px; border:2px solid #e2e8f0;
            background:#fff; font-weight:700; font-size:0.95rem; cursor:pointer; color:#64748b;
          ">Cancel</button>
          <button id="confirm-ok-btn" style="
            flex:1; padding:0.7rem 1rem; border-radius:999px; border:none;
            background:#C41E3A; color:#fff; font-weight:700; font-size:0.95rem; cursor:pointer;
          ">Delete</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    const cleanup = (result) => {
      overlay.remove();
      resolve(result);
    };

    document.getElementById("confirm-ok-btn").addEventListener("click", () => cleanup(true));
    document.getElementById("confirm-cancel-btn").addEventListener("click", () => cleanup(false));
    overlay.addEventListener("click", (e) => { if (e.target === overlay) cleanup(false); });
  });
}

// ============================================================
// AUTH — Email-based login, user greeting, admin badge
// ============================================================

const Auth = {
  getToken() { return localStorage.getItem("disney-auth-token") || ""; },
  getUser() {
    try { return JSON.parse(localStorage.getItem("disney-user") || "null"); } catch { return null; }
  },
  setSession(token, user) {
    localStorage.setItem("disney-auth-token", token);
    localStorage.setItem("disney-user", JSON.stringify(user));
  },
  clearSession() {
    localStorage.removeItem("disney-auth-token");
    localStorage.removeItem("disney-user");
  },

  async login(email) {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || "Login failed");
    }
    const data = await res.json();
    this.setSession(data.token, data.user);
    return data.user;
  },

  async verify() {
    const token = this.getToken();
    if (!token) return null;
    try {
      const res = await fetch("/api/auth/me", {
        headers: { "Authorization": `Bearer ${token}` },
      });
      // Only clear the session on real auth failures. Transient 5xx / network
      // errors / Cloudflare blips must NOT log the user out — fall back to
      // the cached user instead.
      if (res.status === 401 || res.status === 403) {
        this.clearSession();
        return null;
      }
      if (!res.ok) return this.getUser();
      const user = await res.json();
      localStorage.setItem("disney-user", JSON.stringify(user));
      return user;
    } catch {
      return this.getUser(); // offline fallback
    }
  },

  logout() {
    const token = this.getToken();
    if (token) {
      fetch("/api/auth/logout", {
        method: "POST",
        headers: { "Authorization": `Bearer ${token}` },
      }).catch(() => {});
    }
    this.clearSession();
    location.reload();
  },
};

function showLoginModal(onSuccess) {
  document.getElementById("login-modal-overlay")?.remove();

  const overlay = document.createElement("div");
  overlay.id = "login-modal-overlay";
  overlay.className = "modal-overlay";
  overlay.style.background = "linear-gradient(175deg, var(--bg-color-1) 0%, var(--bg-color-2) 50%, var(--bg-color-3) 100%)";
  overlay.innerHTML = `
    <div class="modal-card" style="max-width:400px; text-align:center;">
      <div style="font-size:3rem; margin-bottom:0.5rem;">🏰</div>
      <h2>Welcome!</h2>
      <p style="color:var(--slate); margin:0.5rem 0 1.5rem;">Enter your email to sign in to the Disney Trip Dashboard.</p>
      <div class="wizard-field" style="text-align:left;">
        <label for="login-email-input">Email</label>
        <input type="email" id="login-email-input" placeholder="your@email.com" />
      </div>
      <p id="login-error" style="color:var(--magic-red); font-weight:700; margin:0.75rem 0 0; display:none;"></p>
      <button type="button" class="primary-button" id="login-submit-btn" style="width:100%; margin-top:1rem;">
        Sign In
      </button>
    </div>
  `;
  document.body.appendChild(overlay);
  document.body.style.overflow = "hidden";

  const emailInput = document.getElementById("login-email-input");
  const submitBtn = document.getElementById("login-submit-btn");
  const errorEl = document.getElementById("login-error");

  async function doLogin() {
    const email = emailInput.value.trim();
    if (!email) return;
    submitBtn.textContent = "Signing in...";
    submitBtn.disabled = true;
    errorEl.style.display = "none";
    try {
      await Auth.login(email);
      overlay.remove();
      document.body.style.overflow = "";
      if (onSuccess) onSuccess();
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.style.display = "block";
      submitBtn.textContent = "Sign In";
      submitBtn.disabled = false;
    }
  }

  submitBtn.addEventListener("click", doLogin);
  emailInput.addEventListener("keydown", (e) => { if (e.key === "Enter") doLogin(); });
  setTimeout(() => emailInput.focus(), 100);
}

function renderUserBadge() {
  document.getElementById("user-badge")?.remove();

  const user = Auth.getUser();
  if (!user) return;

  const pill = document.getElementById("nav-pill");
  if (pill) {
    const label = pill.querySelector(".nav-pill-label");
    if (label) label.textContent = user.name.split(" ")[0];

    if (!pill.querySelector(".nav-pill-logout")) {
      const logoutBtn = document.createElement("button");
      logoutBtn.className = "nav-pill-logout";
      logoutBtn.title = "Log Out";
      logoutBtn.textContent = "↪";
      logoutBtn.style.cssText = "background:none; border:none; color:rgba(255,255,255,0.45); cursor:pointer; font-size:0.85rem; padding:0 0 0 0.15rem; line-height:1;";
      logoutBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        Auth.logout();
      });
      pill.appendChild(logoutBtn);
    }
  }
}

// Disney Magic Animations
function initializeDisneyMagic() {
  const elements = document.querySelectorAll('.info-card, .hero-card, .activity-card, .nav-link, .primary-button, .secondary-button, .danger-button, .disney-image-card');

  elements.forEach(el => {
    el.classList.add('squash-target');

    const startSquish = (e) => {
      if (e && e.target) {
        const tagName = e.target.tagName.toUpperCase();
        if (['INPUT', 'TEXTAREA', 'SELECT', 'LABEL', 'OPTION', 'BUTTON', 'A'].includes(tagName) ||
          e.target.closest('.edit-activity-btn')) {
          return; 
        }
      }
      el.classList.remove('is-bouncing');
      el.classList.add('is-squished');
    };

    const releaseBounce = (e) => {
      if (!el.classList.contains('is-squished')) return;
      el.classList.remove('is-squished');
      el.classList.add('is-bouncing');
      setTimeout(() => el.classList.remove('is-bouncing'), 400);
    };

    el.addEventListener('mousedown', startSquish);
    el.addEventListener('mouseup', releaseBounce);
    el.addEventListener('mouseleave', () => {
        el.classList.remove('is-squished', 'is-bouncing');
    });
    el.addEventListener('touchstart', startSquish, { passive: true });
    el.addEventListener('touchend', releaseBounce);
    el.addEventListener('touchcancel', () => {
        el.classList.remove('is-squished', 'is-bouncing');
    });
  });

  // Theme Testing
  const themes = ['', 'theme-mk', 'theme-epcot', 'theme-hs', 'theme-ak'];
  let currentThemeIndex = 0;

  document.body.addEventListener('dblclick', () => {
    document.body.classList.remove(themes[currentThemeIndex]);
    currentThemeIndex = (currentThemeIndex + 1) % themes.length;
    if (themes[currentThemeIndex]) {
      document.body.classList.add(themes[currentThemeIndex]);
    }
  });
}

// ============================================================
// Known Disney locations — map location names to coordinates
// ============================================================

const GOOGLE_MAPS_API_KEY = "YOUR_GOOGLE_MAPS_API_KEY";

const DISNEY_LOCATION_MAP = {
  "magic kingdom":          { lat: 28.4177, lng: -81.5812, label: "Magic Kingdom" },
  "fantasyland":            { lat: 28.4202, lng: -81.5816, label: "Fantasyland, Magic Kingdom" },
  "tomorrowland":           { lat: 28.4186, lng: -81.5798, label: "Tomorrowland, Magic Kingdom" },
  "main street":            { lat: 28.4160, lng: -81.5812, label: "Main Street U.S.A., Magic Kingdom" },
  "liberty square":         { lat: 28.4192, lng: -81.5829, label: "Liberty Square, Magic Kingdom" },
  "adventureland":          { lat: 28.4193, lng: -81.5835, label: "Adventureland, Magic Kingdom" },
  "frontierland":           { lat: 28.4197, lng: -81.5833, label: "Frontierland, Magic Kingdom" },
  "epcot":                  { lat: 28.3747, lng: -81.5494, label: "EPCOT" },
  "hollywood studios":      { lat: 28.3574, lng: -81.5582, label: "Hollywood Studios" },
  "animal kingdom":         { lat: 28.3553, lng: -81.5901, label: "Animal Kingdom" },
  "caribbean beach resort": { lat: 28.3635, lng: -81.5534, label: "Caribbean Beach Resort" },
  "disney springs":         { lat: 28.3706, lng: -81.5168, label: "Disney Springs" },
  "grand floridian":        { lat: 28.4121, lng: -81.5876, label: "Grand Floridian Resort" },
  "boardwalk":              { lat: 28.3686, lng: -81.5499, label: "Disney's BoardWalk" },
};

function resolveDisneyLocation(locationString) {
  if (!locationString) return null;
  const lower = locationString.toLowerCase();
  for (const [key, coords] of Object.entries(DISNEY_LOCATION_MAP)) {
    if (lower.includes(key)) return coords;
  }
  return null;
}

// ============================================================
// APP INIT + AUTH GATE
// ============================================================

document.addEventListener("DOMContentLoaded", async () => {
  // Quick API health check
  try {
    const health = await apiFetch("/health");
    console.log("✅ API server connected:", health);
  } catch (err) {
    console.error("❌ API server not reachable! Activities won't load.", err);
  }

  // Auth — verify session, require login
  const user = await Auth.verify();
  if (!user) {
    const mainContent = document.querySelector(".page-content");
    if (mainContent) mainContent.style.display = "none";
    showLoginModal(() => {
      if (mainContent) mainContent.style.display = "";
      renderUserBadge();
      initApp();
    });
    return;
  }

  renderUserBadge();
  initApp();
});

function initApp() {
  // Render nav tray from single source of truth (eliminates copy-pasted SVG in every HTML file)
  try { if (typeof renderNav === "function") renderNav(); } catch(e) { console.error("[initApp] renderNav error:", e); }

  getStoredItinerary().then(() => {
    // Page-specific inits — each file registers its own if present
    try { if (typeof initializeItineraryPage === "function") initializeItineraryPage(); } catch(e) { console.error("[initApp] error:", e); }
    try { if (typeof initializeDashboardPage === "function") initializeDashboardPage(); } catch(e) { console.error("[initApp] error:", e); }
    try { if (typeof initializeWishlistPage === "function") initializeWishlistPage(); } catch(e) { console.error("[initApp] error:", e); }
    try { if (typeof initializeBudgetPage === "function") initializeBudgetPage(); } catch(e) { console.error("[initApp] error:", e); }
    try { if (typeof initializePhotosPage === "function") initializePhotosPage(); } catch(e) { console.error("[initApp] error:", e); }
    try { if (typeof initializePinsPage === "function") initializePinsPage(); } catch(e) { console.error("[initApp] error:", e); }
    try { if (typeof initializeActivityModal === "function") initializeActivityModal(); } catch(e) { console.error("[initApp] error:", e); }
    try { if (typeof initializeWeather === "function") initializeWeather(); } catch(e) { console.error("[initApp] error:", e); }
    initializeDisneyMagic();
    try { if (typeof renderParkDayBanner === "function") renderParkDayBanner(); } catch(e) { console.error("[initApp] error:", e); }
    try { if (typeof initNavPill === "function") initNavPill(); } catch(e) { console.error("[initApp] error:", e); }
    try { if (typeof initBudgetPill === "function") initBudgetPill(); } catch(e) { console.error("[initApp] error:", e); }
    try { if (typeof initEditTripButton === "function") initEditTripButton(); } catch(e) { console.error("[initApp] error:", e); }

    // Phase 3: Check for unacknowledged trip assignments
    checkTripSplash();

    // Budget confirmation: check if user has an active trip with unconfirmed budget
    checkBudgetConfirmation();

    console.log("Disney site loaded");
  }).catch(err => {
    console.error("[initApp] Fatal error in init chain:", err);
  });
}

// ============================================================
// TRIP ASSIGNMENT SPLASH — "You're going to Disney World!"
// Shows once per trip when a user is newly assigned.
// ============================================================

async function checkTripSplash() {
  try {
    const user = Auth.getUser();
    if (!user || user.role === "admin") return; // Admins are the planners — no surprise needed

    const trips = await apiFetch("/my/unacknowledged-trips");
    if (!trips || trips.length === 0) return;

    // Show splash for the first unacknowledged trip
    const trip = trips[0];
    showTripSplash(trip);
  } catch (e) {
    // Silently fail — splash is non-critical
    console.warn("[TripSplash] Could not check:", e);
  }
}

// ============================================================
// BUDGET CONFIRMATION — "Is your budget accurate?"
// Auto-prompts on first login during trip dates when budget
// is in saving mode (confirmed = 0).
// ============================================================

async function checkBudgetConfirmation() {
  try {
    const user = Auth.getUser();
    if (!user) return;

    // Don't interrupt if the trip splash is showing
    if (document.getElementById("trip-splash-overlay")) return;

    const todayStr = getTodayString();
    let allTrips = [];
    try { allTrips = await apiFetch("/trip-budgets"); } catch (e) { return; }

    // Find an active trip (today is within trip dates)
    const activeTrip = allTrips.find(t => todayStr >= t.start_date && todayStr <= t.end_date);
    if (!activeTrip) return;

    // Check the user's personal budget for this trip
    let myBudget = null;
    try { myBudget = await apiFetch(`/trips/${activeTrip.trip_id}/my-budget`); } catch (e) { return; }

    // Only prompt if they have a budget set but haven't confirmed it
    if (!myBudget || !myBudget.exists || myBudget.confirmed) return;

    // Show the confirmation prompt
    showBudgetConfirmation(activeTrip, myBudget);
  } catch (e) {
    console.warn("[BudgetConfirm] Could not check:", e);
  }
}

function showBudgetConfirmation(trip, myBudget) {
  document.getElementById("budget-confirm-overlay")?.remove();

  const user = Auth.getUser();
  const firstName = user ? user.name.split(" ")[0] : "there";
  const totalContributed = myBudget.totalContributed || 0;
  const budgetGoal = myBudget.total || 0;

  const overlay = document.createElement("div");
  overlay.id = "budget-confirm-overlay";
  overlay.style.cssText = `
    position:fixed; inset:0; z-index:100000;
    background:rgba(0,0,0,0.7);
    display:flex; align-items:center; justify-content:center;
    padding:1rem;
  `;

  overlay.innerHTML = `
    <div style="background:#fff; border-radius:20px; padding:2rem; max-width:440px; width:100%; text-align:center; box-shadow:0 20px 60px rgba(0,0,0,0.3);">
      <div style="font-size:2.5rem; margin-bottom:0.5rem;">💰</div>
      <h2 style="font-family:'Mouse Memoirs',sans-serif; font-size:1.6rem; color:var(--castle-blue); margin:0 0 0.5rem;">Your Trip Has Started!</h2>
      <p style="color:var(--slate); margin:0 0 1rem; font-size:0.95rem;">Hey ${escapeHtml(firstName)}, let's lock in your budget for spending.</p>

      <div style="background:#f8fafc; border-radius:12px; padding:1rem; margin-bottom:1rem;">
        ${totalContributed > 0 ? `
          <p style="font-size:0.85rem; color:var(--muted); font-weight:600; margin:0 0 0.25rem;">You've saved</p>
          <p style="font-size:2rem; font-weight:900; color:var(--castle-blue); margin:0;">$${totalContributed.toFixed(2)}</p>
          <p style="font-size:0.85rem; color:var(--muted); font-weight:600; margin:0.25rem 0 0;">toward your $${budgetGoal.toFixed(2)} goal</p>
        ` : `
          <p style="font-size:0.85rem; color:var(--muted); font-weight:600; margin:0 0 0.25rem;">Your budget goal</p>
          <p style="font-size:2rem; font-weight:900; color:var(--castle-blue); margin:0;">$${budgetGoal.toFixed(2)}</p>
        `}
      </div>

      <p style="color:var(--slate); font-size:0.88rem; margin:0 0 1.25rem;">Is this the right amount for your trip spending?</p>

      <div style="display:flex; flex-direction:column; gap:0.6rem;">
        <button type="button" class="primary-button" id="budget-confirm-yes" style="width:100%;">
          ✅ Looks good — lock it in!
        </button>
        <button type="button" class="secondary-button" id="budget-confirm-edit" style="width:100%;">
          ✏️ Edit my budget first
        </button>
        <button type="button" style="background:none; border:none; color:var(--muted); cursor:pointer; font-family:'Nunito',sans-serif; font-size:0.85rem; padding:0.5rem;" id="budget-confirm-later">
          Remind me later
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  document.body.style.overflow = "hidden";

  const close = () => {
    overlay.remove();
    document.body.style.overflow = "";
  };

  // Confirm — lock the budget
  document.getElementById("budget-confirm-yes").addEventListener("click", async () => {
    try {
      await apiFetch(`/trips/${trip.trip_id}/confirm-budget`, { method: "POST" });
      close();
      showToast("✅ Budget locked in! Happy spending!");
      if (typeof refreshBudgetPill === "function") refreshBudgetPill();
    } catch (e) {
      showToast("❌ Failed to confirm budget.");
    }
  });

  // Edit — close and open budget wizard
  document.getElementById("budget-confirm-edit").addEventListener("click", () => {
    close();
    if (typeof openBudgetWizard === "function") {
      openBudgetWizard(trip.trip_id);
    } else {
      window.location.href = "budget.html";
    }
  });

  // Later — just close (will prompt again next page load)
  document.getElementById("budget-confirm-later").addEventListener("click", close);
}

function showTripSplash(trip) {
  document.getElementById("trip-splash-overlay")?.remove();

  const user = Auth.getUser();
  const firstName = user ? user.name.split(" ")[0] : "there";

  const [sy, sm, sd] = trip.start_date.split("-").map(Number);
  const [ey, em, ed] = trip.end_date.split("-").map(Number);
  const startDate = new Date(sy, sm - 1, sd);
  const endDate = new Date(ey, em - 1, ed);
  const days = Math.round((endDate - startDate) / (1000 * 60 * 60 * 24)) + 1;
  const startStr = startDate.toLocaleDateString("en-US", { month: "long", day: "numeric" });
  const endStr = endDate.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

  // Countdown
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const daysUntil = Math.ceil((startDate - today) / (1000 * 60 * 60 * 24));
  let countdownText = "";
  if (daysUntil > 1) countdownText = `${daysUntil} days away`;
  else if (daysUntil === 1) countdownText = "Tomorrow!";
  else if (daysUntil === 0) countdownText = "Today!";
  else countdownText = "Trip in progress!";

  const overlay = document.createElement("div");
  overlay.id = "trip-splash-overlay";
  overlay.style.cssText = `
    position:fixed; inset:0; z-index:100000;
    background: linear-gradient(175deg, #003087 0%, #1a1a6e 40%, #0a0a3e 100%);
    display:flex; align-items:center; justify-content:center;
    animation: splashFadeIn 0.5s ease;
  `;

  overlay.innerHTML = `
    <style>
      @keyframes splashFadeIn { from { opacity:0; } to { opacity:1; } }
      @keyframes splashCastle { from { transform:scale(0.5) translateY(40px); opacity:0; } to { transform:scale(1) translateY(0); opacity:1; } }
      @keyframes splashText { from { transform:translateY(20px); opacity:0; } to { transform:translateY(0); opacity:1; } }
      @keyframes splashSparkle { 0%,100% { opacity:0.3; transform:scale(0.8); } 50% { opacity:1; transform:scale(1.2); } }
      .splash-card { text-align:center; padding:2.5rem 2rem; max-width:420px; width:90%; }
      .splash-castle { font-size:5rem; animation: splashCastle 0.8s ease 0.2s both; }
      .splash-sparkles { font-size:1.5rem; animation: splashSparkle 2s ease infinite; margin:0.5rem 0; }
      .splash-title { font-family:'Mouse Memoirs',sans-serif; font-size:2.2rem; color:#FFD700; margin:0.75rem 0 0.25rem; animation: splashText 0.6s ease 0.4s both; letter-spacing:0.03em; }
      .splash-subtitle { font-family:'Nunito',sans-serif; font-size:1rem; color:rgba(255,255,255,0.85); margin:0 0 0.25rem; animation: splashText 0.6s ease 0.5s both; font-weight:600; }
      .splash-dates { font-family:'Nunito',sans-serif; font-size:1.15rem; color:white; font-weight:800; margin:0.75rem 0; animation: splashText 0.6s ease 0.6s both; }
      .splash-countdown { font-family:'Nunito',sans-serif; font-size:0.95rem; color:#FFD700; font-weight:700; margin:0 0 1.5rem; animation: splashText 0.6s ease 0.7s both; }
      .splash-buttons { display:flex; flex-direction:column; gap:0.75rem; animation: splashText 0.6s ease 0.8s both; }
      .splash-btn { display:block; padding:0.85rem 1.5rem; border-radius:999px; font-family:'Nunito',sans-serif; font-size:1rem; font-weight:800; cursor:pointer; text-decoration:none; text-align:center; border:none; transition:transform 0.15s, box-shadow 0.15s; }
      .splash-btn:hover { transform:translateY(-2px); box-shadow:0 6px 20px rgba(0,0,0,0.3); }
      .splash-btn-primary { background:linear-gradient(135deg, #FFD700, #FFA500); color:#1a1a2e; }
      .splash-btn-secondary { background:rgba(255,255,255,0.15); color:white; border:2px solid rgba(255,255,255,0.3); }
      .splash-btn-ghost { background:none; color:rgba(255,255,255,0.5); font-size:0.85rem; padding:0.5rem; }
    </style>
    <div class="splash-card">
      <div class="splash-castle">🏰</div>
      <div class="splash-sparkles">✨ ✨ ✨</div>
      <h1 class="splash-title">Hey ${escapeHtml(firstName)}!</h1>
      <p class="splash-subtitle">You're going to</p>
      <h2 class="splash-title" style="font-size:2.8rem; margin-top:0; color:white;">Walt Disney World!</h2>
      <p class="splash-dates">${startStr} – ${endStr}<br>${days} magical day${days !== 1 ? "s" : ""}</p>
      <p class="splash-countdown">🗓️ ${countdownText}</p>
      <div class="splash-buttons">
        <a href="tripcalendar.html?trip=${encodeURIComponent(trip.trip_id)}" class="splash-btn splash-btn-primary" id="splash-view-trip">
          🗺️ View My Trip
        </a>
        <button type="button" class="splash-btn splash-btn-secondary" id="splash-set-budget">
          💰 Set My Budget
        </button>
        <button type="button" class="splash-btn splash-btn-ghost" id="splash-dismiss">
          Skip for now
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  document.body.style.overflow = "hidden";

  // Wire buttons
  const acknowledge = async () => {
    try {
      await apiFetch(`/trips/${trip.trip_id}/acknowledge`, { method: "POST" });
    } catch (e) { }
  };

  document.getElementById("splash-view-trip").addEventListener("click", async (e) => {
    await acknowledge();
    // Link navigates naturally
  });

  document.getElementById("splash-set-budget").addEventListener("click", async () => {
    await acknowledge();
    overlay.remove();
    document.body.style.overflow = "";
    // Open budget wizard for this trip
    if (typeof openBudgetWizard === "function") {
      openBudgetWizard(trip.trip_id);
    } else {
      window.location.href = "budget.html";
    }
  });

  document.getElementById("splash-dismiss").addEventListener("click", async () => {
    await acknowledge();
    overlay.remove();
    document.body.style.overflow = "";
  });
}