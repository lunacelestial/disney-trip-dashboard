// ============================================================
// ITINERARY PAGE — Rendering, activity form, venue autocomplete,
// edit trip modal
// Depends on: script.js (core), dashboard.js (renderTripSwitcher)
// ============================================================

// ── PARK_DISPLAY for itinerary day headers ───────────────────

const PARK_DISPLAY = {
  "magic-kingdom":     { label: "Magic Kingdom", emoji: "🏰", color: "#1e40af", bg: "rgba(30,64,175,0.12)" },
  "epcot":             { label: "EPCOT", emoji: "🌍", color: "#7c3aed", bg: "rgba(124,58,237,0.12)" },
  "hollywood-studios": { label: "Hollywood Studios", emoji: "🎬", color: "#b91c1c", bg: "rgba(185,28,28,0.12)" },
  "animal-kingdom":    { label: "Animal Kingdom", emoji: "🌿", color: "#15803d", bg: "rgba(21,128,61,0.12)" },
  "disney-springs":    { label: "Disney Springs", emoji: "🛍️", color: "#0369a1", bg: "rgba(3,105,161,0.12)" },
  "rest-day":          { label: "Rest / Pool Day", emoji: "☀️", color: "#ca8a04", bg: "rgba(202,138,4,0.12)" },
  "travel":            { label: "Travel Day", emoji: "🚗", color: "#475569", bg: "rgba(71,85,105,0.12)" },
};

// ── Render Itinerary ─────────────────────────────────────────

async function renderItinerary() {
  const itineraryList = document.getElementById("itinerary-list");
  if (!itineraryList) return;

  const allSorted = sortItineraryByTime(await getStoredItinerary());
  const fullTrip = await filterToCurrentTrip(allSorted);
  
  if (fullTrip.length === 0) {
    itineraryList.innerHTML = `
      <article class="activity-card empty-state-card">
        <p class="card-label">No Upcoming Activities</p>
        <h3 class="activity-title">Your itinerary is clear!</h3>
        <p class="activity-location">Tap "Add Activity" to plan something new.</p>
      </article>
    `;
    return;
  }

  const tripStartDate = new Date(fullTrip[0].date + "T12:00:00");
  const tripEndDate = new Date(fullTrip[fullTrip.length - 1].date + "T12:00:00");

  const allTripDates = [];
  const cursor = new Date(tripStartDate);
  while (cursor <= tripEndDate) {
    allTripDates.push(cursor.toISOString().split("T")[0]);
    cursor.setDate(cursor.getDate() + 1);
  }

  const todayStr = getTodayString();
  const visibleDates = allTripDates.filter(date => date >= todayStr);

  if (visibleDates.length === 0) {
    itineraryList.innerHTML = `
      <article class="activity-card empty-state-card">
        <p class="card-label">Trip Complete!</p>
        <h3 class="activity-title">Hope you had a magical time!</h3>
        <p class="activity-location">All trip days are in the past.</p>
      </article>
    `;
    return;
  }

  const parkDays = await ParkDaysDB.getAll();
  const parkDayMap = {};
  parkDays.forEach(pd => { parkDayMap[pd.date] = pd.park; });

  const groupedByDate = {};
  fullTrip.forEach(activity => {
    const ad = activity.date || "Unknown";
    if (!groupedByDate[ad]) groupedByDate[ad] = [];
    groupedByDate[ad].push(activity);
  });

  let html = "";

  visibleDates.forEach((date) => {
    const activities = (groupedByDate[date] || []).sort((a, b) => (a.time || "").localeCompare(b.time || ""));
    
    const currentDate = new Date(date + "T12:00:00");
    const dayNum = Math.round((currentDate - tripStartDate) / (1000 * 60 * 60 * 24)) + 1;

    const [y, m, dd] = date.split("-").map(Number);
    const dateLabel = new Date(y, m - 1, dd).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

    const parkVal = parkDayMap[date] || "";
    const parkInfo = parkVal ? PARK_DISPLAY[parkVal] : null;
    const parkBadge = parkInfo
      ? `<span style="font-size: 0.8rem; color: ${parkInfo.color}; font-weight: 700; font-family: 'Nunito', sans-serif; background: ${parkInfo.bg}; padding: 0.15rem 0.5rem; border-radius: 999px; white-space: nowrap;">${parkInfo.emoji} ${parkInfo.label}</span>`
      : "";

    html += `
      <div class="day-group" style="margin-bottom: 0.25rem; max-width: 100%; overflow: hidden;"> 
        <h2 style="font-size: 1.5rem; color: var(--castle-blue); margin-bottom: 0.25rem; display: flex; align-items: baseline; gap: 0.75rem; text-transform: uppercase; flex-wrap: wrap;">
          ${dateLabel} 
          <span style="font-size: 1rem; color: var(--muted); font-weight: 500;">day ${dayNum}</span>
          ${parkBadge}
        </h2>
    `;

    if (activities.length > 0) {
      html += `<div class="eticket-scroll-row hide-scrollbar">`;

      html += activities.map((activity, idx) => {
        const cfg = getETicketConfig(activity.type, activity.title);
        const displayNotes = getDisplayNotes(activity);

        return `
          <article class="eticket clickable-card" data-id="${activity.id}" role="button" tabindex="0"
                   aria-label="View details for ${escapeHtml(activity.title)}"
                   style="
                     min-width: 280px; 
                     max-width: 320px;
                     scroll-snap-align: start; 
                     flex-shrink: 0;
                     background: ${cfg.bg}; 
                     border-color: ${cfg.border}; 
                     --et-text: ${cfg.text}; 
                     --et-accent: ${cfg.accent}; 
                     --et-stripe: ${cfg.stripe}; 
                     --et-label-bg: ${cfg.labelBg}; 
                     animation-delay: ${idx * 0.08}s;
                   ">
            
            <button type="button" class="edit-activity-btn small-button secondary-button" 
                    data-id="${activity.id}">
              <span class="edit-btn-icon">✏️</span><span class="edit-btn-text">Edit</span>
            </button>

            <div class="et-header">
              <span class="et-letter">${cfg.letter}</span>
              <div class="et-branding">
                <span class="et-disney-mark">${getTicketParkBranding(activity.location).mark}</span>
                ${getTicketParkBranding(activity.location).coupon ? `<span class="et-coupon-label">${getTicketParkBranding(activity.location).coupon}</span>` : ""}
              </div>
            </div>

            <div class="et-body">
              <span class="et-icon">${cfg.icon}</span>
              <div class="et-info">
                <h3 class="et-name">${escapeHtml(activity.title)}</h3>
                <p class="et-location">${escapeHtml(activity.location)}</p>
              </div>
            </div>

            <div class="et-time-strip">
              <span class="et-time">${formatTimeForDisplay(activity.time)}</span>
              ${displayNotes ? `<span class="et-note">${escapeHtml(displayNotes)}</span>` : ""}
            </div>

            <div class="et-footer">
              <span class="et-admit">ADMIT ONE</span>
              <span class="et-serial">${String(activity.id || "").slice(-5).toUpperCase()}</span>
            </div>
          </article>
        `;
      }).join("");

      html += `</div>`;
    } else {
      html += `
        <p style="color: var(--muted); font-style: italic; margin: 0.5rem 0 0; font-size: 0.95rem;">
          No activities planned yet — enjoy the spontaneity! ✨
        </p>
      `;
    }

    html += `</div>`;
  });

  itineraryList.innerHTML = html;
}

