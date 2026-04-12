// ============================================================
// PARK HOPPER — Transportation guide between WDW parks
// Depends on: script.js (core), header.js (PARK_CONFIG)
// ============================================================

const PARK_HOPPER_PARKS = ["magic kingdom", "epcot", "hollywood studios", "animal kingdom"];

const PARK_COORDS = {
  "magic kingdom":     { lat: 28.4177, lng: -81.5812 },
  "epcot":             { lat: 28.3747, lng: -81.5494 },
  "hollywood studios": { lat: 28.3574, lng: -81.5582 },
  "animal kingdom":    { lat: 28.3553, lng: -81.5901 },
};

const PARK_ICONS = {
  "magic kingdom":     "🏰",
  "epcot":             "🌐",
  "hollywood studios": "🎬",
  "animal kingdom":    "🌿",
};

// Transportation options and directions between every park pair
const TRANSPORT_DATA = {
  "magic kingdom|epcot": [
    {
      mode: "Monorail",
      icon: "🚝",
      time: "25–35 min",
      steps: [
        "Exit Magic Kingdom and head to the Transportation & Ticket Center (TTC) via the Resort Monorail or Ferry Boat.",
        "At the TTC, transfer to the EPCOT Monorail line (clearly signed).",
        "Ride the EPCOT Monorail directly to the front entrance of EPCOT."
      ]
    },
    {
      mode: "Bus",
      icon: "🚌",
      time: "20–30 min",
      steps: [
        "Exit Magic Kingdom and follow signs to the bus transportation area.",
        "Board the bus labeled 'EPCOT' from the Magic Kingdom bus loop.",
        "The bus drops you off at the main EPCOT bus terminal near the front entrance."
      ]
    },
    {
      mode: "Drive",
      icon: "🚗",
      time: "10–15 min",
      steps: [
        "Head to the Magic Kingdom parking lot (TTC area).",
        "Follow signs to World Drive South toward EPCOT.",
        "Park in the EPCOT lot and walk or take the tram to the entrance."
      ]
    },
    {
      mode: "Uber / Lyft",
      icon: "📱",
      time: "10–15 min",
      steps: [
        "Exit Magic Kingdom and head to the Transportation & Ticket Center (TTC).",
        "The rideshare pickup point is located at the TTC bus loop area.",
        "Request your ride and set the destination to EPCOT main entrance.",
        "You'll be dropped off at the EPCOT rideshare area near the front."
      ]
    }
  ],
  "magic kingdom|hollywood studios": [
    {
      mode: "Bus",
      icon: "🚌",
      time: "20–30 min",
      steps: [
        "Exit Magic Kingdom and follow signs to the bus transportation area.",
        "Board the bus labeled 'Hollywood Studios'.",
        "You'll be dropped off at the Hollywood Studios bus terminal near the main entrance."
      ]
    },
    {
      mode: "Drive",
      icon: "🚗",
      time: "15–20 min",
      steps: [
        "Head to the Magic Kingdom parking lot (TTC area).",
        "Take World Drive south to Osceola Parkway, then follow signs to Hollywood Studios.",
        "Park and walk or take the tram to the entrance."
      ]
    },
    {
      mode: "Uber / Lyft",
      icon: "📱",
      time: "12–18 min",
      steps: [
        "Exit Magic Kingdom and head to the TTC.",
        "The rideshare pickup is at the TTC bus loop area.",
        "Request your ride to Hollywood Studios main entrance."
      ]
    }
  ],
  "magic kingdom|animal kingdom": [
    {
      mode: "Bus",
      icon: "🚌",
      time: "25–35 min",
      steps: [
        "Exit Magic Kingdom and follow signs to the bus transportation area.",
        "Board the bus labeled 'Animal Kingdom'.",
        "The bus drops you off near the Animal Kingdom main entrance."
      ]
    },
    {
      mode: "Drive",
      icon: "🚗",
      time: "15–20 min",
      steps: [
        "Head to the Magic Kingdom parking lot (TTC area).",
        "Take World Drive south to Osceola Parkway West toward Animal Kingdom.",
        "Park in the Animal Kingdom lot and walk or take the tram."
      ]
    },
    {
      mode: "Uber / Lyft",
      icon: "📱",
      time: "12–18 min",
      steps: [
        "Head to the TTC rideshare pickup area.",
        "Request your ride to Animal Kingdom main entrance.",
        "You'll be dropped off near the front gate."
      ]
    }
  ],
  "epcot|hollywood studios": [
    {
      mode: "Skyliner",
      icon: "🚡",
      time: "12–18 min",
      steps: [
        "Head to the EPCOT Skyliner station located at the International Gateway (back of the park, between France and UK pavilions).",
        "Board the Disney Skyliner gondola.",
        "You'll arrive directly at the Hollywood Studios Skyliner station near the entrance."
      ]
    },
    {
      mode: "Boat",
      icon: "⛴️",
      time: "20–25 min",
      steps: [
        "Walk to the International Gateway at the back of EPCOT (between France and UK pavilions).",
        "Board the Friendship Boat headed to Hollywood Studios.",
        "The boat stops at the BoardWalk, Yacht & Beach Club, then arrives at Hollywood Studios."
      ]
    },
    {
      mode: "Bus",
      icon: "🚌",
      time: "15–20 min",
      steps: [
        "Exit EPCOT via the front entrance and head to the bus terminal.",
        "Board the bus labeled 'Hollywood Studios'.",
        "You'll arrive at the Hollywood Studios bus loop."
      ]
    },
    {
      mode: "Walk",
      icon: "🚶",
      time: "25–35 min",
      steps: [
        "Head to the International Gateway at the back of EPCOT.",
        "Walk along the BoardWalk path — follow signs toward Hollywood Studios.",
        "The walk takes you past the BoardWalk, Yacht & Beach Club resorts.",
        "Enter Hollywood Studios at the main entrance."
      ]
    },
    {
      mode: "Drive",
      icon: "🚗",
      time: "8–12 min",
      steps: [
        "Head to the EPCOT parking lot.",
        "Follow signs to Hollywood Studios via Buena Vista Drive.",
        "Park and head to the entrance."
      ]
    },
    {
      mode: "Uber / Lyft",
      icon: "📱",
      time: "8–12 min",
      steps: [
        "Head to the EPCOT rideshare pickup area near the main bus terminal.",
        "Request your ride to Hollywood Studios.",
        "You'll be dropped off at the Hollywood Studios rideshare zone."
      ]
    }
  ],
  "epcot|animal kingdom": [
    {
      mode: "Bus",
      icon: "🚌",
      time: "20–30 min",
      steps: [
        "Exit EPCOT via the front entrance and head to the bus terminal.",
        "Board the bus labeled 'Animal Kingdom'.",
        "You'll arrive at the Animal Kingdom bus loop near the entrance."
      ]
    },
    {
      mode: "Drive",
      icon: "🚗",
      time: "15–20 min",
      steps: [
        "Head to the EPCOT parking lot.",
        "Take Osceola Parkway west toward Animal Kingdom.",
        "Park and head to the entrance."
      ]
    },
    {
      mode: "Uber / Lyft",
      icon: "📱",
      time: "12–18 min",
      steps: [
        "Head to the EPCOT rideshare pickup area.",
        "Request your ride to Animal Kingdom main entrance."
      ]
    }
  ],
  "hollywood studios|animal kingdom": [
    {
      mode: "Bus",
      icon: "🚌",
      time: "20–30 min",
      steps: [
        "Exit Hollywood Studios and head to the bus transportation area.",
        "Board the bus labeled 'Animal Kingdom'.",
        "You'll arrive at the Animal Kingdom bus terminal near the entrance."
      ]
    },
    {
      mode: "Drive",
      icon: "🚗",
      time: "15–20 min",
      steps: [
        "Head to the Hollywood Studios parking lot.",
        "Take Osceola Parkway west toward Animal Kingdom.",
        "Park and walk to the entrance."
      ]
    },
    {
      mode: "Uber / Lyft",
      icon: "📱",
      time: "12–18 min",
      steps: [
        "Head to the Hollywood Studios rideshare pickup zone.",
        "Request your ride to Animal Kingdom main entrance."
      ]
    }
  ],
  "epcot|magic kingdom": [
    {
      mode: "Monorail",
      icon: "🚝",
      time: "25–35 min",
      steps: [
        "Head to the EPCOT Monorail station near the main entrance.",
        "Ride the EPCOT Monorail to the Transportation & Ticket Center (TTC).",
        "At the TTC, transfer to the Magic Kingdom Express or Resort Monorail.",
        "The monorail takes you directly to the Magic Kingdom entrance."
      ]
    },
    {
      mode: "Bus",
      icon: "🚌",
      time: "20–30 min",
      steps: [
        "Exit EPCOT via the front entrance and head to the bus terminal.",
        "Board the bus labeled 'Magic Kingdom'.",
        "You'll be dropped off at the Magic Kingdom bus terminal."
      ]
    },
    {
      mode: "Drive",
      icon: "🚗",
      time: "10–15 min",
      steps: [
        "Head to the EPCOT parking lot.",
        "Follow signs to World Drive north toward Magic Kingdom / TTC.",
        "Park at the TTC and take the monorail or ferry to Magic Kingdom."
      ]
    },
    {
      mode: "Uber / Lyft",
      icon: "📱",
      time: "10–15 min",
      steps: [
        "Head to the EPCOT rideshare pickup area near the bus terminal.",
        "Request your ride to Magic Kingdom / TTC.",
        "You'll be dropped off at the TTC — take the monorail or ferry into the park."
      ]
    }
  ],
  "hollywood studios|magic kingdom": [
    {
      mode: "Bus",
      icon: "🚌",
      time: "20–30 min",
      steps: [
        "Exit Hollywood Studios and head to the bus transportation area.",
        "Board the bus labeled 'Magic Kingdom'.",
        "You'll arrive at the Magic Kingdom bus loop."
      ]
    },
    {
      mode: "Drive",
      icon: "🚗",
      time: "15–20 min",
      steps: [
        "Head to the Hollywood Studios parking lot.",
        "Follow signs north via World Drive toward Magic Kingdom / TTC.",
        "Park at the TTC and take the monorail or ferry."
      ]
    },
    {
      mode: "Uber / Lyft",
      icon: "📱",
      time: "12–18 min",
      steps: [
        "Head to the Hollywood Studios rideshare pickup zone.",
        "Request your ride to the TTC / Magic Kingdom.",
        "Take the monorail or ferry from TTC into the park."
      ]
    }
  ],
  "hollywood studios|epcot": [
    {
      mode: "Skyliner",
      icon: "🚡",
      time: "12–18 min",
      steps: [
        "Head to the Hollywood Studios Skyliner station near the park entrance.",
        "Board the Disney Skyliner gondola.",
        "You'll arrive at the EPCOT International Gateway station (back of the park)."
      ]
    },
    {
      mode: "Boat",
      icon: "⛴️",
      time: "20–25 min",
      steps: [
        "Exit Hollywood Studios and head to the boat dock.",
        "Board the Friendship Boat toward EPCOT.",
        "The boat arrives at EPCOT's International Gateway (back entrance)."
      ]
    },
    {
      mode: "Bus",
      icon: "🚌",
      time: "15–20 min",
      steps: [
        "Exit Hollywood Studios and head to the bus terminal.",
        "Board the bus labeled 'EPCOT'.",
        "You'll arrive at EPCOT's front bus terminal."
      ]
    },
    {
      mode: "Walk",
      icon: "🚶",
      time: "25–35 min",
      steps: [
        "Exit Hollywood Studios and follow the path along the BoardWalk area.",
        "Walk past the Yacht & Beach Club and BoardWalk resorts.",
        "Enter EPCOT through the International Gateway (back entrance)."
      ]
    },
    {
      mode: "Drive",
      icon: "🚗",
      time: "8–12 min",
      steps: [
        "Head to the Hollywood Studios parking lot.",
        "Follow signs to EPCOT via Buena Vista Drive.",
        "Park in the EPCOT lot."
      ]
    },
    {
      mode: "Uber / Lyft",
      icon: "📱",
      time: "8–12 min",
      steps: [
        "Head to the Hollywood Studios rideshare pickup zone.",
        "Request your ride to EPCOT main entrance."
      ]
    }
  ],
  "animal kingdom|magic kingdom": [
    {
      mode: "Bus",
      icon: "🚌",
      time: "25–35 min",
      steps: [
        "Exit Animal Kingdom and head to the bus terminal.",
        "Board the bus labeled 'Magic Kingdom'.",
        "You'll arrive at the Magic Kingdom bus loop."
      ]
    },
    {
      mode: "Drive",
      icon: "🚗",
      time: "15–20 min",
      steps: [
        "Head to the Animal Kingdom parking lot.",
        "Take Osceola Parkway east to World Drive north toward Magic Kingdom / TTC.",
        "Park at the TTC and take the monorail or ferry."
      ]
    },
    {
      mode: "Uber / Lyft",
      icon: "📱",
      time: "12–18 min",
      steps: [
        "Head to the Animal Kingdom rideshare pickup area.",
        "Request your ride to the TTC / Magic Kingdom.",
        "Take the monorail or ferry from TTC into the park."
      ]
    }
  ],
  "animal kingdom|epcot": [
    {
      mode: "Bus",
      icon: "🚌",
      time: "20–30 min",
      steps: [
        "Exit Animal Kingdom and head to the bus terminal.",
        "Board the bus labeled 'EPCOT'.",
        "You'll arrive at EPCOT's front bus terminal."
      ]
    },
    {
      mode: "Drive",
      icon: "🚗",
      time: "15–20 min",
      steps: [
        "Head to the Animal Kingdom parking lot.",
        "Take Osceola Parkway east toward EPCOT.",
        "Park in the EPCOT lot."
      ]
    },
    {
      mode: "Uber / Lyft",
      icon: "📱",
      time: "12–18 min",
      steps: [
        "Head to the Animal Kingdom rideshare pickup area.",
        "Request your ride to EPCOT main entrance."
      ]
    }
  ],
  "animal kingdom|hollywood studios": [
    {
      mode: "Bus",
      icon: "🚌",
      time: "20–30 min",
      steps: [
        "Exit Animal Kingdom and head to the bus terminal.",
        "Board the bus labeled 'Hollywood Studios'.",
        "You'll arrive at the Hollywood Studios bus loop."
      ]
    },
    {
      mode: "Drive",
      icon: "🚗",
      time: "15–20 min",
      steps: [
        "Head to the Animal Kingdom parking lot.",
        "Take Osceola Parkway east toward Hollywood Studios.",
        "Park and head to the entrance."
      ]
    },
    {
      mode: "Uber / Lyft",
      icon: "📱",
      time: "12–18 min",
      steps: [
        "Head to the Animal Kingdom rideshare pickup area.",
        "Request your ride to Hollywood Studios."
      ]
    }
  ]
};

