// ============================================================
// TRIP PLANNER WIZARD
// A step-by-step planner that builds out a full Disney itinerary
// and pushes everything to the API in one go.
// ============================================================

const PLANNER_STEPS = [
  { id: "dates",      label: "Dates & Travel",    icon: "✈️" },
  { id: "members",    label: "Who's Going?",      icon: "👨‍👩‍👧‍👦" },
  { id: "resort",     label: "Resort",            icon: "🏰" },
  { id: "parks",      label: "Park Days",         icon: "🎢" },
  { id: "dining",     label: "Dining",            icon: "🍽️" },
  { id: "lightning",  label: "Lightning Lane",    icon: "⚡" },
  { id: "extras",     label: "Other Activities",  icon: "🎭" },
  { id: "review",     label: "Review & Save",     icon: "✅" },
];

const PARK_OPTIONS = [
  { value: "magic-kingdom",     label: "Magic Kingdom",       emoji: "🏰" },
  { value: "epcot",             label: "EPCOT",               emoji: "🌍" },
  { value: "hollywood-studios", label: "Hollywood Studios",   emoji: "🎬" },
  { value: "animal-kingdom",    label: "Animal Kingdom",      emoji: "🌿" },
  { value: "disney-springs",    label: "Disney Springs",      emoji: "🛍️" },
  { value: "rest-day",          label: "Rest / Pool Day",     emoji: "☀️" },
  { value: "travel",            label: "Travel Day",          emoji: "🚗" },
];

const PARK_LOCATION_NAMES = {
  "magic-kingdom":     "Magic Kingdom",
  "epcot":             "EPCOT",
  "hollywood-studios": "Hollywood Studios",
  "animal-kingdom":    "Animal Kingdom",
  "disney-springs":    "Disney Springs",
  "rest-day":          "Resort",
  "travel":            "Travel",
};

// Wizard state — collects data across all steps
const plannerState = {
  // Step 1: Dates & Travel
  startDate: "",
  endDate: "",
  travelMode: "flying",    // "flying" or "driving"
  arrivalTime: "15:00",
  departureTime: "11:00",

  // Step 2: Who's Going — array of user IDs
  members: [],

  // Step 2: Resort
  resortName: "",
  changingResorts: false,
  secondResort: "",
  resortChangeDate: "",

  // Step 3: Parks — keyed by date string → park value
  parkDays: {},

  // Step 4: Dining — array of { date, time, title, location, notes }
  diningReservations: [],

  // Step 5: Lightning Lane — array of { date, time, title, location }
  lightningLanes: [],

  // Step 6: Other activities — array of { date, time, type, title, location, notes }
  otherActivities: [],
};

let currentStep = 0;

// ── Helpers ────────────────────────────────────────────────

function getDaysBetween(start, end) {
  const days = [];
  const d = new Date(start + "T12:00:00");
  const e = new Date(end + "T12:00:00");
  while (d <= e) {
    days.push(d.toISOString().split("T")[0]);
    d.setDate(d.getDate() + 1);
  }
  return days;
}