// ── Activity Form ────────────────────────────────────────────

function openActivityForm() {
  const formCard = document.getElementById("activity-form-card");
  const openButton = document.getElementById("open-activity-form-btn");

  if (!formCard || !openButton) return;

  formCard.classList.remove("hidden");
  openButton.classList.add("hidden");

  const titleInput = document.getElementById("activity-title-input");
  if (titleInput) {
    setTimeout(() => titleInput.focus(), 50);
  }
}

function closeActivityForm() {
  const formCard = document.getElementById("activity-form-card");
  const openButton = document.getElementById("open-activity-form-btn");

  if (!formCard || !openButton) return;

  formCard.classList.add("hidden");
  openButton.classList.remove("hidden");
}

function showDeleteButton() {
  const deleteButton = document.getElementById("delete-activity-btn");
  if (deleteButton) {
    deleteButton.classList.remove("hidden");
  }
}

function hideDeleteButton() {
  const deleteButton = document.getElementById("delete-activity-btn");
  if (deleteButton) {
    deleteButton.classList.add("hidden");
  }
}

async function populateFormForEdit(activityId) {
  const activity = await ItineraryDB.findById(activityId);
  if (!activity) return;

  document.getElementById("activity-id").value = activity.id;
  document.getElementById("activity-date-input").value = activity.date || ""; 
  document.getElementById("activity-time-input").value = activity.time;
  document.getElementById("activity-type-input").value = activity.type;
  document.getElementById("activity-title-input").value = activity.title;
  document.getElementById("activity-location-input").value = activity.location;
  document.getElementById("activity-notes-input").value = activity.notes || "";
  const urlInput = document.getElementById("activity-url-input");
  if (urlInput) urlInput.value = activity.url || "";

  document.getElementById("form-heading").textContent = "Edit Activity";
  document.getElementById("save-activity-btn").textContent = "Update Activity";

  showDeleteButton();
  openActivityForm();

  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });
}

function resetActivityForm() {
  const form = document.getElementById("activity-form");
  if (!form) return;

  form.reset();
  document.getElementById("activity-id").value = "";
  document.getElementById("activity-date-input").value = ""; 
  document.getElementById("form-heading").textContent = "Add Activity";
  document.getElementById("save-activity-btn").textContent = "Save Activity";
  hideDeleteButton();
}

function handleCancelForm() {
  resetActivityForm();
  closeActivityForm();
}