// Config key ("magic kingdom") → planner key ("magic-kingdom")
const CONFIG_TO_PLANNER = {
  "magic kingdom":     "magic-kingdom",
  "epcot":             "epcot",
  "hollywood studios": "hollywood-studios",
  "animal kingdom":    "animal-kingdom",
  "disney springs":    "disney-springs",
};

// ── State ──
let _hopperCurrentPark = null;

function getTransportOptions(fromPark, toPark) {
  const key = `${fromPark}|${toPark}`;
  return TRANSPORT_DATA[key] || [];
}

async function performParkHop(destPark) {
  const todayStr = getTodayString();
  const plannerKey = CONFIG_TO_PLANNER[destPark];
  if (!plannerKey) return;

  try {
    await ParkDaysDB.saveMany([{ date: todayStr, park: plannerKey }]);
  } catch (err) {
    console.warn("[ParkHopper] Failed to save park day:", err);
  }

  // Re-render the full banner with the new park
  if (typeof renderParkDayBanner === "function") {
    await renderParkDayBanner();
  }

  const destLabel = PARK_CONFIG[destPark] ? PARK_CONFIG[destPark].label : destPark;
  showToast(`🎫 Park hopped to ${destLabel}!`);
}

function getGoogleMapsUrl(fromPark, toPark) {
  const from = PARK_COORDS[fromPark];
  const to = PARK_COORDS[toPark];
  if (!from || !to) return null;
  return `https://www.google.com/maps/dir/${from.lat},${from.lng}/${to.lat},${to.lng}`;
}

