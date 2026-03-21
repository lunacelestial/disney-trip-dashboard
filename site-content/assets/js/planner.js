// ============================================================
// TRIP PLANNER WIZARD
// A step-by-step planner that builds out a full Disney itinerary
// and pushes everything to the API in one go.
// ============================================================

const PLANNER_STEPS = [
  { id: "dates",        label: "Dates & Travel",    icon: "✈️" },
  { id: "members",      label: "Who's Going?",      icon: "👨‍👩‍👧‍👦" },
  { id: "budgetgroups", label: "Budget Groups",     icon: "💰" },
  { id: "resort",       label: "Resort",            icon: "🏰" },
  { id: "parks",        label: "Park Days",         icon: "🎢" },
  { id: "dining",       label: "Dining",            icon: "🍽️" },
  { id: "lightning",    label: "Lightning Lane",    icon: "⚡" },
  { id: "extras",       label: "Other Activities",  icon: "🎭" },
  { id: "review",       label: "Review & Save",     icon: "✅" },
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

  // Step 3: Budget Groups
  // null = not yet decided, "individual" = all solo, "shared" = groups defined below
  budgetMode: null,
  // Array of { id, label, memberIds[] } — only used when budgetMode === "shared"
  budgetGroups: [],
  // Full user objects for the selected members (stashed for the budget groups step)
  _memberObjects: [],

  // Step 4: Resort
  resortName: "",
  resortType: "disney",  // "disney" | "timeshare" | "offsite"
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

// ── TV-Friendly Date Picker ────────────────────────────────
// Replaces native <input type="date"> with MM / DD / YYYY number
// spinners that work reliably with TV remote controls.
// A 📅 button opens the native calendar for mouse/touch users.
// The hidden backing <input id="..."> stays in sync so all
// existing .value reads work completely unchanged.

function renderTVDatePicker(id, value) {
  const parts = value ? value.split("-") : ["", "", ""];
  const yyyy = parts[0] || "";
  const mm   = parts[1] || "";
  const dd   = parts[2] || "";
  return `
    <div class="tv-date-picker" data-id="${id}">
      <input type="number" class="tv-date-seg tv-date-mm" min="1" max="12"
        placeholder="MM" value="${mm}" aria-label="Month" />
      <span class="tv-date-sep">/</span>
      <input type="number" class="tv-date-seg tv-date-dd" min="1" max="31"
        placeholder="DD" value="${dd}" aria-label="Day" />
      <span class="tv-date-sep">/</span>
      <input type="number" class="tv-date-seg tv-date-yyyy" min="2024" max="2099"
        placeholder="YYYY" value="${yyyy}" aria-label="Year" />
      <span class="tv-date-spacer"></span>
      <button type="button" class="tv-date-cal-btn" aria-label="Open calendar">📅</button>
      <input type="date" class="tv-date-native" value="${value || ""}" tabindex="-1" aria-hidden="true" />
      <input type="hidden" id="${id}" value="${value || ""}" />
    </div>
  `;
}

function initTVDatePicker(id) {
  const wrapper = document.querySelector(`.tv-date-picker[data-id="${id}"]`);
  if (!wrapper) return;

  const hidden  = document.getElementById(id);
  const mmEl    = wrapper.querySelector(".tv-date-mm");
  const ddEl    = wrapper.querySelector(".tv-date-dd");
  const yyyyEl  = wrapper.querySelector(".tv-date-yyyy");
  const calBtn  = wrapper.querySelector(".tv-date-cal-btn");
  const nativeEl = wrapper.querySelector(".tv-date-native");

  function sync() {
    const mm   = String(mmEl.value   || "").padStart(2, "0");
    const dd   = String(ddEl.value   || "").padStart(2, "0");
    const yyyy = String(yyyyEl.value || "");
    if (mm !== "00" && dd !== "00" && yyyy.length === 4) {
      hidden.value = `${yyyy}-${mm}-${dd}`;
    } else {
      hidden.value = "";
    }
  }

  function syncFromNative() {
    const val = nativeEl.value;
    if (val && val.includes("-")) {
      const [y, m, d] = val.split("-");
      yyyyEl.value = y;
      mmEl.value   = String(parseInt(m));
      ddEl.value   = String(parseInt(d));
      hidden.value = val;
    }
  }

  if (calBtn && nativeEl) {
    calBtn.addEventListener("click", () => {
      const mm   = String(mmEl.value   || "").padStart(2, "0");
      const dd   = String(ddEl.value   || "").padStart(2, "0");
      const yyyy = String(yyyyEl.value || "");
      if (mm !== "00" && dd !== "00" && yyyy.length === 4) {
        nativeEl.value = `${yyyy}-${mm}-${dd}`;
      }
      nativeEl.showPicker ? nativeEl.showPicker() : nativeEl.click();
    });
    nativeEl.addEventListener("change", syncFromNative);
  }

  function clamp(el, min, max) {
    const v = parseInt(el.value);
    if (!isNaN(v)) el.value = Math.min(max, Math.max(min, v));
    sync();
  }

  function handleKey(e, el, min, max, prev, next) {
    switch (e.key) {
      case "ArrowUp":
        e.preventDefault();
        el.value = Math.min(max, (parseInt(el.value) || min) + 1);
        sync(); break;
      case "ArrowDown":
        e.preventDefault();
        el.value = Math.max(min, (parseInt(el.value) || min + 1) - 1);
        sync(); break;
      case "ArrowRight":
      case "Enter":
        e.preventDefault();
        if (next) next.focus(); break;
      case "ArrowLeft":
        e.preventDefault();
        if (prev) prev.focus(); break;
    }
  }

  function autoAdvance(el, maxLen, min, max, next) {
    el.addEventListener("input", () => {
      const raw = String(el.value).replace(/\D/g, "").slice(0, maxLen);
      el.value = raw;
      sync();
      if (raw.length >= maxLen && next) { clamp(el, min, max); next.focus(); }
    });
    el.addEventListener("blur", () => clamp(el, min, max));
  }

  mmEl.addEventListener("keydown",   e => handleKey(e, mmEl,   1,    12,   null, ddEl));
  ddEl.addEventListener("keydown",   e => handleKey(e, ddEl,   1,    31,   mmEl, yyyyEl));
  yyyyEl.addEventListener("keydown", e => handleKey(e, yyyyEl, 2024, 2099, ddEl, null));

  autoAdvance(mmEl,   2, 1,    12,   ddEl);
  autoAdvance(ddEl,   2, 1,    31,   yyyyEl);
  autoAdvance(yyyyEl, 4, 2024, 2099, null);

  [mmEl, ddEl, yyyyEl].forEach(el => el.addEventListener("change", sync));
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

  // Skip the budgetgroups step when only 1 member is going
  function nextStepIndex(from) {
    let idx = from + 1;
    if (PLANNER_STEPS[idx]?.id === "budgetgroups" && plannerState.members.length <= 1) idx++;
    return idx;
  }
  function prevStepIndex(from) {
    let idx = from - 1;
    if (PLANNER_STEPS[idx]?.id === "budgetgroups" && plannerState.members.length <= 1) idx--;
    return idx;
  }

  // addClickAndEnter: TV remote OK/Select (Enter/Space) fires same handler as click
  function addClickAndEnter(btn, handler) {
    if (!btn) return;
    btn.addEventListener("click", handler);
    btn.addEventListener("keydown", e => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handler(); }
    });
  }

  addClickAndEnter(nextBtn, () => {
    if (validateAndSave && !validateAndSave()) return;
    currentStep = nextStepIndex(currentStep);
    renderCurrentStep();
  });

  addClickAndEnter(backBtn, () => {
    currentStep = prevStepIndex(currentStep);
    renderCurrentStep();
  });
}

