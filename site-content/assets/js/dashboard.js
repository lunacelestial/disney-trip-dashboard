// ============================================================
// DASHBOARD — Next Activity, Later Today, Budget & Wishlist cards
// Depends on: script.js (core)
// ============================================================

function getNextActivity(itinerary) {
  if (!Array.isArray(itinerary) || itinerary.length === 0) return null;

  const sorted = sortItineraryByTime(itinerary);
  const now = new Date();
  const todayString = getTodayString();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  const ACTIVITY_DURATIONS = {
    ride: 10, dining: 45, show: 30, merch: 20,
    shopping: 20, travel: 30, break: 30,
  };

  const upcoming = sorted.find((activity) => {
    if ((activity.date || "") > todayString) return true;

    if ((activity.date || "") === todayString) {
      const actMinutes = timeStringToMinutes(activity.time);
      if (actMinutes >= nowMinutes) return true;
      const type = (activity.type || "").toLowerCase();
      const durationMins = ACTIVITY_DURATIONS[type] || 15;
      if (actMinutes + durationMins >= nowMinutes) return true;
    }
    return false;
  });

  return upcoming || null;
}

async function renderNextActivityCard() {
  const titleEl = document.getElementById("next-activity-title");
  const detailsEl = document.getElementById("next-activity-details");
  const countdownEl = document.getElementById("next-activity-countdown");
  const iconEl = document.getElementById("next-activity-icon");
  const dateEl = document.getElementById("next-activity-date");
  const card = document.getElementById("next-activity-card");

  if (!titleEl || !detailsEl) return;

  const allSorted = sortItineraryByTime(await getStoredItinerary());
  const itinerary = await filterToCurrentTrip(allSorted);

  if (itinerary.length === 0) {
    titleEl.textContent = "No activities planned";
    detailsEl.textContent = "Add activities on the itinerary page to get started.";
    if (countdownEl) countdownEl.textContent = "";
    if (iconEl) iconEl.textContent = "🗓️";
    if (dateEl) dateEl.textContent = "";
    return;
  }

  const nextActivity = getNextActivity(itinerary);

  if (!nextActivity) {
    const todayStr = getTodayString();
    const todayActivities = itinerary.filter(a => a.date === todayStr);
    if (todayActivities.length > 0) {
      titleEl.textContent = "All done for today!";
      detailsEl.textContent = "Relax and enjoy the rest of your evening. ✨";
      if (iconEl) iconEl.textContent = "🌙";
      if (dateEl) dateEl.textContent = "";
      if (countdownEl) countdownEl.innerHTML = "";
    } else {
      titleEl.textContent = "No activities planned";
      detailsEl.textContent = "Add activities on the itinerary page to get started.";
      if (iconEl) iconEl.textContent = "🗓️";
      if (dateEl) dateEl.textContent = "";
      if (countdownEl) countdownEl.textContent = "";
    }
    return;
  }

  titleEl.textContent = nextActivity.title;
  detailsEl.textContent = `${formatTimeForDisplay(nextActivity.time)} • ${nextActivity.location}`;

  const typeIcons = { ride: "🎢", dining: "🍽️", show: "🎭", merch: "🛍️", shopping: "🛍️", break: "☀️" };
  const type = (nextActivity.type || "").toLowerCase();
  if (iconEl) {
    if (type === "travel") {
      const cfg = getETicketConfig("travel", nextActivity.title);
      iconEl.textContent = cfg.icon;
    } else {
      iconEl.textContent = typeIcons[type] || "🏰";
    }
  }

  if (card) {
    card.className = card.className.replace(/next-act-theme-\w+/g, "").trim();
    card.classList.add(`next-act-theme-${type || "default"}`);
  }

  if (dateEl && nextActivity.date) {
    const [y, m, d] = nextActivity.date.split("-").map(Number);
    const dt = new Date(y, m - 1, d);
    dateEl.textContent = dt.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
  }

  if (countdownEl) {
    updateNextActivityCountdown(nextActivity, countdownEl);
    if (window._nextActCountdownInterval) clearInterval(window._nextActCountdownInterval);
    window._nextActCountdownInterval = setInterval(() => {
      updateNextActivityCountdown(nextActivity, countdownEl);
    }, 30000);
  }
}