// ── Render Park Hopper Button ──

function renderParkHopperButton() {
  const bar = document.getElementById("park-day-bar");
  if (!bar || bar.classList.contains("no-park")) return;

  if (document.getElementById("park-hopper-btn")) return;

  const btn = document.createElement("button");
  btn.id = "park-hopper-btn";
  btn.className = "park-hopper-btn";
  btn.setAttribute("aria-label", "Park Hopper — switch parks");
  btn.innerHTML = `<span class="park-hopper-btn-icon">🎫</span> <span class="park-hopper-btn-text">Park Hop</span>`;
  btn.addEventListener("click", openParkHopperModal);
  bar.appendChild(btn);
}

// ── Modal Logic ──

function openParkHopperModal() {
  const bar = document.getElementById("park-day-bar");
  _hopperCurrentPark = bar ? bar.getAttribute("data-park") : null;

  const overlay = document.getElementById("park-hopper-overlay");
  if (!overlay) return;

  renderParkSelectStep();
  overlay.classList.remove("hidden");
}

function closeParkHopperModal() {
  const overlay = document.getElementById("park-hopper-overlay");
  if (overlay) overlay.classList.add("hidden");
}

function renderParkSelectStep() {
  const content = document.getElementById("park-hopper-content");
  if (!content) return;

  const currentLabel = _hopperCurrentPark && PARK_CONFIG[_hopperCurrentPark]
    ? PARK_CONFIG[_hopperCurrentPark].label : "your park";
  const currentIcon = _hopperCurrentPark ? (PARK_ICONS[_hopperCurrentPark] || "🏰") : "🏰";

  const otherParks = PARK_HOPPER_PARKS.filter(p => p !== _hopperCurrentPark);

  content.innerHTML = `
    <div class="hopper-step-header">
      <h2 class="hopper-title">Which Park are you going to?</h2>
      <p class="hopper-subtitle">You're currently at</p>
      <div class="hopper-current-park">
        <span class="hopper-current-icon">${currentIcon}</span>
        <span class="hopper-current-name">${currentLabel}</span>
      </div>
    </div>
    <div class="hopper-park-grid">
      ${otherParks.map(p => {
        const cfg = PARK_CONFIG[p];
        const icon = PARK_ICONS[p] || "🏰";
        return `
          <button class="hopper-park-card" data-park="${p}">
            <span class="hopper-park-card-icon">${icon}</span>
            <span class="hopper-park-card-name">${cfg ? cfg.label : p}</span>
          </button>`;
      }).join("")}
    </div>
  `;

  content.querySelectorAll(".hopper-park-card").forEach(card => {
    card.addEventListener("click", () => {
      const dest = card.getAttribute("data-park");
      renderTransportStep(dest);
    });
  });
}