function renderCurrentStep() {
  renderProgress();
  const step = PLANNER_STEPS[currentStep];
  switch (step.id) {
    case "dates":         renderStepDates(); break;
    case "members":       renderStepMembers(); break;
    case "budgetgroups":  renderStepBudgetGroups(); break;
    case "resort":        renderStepResort(); break;
    case "parks":         renderStepParks(); break;
    case "dining":        renderStepDining(); break;
    case "lightning":     renderStepLightning(); break;
    case "extras":        renderStepExtras(); break;
    case "review":        renderStepReview(); break;
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
          <label>First Day</label>
          ${renderTVDatePicker("p-start-date", plannerState.startDate)}
        </div>
        <div class="wizard-field">
          <label>Last Day</label>
          ${renderTVDatePicker("p-end-date", plannerState.endDate)}
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

  // Initialise TV-friendly date pickers
  initTVDatePicker("p-start-date");
  initTVDatePicker("p-end-date");

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
    const checkboxes = c.querySelectorAll(".member-checkbox:checked");
    const newMembers = Array.from(checkboxes).map(cb => cb.value);
    // Reset budget state if membership changed
    const changed = JSON.stringify([...newMembers].sort()) !== JSON.stringify([...plannerState.members].sort());
    if (changed) { plannerState.budgetMode = null; plannerState.budgetGroups = []; }
    plannerState.members = newMembers;
    // Stash full user objects for the budget groups step
    plannerState._memberObjects = allUsers.filter(u => plannerState.members.includes(u.id));

    // If 2+ members and budget mode not yet chosen, show the splash modal
    if (plannerState.members.length > 1 && plannerState.budgetMode === null) {
      showBudgetModeModal();
      return false; // prevent wizard from advancing — modal handles navigation
    }
    return true;
  });
}