function updateNextActivityCountdown(activity, el) {
  if (!activity || !activity.date || !activity.time) {
    el.textContent = "";
    return;
  }

  const [h, m] = activity.time.split(":").map(Number);
  const [y, mo, d] = activity.date.split("-").map(Number);
  const activityTime = new Date(y, mo - 1, d, h, m, 0);
  const now = new Date();
  const diffMs = activityTime - now;

  const ACTIVITY_DURATIONS = {
    ride: 10, dining: 45, show: 30, merch: 20,
    shopping: 20, travel: 30, break: 30,
  };

  const type = (activity.type || "").toLowerCase();
  const durationMins = ACTIVITY_DURATIONS[type] || 15;
  const endTimeMs = activityTime.getTime() + (durationMins * 60 * 1000);

  if (diffMs <= 0 && now.getTime() < endTimeMs) {
    const minsElapsed = Math.floor((now.getTime() - activityTime.getTime()) / 60000);
    const minsLeft = durationMins - minsElapsed;

    if (minsLeft > 0) {
      el.innerHTML = `<span class="countdown-now">Happening now! ~${minsLeft}m left</span>`;
    } else {
      el.innerHTML = `<span class="countdown-now">Wrapping up...</span>`;
    }
    return;
  }

  if (diffMs <= 0 && now.getTime() >= endTimeMs) {
    if (!window._nextActAutoAdvanced) {
      window._nextActAutoAdvanced = true;

      if (type === "dining" && !window._diningFeedbackShown?.[activity.id]) {
        if (!window._diningFeedbackShown) window._diningFeedbackShown = {};
        window._diningFeedbackShown[activity.id] = true;
        setTimeout(() => {
          showDiningFeedbackModal(activity);
          window._nextActAutoAdvanced = false;
          renderNextActivityCard();
          renderDashboardItinerary();
        }, 1000);
      } else {
        setTimeout(() => {
          window._nextActAutoAdvanced = false;
          renderNextActivityCard();
          renderDashboardItinerary();
        }, 500);
      }
    }
    el.innerHTML = `<span class="countdown-now">Wrapping up...</span>`;
    return;
  }

  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);
  const remainHours = diffHours % 24;
  const remainMins = diffMins % 60;

  let text = "";
  if (diffDays > 0) {
    text = `${diffDays}d ${remainHours}h`;
  } else if (diffHours > 0) {
    text = `${diffHours}h ${remainMins}m`;
  } else {
    text = `${remainMins}m`;
  }

  el.innerHTML = `
    <span class="urgency-phrase" id="urgency-phrase-el"></span> 
    <span class="countdown-label">in</span> 
    <span class="countdown-value">${text}</span>
  `;

  if (navigator.geolocation && resolveDisneyLocation(activity.location)) {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const destination = resolveDisneyLocation(activity.location);
        if (!destination) return;

        const userLat = pos.coords.latitude;
        const userLng = pos.coords.longitude;
        const distance = haversineDistance(userLat, userLng, destination.lat, destination.lng);
        const walkSeconds = Math.round(distance / 1.2);
        const arrivalTimeMs = now.getTime() + (walkSeconds * 1000);
        const bufferMs = activityTime.getTime() - arrivalTimeMs;
        const bufferMins = Math.floor(bufferMs / 60000);

        let phrase = "";
        if (bufferMins >= 30) {
          phrase = "You've got plenty of time, it's";
        } else if (bufferMins >= 15 && bufferMins < 30) {
          phrase = "Start wrappin' up, it's";
        } else if (bufferMins >= 5 && bufferMins < 15) {
          if ((activity.type || "").toLowerCase() === "dining") {
            phrase = "You should really be on your way, it's";
          } else {
            phrase = "Get ready!!! It's";
          }
        } else {
          phrase = "You should really be on your way, it's";
        }

        const phraseEl = document.getElementById("urgency-phrase-el");
        if (phraseEl) phraseEl.textContent = phrase;
      },
      () => {},
      { maximumAge: 60000, timeout: 5000 }
    );
  }
}

