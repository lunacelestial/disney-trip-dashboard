// ============================================================
// MODALS — Activity detail modal, dining memories & feedback
// Depends on: script.js (core)
// ============================================================

function formatModalDate(dateString) {
  if (!dateString) return "";
  const [year, month, day] = dateString.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}

function getBadgeEmoji(type) {
  const map = { ride: "🎢", dining: "🍽️", show: "🎭", merch: "🛍️", shopping: "🛍️", travel: "🚌", break: "☀️" };
  return map[String(type || "").toLowerCase()] || "📌";
}

function openActivityModal(activity) {
  const overlay  = document.getElementById("activity-modal-overlay");
  const title    = document.getElementById("modal-title");
  const meta     = document.getElementById("modal-meta");
  const badge    = document.getElementById("modal-badge-label");
  const notes    = document.getElementById("modal-notes");
  const mapFrame = document.getElementById("modal-map-iframe");
  const mapLoad  = document.getElementById("modal-map-loading");
  const navBtn   = document.getElementById("modal-navigate-btn");
  const walkBanner = document.getElementById("modal-walk-banner");
  const venueLink = document.getElementById("modal-venue-link");

  if (!overlay || !activity) return;

  // Populate text
  title.textContent  = activity.title;
  badge.textContent  = `${getBadgeEmoji(activity.type)} ${activity.type}`;
  meta.textContent   = `${formatModalDate(activity.date)} • ${formatTimeForDisplay(activity.time)} • ${activity.location}`;

  // Venue link
  if (venueLink) {
    if (activity.url) {
      venueLink.href = activity.url;
      venueLink.classList.remove("hidden");
    } else {
      venueLink.classList.add("hidden");
    }
  }

  const modalDisplayNotes = getDisplayNotes(activity);
  if (modalDisplayNotes) {
    notes.textContent = `💡 ${modalDisplayNotes}`;
    notes.classList.remove("hidden");
  } else {
    notes.classList.add("hidden");
  }

  // Dining memory — show past visits if this is a dining activity
  let diningMemoryEl = document.getElementById("modal-dining-memory");
  if (!diningMemoryEl) {
    diningMemoryEl = document.createElement("div");
    diningMemoryEl.id = "modal-dining-memory";
    notes.parentNode.insertBefore(diningMemoryEl, notes.nextSibling);
  }
  diningMemoryEl.innerHTML = "";
  diningMemoryEl.className = "hidden";

  // Add/remove "Log What I Had" button for dining activities
  let logDiningBtn = document.getElementById("modal-log-dining-btn");
  if (!logDiningBtn) {
    logDiningBtn = document.createElement("button");
    logDiningBtn.id = "modal-log-dining-btn";
    logDiningBtn.className = "primary-button modal-btn";
    logDiningBtn.style.background = "linear-gradient(135deg, #f59e0b, #d97706)";
    const actionsDiv = document.querySelector(".modal-actions");
    if (actionsDiv) actionsDiv.insertBefore(logDiningBtn, actionsDiv.firstChild);
  }

  if ((activity.type || "").toLowerCase() === "dining") {
    const user = Auth.getUser();
    if (user) {
      loadDiningMemories(user.id, activity.title, diningMemoryEl);
    }
    logDiningBtn.textContent = "🍽️ Log What I Had";
    logDiningBtn.classList.remove("hidden");
    logDiningBtn.onclick = () => {
      closeActivityModal();
      showDiningFeedbackModal(activity);
    };
  } else {
    logDiningBtn.classList.add("hidden");
  }

  // Resolve location
  const resolved = resolveDisneyLocation(activity.location);
  const searchQuery = resolved
    ? `${resolved.label}, Walt Disney World, FL`
    : `${activity.location}, Walt Disney World, Orlando, FL`;

  const encodedQuery = encodeURIComponent(searchQuery);

  // Google Maps embed
  mapLoad.style.display = "flex";
  mapFrame.style.opacity = "0";

  if (GOOGLE_MAPS_API_KEY && GOOGLE_MAPS_API_KEY !== "YOUR_GOOGLE_MAPS_API_KEY") {
    mapFrame.src = `https://www.google.com/maps/embed/v1/place?key=${GOOGLE_MAPS_API_KEY}&q=${encodedQuery}&zoom=17`;
  } else {
    if (resolved) {
      mapFrame.src = `https://www.openstreetmap.org/export/embed.html?bbox=${resolved.lng - 0.005},${resolved.lat - 0.004},${resolved.lng + 0.005},${resolved.lat + 0.004}&layer=mapnik&marker=${resolved.lat},${resolved.lng}`;
    } else {
      mapFrame.src = `https://www.openstreetmap.org/export/embed.html?bbox=-81.59,28.35,-81.55,28.43&layer=mapnik`;
    }
  }

  mapFrame.onload = () => {
    mapLoad.style.display = "none";
    mapFrame.style.opacity = "1";
    mapFrame.style.transition = "opacity 0.3s ease";
  };

  // Navigate button
  if (resolved) {
    navBtn.href = `https://www.google.com/maps/dir/?api=1&destination=${resolved.lat},${resolved.lng}&travelmode=walking`;
  } else {
    navBtn.href = `https://www.google.com/maps/search/?api=1&query=${encodedQuery}`;
  }

  // Walk time
  walkBanner.classList.add("hidden");
  if (navigator.geolocation && resolved) {
    navigator.geolocation.getCurrentPosition(
      (pos) => fetchWalkTime(pos.coords.latitude, pos.coords.longitude, resolved, activity),
      () => {}
    );
  }

  overlay.classList.remove("hidden");
  document.body.style.overflow = "hidden";
}