function renderTransportStep(destPark) {
  const content = document.getElementById("park-hopper-content");
  if (!content) return;

  const fromLabel = _hopperCurrentPark && PARK_CONFIG[_hopperCurrentPark]
    ? PARK_CONFIG[_hopperCurrentPark].label : "Your Park";
  const toLabel = PARK_CONFIG[destPark] ? PARK_CONFIG[destPark].label : destPark;
  const toIcon = PARK_ICONS[destPark] || "🏰";
  const options = getTransportOptions(_hopperCurrentPark, destPark);

  content.innerHTML = `
    <div class="hopper-step-header">
      <button class="hopper-back-btn" aria-label="Go back">← Back</button>
      <h2 class="hopper-title">How are you getting there?</h2>
      <p class="hopper-route">${fromLabel} → <span class="hopper-route-dest">${toIcon} ${toLabel}</span></p>
    </div>
    <div class="hopper-transport-grid">
      ${options.map((opt, i) => `
        <button class="hopper-transport-card" data-index="${i}" data-dest="${destPark}">
          <span class="hopper-transport-icon">${opt.icon}</span>
          <span class="hopper-transport-mode">${opt.mode}</span>
          <span class="hopper-transport-time">${opt.time}</span>
        </button>
      `).join("")}
    </div>
  `;

  content.querySelector(".hopper-back-btn").addEventListener("click", renderParkSelectStep);

  content.querySelectorAll(".hopper-transport-card").forEach(card => {
    card.addEventListener("click", () => {
      const idx = parseInt(card.getAttribute("data-index"), 10);
      const dest = card.getAttribute("data-dest");
      renderDirectionsStep(dest, idx);
    });
  });
}