// Dashboard E-TICKET Style Schedule Cards ("Later Today" row)
async function renderDashboardItinerary() {
  const listEl = document.getElementById("dashboard-itinerary-list");
  if (!listEl) return;

  const allSorted = sortItineraryByTime(await getStoredItinerary());
  const itinerary = await filterToCurrentTrip(allSorted);
  if (itinerary.length === 0) {
    listEl.innerHTML = '<p style="color: #64748b;">No activities planned yet.</p>';
    return;
  }

  const now = new Date();
  const todayString = getTodayString();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  const todayUpcoming = itinerary.filter((activity) => {
    if ((activity.date || "") !== todayString) return false;
    return timeStringToMinutes(activity.time) >= nowMinutes;
  });

  const laterActivities = todayUpcoming.slice(1, 6);

  if (laterActivities.length === 0) {
     listEl.innerHTML = '<p style="color: #64748b; font-size: 1.1rem;">No more activities planned today. Time to relax!</p>';
     return;
  }

  listEl.innerHTML = laterActivities.map((activity, idx) => {
    const cfg = getETicketConfig(activity.type, activity.title);
    const displayNotes = getDisplayNotes(activity);

    return `
      <article class="eticket clickable-card" data-id="${activity.id}" role="button" tabindex="0"
               aria-label="View details for ${escapeHtml(activity.title)}"
               style="background: ${cfg.bg}; border-color: ${cfg.border}; --et-text: ${cfg.text}; --et-accent: ${cfg.accent}; --et-stripe: ${cfg.stripe}; --et-label-bg: ${cfg.labelBg}; animation-delay: ${idx * 0.08}s;">

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
  }).join('');
}

// ── Dashboard Budget & Wishlist Cards ────────────────────────

async function renderDashboardBudgetCard() {
  const h3 = document.getElementById("dashboard-budget-h3");
  const p = document.getElementById("dashboard-budget-p");
  if (!h3) return;

  try {
    const allTrips = await fetch("/api/trip-budgets").then(r => r.json());
    const today = new Date().toISOString().split("T")[0];
    const trip = allTrips.find(t => today >= t.start_date && today <= t.end_date)
      || allTrips.find(t => t.start_date > today)
      || allTrips[0];

    if (!trip) {
      h3.textContent = "No budget set";
      if (p) p.textContent = "Configure on the Budget page.";
    } else {
      const remaining = trip.total - trip.spent;
      h3.textContent = `$${trip.spent.toFixed(2)} Spent`;
      if (p) p.textContent = `$${remaining.toFixed(2)} Remaining`;
    }
  } catch (e) {
    h3.textContent = "No budget set";
    if (p) p.textContent = "Configure on the Budget page.";
  }
}

async function renderDashboardWishlistCard() {
  const h3 = document.getElementById("dashboard-wishlist-h3");
  const p = document.getElementById("dashboard-wishlist-p");
  if (!h3) return;

  const items = await WishlistDB.getAll();

  if (items.length === 0) {
    h3.textContent = "Wishlist is empty";
    if (p) p.textContent = "Add items on the Wishlist page.";
  } else {
    const top2 = items.slice(0, 2).map(i => i.title).join(" + ");
    h3.textContent = top2;
    if (p) p.textContent = `${items.length} item${items.length === 1 ? "" : "s"} on your wishlist`;

    const carouselEl = document.getElementById("wishlist-spotlight-carousel");
    if (carouselEl) {
      const imageItems = items.filter(i => {
        if (!i.image) return false;
        return i.image.startsWith("data:") || i.image.length > 0;
      });
      if (imageItems.length > 0) {
        let imgIdx = 0;
        const showImage = () => {
          const item = imageItems[imgIdx % imageItems.length];
          const src = item.image.startsWith("data:") ? item.image : `/api/wishlist/image/${item.image}`;
          carouselEl.style.backgroundImage = `url('${src}')`;
          imgIdx++;
        };
        showImage();
        if (imageItems.length > 1) {
          setInterval(showImage, 5000);
        }
      }
    }
  }
}

// ── Trip Switcher ────────────────────────────────────────────

async function renderTripSwitcher() {
  const switcher = document.getElementById("trip-switcher");
  if (!switcher) return;

  const allSorted = sortItineraryByTime(await getStoredItinerary());
  const tripBudgets = await loadTripBudgets();
  const tripGroups = buildTripsFromBudgets(allSorted, tripBudgets);

  if (tripGroups.length <= 1 && tripGroups.every(tg => tg.activities.length === 0 && !tg.label)) {
    switcher.classList.add("hidden");
    return;
  }

  const autoIdx = detectCurrentTripGroupIndex(tripGroups);
  const activeIdx = selectedTripIndex >= 0 ? Math.min(selectedTripIndex, tripGroups.length - 1) : autoIdx;
  const selectedGroup = tripGroups[activeIdx];

  let countdownHtml = "";
  if (selectedGroup) {
    const status = getTripGroupStatus(selectedGroup);
    if (status === "upcoming") {
      const [fy, fm, fd] = selectedGroup.start.split("-").map(Number);
      const tripStart = new Date(fy, fm - 1, fd);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const daysUntil = Math.ceil((tripStart - today) / (1000 * 60 * 60 * 24));
      if (daysUntil === 1) countdownHtml = `<span style="font-size:0.85rem; font-weight:800; color:var(--sky-blue); margin-left:0.5rem;">Tomorrow!</span>`;
      else if (daysUntil > 0) countdownHtml = `<span style="font-size:0.85rem; font-weight:800; color:var(--sky-blue); margin-left:0.5rem;">${daysUntil} days away</span>`;
    } else if (status === "active") {
      countdownHtml = `<span style="font-size:0.85rem; font-weight:800; color:var(--pixie-gold-dark); margin-left:0.5rem;">🌟 Current Trip</span>`;
    }
  }

  const tripOptions = tripGroups.map((tg, i) => {
    const label = getTripGroupLabel(tg);
    const s = getTripGroupStatus(tg);
    const tag = s === "active" ? " 🌟 Now" : s === "past" ? " ✅ Past" : " 🗓️ Upcoming";
    const actCount = tg.activities.length;
    return `<option value="${i}" ${i === activeIdx ? "selected" : ""}>${label}${tag} (${actCount} activities)</option>`;
  }).join("");

  switcher.classList.remove("hidden");
  switcher.innerHTML = `
    <div class="budget-trip-pill">
      <label class="card-label">Viewing Itinerary For</label>
      <select id="trip-switcher-select">${tripOptions}</select>
      ${countdownHtml}
    </div>
  `;

  document.getElementById("trip-switcher-select")?.addEventListener("change", async (e) => {
    selectedTripIndex = parseInt(e.target.value);
    await renderTripSwitcher();
    await renderItinerary();
    await renderParkDayBanner();
  });
}

// ── Dashboard click handlers ─────────────────────────────────

async function handleDashboardListClick(event) {
  const card = event.target.closest(".clickable-card");
  if (card && card.dataset.id) {
    const itinerary = await getStoredItinerary();
    const activity = itinerary.find(a => a.id === card.dataset.id);
    if (activity) openActivityModal(activity);
  }
}

async function initializeDashboardPage() {
  // Only run on the dashboard page
  const titleEl = document.querySelector(".page-dashboard .entrance-title");
  if (!titleEl) return;

  const user = Auth.getUser();
  const firstName = user ? user.name.split(" ")[0] : "Pal";

  // Determine user's trip state
  const todayStr = getTodayString();
  let allTrips = [];
  try { allTrips = await apiFetch("/trip-budgets"); } catch (e) { }

  // Filter to trips the user is a member of (or all trips for admin)
  let myTrips = allTrips;
  if (user && user.role !== "admin") {
    try {
      const memberTrips = await apiFetch(`/users/${user.id}/trips`);
      const memberTripIds = new Set(memberTrips.map(t => t.trip_id));
      // Show trips user is assigned to, plus any without members (unassigned trips)
      myTrips = allTrips.filter(t => {
        return memberTripIds.has(t.trip_id);
      });
    } catch (e) {
      // On error, fall through to normal dashboard
    }
  }

  const activeTrip = myTrips.find(t => todayStr >= t.start_date && todayStr <= t.end_date);
  const upcomingTrip = myTrips.find(t => t.start_date > todayStr);
  const pastTrips = myTrips.filter(t => t.end_date < todayStr);

  // ── State 1: Active trip → show normal dashboard ──
  if (activeTrip) {
    titleEl.innerHTML = `Hi!<br><span class="entrance-title-name">${escapeHtml(firstName)}</span>`;
    renderNormalDashboard();
    return;
  }

  // ── State 2: Upcoming trip → redirect to pretrip ──
  if (upcomingTrip) {
    // Don't redirect if they explicitly navigated to index.html with a hash
    if (!window.location.hash.includes("stay")) {
      window.location.href = "pretrip.html";
      return;
    }
  }

  // ── State 3: No future trips → show memories view ──
  if (!activeTrip && !upcomingTrip) {
    titleEl.innerHTML = `Welcome back,<br><span class="entrance-title-name">${escapeHtml(firstName)}</span>`;
    renderMemoriesDashboard(pastTrips, firstName);
    return;
  }

  // Fallback — normal dashboard
  titleEl.innerHTML = `Hi!<br><span class="entrance-title-name">${escapeHtml(firstName)}</span>`;
  renderNormalDashboard();
}

function renderNormalDashboard() {
  renderNextActivityCard();
  renderDashboardItinerary();
  renderDashboardBudgetCard();
  renderDashboardWishlistCard();

  const dashList = document.getElementById("dashboard-itinerary-list");
  if (dashList) {
    dashList.addEventListener("click", handleDashboardListClick);
    dashList.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        handleDashboardListClick(e);
      }
    });
  }
}

async function renderMemoriesDashboard(pastTrips, firstName) {
  // Hide normal dashboard sections
  const nextActCard = document.getElementById("next-activity-card");
  const scheduleSection = nextActCard?.closest("main");

  if (!scheduleSection) return;

  // Fetch photo counts for past trips
  const tripPhotoCounts = {};
  for (const trip of pastTrips.slice(0, 10)) { // Limit to 10 most recent
    try {
      const photos = await apiFetch(`/trips/${trip.trip_id}/photos`);
      tripPhotoCounts[trip.trip_id] = photos.length;
    } catch (e) {
      tripPhotoCounts[trip.trip_id] = 0;
    }
  }

  let tripsHtml = "";
  if (pastTrips.length === 0) {
    tripsHtml = `
      <div style="text-align:center; padding:2.5rem 1.5rem; background:rgba(255,253,244,0.92); border-radius:20px; box-shadow:var(--card-shadow);">
        <div style="font-size:3rem; margin-bottom:0.75rem;">🏰</div>
        <h3 style="font-family:'Mouse Memoirs',sans-serif; font-size:1.5rem; color:var(--castle-blue); margin:0 0 0.5rem;">No Trips Yet</h3>
        <p style="color:var(--slate); margin:0 0 1.25rem;">Your Disney adventure is waiting to be planned!</p>
        <a href="planner.html" class="primary-button" style="display:inline-block; text-decoration:none;">Plan a Trip ✨</a>
      </div>
    `;
  } else {
    tripsHtml = pastTrips.slice(0, 10).map(trip => {
      const [sy, sm, sd] = trip.start_date.split("-").map(Number);
      const [ey, em, ed] = trip.end_date.split("-").map(Number);
      const startFmt = new Date(sy, sm - 1, sd).toLocaleDateString("en-US", { month: "short", day: "numeric" });
      const endFmt = new Date(ey, em - 1, ed).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
      const days = Math.round((new Date(ey, em - 1, ed) - new Date(sy, sm - 1, sd)) / (1000 * 60 * 60 * 24)) + 1;
      const photoCount = tripPhotoCounts[trip.trip_id] || 0;

      return `
        <div style="background:rgba(255,253,244,0.92); border-radius:16px; box-shadow:var(--card-shadow); border:1.5px solid rgba(255,255,255,0.85); padding:1.25rem; display:flex; align-items:center; gap:1rem;">
          <div style="font-size:2.2rem; flex-shrink:0;">🏰</div>
          <div style="flex:1; min-width:0;">
            <h3 style="font-family:'Mouse Memoirs',sans-serif; font-size:1.2rem; color:var(--castle-blue); margin:0 0 0.15rem; letter-spacing:0.02em;">${startFmt} – ${endFmt}</h3>
            <p style="font-family:'Nunito',sans-serif; font-size:0.8rem; font-weight:600; color:var(--muted); margin:0;">${days} day${days !== 1 ? "s" : ""}${trip.label ? " · " + escapeHtml(trip.label) : ""}</p>
          </div>
          <div style="display:flex; gap:0.5rem; flex-shrink:0;">
            ${photoCount > 0 ? `
              <a href="photos.html?trip=${encodeURIComponent(trip.trip_id)}" style="display:flex; align-items:center; gap:0.3rem; padding:0.4rem 0.75rem; border-radius:999px; background:var(--castle-blue); color:white; font-family:'Nunito',sans-serif; font-size:0.78rem; font-weight:700; text-decoration:none;">
                📸 ${photoCount}
              </a>
            ` : ''}
            <a href="tripcalendar.html?trip=${encodeURIComponent(trip.trip_id)}" style="display:flex; align-items:center; padding:0.4rem 0.75rem; border-radius:999px; background:rgba(0,48,135,0.08); color:var(--castle-blue); font-family:'Nunito',sans-serif; font-size:0.78rem; font-weight:700; text-decoration:none;">
              🗓️ View
            </a>
          </div>
        </div>
      `;
    }).join("");
  }

  scheduleSection.innerHTML = `
    <section style="margin-bottom:2rem;">
      <div style="text-align:center; margin-bottom:1.5rem;">
        <p style="font-family:'Nunito',sans-serif; font-size:0.85rem; font-weight:700; text-transform:uppercase; letter-spacing:0.08em; color:var(--muted);">✨ Looking Back ✨</p>
        <h2 style="font-family:'Mouse Memoirs',sans-serif; font-size:1.8rem; color:var(--castle-blue); margin:0.25rem 0;">Your Disney Memories</h2>
      </div>

      <div style="display:flex; flex-direction:column; gap:0.75rem;">
        ${tripsHtml}
      </div>

      <div style="text-align:center; margin-top:2rem;">
        <a href="history.html" class="secondary-button" style="display:inline-block; text-decoration:none; margin-bottom:0.75rem;">
          View Full Trip History →
        </a>
        <br>
        <a href="planner.html" class="primary-button" style="display:inline-block; text-decoration:none;">
          Plan Your Next Trip ✨
        </a>
      </div>
    </section>
  `;
}