function fetchWalkTime(userLat, userLng, destination, activity) {
  const walkBanner  = document.getElementById("modal-walk-banner");
  const walkTimeEl  = document.getElementById("modal-walk-time");
  const walkLeaveEl = document.getElementById("modal-walk-leave");

  const distance = haversineDistance(userLat, userLng, destination.lat, destination.lng);

  const walkSeconds = Math.round(distance / 1.2);
  const walkMins = Math.max(1, Math.round(walkSeconds / 60));

  walkTimeEl.textContent = `~${walkMins} min walk (${Math.round(distance)}m away)`;

  if (activity.time) {
    const [h, m] = activity.time.split(":").map(Number);
    const activityDate = new Date();
    activityDate.setHours(h, m, 0, 0);
    const leaveTime = new Date(activityDate.getTime() - walkSeconds * 1000 - 5 * 60 * 1000);
    const now = new Date();

    if (leaveTime > now) {
      const leaveHour = leaveTime.getHours();
      const leaveMins = String(leaveTime.getMinutes()).padStart(2, "0");
      const suffix = leaveHour >= 12 ? "PM" : "AM";
      const leaveHour12 = leaveHour % 12 === 0 ? 12 : leaveHour % 12;
      walkLeaveEl.textContent = `Leave by ${leaveHour12}:${leaveMins} ${suffix} to arrive on time`;
    } else {
      walkLeaveEl.textContent = "You should head there now!";
      walkLeaveEl.style.color = "#C41E3A";
      walkLeaveEl.style.fontWeight = "800";
    }
  }

  walkBanner.classList.remove("hidden");
}

function closeActivityModal() {
  const overlay = document.getElementById("activity-modal-overlay");
  if (!overlay) return;
  overlay.classList.add("hidden");
  document.body.style.overflow = "";
  const mapFrame = document.getElementById("modal-map-iframe");
  if (mapFrame) mapFrame.src = "";
}

// ============================================================
// DINING MEMORIES — Past visit recall + post-meal feedback
// ============================================================