async function handleActivityFormSubmit(event) {
  event.preventDefault();

  const existingId  = document.getElementById("activity-id").value.trim();
  const activityData = {
    id:       existingId || generateId(),
    date:     document.getElementById("activity-date-input").value,
    time:     document.getElementById("activity-time-input").value,
    type:     document.getElementById("activity-type-input").value,
    title:    document.getElementById("activity-title-input").value.trim(),
    location: document.getElementById("activity-location-input").value.trim(),
    notes:    document.getElementById("activity-notes-input").value.trim(),
    url:      (document.getElementById("activity-url-input") || {}).value?.trim() || "",
    image:    "",
  };

  if (existingId) {
    await ItineraryDB.update(existingId, activityData);
  } else {
    await ItineraryDB.add(activityData);
  }

  // Auto-save venue for future autocomplete
  if (activityData.title) {
    VenuesDB.save({
      name: activityData.title,
      location: activityData.location,
      url: activityData.url,
      type: activityData.type,
    }).catch(() => {});
  }

  resetActivityForm();
  closeActivityForm();
  await renderItinerary();
  if (typeof renderNextActivityCard === "function") await renderNextActivityCard();
  showToast(existingId ? "✅ Activity updated!" : "✅ Activity added!");
}

// ── Undo Toast ───────────────────────────────────────────────

let _undoPendingActivity = null;
let _undoTimer = null;

function showUndoToast(message, onUndo) {
  let toast = document.getElementById("disney-undo-toast");
  if (toast) toast.remove();

  toast = document.createElement("div");
  toast.id = "disney-undo-toast";
  toast.style.cssText = `
    position:fixed; bottom:2rem; left:50%; transform:translateX(-50%) translateY(0);
    background:#1a1a2e; color:#fff; padding:0.7rem 1rem 0.7rem 1.25rem; border-radius:999px;
    font-weight:700; font-size:0.9rem; box-shadow:0 4px 24px rgba(0,0,0,0.25);
    z-index:9999; display:flex; align-items:center; gap:0.75rem;
    opacity:1; transition:transform 0.3s ease, opacity 0.3s ease;
  `;
  toast.innerHTML = `
    <span>${message}</span>
    <button type="button" id="undo-btn" style="
      background:var(--pixie-gold); color:#1a1a2e; border:none; border-radius:999px;
      padding:0.35rem 0.85rem; font-weight:800; font-size:0.82rem; cursor:pointer;
      font-family:'Nunito',sans-serif; letter-spacing:0.03em;
    ">Undo</button>
  `;
  document.body.appendChild(toast);

  document.getElementById("undo-btn").addEventListener("click", () => {
    toast.remove();
    if (onUndo) onUndo();
  });

  setTimeout(() => {
    if (toast.parentNode) {
      toast.style.transform = "translateX(-50%) translateY(80px)";
      toast.style.opacity = "0";
      setTimeout(() => toast.remove(), 300);
    }
  }, 8000);
}

async function handleDeleteFromForm() {
  const activityId = document.getElementById("activity-id").value.trim();
  if (!activityId) return;

  const activity = await ItineraryDB.findById(activityId);
  if (!activity) return;

  const title = activity.title || "this activity";

  const confirmed = await showConfirmDialog(`Delete "${title}"?`);
  if (!confirmed) return;

  await ItineraryDB.delete(activityId);

  _undoPendingActivity = { ...activity };
  if (_undoTimer) clearTimeout(_undoTimer);

  resetActivityForm();
  closeActivityForm();
  await renderItinerary();
  if (typeof renderNextActivityCard === "function") await renderNextActivityCard();

  showUndoToast(`🗑️ "${title}" deleted`, async () => {
    if (_undoPendingActivity) {
      await ItineraryDB.add(_undoPendingActivity);
      _undoPendingActivity = null;
      await renderItinerary();
      if (typeof renderNextActivityCard === "function") await renderNextActivityCard();
      showToast("✅ Activity restored!");
    }
  });

  _undoTimer = setTimeout(() => {
    _undoPendingActivity = null;
  }, 8000);
}

// ── Itinerary List Click Handlers ────────────────────────────

async function handleItineraryListClick(event) {
  const editButton = event.target.closest(".edit-activity-btn");
  if (editButton) {
    event.stopPropagation();
    populateFormForEdit(editButton.dataset.id);
    return;
  }

  const card = event.target.closest(".clickable-card");
  if (card && card.dataset.id) {
    const itinerary = await getStoredItinerary();
    const activity = itinerary.find(a => a.id === card.dataset.id);
    if (activity) openActivityModal(activity);
  }
}

// ============================================================
// VENUE AUTOCOMPLETE
// ============================================================

let venueAutocompleteEl = null;
let venueDebounceTimer = null;