function renderDirectionsStep(destPark, transportIndex) {
  const content = document.getElementById("park-hopper-content");
  if (!content) return;

  const options = getTransportOptions(_hopperCurrentPark, destPark);
  const transport = options[transportIndex];
  if (!transport) return;

  const fromLabel = _hopperCurrentPark && PARK_CONFIG[_hopperCurrentPark]
    ? PARK_CONFIG[_hopperCurrentPark].label : "Your Park";
  const toLabel = PARK_CONFIG[destPark] ? PARK_CONFIG[destPark].label : destPark;
  const mapsUrl = getGoogleMapsUrl(_hopperCurrentPark, destPark);

  const showMapsBtn = transport.mode === "Drive" || transport.mode === "Uber / Lyft";

  content.innerHTML = `
    <div class="hopper-step-header">
      <button class="hopper-back-btn" aria-label="Go back">← Back</button>
      <div class="hopper-directions-badge">
        <span class="hopper-directions-badge-icon">${transport.icon}</span>
        <span class="hopper-directions-badge-mode">${transport.mode}</span>
        <span class="hopper-directions-badge-time">${transport.time}</span>
      </div>
      <p class="hopper-route">${fromLabel} → ${toLabel}</p>
    </div>
    <div class="hopper-directions-list">
      <ol class="hopper-steps">
        ${transport.steps.map(step => `<li>${step}</li>`).join("")}
      </ol>
    </div>
    ${showMapsBtn && mapsUrl ? `
      <div class="hopper-actions">
        <a href="${mapsUrl}" target="_blank" rel="noopener" class="hopper-maps-btn">
          🗺️ Open in Google Maps
        </a>
      </div>
    ` : ""}
    <div class="hopper-actions">
      <button class="hopper-done-btn">Let's Go!</button>
    </div>
  `;

  content.querySelector(".hopper-back-btn").addEventListener("click", () => {
    renderTransportStep(destPark);
  });

  const doneBtn = content.querySelector(".hopper-done-btn");
  if (doneBtn) doneBtn.addEventListener("click", async () => {
    doneBtn.disabled = true;
    doneBtn.textContent = "Switching parks...";
    closeParkHopperModal();
    await performParkHop(destPark);
  });
}

// ── Init ──

function initParkHopper() {
  const overlay = document.getElementById("park-hopper-overlay");
  if (!overlay) return;

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) closeParkHopperModal();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !overlay.classList.contains("hidden")) {
      closeParkHopperModal();
    }
  });

  const closeBtn = document.getElementById("park-hopper-close");
  if (closeBtn) closeBtn.addEventListener("click", closeParkHopperModal);
}