async function loadDiningMemories(userId, venueName, containerEl) {
  try {
    const memories = await apiFetch(`/dining-memories/${userId}/${encodeURIComponent(venueName)}`);
    if (memories.length === 0) {
      containerEl.className = "hidden";
      return;
    }

    const memoryCards = memories.map(mem => {
      const items = JSON.parse(mem.items || "[]");
      const stars = "⭐".repeat(Math.min(5, mem.rating || 0));
      const dateStr = mem.visit_date ? new Date(mem.visit_date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "";

      return `
        <div style="padding:0.6rem 0; border-bottom:1px solid rgba(0,0,0,0.06);">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.25rem;">
            <span style="font-size:0.75rem; font-weight:700; color:var(--muted);">${dateStr}</span>
            ${stars ? `<span style="font-size:0.7rem;">${stars}</span>` : ""}
          </div>
          ${items.length > 0 ? `
            <div style="display:flex; flex-wrap:wrap; gap:0.3rem; margin-bottom:0.25rem;">
              ${items.map(item => `<span style="font-size:0.78rem; font-weight:700; background:#fef3c7; color:#92400e; padding:0.15rem 0.5rem; border-radius:999px;">${escapeHtml(item)}</span>`).join("")}
            </div>
          ` : ""}
          ${mem.notes ? `<p style="font-size:0.82rem; color:var(--slate); margin:0; font-style:italic;">${escapeHtml(mem.notes)}</p>` : ""}
        </div>
      `;
    }).join("");

    containerEl.innerHTML = `
      <div style="padding:0.85rem 1.75rem; background:linear-gradient(135deg, #fef9e7, #fff8d6); border-bottom:1.5px solid rgba(245,158,11,0.2);">
        <p style="font-size:0.78rem; font-weight:800; text-transform:uppercase; letter-spacing:0.08em; color:#92400e; margin:0 0 0.35rem;">🍽️ Your Past Visits Here</p>
        ${memoryCards}
      </div>
    `;
    containerEl.className = "";
  } catch (err) {
    console.warn("Failed to load dining memories:", err);
    containerEl.className = "hidden";
  }
}

function showDiningFeedbackModal(activity) {
  document.getElementById("dining-feedback-overlay")?.remove();

  const user = Auth.getUser();
  if (!user) return;

  const overlay = document.createElement("div");
  overlay.id = "dining-feedback-overlay";
  overlay.className = "modal-overlay";
  overlay.innerHTML = `
    <div class="modal-card" style="max-width:450px; text-align:center;">
      <button class="modal-close-btn" onclick="document.getElementById('dining-feedback-overlay').remove(); document.body.style.overflow='';" aria-label="Close">✕</button>
      <div style="padding:1.75rem 1.75rem 0.5rem;">
        <div style="font-size:2.5rem; margin-bottom:0.5rem;">🍽️</div>
        <h2 style="font-size:1.5rem; color:var(--castle-blue); margin:0 0 0.25rem;">How was ${escapeHtml(activity.title)}?</h2>
        <p style="color:var(--slate); margin:0 0 1.25rem; font-size:0.9rem;">Share what you had so we can remind you next time!</p>
      </div>

      <div style="padding:0 1.75rem 1.75rem;">
        <div style="margin-bottom:1rem;">
          <label style="font-size:0.78rem; font-weight:800; text-transform:uppercase; letter-spacing:0.06em; color:var(--slate); display:block; text-align:left; margin-bottom:0.35rem;">Rating</label>
          <div id="dining-rating-stars" style="display:flex; gap:0.25rem; font-size:1.8rem; cursor:pointer; justify-content:center;">
            <span data-star="1">☆</span><span data-star="2">☆</span><span data-star="3">☆</span><span data-star="4">☆</span><span data-star="5">☆</span>
          </div>
        </div>

        <div style="margin-bottom:1rem; text-align:left;">
          <label style="font-size:0.78rem; font-weight:800; text-transform:uppercase; letter-spacing:0.06em; color:var(--slate); display:block; margin-bottom:0.35rem;">What did you have?</label>
          <input type="text" id="dining-items-input" placeholder="e.g. Dole Whip, Turkey Leg, Mickey Pretzel" style="width:100%; padding:0.65rem 0.9rem; border:1.5px solid #d1d5db; border-radius:10px; font-family:'Nunito',sans-serif; font-size:0.95rem;" />
          <span style="font-size:0.7rem; color:var(--muted);">Separate items with commas</span>
        </div>

        <div style="margin-bottom:1rem; text-align:left;">
          <label style="font-size:0.78rem; font-weight:800; text-transform:uppercase; letter-spacing:0.06em; color:var(--slate); display:block; margin-bottom:0.35rem;">Notes (optional)</label>
          <textarea id="dining-notes-input" rows="2" placeholder="Any thoughts on the food, service, atmosphere..." style="width:100%; padding:0.65rem 0.9rem; border:1.5px solid #d1d5db; border-radius:10px; font-family:'Nunito',sans-serif; font-size:0.95rem; resize:vertical;"></textarea>
        </div>

        <div style="display:flex; gap:0.75rem;">
          <button type="button" class="secondary-button" style="flex:1;" onclick="document.getElementById('dining-feedback-overlay').remove(); document.body.style.overflow='';">Skip</button>
          <button type="button" class="primary-button" style="flex:2;" id="dining-save-btn">Save Memory ✨</button>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  document.body.style.overflow = "hidden";

  // Star rating interaction
  let selectedRating = 0;
  const starsContainer = document.getElementById("dining-rating-stars");
  starsContainer.querySelectorAll("span").forEach(star => {
    star.addEventListener("click", () => {
      selectedRating = parseInt(star.dataset.star);
      starsContainer.querySelectorAll("span").forEach((s, i) => {
        s.textContent = i < selectedRating ? "⭐" : "☆";
      });
    });
    star.addEventListener("mouseenter", () => {
      const val = parseInt(star.dataset.star);
      starsContainer.querySelectorAll("span").forEach((s, i) => {
        s.textContent = i < val ? "⭐" : "☆";
      });
    });
    star.addEventListener("mouseleave", () => {
      starsContainer.querySelectorAll("span").forEach((s, i) => {
        s.textContent = i < selectedRating ? "⭐" : "☆";
      });
    });
  });

  // Save handler
  document.getElementById("dining-save-btn").addEventListener("click", async () => {
    const itemsRaw = document.getElementById("dining-items-input").value.trim();
    const items = itemsRaw ? itemsRaw.split(",").map(s => s.trim()).filter(Boolean) : [];
    const notes = document.getElementById("dining-notes-input").value.trim();

    try {
      await apiFetch("/dining-memories", {
        method: "POST",
        body: JSON.stringify({
          user_id: user.id,
          venue_name: activity.title,
          items,
          rating: selectedRating,
          notes,
          visit_date: activity.date || new Date().toISOString().split("T")[0],
        }),
      });
      overlay.remove();
      document.body.style.overflow = "";
      showToast("✅ Dining memory saved! We'll remind you next time.");
    } catch (err) {
      console.error("Failed to save dining memory:", err);
      showToast("❌ Failed to save. Try again.");
    }
  });

  setTimeout(() => document.getElementById("dining-items-input")?.focus(), 200);
}

// ── Activity Modal Init ──────────────────────────────────────

function initializeActivityModal() {
  const nextCard = document.getElementById("next-activity-card");
  const closeBtn = document.getElementById("modal-close-btn");
  const overlay  = document.getElementById("activity-modal-overlay");

  if (!overlay) return;

  if (nextCard) {
    const getNextForModal = async () => {
      const allSorted = sortItineraryByTime(await getStoredItinerary());
      return getNextActivity(await filterToCurrentTrip(allSorted));
    };

    nextCard.addEventListener("click", async () => {
      const activity = await getNextForModal();
      if (activity) openActivityModal(activity);
    });
    nextCard.addEventListener("keydown", async (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        const activity = await getNextForModal();
        if (activity) openActivityModal(activity);
      }
    });
  }

  const itineraryList = document.getElementById("itinerary-list");
  if (itineraryList) {
    itineraryList.addEventListener("keydown", async (e) => {
      if (e.key === "Enter" || e.key === " ") {
        const card = e.target.closest(".clickable-card");
        if (card && card.dataset.id) {
          e.preventDefault();
          const activity = (await getStoredItinerary()).find(a => a.id === card.dataset.id);
          if (activity) openActivityModal(activity);
        }
      }
    });
  }

  if (closeBtn) closeBtn.addEventListener("click", closeActivityModal);

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) closeActivityModal();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeActivityModal();
  });
}