function formatDateNice(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function formatTimeNice(time24) {
  if (!time24 || !time24.includes(":")) return time24;
  const [h, m] = time24.split(":").map(Number);
  const suffix = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${suffix}`;
}

function escHtml(str) {
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// ── Progress Bar ───────────────────────────────────────────

function renderProgress() {
  const fill = document.getElementById("wizard-progress-fill");
  const labels = document.getElementById("wizard-steps-labels");
  if (!fill || !labels) return;

  const pct = ((currentStep) / (PLANNER_STEPS.length - 1)) * 100;
  fill.style.width = `${pct}%`;

  const step = PLANNER_STEPS[currentStep];
  labels.innerHTML = `
    <div class="wizard-progress-info">
      <div class="wizard-progress-dots">
        ${PLANNER_STEPS.map((s, i) => `
          <span class="wizard-dot ${i === currentStep ? "current" : ""} ${i < currentStep ? "done" : ""}" title="${s.label}">
            ${i < currentStep ? "✓" : ""}
          </span>
        `).join("")}
      </div>
      <div class="wizard-progress-current">
        <span class="wizard-progress-step-num">Step ${currentStep + 1} of ${PLANNER_STEPS.length}</span>
        <span class="wizard-progress-step-name">${step.icon} ${step.label}</span>
      </div>
    </div>
  `;
}

// ── Navigation ─────────────────────────────────────────────

function renderNavButtons(opts = {}) {
  const { backLabel = "← Back", nextLabel = "Next →", nextDisabled = false, hideBack = false, onNext, onBack } = opts;
  return `
    <div class="wizard-nav-buttons">
      ${hideBack ? "" : `<button type="button" class="secondary-button wizard-back-btn">${backLabel}</button>`}
      <button type="button" class="primary-button wizard-next-btn" ${nextDisabled ? "disabled" : ""}>${nextLabel}</button>
    </div>
  `;
}

function wireNavButtons(validateAndSave) {
  const container = document.getElementById("wizard-container");
  const nextBtn = container.querySelector(".wizard-next-btn");
  const backBtn = container.querySelector(".wizard-back-btn");

  if (nextBtn) {
    nextBtn.addEventListener("click", () => {
      if (validateAndSave && !validateAndSave()) return;
      currentStep++;
      renderCurrentStep();
    });
  }
  if (backBtn) {
    backBtn.addEventListener("click", () => {
      currentStep--;
      renderCurrentStep();
    });
  }
}

function renderCurrentStep() {
  renderProgress();
  const step = PLANNER_STEPS[currentStep];
  switch (step.id) {
    case "dates":     renderStepDates(); break;
    case "members":   renderStepMembers(); break;
    case "resort":    renderStepResort(); break;
    case "parks":     renderStepParks(); break;
    case "dining":    renderStepDining(); break;
    case "lightning": renderStepLightning(); break;
    case "extras":    renderStepExtras(); break;
    case "review":    renderStepReview(); break;
  }
  window.scrollTo({ top: 0, behavior: "smooth" });
}

// ── STEP 1: Dates & Travel ─────────────────────────────────

function renderStepDates() {
  const c = document.getElementById("wizard-container");
  c.innerHTML = `
    <section class="wizard-step-card">
      <div class="wizard-step-header">
        <span class="wizard-step-emoji">✈️</span>
        <div>
          <h2>When are you going to Disney?</h2>
          <p class="wizard-step-subtitle">Let's start with your travel dates and how you're getting there.</p>
        </div>
      </div>

      <div class="wizard-form-grid">
        <div class="wizard-field">
          <label for="p-start-date">First Day</label>
          <input type="date" id="p-start-date" value="${plannerState.startDate}" />
        </div>
        <div class="wizard-field">
          <label for="p-end-date">Last Day</label>
          <input type="date" id="p-end-date" value="${plannerState.endDate}" />
        </div>
      </div>

      <div class="wizard-field" style="margin-top:1.25rem;">
        <label>How are you getting there?</label>
        <div class="wizard-toggle-group">
          <button type="button" class="wizard-toggle ${plannerState.travelMode === "flying" ? "active" : ""}" data-val="flying">✈️ Flying</button>
          <button type="button" class="wizard-toggle ${plannerState.travelMode === "driving" ? "active" : ""}" data-val="driving">🚗 Driving</button>
        </div>
      </div>

      <div class="wizard-form-grid" style="margin-top:1.25rem;">
        <div class="wizard-field">
          <label for="p-arrival-time">Estimated Arrival Time (Day 1)</label>
          <input type="time" id="p-arrival-time" value="${plannerState.arrivalTime}" />
        </div>
        <div class="wizard-field">
          <label for="p-departure-time">Departure Time (Last Day)</label>
          <input type="time" id="p-departure-time" value="${plannerState.departureTime}" />
        </div>
      </div>

      ${renderNavButtons({ hideBack: true, nextLabel: "Next: Who's Going? →" })}
    </section>
  `;

  // Toggle buttons
  c.querySelectorAll(".wizard-toggle").forEach(btn => {
    btn.addEventListener("click", () => {
      c.querySelectorAll(".wizard-toggle").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      plannerState.travelMode = btn.dataset.val;
    });
  });

  wireNavButtons(() => {
    const start = document.getElementById("p-start-date").value;
    const end = document.getElementById("p-end-date").value;
    if (!start || !end) { alert("Please enter both start and end dates."); return false; }
    if (end < start) { alert("End date must be on or after start date."); return false; }
    plannerState.startDate = start;
    plannerState.endDate = end;
    plannerState.arrivalTime = document.getElementById("p-arrival-time").value || "15:00";
    plannerState.departureTime = document.getElementById("p-departure-time").value || "11:00";
    return true;
  });
}

// ── STEP 2: Who's Going? ──────────────────────────────────

async function renderStepMembers() {
  const c = document.getElementById("wizard-container");

  // Fetch all users from the system
  let allUsers = [];
  try {
    allUsers = await apiFetch("/users");
  } catch (e) {
    // Fallback — try to at least get current user
    try {
      const me = await apiFetch("/auth/me");
      if (me && me.id) allUsers = [me];
    } catch (e2) { }
  }

  // Auto-add current user if members list is empty
  if (plannerState.members.length === 0) {
    try {
      const me = await apiFetch("/auth/me");
      if (me && me.id) plannerState.members.push(me.id);
    } catch (e) { }
  }

  c.innerHTML = `
    <section class="wizard-step-card">
      <div class="wizard-step-header">
        <span class="wizard-step-emoji">👨‍👩‍👧‍👦</span>
        <div>
          <h2>Who's Going?</h2>
          <p class="wizard-step-subtitle">Select the family members joining this trip. They'll be able to upload photos and see trip details.</p>
        </div>
      </div>

      <div id="members-list" style="display:flex; flex-direction:column; gap:0.5rem;">
        ${allUsers.length === 0 ? `<p style="color:var(--muted); font-style:italic;">No users found. Add family members in the Admin panel first.</p>` : ""}
        ${allUsers.map(u => {
          const checked = plannerState.members.includes(u.id) ? "checked" : "";
          const initial = (u.name || "?")[0].toUpperCase();
          return `
            <label style="display:flex; align-items:center; gap:0.75rem; padding:0.75rem 1rem; border-radius:12px; border:1.5px solid ${checked ? "var(--castle-blue)" : "#e2e8f0"}; background:${checked ? "rgba(0,48,135,0.04)" : "white"}; cursor:pointer; transition:all 0.15s;" class="member-row">
              <input type="checkbox" value="${u.id}" ${checked} style="width:18px; height:18px; accent-color:var(--castle-blue);" class="member-checkbox" />
              <div style="width:34px; height:34px; border-radius:50%; background:linear-gradient(135deg, var(--castle-blue), var(--sky-blue)); color:white; display:flex; align-items:center; justify-content:center; font-family:'Mouse Memoirs',sans-serif; font-size:1rem; flex-shrink:0;">${initial}</div>
              <div style="flex:1; min-width:0;">
                <strong style="font-size:0.95rem; color:var(--ink);">${escHtml(u.name)}</strong>
                <span style="font-size:0.78rem; color:var(--muted); margin-left:0.4rem;">${escHtml(u.email)}</span>
                ${u.role === "admin" ? '<span style="font-size:0.65rem; background:var(--pixie-gold); color:var(--ink); padding:0.1rem 0.4rem; border-radius:4px; font-weight:800; margin-left:0.3rem;">ADMIN</span>' : ""}
              </div>
            </label>
          `;
        }).join("")}
      </div>

      ${renderNavButtons({ nextLabel: "Next: Resort →" })}
    </section>
  `;

  // Wire checkboxes to update highlight styling
  c.querySelectorAll(".member-checkbox").forEach(cb => {
    cb.addEventListener("change", () => {
      const row = cb.closest(".member-row");
      if (cb.checked) {
        row.style.borderColor = "var(--castle-blue)";
        row.style.background = "rgba(0,48,135,0.04)";
      } else {
        row.style.borderColor = "#e2e8f0";
        row.style.background = "white";
      }
    });
  });

  wireNavButtons(() => {
    // Collect selected member IDs
    const checkboxes = c.querySelectorAll(".member-checkbox:checked");
    plannerState.members = Array.from(checkboxes).map(cb => cb.value);
    return true;
  });
}

// ── STEP 3: Resort ─────────────────────────────────────────

function renderStepResort() {
  const c = document.getElementById("wizard-container");
  c.innerHTML = `
    <section class="wizard-step-card">
      <div class="wizard-step-header">
        <span class="wizard-step-emoji">🏰</span>
        <div>
          <h2>Where are you staying?</h2>
          <p class="wizard-step-subtitle">This helps us plan travel times and resort activities.</p>
        </div>
      </div>

      <div class="wizard-field">
        <label for="p-resort">Resort Name</label>
        <input type="text" id="p-resort" value="${escHtml(plannerState.resortName)}" placeholder="e.g. Caribbean Beach Resort" />
      </div>

      <div class="wizard-field" style="margin-top:1.25rem;">
        <label>Changing resorts during your stay?</label>
        <div class="wizard-toggle-group">
          <button type="button" class="wizard-toggle ${!plannerState.changingResorts ? "active" : ""}" data-val="no">No</button>
          <button type="button" class="wizard-toggle ${plannerState.changingResorts ? "active" : ""}" data-val="yes">Yes</button>
        </div>
      </div>

      <div id="resort-change-fields" class="${plannerState.changingResorts ? "" : "hidden"}" style="margin-top:1.25rem;">
        <div class="wizard-form-grid">
          <div class="wizard-field">
            <label for="p-resort-2">Second Resort</label>
            <input type="text" id="p-resort-2" value="${escHtml(plannerState.secondResort)}" placeholder="e.g. Animal Kingdom Lodge" />
          </div>
          <div class="wizard-field">
            <label for="p-resort-change-date">Change Date</label>
            <input type="date" id="p-resort-change-date" value="${plannerState.resortChangeDate}" />
          </div>
        </div>
      </div>

      ${renderNavButtons({ nextLabel: "Next: Park Days →" })}
    </section>
  `;

  c.querySelectorAll(".wizard-toggle").forEach(btn => {
    btn.addEventListener("click", () => {
      c.querySelectorAll(".wizard-toggle").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      const yes = btn.dataset.val === "yes";
      plannerState.changingResorts = yes;
      document.getElementById("resort-change-fields").classList.toggle("hidden", !yes);
    });
  });

  wireNavButtons(() => {
    plannerState.resortName = document.getElementById("p-resort").value.trim();
    if (!plannerState.resortName) { alert("Please enter your resort name."); return false; }
    if (plannerState.changingResorts) {
      plannerState.secondResort = document.getElementById("p-resort-2").value.trim();
      plannerState.resortChangeDate = document.getElementById("p-resort-change-date").value;
    }
    return true;
  });

  // Attach venue autocomplete to resort inputs
  if (typeof attachVenueAutocomplete === "function") {
    const resortInput = document.getElementById("p-resort");
    if (resortInput) attachVenueAutocomplete(resortInput, {
      filterType: "travel",
      onSelect: (venue) => {
        // Resort names don't need to fill other fields
      }
    });
    const resort2Input = document.getElementById("p-resort-2");
    if (resort2Input) attachVenueAutocomplete(resort2Input, {
      filterType: "travel",
      onSelect: () => {}
    });
  }
}

// ── STEP 3: Park Days ──────────────────────────────────────

function renderStepParks() {
  const c = document.getElementById("wizard-container");
  const days = getDaysBetween(plannerState.startDate, plannerState.endDate);

  c.innerHTML = `
    <section class="wizard-step-card">
      <div class="wizard-step-header">
        <span class="wizard-step-emoji">🎢</span>
        <div>
          <h2>Which park each day?</h2>
          <p class="wizard-step-subtitle">Pick the park you'll start your day at. You can always park hop later!</p>
        </div>
      </div>

      <div class="park-day-grid">
        ${days.map((date, i) => {
          const current = plannerState.parkDays[date] || "";
          const isFirst = i === 0;
          const isLast = i === days.length - 1;
          let dayNote = "";
          if (isFirst) dayNote = `<span class="park-day-note">Arrival day — ${formatTimeNice(plannerState.arrivalTime)}</span>`;
          if (isLast) dayNote = `<span class="park-day-note">Departure — ${formatTimeNice(plannerState.departureTime)}</span>`;

          return `
            <div class="park-day-row">
              <div class="park-day-date">
                <strong>${formatDateNice(date)}</strong>
                ${dayNote}
              </div>
              <select class="park-day-select" data-date="${date}">
                <option value="">— Select —</option>
                ${PARK_OPTIONS.map(p => `<option value="${p.value}" ${current === p.value ? "selected" : ""}>${p.emoji} ${p.label}</option>`).join("")}
              </select>
            </div>
          `;
        }).join("")}
      </div>

      ${renderNavButtons({ nextLabel: "Next: Dining →" })}
    </section>
  `;

  wireNavButtons(() => {
    const selects = c.querySelectorAll(".park-day-select");
    let allGood = true;
    selects.forEach(sel => {
      if (sel.value) {
        plannerState.parkDays[sel.dataset.date] = sel.value;
      } else {
        allGood = false;
      }
    });
    if (!allGood) { alert("Please select a park (or rest/travel day) for each day."); return false; }
    return true;
  });
}

// ── STEP 4: Dining Reservations ────────────────────────────

function renderStepDining() {
  const c = document.getElementById("wizard-container");
  const days = getDaysBetween(plannerState.startDate, plannerState.endDate);

  c.innerHTML = `
    <section class="wizard-step-card">
      <div class="wizard-step-header">
        <span class="wizard-step-emoji">🍽️</span>
        <div>
          <h2>Dining Reservations</h2>
          <p class="wizard-step-subtitle">Add any dining reservations you've booked. You can skip days with none.</p>
        </div>
      </div>

      <div id="dining-days-container">
        ${days.map(date => {
          const parkVal = plannerState.parkDays[date] || "";
          const parkLabel = PARK_LOCATION_NAMES[parkVal] || "";
          const existing = plannerState.diningReservations.filter(d => d.date === date);

          return `
            <div class="wizard-day-section" data-date="${date}">
              <div class="wizard-day-header">
                <strong>${formatDateNice(date)}</strong>
                <span class="wizard-day-park">${parkLabel}</span>
              </div>
              <div class="dining-entries" data-date="${date}">
                ${existing.length > 0 ? existing.map((d, i) => renderDiningEntry(date, i, d)).join("") : ""}
              </div>
              <button type="button" class="secondary-button add-dining-btn" data-date="${date}" style="margin-top:0.5rem;">
                + Add Dining Reservation
              </button>
            </div>
          `;
        }).join("")}
      </div>

      ${renderNavButtons({ nextLabel: "Next: Lightning Lane →" })}
    </section>
  `;

  // Wire add buttons
  c.querySelectorAll(".add-dining-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const date = btn.dataset.date;
      const container = c.querySelector(`.dining-entries[data-date="${date}"]`);
      const idx = container.children.length;
      container.insertAdjacentHTML("beforeend", renderDiningEntry(date, idx, {}));
      // Attach autocomplete to the newly added entry
      const newRow = container.lastElementChild;
      attachDiningAutocomplete(newRow);
    });
  });

  // Attach autocomplete to all existing dining entries
  c.querySelectorAll(".wizard-entry-row").forEach(row => {
    attachDiningAutocomplete(row);
  });

  wireNavButtons(() => {
    plannerState.diningReservations = collectReservationEntries(c, "dining");
    return true;
  });
}

function renderDiningEntry(date, idx, data = {}) {
  return `
    <div class="wizard-entry-row">
      <input type="time" class="entry-time" value="${data.time || ""}" placeholder="Time" />
      <input type="text" class="entry-title" value="${escHtml(data.title || "")}" placeholder="Restaurant name" />
      <input type="text" class="entry-location" value="${escHtml(data.location || "")}" placeholder="Location (optional)" />
      <input type="text" class="entry-notes" value="${escHtml(data.notes || "")}" placeholder="Notes (optional)" />
      <button type="button" class="wizard-remove-entry" aria-label="Remove">✕</button>
      <input type="hidden" class="entry-date" value="${date}" />
    </div>
  `;
}

// Attach venue autocomplete to a dining entry row's title input
function attachDiningAutocomplete(rowEl) {
  if (typeof attachVenueAutocomplete !== "function") return;
  const titleInput = rowEl.querySelector(".entry-title");
  if (!titleInput) return;

  attachVenueAutocomplete(titleInput, {
    filterType: "Dining",
    onSelect: (venue) => {
      // Auto-fill location if the venue has one
      const locationInput = rowEl.querySelector(".entry-location");
      if (locationInput && venue.location) {
        locationInput.value = venue.location;
      }
    }
  });
}

function collectReservationEntries(container, type) {
  const entries = [];
  container.querySelectorAll(".wizard-entry-row").forEach(row => {
    const time = row.querySelector(".entry-time")?.value;
    const title = row.querySelector(".entry-title")?.value.trim();
    const location = row.querySelector(".entry-location")?.value.trim();
    const notes = row.querySelector(".entry-notes")?.value.trim();
    const date = row.querySelector(".entry-date")?.value;
    if (title && time) {
      entries.push({ date, time, title, location, notes });
    }
  });
  return entries;
}

// Delegate remove button clicks
document.addEventListener("click", (e) => {
  if (e.target.classList.contains("wizard-remove-entry")) {
    e.target.closest(".wizard-entry-row").remove();
  }
});

// ── STEP 5: Lightning Lane ─────────────────────────────────

function renderStepLightning() {
  const c = document.getElementById("wizard-container");
  const days = getDaysBetween(plannerState.startDate, plannerState.endDate);

  // Check if within booking window (7 days out for resort guests)
  const now = new Date();
  const tripStart = new Date(plannerState.startDate + "T12:00:00");
  const daysUntilTrip = Math.ceil((tripStart - now) / (1000 * 60 * 60 * 24));
  const canBook = daysUntilTrip <= 7;

  const bookingDate = new Date(tripStart);
  bookingDate.setDate(bookingDate.getDate() - 7);
  const bookingDateStr = bookingDate.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

  c.innerHTML = `
    <section class="wizard-step-card">
      <div class="wizard-step-header">
        <span class="wizard-step-emoji">⚡</span>
        <div>
          <h2>Lightning Lane Passes</h2>
          <p class="wizard-step-subtitle">
            ${canBook
              ? "You're within the booking window! Add any Lightning Lane reservations you've made."
              : `Your booking window opens <strong>${bookingDateStr}</strong>. You can skip this for now and add them later from the itinerary page.`
            }
          </p>
        </div>
      </div>

      <div id="ll-days-container">
        ${days.map(date => {
          const parkVal = plannerState.parkDays[date] || "";
          const parkLabel = PARK_LOCATION_NAMES[parkVal] || "";
          if (parkVal === "rest-day" || parkVal === "travel") return "";
          const existing = plannerState.lightningLanes.filter(d => d.date === date);

          return `
            <div class="wizard-day-section" data-date="${date}">
              <div class="wizard-day-header">
                <strong>${formatDateNice(date)}</strong>
                <span class="wizard-day-park">${parkLabel}</span>
              </div>
              <div class="ll-entries" data-date="${date}">
                ${existing.map((d, i) => renderLLEntry(date, i, d)).join("")}
              </div>
              <button type="button" class="secondary-button add-ll-btn" data-date="${date}" style="margin-top:0.5rem;">
                + Add Lightning Lane
              </button>
            </div>
          `;
        }).join("")}
      </div>

      ${renderNavButtons({ nextLabel: "Next: Other Activities →" })}
    </section>
  `;

  c.querySelectorAll(".add-ll-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const date = btn.dataset.date;
      const container = c.querySelector(`.ll-entries[data-date="${date}"]`);
      const idx = container.children.length;
      container.insertAdjacentHTML("beforeend", renderLLEntry(date, idx, {}));
      // Attach autocomplete to the newly added entry
      const newRow = container.lastElementChild;
      attachLLAutocomplete(newRow);
    });
  });

  // Attach autocomplete to all existing LL entries
  c.querySelectorAll(".wizard-entry-row").forEach(row => {
    attachLLAutocomplete(row);
  });

  wireNavButtons(() => {
    plannerState.lightningLanes = [];
    c.querySelectorAll(".wizard-entry-row").forEach(row => {
      const time = row.querySelector(".entry-time")?.value;
      const title = row.querySelector(".entry-title")?.value.trim();
      const location = row.querySelector(".entry-location")?.value.trim();
      const date = row.querySelector(".entry-date")?.value;
      if (title && time) {
        plannerState.lightningLanes.push({ date, time, title, location });
      }
    });
    return true;
  });
}

function renderLLEntry(date, idx, data = {}) {
  return `
    <div class="wizard-entry-row">
      <input type="time" class="entry-time" value="${data.time || ""}" placeholder="Time" />
      <input type="text" class="entry-title" value="${escHtml(data.title || "")}" placeholder="Ride name" />
      <input type="text" class="entry-location" value="${escHtml(data.location || "")}" placeholder="Land / Area (optional)" />
      <button type="button" class="wizard-remove-entry" aria-label="Remove">✕</button>
      <input type="hidden" class="entry-date" value="${date}" />
    </div>
  `;
}

// Attach venue autocomplete to a Lightning Lane entry row
function attachLLAutocomplete(rowEl) {
  if (typeof attachVenueAutocomplete !== "function") return;
  const titleInput = rowEl.querySelector(".entry-title");
  if (!titleInput) return;

  attachVenueAutocomplete(titleInput, {
    filterType: "Ride",
    onSelect: (venue) => {
      const locationInput = rowEl.querySelector(".entry-location");
      if (locationInput && venue.location) {
        locationInput.value = venue.location;
      }
    }
  });
}

// ── STEP 6: Other Activities ───────────────────────────────

function renderStepExtras() {
  const c = document.getElementById("wizard-container");
  const days = getDaysBetween(plannerState.startDate, plannerState.endDate);

  c.innerHTML = `
    <section class="wizard-step-card">
      <div class="wizard-step-header">
        <span class="wizard-step-emoji">🎭</span>
        <div>
          <h2>Other Activities</h2>
          <p class="wizard-step-subtitle">Shows, character meets, shopping trips, pool time — anything else you want to remember.</p>
        </div>
      </div>

      <div id="extras-days-container">
        ${days.map(date => {
          const parkVal = plannerState.parkDays[date] || "";
          const parkLabel = PARK_LOCATION_NAMES[parkVal] || "";
          const existing = plannerState.otherActivities.filter(d => d.date === date);

          return `
            <div class="wizard-day-section" data-date="${date}">
              <div class="wizard-day-header">
                <strong>${formatDateNice(date)}</strong>
                <span class="wizard-day-park">${parkLabel}</span>
              </div>
              <div class="extras-entries" data-date="${date}">
                ${existing.map((d, i) => renderExtrasEntry(date, i, d)).join("")}
              </div>
              <button type="button" class="secondary-button add-extras-btn" data-date="${date}" style="margin-top:0.5rem;">
                + Add Activity
              </button>
            </div>
          `;
        }).join("")}
      </div>

      ${renderNavButtons({ nextLabel: "Next: Review →" })}
    </section>
  `;

  c.querySelectorAll(".add-extras-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const date = btn.dataset.date;
      const container = c.querySelector(`.extras-entries[data-date="${date}"]`);
      const idx = container.children.length;
      container.insertAdjacentHTML("beforeend", renderExtrasEntry(date, idx, {}));
      // Attach autocomplete to the newly added entry
      const newRow = container.lastElementChild;
      attachExtrasAutocomplete(newRow);
    });
  });

  // Attach autocomplete to all existing extras entries
  c.querySelectorAll(".wizard-entry-row").forEach(row => {
    attachExtrasAutocomplete(row);
  });

  wireNavButtons(() => {
    plannerState.otherActivities = [];
    c.querySelectorAll(".wizard-entry-row").forEach(row => {
      const time = row.querySelector(".entry-time")?.value;
      const title = row.querySelector(".entry-title")?.value.trim();
      const location = row.querySelector(".entry-location")?.value.trim();
      const notes = row.querySelector(".entry-notes")?.value.trim();
      const type = row.querySelector(".entry-type")?.value || "Show";
      const date = row.querySelector(".entry-date")?.value;
      if (title) {
        plannerState.otherActivities.push({ date, time: time || "12:00", type, title, location, notes });
      }
    });
    return true;
  });
}

function renderExtrasEntry(date, idx, data = {}) {
  return `
    <div class="wizard-entry-row">
      <input type="time" class="entry-time" value="${data.time || ""}" placeholder="Time" />
      <select class="entry-type">
        ${["Show", "Ride", "Merch", "Break", "Travel"].map(t =>
          `<option value="${t}" ${(data.type || "Show") === t ? "selected" : ""}>${t}</option>`
        ).join("")}
      </select>
      <input type="text" class="entry-title" value="${escHtml(data.title || "")}" placeholder="Activity name" />
      <input type="text" class="entry-location" value="${escHtml(data.location || "")}" placeholder="Location (optional)" />
      <input type="text" class="entry-notes" value="${escHtml(data.notes || "")}" placeholder="Notes (optional)" />
      <button type="button" class="wizard-remove-entry" aria-label="Remove">✕</button>
      <input type="hidden" class="entry-date" value="${date}" />
    </div>
  `;
}

// Attach venue autocomplete to an extras entry row's title input
function attachExtrasAutocomplete(rowEl) {
  if (typeof attachVenueAutocomplete !== "function") return;
  const titleInput = rowEl.querySelector(".entry-title");
  if (!titleInput) return;

  attachVenueAutocomplete(titleInput, {
    onSelect: (venue) => {
      // Auto-fill location and type if the venue has them
      const locationInput = rowEl.querySelector(".entry-location");
      if (locationInput && venue.location) {
        locationInput.value = venue.location;
      }
      const typeSelect = rowEl.querySelector(".entry-type");
      if (typeSelect && venue.type) {
        const validTypes = [...typeSelect.options].map(o => o.value);
        // Map venue types to the select options (capitalize first letter)
        const mapped = venue.type.charAt(0).toUpperCase() + venue.type.slice(1).toLowerCase();
        if (validTypes.includes(mapped)) {
          typeSelect.value = mapped;
        }
      }
    }
  });
}

// ── STEP 7: Review & Save ──────────────────────────────────

function renderStepReview() {
  const c = document.getElementById("wizard-container");
  const days = getDaysBetween(plannerState.startDate, plannerState.endDate);
  const allActivities = buildAllActivities();

  c.innerHTML = `
    <section class="wizard-step-card">
      <div class="wizard-step-header">
        <span class="wizard-step-emoji">✅</span>
        <div>
          <h2>Review Your Trip</h2>
          <p class="wizard-step-subtitle">Here's everything you've planned. Hit save to add it all to your itinerary!</p>
        </div>
      </div>

      <div class="review-summary">
        <div class="review-meta">
          <p>📅 <strong>${formatDateNice(plannerState.startDate)}</strong> → <strong>${formatDateNice(plannerState.endDate)}</strong> (${days.length} days)</p>
          <p>${plannerState.travelMode === "flying" ? "✈️ Flying" : "🚗 Driving"} — arriving ${formatTimeNice(plannerState.arrivalTime)}, departing ${formatTimeNice(plannerState.departureTime)}</p>
          <p>🏰 Staying at <strong>${escHtml(plannerState.resortName)}</strong>
            ${plannerState.changingResorts ? ` → then <strong>${escHtml(plannerState.secondResort)}</strong> from ${formatDateNice(plannerState.resortChangeDate)}` : ""}
          </p>
        </div>

        ${days.map(date => {
          const parkVal = plannerState.parkDays[date] || "";
          const parkOpt = PARK_OPTIONS.find(p => p.value === parkVal);
          const dayActivities = allActivities.filter(a => a.date === date).sort((a, b) => (a.time || "").localeCompare(b.time || ""));

          return `
            <div class="review-day">
              <div class="review-day-header">
                <strong>${formatDateNice(date)}</strong>
                <span>${parkOpt ? parkOpt.emoji + " " + parkOpt.label : ""}</span>
              </div>
              ${dayActivities.length > 0 ? `
                <div class="review-day-activities">
                  ${dayActivities.map(a => `
                    <div class="review-activity">
                      <span class="review-time">${formatTimeNice(a.time)}</span>
                      <span class="review-title">${escHtml(a.title)}</span>
                      <span class="review-badge review-badge-${a.type.toLowerCase()}">${a.type}</span>
                    </div>
                  `).join("")}
                </div>
              ` : `<p class="review-empty">No activities planned</p>`}
            </div>
          `;
        }).join("")}
      </div>

      <p class="review-count">📋 <strong>${allActivities.length} activities</strong> will be added to your itinerary.</p>

      <div class="wizard-nav-buttons">
        <button type="button" class="secondary-button wizard-back-btn">← Back</button>
        <button type="button" class="primary-button wizard-save-btn" id="wizard-save-btn">
          🎉 Save to Itinerary
        </button>
      </div>
    </section>
  `;

  const backBtn = c.querySelector(".wizard-back-btn");
  if (backBtn) backBtn.addEventListener("click", () => { currentStep--; renderCurrentStep(); });

  const saveBtn = document.getElementById("wizard-save-btn");
  if (saveBtn) saveBtn.addEventListener("click", handleSaveTrip);
}

// ── Build Activities from planner state ────────────────────

function buildAllActivities() {
  const activities = [];
  const days = getDaysBetween(plannerState.startDate, plannerState.endDate);

  // Travel / arrival activity on first day
  activities.push({
    date: plannerState.startDate,
    time: plannerState.arrivalTime,
    type: "Travel",
    title: plannerState.travelMode === "flying" ? "Arrive at Orlando (Flight)" : "Arrive at Disney (Driving)",
    location: plannerState.resortName,
    notes: `Check in to ${plannerState.resortName}`,
  });

  // Resort change activity
  if (plannerState.changingResorts && plannerState.resortChangeDate) {
    activities.push({
      date: plannerState.resortChangeDate,
      time: "10:00",
      type: "Travel",
      title: `Resort Change: ${plannerState.secondResort}`,
      location: plannerState.secondResort,
      notes: `Moving from ${plannerState.resortName} to ${plannerState.secondResort}`,
    });
  }

  // Departure activity on last day
  activities.push({
    date: plannerState.endDate,
    time: plannerState.departureTime,
    type: "Travel",
    title: plannerState.travelMode === "flying" ? "Depart Orlando (Flight)" : "Depart Disney (Driving)",
    location: plannerState.resortName,
    notes: "Have a magical trip home! ✨",
  });

  // Dining reservations
  plannerState.diningReservations.forEach(d => {
    activities.push({
      date: d.date,
      time: d.time,
      type: "Dining",
      title: d.title,
      location: d.location || PARK_LOCATION_NAMES[plannerState.parkDays[d.date]] || "",
      notes: d.notes || "",
    });
  });

  // Lightning Lane
  plannerState.lightningLanes.forEach(ll => {
    activities.push({
      date: ll.date,
      time: ll.time,
      type: "Ride",
      title: ll.title + " (Lightning Lane)",
      location: ll.location || PARK_LOCATION_NAMES[plannerState.parkDays[ll.date]] || "",
      notes: "Lightning Lane — arrive 5 min early",
    });
  });

  // Other activities
  plannerState.otherActivities.forEach(a => {
    activities.push({
      date: a.date,
      time: a.time,
      type: a.type || "Show",
      title: a.title,
      location: a.location || PARK_LOCATION_NAMES[plannerState.parkDays[a.date]] || "",
      notes: a.notes || "",
    });
  });

  return activities;
}

// ── Save to API ────────────────────────────────────────────

async function handleSaveTrip() {
  const saveBtn = document.getElementById("wizard-save-btn");
  saveBtn.textContent = "Saving...";
  saveBtn.disabled = true;

  const activities = buildAllActivities().map(a => ({
    id: `activity-${Date.now()}-${Math.floor(Math.random() * 100000)}`,
    date: a.date,
    time: a.time,
    type: a.type,
    title: a.title,
    location: a.location,
    notes: a.notes,
    image: "",
  }));

  // Build park days array from planner state
  const parkDays = Object.entries(plannerState.parkDays)
    .filter(([date, park]) => park && park !== "rest-day" && park !== "travel")
    .map(([date, park]) => ({ date, park }));

  try {
    await ItineraryDB.addMany(activities);

    // Save park day assignments
    if (parkDays.length > 0) {
      await ParkDaysDB.saveMany(parkDays);
      console.log(`[Planner] Saved ${parkDays.length} park days`);
    }

    // Assign members to this trip
    if (plannerState.members.length > 0) {
      const tripId = `trip-${plannerState.startDate}-${plannerState.endDate}`;
      for (const userId of plannerState.members) {
        try {
          await apiFetch(`/trips/${tripId}/members`, {
            method: "POST",
            body: JSON.stringify({ user_id: userId }),
          });
        } catch (e) {
          console.error(`[Planner] Failed to assign member ${userId}:`, e);
        }
      }
      console.log(`[Planner] Assigned ${plannerState.members.length} members to trip ${tripId}`);
    }

    // Create a trip_budgets entry so the trip date range is always stored
    // (budget amounts default to 0 — user can set them later via the budget wizard)
    const budgetTripId = `trip-${plannerState.startDate}-${plannerState.endDate}`;
    const [_sy, _sm, _sd] = plannerState.startDate.split("-").map(Number);
    const [_ey, _em, _ed] = plannerState.endDate.split("-").map(Number);
    const _startFmt = new Date(_sy, _sm - 1, _sd).toLocaleDateString("en-US", { month: "short", day: "numeric" });
    const _endFmt = new Date(_ey, _em - 1, _ed).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

    try {
      await apiFetch(`/trip-budgets/${budgetTripId}`, {
        method: "PUT",
        body: JSON.stringify({
          label: `${_startFmt} – ${_endFmt}`,
          start_date: plannerState.startDate,
          end_date: plannerState.endDate,
          hotel: 0,
          food: 0,
          extras: 0,
          souvenirs: 0,
        }),
      });
      console.log(`[Planner] Created trip budget entry: ${budgetTripId}`);
    } catch (e) {
      console.warn("[Planner] Could not create trip budget entry:", e);
    }

    // Show success
    const c = document.getElementById("wizard-container");
    c.innerHTML = `
      <section class="wizard-step-card" style="text-align:center; padding: 3rem 2rem;">
        <div style="font-size:4rem; margin-bottom:1rem;">🎉</div>
        <h2>Your trip is planned!</h2>
        <p style="font-size:1.1rem; color:var(--slate); margin:1rem 0 2rem;">
          ${activities.length} activities and ${parkDays.length} park days have been added to your itinerary.
        </p>
        <div style="display:flex; gap:1rem; justify-content:center; flex-wrap:wrap;">
          <a href="itinerary.html" class="primary-button" style="text-decoration:none; display:inline-block;">
            📋 View Itinerary
          </a>
          <a href="index.html" class="secondary-button" style="text-decoration:none; display:inline-block;">
            🏠 Go to Dashboard
          </a>
        </div>
      </section>
    `;
  } catch (err) {
    console.error("Failed to save trip:", err);
    saveBtn.textContent = "❌ Error — Try Again";
    saveBtn.disabled = false;
  }
}

// ── Initialize ─────────────────────────────────────────────

document.addEventListener("DOMContentLoaded", () => {
  if (!document.getElementById("wizard-container")) return;
  renderCurrentStep();
});