function initVenueAutocomplete() {
  const titleInput = document.getElementById("activity-title-input");
  if (!titleInput) return;

  venueAutocompleteEl = document.createElement("div");
  venueAutocompleteEl.id = "venue-autocomplete";
  venueAutocompleteEl.className = "venue-autocomplete hidden";
  titleInput.parentNode.style.position = "relative";
  titleInput.parentNode.appendChild(venueAutocompleteEl);

  titleInput.addEventListener("input", () => {
    clearTimeout(venueDebounceTimer);
    const query = titleInput.value.trim();
    if (query.length < 2) {
      venueAutocompleteEl.classList.add("hidden");
      return;
    }
    venueDebounceTimer = setTimeout(() => showVenueSuggestions(query), 200);
  });

  titleInput.addEventListener("blur", () => {
    setTimeout(() => venueAutocompleteEl.classList.add("hidden"), 200);
  });

  titleInput.addEventListener("focus", () => {
    const query = titleInput.value.trim();
    if (query.length >= 2) showVenueSuggestions(query);
  });
}

async function showVenueSuggestions(query) {
  if (!venueAutocompleteEl) return;

  const results = await VenuesDB.search(query);
  if (results.length === 0) {
    venueAutocompleteEl.classList.add("hidden");
    return;
  }

  venueAutocompleteEl.innerHTML = results.map(v => `
    <button type="button" class="venue-suggestion" data-venue='${JSON.stringify(v).replace(/'/g, "&#39;")}'>
      <span class="venue-suggestion-name">${escapeHtml(v.name)}</span>
      ${v.location ? `<span class="venue-suggestion-location">${escapeHtml(v.location)}</span>` : ""}
    </button>
  `).join("") + `
    <button type="button" class="venue-browse-btn" id="venue-browse-trigger">
      📋 Browse all saved venues
    </button>
  `;

  venueAutocompleteEl.classList.remove("hidden");

  venueAutocompleteEl.querySelectorAll(".venue-suggestion").forEach(btn => {
    btn.addEventListener("mousedown", (e) => {
      e.preventDefault();
      const venue = JSON.parse(btn.dataset.venue);
      fillFormFromVenue(venue);
      venueAutocompleteEl.classList.add("hidden");
    });
  });

  const browseBtn = document.getElementById("venue-browse-trigger");
  if (browseBtn) {
    browseBtn.addEventListener("mousedown", (e) => {
      e.preventDefault();
      venueAutocompleteEl.classList.add("hidden");
      openVenueBrowser();
    });
  }
}

function fillFormFromVenue(venue) {
  const titleInput = document.getElementById("activity-title-input");
  const locationInput = document.getElementById("activity-location-input");
  const urlInput = document.getElementById("activity-url-input");
  const typeInput = document.getElementById("activity-type-input");

  if (titleInput) titleInput.value = venue.name || "";
  if (locationInput && venue.location) locationInput.value = venue.location;
  if (urlInput && venue.url) urlInput.value = venue.url;
  if (typeInput && venue.type) {
    const validTypes = [...typeInput.options].map(o => o.value);
    if (validTypes.includes(venue.type)) typeInput.value = venue.type;
  }
}

async function openVenueBrowser() {
  document.getElementById("venue-browser-modal")?.remove();

  const allVenues = await VenuesDB.getAll();

  const modal = document.createElement("div");
  modal.id = "venue-browser-modal";
  modal.className = "modal-overlay";
  modal.innerHTML = `
    <div class="modal-card" style="max-width:600px; width:95vw; max-height:80vh; overflow-y:auto;">
      <button class="modal-close-btn" id="venue-browser-close">✕</button>
      <div class="modal-header">
        <p class="card-label">📋 Saved Venues</p>
        <h2>Pick a Venue</h2>
        <input type="text" id="venue-browser-search" placeholder="Search venues..." style="
          width:100%; margin-top:0.75rem; padding:0.6rem 0.9rem;
          border:1.5px solid #d1d5db; border-radius:10px;
          font-family:'Nunito',sans-serif; font-size:0.95rem; font-weight:600;
        " />
      </div>
      <div id="venue-browser-list" style="padding:0 1.75rem 1.75rem;">
        ${allVenues.length === 0 ? '<p style="color:var(--muted); text-align:center; padding:2rem 0;">No saved venues yet. They\'ll appear here after you add activities.</p>' : ""}
        ${allVenues.map(v => `
          <button type="button" class="venue-browser-item" data-venue='${JSON.stringify(v).replace(/'/g, "&#39;")}'>
            <div class="venue-browser-item-info">
              <strong>${escapeHtml(v.name)}</strong>
              ${v.location ? `<span>${escapeHtml(v.location)}</span>` : ""}
              ${v.url ? `<span class="venue-browser-item-url">🔗 Has link</span>` : ""}
            </div>
            <span class="venue-browser-item-count">Used ${v.use_count}×</span>
          </button>
        `).join("")}
      </div>
    </div>
  `;

  document.body.appendChild(modal);
  document.body.style.overflow = "hidden";

  // Close handlers
  const close = () => { modal.remove(); document.body.style.overflow = ""; };
  document.getElementById("venue-browser-close").addEventListener("click", close);
  modal.addEventListener("click", (e) => { if (e.target === modal) close(); });

  // Search filter
  const searchInput = document.getElementById("venue-browser-search");
  searchInput.addEventListener("input", () => {
    const q = searchInput.value.toLowerCase();
    modal.querySelectorAll(".venue-browser-item").forEach(item => {
      const venue = JSON.parse(item.dataset.venue);
      const match = venue.name.toLowerCase().includes(q) || (venue.location || "").toLowerCase().includes(q);
      item.style.display = match ? "" : "none";
    });
  });
  setTimeout(() => searchInput.focus(), 50);

  // Pick venue
  modal.querySelectorAll(".venue-browser-item").forEach(btn => {
    btn.addEventListener("click", () => {
      const venue = JSON.parse(btn.dataset.venue);
      fillFormFromVenue(venue);
      close();
    });
  });
}