// ── STEP 3: Budget Groups ──────────────────────────────────
// Only shown when 2+ members are going AND shared mode was chosen.
// The Individual vs Shared choice is handled by a modal on the members step.

function renderStepBudgetGroups() {
  // This step is only reached when budgetMode === "shared"
  renderBudgetGroupBuilder();
}

// ── Budget Mode Modal ──────────────────────────────────────
// Shown as a splash overlay after the members step when 2+ members are selected.
function showBudgetModeModal() {
  // Remove any existing modal
  document.getElementById("budget-mode-modal")?.remove();

  const memberCount = plannerState.members.length;

  const overlay = document.createElement("div");
  overlay.id = "budget-mode-modal";
  overlay.innerHTML = `
    <div class="bm-modal-backdrop"></div>
    <div class="bm-modal-card" role="dialog" aria-modal="true" aria-labelledby="bm-modal-title">
      <div class="bm-modal-header">
        <span class="bm-modal-emoji">💰</span>
        <div>
          <h2 id="bm-modal-title">How are you handling budgets?</h2>
          <p>${memberCount} people are going. Does everyone track their own spending, or are some people sharing one budget?</p>
        </div>
      </div>

      <div class="bg-mode-choices">
        <button type="button" class="bg-mode-card" data-mode="individual">
          <span class="bg-mode-icon">🧍</span>
          <strong>Individual Budgets</strong>
          <p>Everyone tracks and manages their own spending separately.</p>
        </button>
        <button type="button" class="bg-mode-card" data-mode="shared">
          <span class="bg-mode-icon">👫</span>
          <strong>Shared Budgets</strong>
          <p>Some or all people share a combined budget. You choose who.</p>
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  // Animate in
  requestAnimationFrame(() => overlay.classList.add("bm-visible"));

  function closeModal() {
    overlay.classList.remove("bm-visible");
    setTimeout(() => overlay.remove(), 250);
  }

  overlay.querySelectorAll(".bg-mode-card").forEach(card => {
    card.addEventListener("click", () => {
      const mode = card.dataset.mode;
      plannerState.budgetMode = mode;

      if (mode === "individual") {
        // Clear any groups and go straight to resort
        plannerState.budgetGroups = [];
        closeModal();
        // Skip budgetgroups step — advance past it to resort
        const budgetStepIdx = PLANNER_STEPS.findIndex(s => s.id === "budgetgroups");
        currentStep = budgetStepIdx + 1; // resort
        renderCurrentStep();
      } else {
        // Shared — close modal and go to budget groups builder
        closeModal();
        const budgetStepIdx = PLANNER_STEPS.findIndex(s => s.id === "budgetgroups");
        currentStep = budgetStepIdx;
        renderCurrentStep();
      }
    });
  });
}

// Phase 2 — Drag-and-drop budget builder
function renderBudgetGroupBuilder() {
  const c = document.getElementById("wizard-container");
  const nameMap = {};
  plannerState._memberObjects.forEach(u => { nameMap[u.id] = u.name; });

  // Initialise groups if empty — start with everyone unassigned
  if (!plannerState.budgetGroups || plannerState.budgetGroups.length === 0) {
    plannerState.budgetGroups = [];
  }

  // Which members are already in a group?
  function assignedIds() {
    return new Set(plannerState.budgetGroups.flatMap(g => g.memberIds));
  }

  function firstName(uid) {
    return (nameMap[uid] || uid).split(" ")[0];
  }

  function render() {
    const assigned = assignedIds();
    const unassigned = plannerState.members.filter(uid => !assigned.has(uid));

    c.innerHTML = `
      <section class="wizard-step-card">
        <div class="wizard-step-header">
          <span class="wizard-step-emoji">💰</span>
          <div>
            <h2>Assign Budget Groups</h2>
            <p class="wizard-step-subtitle">Drag people into a shared budget, or leave them unassigned to keep an individual budget.</p>
          </div>
        </div>

        ${unassigned.length > 0 ? `
          <div class="bg-unassigned-pool">
            <p class="bg-pool-label">Unassigned — individual budget by default</p>
            <div class="bg-pill-pool" id="bg-unassigned-pool">
              ${unassigned.map(uid => `
                <div class="bg-pill" draggable="true" data-uid="${uid}" data-source="unassigned">
                  <span class="bg-pill-avatar">${firstName(uid)[0]}</span>
                  <span class="bg-pill-name">${escHtml(firstName(uid))}</span>
                </div>
              `).join("")}
            </div>
          </div>
        ` : ""}

        <div id="bg-groups-list" class="bg-groups-list">
          ${plannerState.budgetGroups.map((grp, gi) => `
            <div class="bg-group-bucket" data-gi="${gi}">
              <div class="bg-bucket-header">
                <input type="text" class="bg-bucket-name" value="${escHtml(grp.label)}" data-gi="${gi}" placeholder="Budget name..." maxlength="30" />
                <button type="button" class="bg-bucket-delete" data-gi="${gi}" title="Remove this budget group">✕</button>
              </div>
              <div class="bg-bucket-drop" data-gi="${gi}" id="bg-drop-${gi}">
                ${grp.memberIds.map(uid => `
                  <div class="bg-pill" draggable="true" data-uid="${uid}" data-source="group" data-gi="${gi}">
                    <span class="bg-pill-avatar">${firstName(uid)[0]}</span>
                    <span class="bg-pill-name">${escHtml(firstName(uid))}</span>
                    <button type="button" class="bg-pill-remove" data-uid="${uid}" data-gi="${gi}" title="Remove from group">↩</button>
                  </div>
                `).join("")}
                ${grp.memberIds.length === 0 ? `<p class="bg-drop-hint">Drop people here</p>` : ""}
              </div>
            </div>
          `).join("")}
        </div>

        <button type="button" class="secondary-button bg-add-budget-btn" style="margin-top:1rem; width:100%;">
          + Add Budget Group
        </button>

        <div class="wizard-nav-buttons" style="margin-top:2rem; padding-top:1.5rem; border-top:1px solid #e2e8f0;">
          <button type="button" class="secondary-button" id="bg-back-btn">← Back</button>
          <button type="button" class="primary-button" id="bg-next-btn">Next: Resort →</button>
        </div>
      </section>
    `;

    wireBudgetBuilder(render);
  }

  render();
}

function wireBudgetBuilder(rerender) {
  const c = document.getElementById("wizard-container");
  let dragUid = null;
  let dragSource = null;
  let dragSourceGi = null;

  // ── Drag from pills ──────────────────────────────────────
  c.querySelectorAll(".bg-pill[draggable]").forEach(pill => {
    pill.addEventListener("dragstart", e => {
      dragUid = pill.dataset.uid;
      dragSource = pill.dataset.source;
      dragSourceGi = pill.dataset.gi !== undefined ? parseInt(pill.dataset.gi) : null;
      pill.classList.add("dragging");
      e.dataTransfer.effectAllowed = "move";
    });
    pill.addEventListener("dragend", () => pill.classList.remove("dragging"));
  });

  // ── Drop zones: bucket drop areas ───────────────────────
  c.querySelectorAll(".bg-bucket-drop").forEach(zone => {
    zone.addEventListener("dragover", e => { e.preventDefault(); zone.classList.add("drag-over"); });
    zone.addEventListener("dragleave", () => zone.classList.remove("drag-over"));
    zone.addEventListener("drop", e => {
      e.preventDefault();
      zone.classList.remove("drag-over");
      if (!dragUid) return;
      const targetGi = parseInt(zone.dataset.gi);

      // Remove from source
      if (dragSource === "group" && dragSourceGi !== null) {
        plannerState.budgetGroups[dragSourceGi].memberIds =
          plannerState.budgetGroups[dragSourceGi].memberIds.filter(id => id !== dragUid);
      }
      // Add to target group (avoid duplicates)
      if (!plannerState.budgetGroups[targetGi].memberIds.includes(dragUid)) {
        plannerState.budgetGroups[targetGi].memberIds.push(dragUid);
      }
      dragUid = null;
      rerender();
    });
  });

  // ── Drop zone: unassigned pool ───────────────────────────
  const pool = c.querySelector("#bg-unassigned-pool");
  if (pool) {
    pool.addEventListener("dragover", e => { e.preventDefault(); pool.classList.add("drag-over"); });
    pool.addEventListener("dragleave", () => pool.classList.remove("drag-over"));
    pool.addEventListener("drop", e => {
      e.preventDefault();
      pool.classList.remove("drag-over");
      if (!dragUid || dragSource !== "group" || dragSourceGi === null) return;
      // Remove from group — back to unassigned
      plannerState.budgetGroups[dragSourceGi].memberIds =
        plannerState.budgetGroups[dragSourceGi].memberIds.filter(id => id !== dragUid);
      dragUid = null;
      rerender();
    });
  }

  // ── Remove pill from group (↩ button) ───────────────────
  c.querySelectorAll(".bg-pill-remove").forEach(btn => {
    btn.addEventListener("click", e => {
      e.stopPropagation();
      const uid = btn.dataset.uid;
      const gi = parseInt(btn.dataset.gi);
      plannerState.budgetGroups[gi].memberIds =
        plannerState.budgetGroups[gi].memberIds.filter(id => id !== uid);
      rerender();
    });
  });

  // ── Add Budget Group ─────────────────────────────────────
  c.querySelector(".bg-add-budget-btn")?.addEventListener("click", () => {
    const idx = plannerState.budgetGroups.length + 1;
    plannerState.budgetGroups.push({
      id: `grp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      label: `Budget ${idx}`,
      memberIds: [],
    });
    rerender();
  });

  // ── Delete budget group ──────────────────────────────────
  c.querySelectorAll(".bg-bucket-delete").forEach(btn => {
    btn.addEventListener("click", () => {
      const gi = parseInt(btn.dataset.gi);
      // Members go back to unassigned automatically (not in any group)
      plannerState.budgetGroups.splice(gi, 1);
      rerender();
    });
  });

  // ── Rename group ─────────────────────────────────────────
  c.querySelectorAll(".bg-bucket-name").forEach(input => {
    input.addEventListener("input", () => {
      const gi = parseInt(input.dataset.gi);
      plannerState.budgetGroups[gi].label = input.value;
    });
  });

  // ── Back: return to members step (modal will re-fire if needed) ─────
  c.querySelector("#bg-back-btn")?.addEventListener("click", () => {
    plannerState.budgetMode = null;
    const membersStepIdx = PLANNER_STEPS.findIndex(s => s.id === "members");
    currentStep = membersStepIdx;
    renderCurrentStep();
  });

  // ── Next: validate and advance ───────────────────────────
  c.querySelector("#bg-next-btn")?.addEventListener("click", () => {
    // Remove any empty groups
    plannerState.budgetGroups = plannerState.budgetGroups.filter(g => g.memberIds.length > 0);
    currentStep++;
    renderCurrentStep();
  });
}