// ============================================================
// EDIT TRIP — Park Day Editor Modal
// ============================================================

const EDIT_TRIP_PARK_OPTIONS = [
  { value: "", label: "— Not set —" },
  { value: "magic-kingdom", label: "🏰 Magic Kingdom" },
  { value: "epcot", label: "🌍 EPCOT" },
  { value: "hollywood-studios", label: "🎬 Hollywood Studios" },
  { value: "animal-kingdom", label: "🌿 Animal Kingdom" },
  { value: "disney-springs", label: "🛍️ Disney Springs" },
  { value: "rest-day", label: "☀️ Rest / Pool Day" },
  { value: "travel", label: "🚗 Travel Day" },
];

function initEditTripButton() {
  const btn = document.getElementById("edit-trip-btn");
  const closeBtn = document.getElementById("edit-trip-close");
  const overlay = document.getElementById("edit-trip-overlay");
  if (!btn || !overlay) return;

  btn.addEventListener("click", openEditTripModal);

  if (closeBtn) closeBtn.addEventListener("click", closeEditTripModal);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) closeEditTripModal();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !overlay.classList.contains("hidden")) {
      closeEditTripModal();
    }
  });
}

async function openEditTripModal() {
  const overlay = document.getElementById("edit-trip-overlay");
  const body = document.getElementById("edit-trip-body");
  if (!overlay || !body) return;

  const allSorted = sortItineraryByTime(await getStoredItinerary());
  const tripBudgets = await loadTripBudgets();
  const tripGroups = buildTripsFromBudgets(allSorted, tripBudgets);

  if (tripGroups.length === 0) {
    body.innerHTML = `
      <p style="text-align:center; color:var(--muted); padding:2rem 0;">
        No trip found. <a href="planner.html" style="color:var(--castle-blue); font-weight:700;">Plan a new trip</a> first.
      </p>
    `;
    overlay.classList.remove("hidden");
    document.body.style.overflow = "hidden";
    return;
  }

  // Use the selected trip group (from trip_budgets) for authoritative dates & ID
  const idx = selectedTripIndex >= 0 ? Math.min(selectedTripIndex, tripGroups.length - 1) : detectCurrentTripGroupIndex(tripGroups);
  const tripGroup = tripGroups[idx];
  const fullTrip = tripGroup.activities;

  const tripStartDate = tripGroup.start;
  const tripEndDate = tripGroup.end;
  const tripId = tripGroup.trip_id;

  // Store original dates for resize detection
  const originalStart = tripStartDate;
  const originalEnd = tripEndDate;

  const parkDays = await ParkDaysDB.getAll();
  const parkDayMap = {};
  parkDays.forEach(pd => { parkDayMap[pd.date] = pd.park; });

  const activityCounts = {};
  fullTrip.forEach(a => {
    const d = a.date || "";
    activityCounts[d] = (activityCounts[d] || 0) + 1;
  });

  // Helper: compute dates array from start to end (inclusive)
  function dateRange(start, end) {
    const dates = [];
    const cursor = new Date(start + "T12:00:00");
    const endDt = new Date(end + "T12:00:00");
    while (cursor <= endDt) {
      dates.push(cursor.toISOString().split("T")[0]);
      cursor.setDate(cursor.getDate() + 1);
    }
    return dates;
  }

  // Helper: render the park day rows HTML
  function renderParkDayRows(dates) {
    let rowsHtml = "";
    dates.forEach((date, i) => {
      const [y, m, d] = date.split("-").map(Number);
      const dayLabel = new Date(y, m - 1, d).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
      const dayNum = i + 1;
      const currentPark = parkDayMap[date] || "";
      const actCount = activityCounts[date] || 0;

      const options = EDIT_TRIP_PARK_OPTIONS.map(o =>
        `<option value="${o.value}" ${currentPark === o.value ? "selected" : ""}>${o.label}</option>`
      ).join("");

      rowsHtml += `
        <div class="edit-trip-day-row" style="display:flex; align-items:center; gap:0.75rem; padding:0.6rem 0.75rem; border-radius:12px; background:rgba(0,0,0,0.02); border:1px solid rgba(0,0,0,0.05);">
          <div style="flex:1; min-width:0;">
            <strong style="font-size:0.9rem; color:var(--ink);">${dayLabel}</strong>
            <span style="font-size:0.75rem; color:var(--muted); margin-left:0.5rem;">Day ${dayNum}</span>
            ${actCount > 0 ? `<span style="font-size:0.7rem; color:var(--slate); margin-left:0.25rem;">(${actCount} activities)</span>` : ""}
          </div>
          <select class="edit-trip-park-select" data-date="${date}" data-original="${currentPark}" data-activities="${actCount}"
            style="padding:0.4rem 0.5rem; border-radius:10px; border:1.5px solid #d1d5db; font-family:'Nunito',sans-serif; font-size:0.85rem; font-weight:600; min-width:0; max-width:180px;">
            ${options}
          </select>
        </div>
      `;
    });
    return rowsHtml;
  }

  // Helper: count activities that would be lost if dates shrink
  function countLostActivities(newStart, newEnd) {
    let lost = 0;
    for (const [date, count] of Object.entries(activityCounts)) {
      if (date < newStart || date > newEnd) lost += count;
    }
    return lost;
  }

  // Helper: refresh the park days container and warning
  function refreshParkDays() {
    const startVal = document.getElementById("edit-trip-start").value;
    const endVal = document.getElementById("edit-trip-end").value;
    if (!startVal || !endVal || startVal > endVal) return;

    const dates = dateRange(startVal, endVal);
    const container = document.getElementById("edit-trip-park-rows");
    if (container) {
      container.innerHTML = renderParkDayRows(dates);
      // Re-wire park change confirmation on new selects
      container.querySelectorAll(".edit-trip-park-select").forEach(select => {
        select.addEventListener("change", () => {
          const original = select.dataset.original;
          const actCount = parseInt(select.dataset.activities) || 0;
          const newVal = select.value;
          if (newVal !== original && actCount > 0 && newVal) showParkChangeConfirm(select);
        });
      });
    }

    // Update day count
    const countEl = document.getElementById("edit-trip-day-count");
    if (countEl) countEl.textContent = `${dates.length} day${dates.length !== 1 ? "s" : ""}`;

    // Show/hide warning about lost activities
    const lost = countLostActivities(startVal, endVal);
    const warnEl = document.getElementById("edit-trip-date-warning");
    if (warnEl) {
      if (lost > 0) {
        warnEl.textContent = `${lost} activit${lost === 1 ? "y" : "ies"} will be removed from dates outside this range.`;
        warnEl.style.display = "";
      } else {
        warnEl.style.display = "none";
      }
    }
  }

  const allDates = dateRange(tripStartDate, tripEndDate);

  // ── Trip Dates Section ──
  let html = `
    <div style="margin-bottom:1rem;">
      <p style="font-size:0.78rem; font-weight:800; text-transform:uppercase; letter-spacing:0.07em; color:var(--castle-blue); margin:0 0 0.6rem;">📅 Trip Dates</p>
      <div style="display:flex; align-items:center; gap:0.5rem; flex-wrap:wrap;">
        <input type="date" id="edit-trip-start" value="${tripStartDate}"
          style="flex:1; min-width:130px; padding:0.5rem 0.65rem; border:1.5px solid #d1d5db; border-radius:10px; font-family:'Nunito',sans-serif; font-size:0.9rem; font-weight:600; color:var(--ink); background:#fff;" />
        <span style="font-size:0.85rem; color:var(--muted); font-weight:600;">to</span>
        <input type="date" id="edit-trip-end" value="${tripEndDate}"
          style="flex:1; min-width:130px; padding:0.5rem 0.65rem; border:1.5px solid #d1d5db; border-radius:10px; font-family:'Nunito',sans-serif; font-size:0.9rem; font-weight:600; color:var(--ink); background:#fff;" />
        <span id="edit-trip-day-count" style="font-size:0.78rem; font-weight:700; color:var(--muted); white-space:nowrap;">${allDates.length} day${allDates.length !== 1 ? "s" : ""}</span>
      </div>
      <p id="edit-trip-date-warning" style="display:none; font-size:0.78rem; color:#dc2626; font-weight:600; margin:0.4rem 0 0; padding:0.4rem 0.6rem; background:#fef2f2; border-radius:8px; border:1px solid #fecaca;">
      </p>
    </div>
  `;

  // ── Park Days Section ──
  html += `
    <div style="padding-top:0.75rem; border-top:1.5px solid rgba(0,0,0,0.06);">
      <p style="font-size:0.78rem; font-weight:800; text-transform:uppercase; letter-spacing:0.07em; color:var(--castle-blue); margin:0 0 0.6rem;">🎢 Park Day Schedule</p>
      <div id="edit-trip-park-rows" style="display:flex; flex-direction:column; gap:0.5rem;">
        ${renderParkDayRows(allDates)}
      </div>
    </div>
  `;

  // ── Trip Members Section ──
  let currentMembers = [];
  let allUsers = [];
  try { currentMembers = await apiFetch(`/trips/${tripId}/members`); } catch (e) { }
  try { allUsers = await apiFetch("/users"); } catch (e) { }

  const memberIds = new Set(currentMembers.map(m => m.user_id));

  html += `
    <div style="margin-top:1.25rem; padding-top:1rem; border-top:1.5px solid rgba(0,0,0,0.06);">
      <p style="font-size:0.78rem; font-weight:800; text-transform:uppercase; letter-spacing:0.07em; color:var(--castle-blue); margin:0 0 0.6rem;">👨‍👩‍👧‍👦 Trip Members</p>
      <div id="edit-trip-members" style="display:flex; flex-direction:column; gap:0.4rem;">
        ${allUsers.map(u => {
          const isMember = memberIds.has(u.id);
          const initial = (u.name || "?")[0].toUpperCase();
          return `
            <label style="display:flex; align-items:center; gap:0.6rem; padding:0.55rem 0.75rem; border-radius:10px; border:1.5px solid ${isMember ? "var(--castle-blue)" : "#e2e8f0"}; background:${isMember ? "rgba(0,48,135,0.04)" : "white"}; cursor:pointer; transition:all 0.15s;" class="edit-member-row">
              <input type="checkbox" value="${u.id}" ${isMember ? "checked" : ""} class="edit-member-cb" style="width:16px; height:16px; accent-color:var(--castle-blue);" />
              <div style="width:28px; height:28px; border-radius:50%; background:linear-gradient(135deg, var(--castle-blue), var(--sky-blue)); color:white; display:flex; align-items:center; justify-content:center; font-family:'Mouse Memoirs',sans-serif; font-size:0.85rem; flex-shrink:0;">${initial}</div>
              <strong style="font-size:0.88rem; color:var(--ink);">${escapeHtml(u.name)}</strong>
              <span style="font-size:0.72rem; color:var(--muted);">${escapeHtml(u.email)}</span>
            </label>
          `;
        }).join("")}
        ${allUsers.length === 0 ? `<p style="color:var(--muted); font-style:italic; font-size:0.85rem;">Add family members in the Admin panel first.</p>` : ""}
      </div>
    </div>
  `;

  html += `
    <div style="display:flex; gap:0.75rem; margin-top:1.25rem; flex-wrap:wrap; justify-content:space-between; align-items:center;">
      <a href="planner.html" class="secondary-button" style="text-decoration:none; font-size:0.85rem;">
        🗺️ Full Trip Planner
      </a>
      <button type="button" class="primary-button" id="edit-trip-save-btn" style="font-size:0.9rem;">
        Save Changes ✨
      </button>
    </div>
  `;

  body.innerHTML = html;

  // Wire date input changes to refresh park day rows
  document.getElementById("edit-trip-start").addEventListener("change", refreshParkDays);
  document.getElementById("edit-trip-end").addEventListener("change", refreshParkDays);

  // Wire member checkbox styling
  body.querySelectorAll(".edit-member-cb").forEach(cb => {
    cb.addEventListener("change", () => {
      const row = cb.closest(".edit-member-row");
      row.style.borderColor = cb.checked ? "var(--castle-blue)" : "#e2e8f0";
      row.style.background = cb.checked ? "rgba(0,48,135,0.04)" : "white";
    });
  });

  // Wire save button
  document.getElementById("edit-trip-save-btn").addEventListener("click", async () => {
    const newStart = document.getElementById("edit-trip-start").value;
    const newEnd = document.getElementById("edit-trip-end").value;

    if (!newStart || !newEnd || newStart > newEnd) {
      showToast("❌ Check your trip dates — start must be before end.");
      return;
    }

    const saveBtn = document.getElementById("edit-trip-save-btn");
    saveBtn.disabled = true;
    saveBtn.textContent = "Saving...";

    try {
      // 1. Resize trip dates if they changed
      const datesChanged = newStart !== originalStart || newEnd !== originalEnd;
      let activeTripId = tripId;

      if (datesChanged) {
        const resizeRes = await apiFetch(`/trips/${tripId}/resize`, {
          method: "PUT",
          body: JSON.stringify({ start_date: newStart, end_date: newEnd }),
        });
        if (resizeRes.changed) {
          activeTripId = resizeRes.trip_id;
        }
        // Invalidate cached trip budgets so re-renders pick up the new dates/ID
        invalidateTripBudgetsCache();
      }

      // 2. Save member changes (use the potentially-new trip ID)
      const checkedIds = new Set(Array.from(body.querySelectorAll(".edit-member-cb:checked")).map(cb => cb.value));
      const uncheckedIds = new Set(Array.from(body.querySelectorAll(".edit-member-cb:not(:checked)")).map(cb => cb.value));

      for (const uid of checkedIds) {
        if (!memberIds.has(uid)) {
          try { await apiFetch(`/trips/${activeTripId}/members`, { method: "POST", body: JSON.stringify({ user_id: uid }) }); } catch (e) { }
        }
      }
      for (const uid of uncheckedIds) {
        if (memberIds.has(uid)) {
          try { await apiFetch(`/trips/${activeTripId}/members/${uid}`, { method: "DELETE" }); } catch (e) { }
        }
      }

      // 3. Save park day changes
      await handleEditTripSave();
    } catch (err) {
      console.error("[EditTrip] Save failed:", err);
      saveBtn.disabled = false;
      saveBtn.textContent = "Save Changes ✨";
      showToast("❌ Failed to save. Try again.");
    }
  });

  // Wire individual selectors for the confirmation flow
  body.querySelectorAll(".edit-trip-park-select").forEach(select => {
    select.addEventListener("change", () => {
      const original = select.dataset.original;
      const actCount = parseInt(select.dataset.activities) || 0;
      const newVal = select.value;

      if (newVal !== original && actCount > 0 && newVal) {
        showParkChangeConfirm(select);
      }
    });
  });

  overlay.classList.remove("hidden");
  document.body.style.overflow = "hidden";
}

function closeEditTripModal() {
  const overlay = document.getElementById("edit-trip-overlay");
  if (overlay) overlay.classList.add("hidden");
  document.body.style.overflow = "";
}

function showParkChangeConfirm(selectEl) {
  const overlay = document.getElementById("park-change-confirm-overlay");
  const titleEl = document.getElementById("park-change-title");
  const msgEl = document.getElementById("park-change-msg");
  const keepBtn = document.getElementById("park-change-keep");
  const cancelBtn = document.getElementById("park-change-cancel-activities");
  if (!overlay) return;

  const date = selectEl.dataset.date;
  const [y, m, d] = date.split("-").map(Number);
  const dayLabel = new Date(y, m - 1, d).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
  const actCount = parseInt(selectEl.dataset.activities) || 0;
  const newParkLabel = selectEl.options[selectEl.selectedIndex].text;

  titleEl.textContent = `Change to ${newParkLabel}?`;
  msgEl.textContent = `You have ${actCount} activit${actCount === 1 ? "y" : "ies"} on ${dayLabel}. Would you like to keep them or cancel and replan the day?`;

  overlay.classList.remove("hidden");

  const newKeep = keepBtn.cloneNode(true);
  const newCancel = cancelBtn.cloneNode(true);
  keepBtn.replaceWith(newKeep);
  cancelBtn.replaceWith(newCancel);

  newKeep.addEventListener("click", () => {
    overlay.classList.add("hidden");
    showToast("✅ Activities kept — park will update on save.");
  });

  newCancel.addEventListener("click", async () => {
    overlay.classList.add("hidden");

    const allActivities = await getStoredItinerary();
    const toDelete = allActivities.filter(a => a.date === date);

    for (const activity of toDelete) {
      await ItineraryDB.delete(activity.id);
    }

    selectEl.dataset.activities = "0";
    const row = selectEl.closest(".edit-trip-day-row");
    const countSpan = row.querySelector("span[style*='slate']");
    if (countSpan) countSpan.remove();

    showToast(`🗑️ ${toDelete.length} activit${toDelete.length === 1 ? "y" : "ies"} removed. Save to confirm park change.`);
  });
}