// ── STEP 4: Resort ─────────────────────────────────────────

async function renderStepResort() {
  const c = document.getElementById("wizard-container");

  // Try to pull timeshare name from user profile to pre-fill
  let profileTimeshare = "";
  try {
    const user = typeof Auth !== "undefined" ? Auth.getUser() : null;
    if (user) {
      const profile = await apiFetch(`/user-profile/${user.id}`).catch(() => ({}));
      if (profile && profile.timeshare_name) profileTimeshare = profile.timeshare_name;
    }
  } catch(e) { /* non-fatal */ }

  // If resortType is timeshare and no resortName yet, pre-fill from profile
  if (plannerState.resortType === "timeshare" && !plannerState.resortName && profileTimeshare) {
    plannerState.resortName = profileTimeshare;
  }

  c.innerHTML = `
    <section class="wizard-step-card">
      <div class="wizard-step-header">
        <span class="wizard-step-emoji">🏰</span>
        <div>
          <h2>Where are you staying?</h2>
          <p class="wizard-step-subtitle">This helps us plan travel times and resort activities.</p>
        </div>
      </div>

      <div class="wizard-field" style="margin-bottom:1.25rem;">
        <label>Type of accommodation</label>
        <div class="wizard-toggle-group" id="resort-type-toggles">
          <button type="button" class="wizard-toggle ${plannerState.resortType === "disney"    ? "active" : ""}" data-rtype="disney">🏰 Disney Resort</button>
          <button type="button" class="wizard-toggle ${plannerState.resortType === "timeshare" ? "active" : ""}" data-rtype="timeshare">🏖️ Timeshare</button>
          <button type="button" class="wizard-toggle ${plannerState.resortType === "offsite"   ? "active" : ""}" data-rtype="offsite">🏨 Off-Site</button>
        </div>
      </div>

      <div class="wizard-field">
        <label for="p-resort" id="p-resort-label">${plannerState.resortType === "timeshare" ? "Timeshare / Property Name" : plannerState.resortType === "offsite" ? "Hotel Name" : "Resort Name"}</label>
        <input type="text" id="p-resort" value="${escHtml(plannerState.resortName)}"
          placeholder="${plannerState.resortType === "timeshare" ? "e.g. Marriott Grande Vista, Orange Lake" : plannerState.resortType === "offsite" ? "e.g. Hyatt Regency Orlando" : "e.g. Caribbean Beach Resort"}" />
        ${profileTimeshare && plannerState.resortType === "timeshare" ? `<p style="font-size:0.78rem; color:var(--sky-blue); margin:0.3rem 0 0; font-weight:700;">✓ Pre-filled from your profile</p>` : ""}
      </div>

      <div class="wizard-field" style="margin-top:1.25rem;">
        <label>Changing accommodations during your stay?</label>
        <div class="wizard-toggle-group" id="resort-change-toggles">
          <button type="button" class="wizard-toggle ${!plannerState.changingResorts ? "active" : ""}" data-val="no">No</button>
          <button type="button" class="wizard-toggle ${plannerState.changingResorts  ? "active" : ""}" data-val="yes">Yes</button>
        </div>
      </div>

      <div id="resort-change-fields" class="${plannerState.changingResorts ? "" : "hidden"}" style="margin-top:1.25rem;">
        <div class="wizard-form-grid">
          <div class="wizard-field">
            <label for="p-resort-2">Second Property</label>
            <input type="text" id="p-resort-2" value="${escHtml(plannerState.secondResort)}" placeholder="e.g. Animal Kingdom Lodge" />
          </div>
          <div class="wizard-field">
            <label>Change Date</label>
            ${renderTVDatePicker("p-resort-change-date", plannerState.resortChangeDate)}
          </div>
        </div>
      </div>

      ${renderNavButtons({ nextLabel: "Next: Park Days →" })}
    </section>
  `;

  // Property type toggles
  c.querySelectorAll("#resort-type-toggles .wizard-toggle").forEach(btn => {
    btn.addEventListener("click", () => {
      c.querySelectorAll("#resort-type-toggles .wizard-toggle").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      plannerState.resortType = btn.dataset.rtype;
      // Update label and placeholder
      const label = document.getElementById("p-resort-label");
      const input = document.getElementById("p-resort");
      if (plannerState.resortType === "timeshare") {
        label.textContent = "Timeshare / Property Name";
        input.placeholder = "e.g. Marriott Grande Vista, Orange Lake";
        // Pre-fill from profile if blank
        if (!input.value && profileTimeshare) input.value = profileTimeshare;
      } else if (plannerState.resortType === "offsite") {
        label.textContent = "Hotel Name";
        input.placeholder = "e.g. Hyatt Regency Orlando";
      } else {
        label.textContent = "Resort Name";
        input.placeholder = "e.g. Caribbean Beach Resort";
      }
    });
  });

  // Changing resorts toggles
  c.querySelectorAll("#resort-change-toggles .wizard-toggle").forEach(btn => {
    btn.addEventListener("click", () => {
      c.querySelectorAll("#resort-change-toggles .wizard-toggle").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      const yes = btn.dataset.val === "yes";
      plannerState.changingResorts = yes;
      document.getElementById("resort-change-fields").classList.toggle("hidden", !yes);
    });
  });

  initTVDatePicker("p-resort-change-date");

  wireNavButtons(() => {
    plannerState.resortName = document.getElementById("p-resort").value.trim();
    if (!plannerState.resortName) { alert("Please enter your accommodation name."); return false; }
    if (plannerState.changingResorts) {
      plannerState.secondResort = document.getElementById("p-resort-2").value.trim();
      plannerState.resortChangeDate = document.getElementById("p-resort-change-date").value;
    }
    return true;
  });

  if (typeof attachVenueAutocomplete === "function") {
    const resortInput = document.getElementById("p-resort");
    if (resortInput) attachVenueAutocomplete(resortInput, { filterType: "travel", onSelect: () => {} });
    const resort2Input = document.getElementById("p-resort-2");
    if (resort2Input) attachVenueAutocomplete(resort2Input, { filterType: "travel", onSelect: () => {} });
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

      // Save budget groups (only when shared mode with at least one group)
      if (plannerState.budgetMode === "shared" && plannerState.budgetGroups.length > 0) {
        try {
          await apiFetch(`/trips/${tripId}/budget-groups`, {
            method: "POST",
            body: JSON.stringify({ groups: plannerState.budgetGroups }),
          });
          console.log(`[Planner] Saved ${plannerState.budgetGroups.length} budget group(s)`);
        } catch (e) {
          console.warn("[Planner] Could not save budget groups:", e);
        }
      }
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