async function handleEditTripSave() {
  const selects = document.querySelectorAll(".edit-trip-park-select");
  const updates = [];
  const removals = [];

  selects.forEach(select => {
    const date = select.dataset.date;
    const park = select.value;
    if (park) {
      updates.push({ date, park });
    } else {
      removals.push(date);
    }
  });

  try {
    if (updates.length > 0) {
      await ParkDaysDB.saveMany(updates);
    }
    for (const date of removals) {
      await ParkDaysDB.remove(date);
    }

    closeEditTripModal();
    await renderItinerary();
    if (typeof renderTripSwitcher === "function") await renderTripSwitcher();
    if (typeof renderParkDayBanner === "function") await renderParkDayBanner();
    showToast("✅ Trip updated!");
  } catch (err) {
    console.error("[EditTrip] Save failed:", err);
    showToast("❌ Failed to save. Try again.");
  }
}

// ── Itinerary Page Init ──────────────────────────────────────

function initializeItineraryPage() {
  const form = document.getElementById("activity-form");
  const itineraryList = document.getElementById("itinerary-list");
  const cancelEditBtn = document.getElementById("cancel-edit-btn");
  const openFormBtn = document.getElementById("open-activity-form-btn");
  const deleteActivityBtn = document.getElementById("delete-activity-btn");

  if (!form || !itineraryList || !cancelEditBtn || !openFormBtn || !deleteActivityBtn) return;

  form.addEventListener("submit", handleActivityFormSubmit);
  itineraryList.addEventListener("click", handleItineraryListClick);
  cancelEditBtn.addEventListener("click", handleCancelForm);
  openFormBtn.addEventListener("click", openActivityForm);
  deleteActivityBtn.addEventListener("click", handleDeleteFromForm);

  if (typeof renderTripSwitcher === "function") renderTripSwitcher();
  renderItinerary();
  initVenueAutocomplete();
}
