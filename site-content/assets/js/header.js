// ============================================================
// HEADER — Weather, Park Day Banner, Nav Pill, Budget Pill
// Depends on: script.js (core)
// ============================================================

// ── WEATHER WIDGET ───────────────────────────────────────────

const WDW_COORDS = { lat: 28.3772, lng: -81.5707, name: "Walt Disney World" };

const WMO_ICONS = {
  0:  { icon: "☀️",  desc: "Clear" },
  1:  { icon: "🌤️", desc: "Mostly Clear" },
  2:  { icon: "⛅",  desc: "Partly Cloudy" },
  3:  { icon: "☁️",  desc: "Overcast" },
  45: { icon: "🌫️", desc: "Foggy" },
  48: { icon: "🌫️", desc: "Icy Fog" },
  51: { icon: "🌦️", desc: "Light Drizzle" },
  53: { icon: "🌦️", desc: "Drizzle" },
  55: { icon: "🌧️", desc: "Heavy Drizzle" },
  61: { icon: "🌧️", desc: "Light Rain" },
  63: { icon: "🌧️", desc: "Rain" },
  65: { icon: "🌧️", desc: "Heavy Rain" },
  71: { icon: "🌨️", desc: "Light Snow" },
  73: { icon: "🌨️", desc: "Snow" },
  75: { icon: "❄️",  desc: "Heavy Snow" },
  80: { icon: "🌦️", desc: "Showers" },
  81: { icon: "🌧️", desc: "Heavy Showers" },
  95: { icon: "⛈️",  desc: "Thunderstorm" },
  96: { icon: "⛈️",  desc: "Thunderstorm" },
  99: { icon: "⛈️",  desc: "Heavy Thunderstorm" },
};

function getWeatherIcon(code) {
  return WMO_ICONS[code] || { icon: "🌡️", desc: "Unknown" };
}

function celsiusToF(c) {
  return Math.round(c * 9/5 + 32);
}

function getDayName(dateStr, isShort = true) {
  const date = new Date(dateStr + "T12:00:00");
  return date.toLocaleDateString("en-US", { weekday: isShort ? "short" : "long" });
}

let weatherData = null;
let weatherLocation = null;

async function fetchWeather(lat, lng, locationName) {
  weatherLocation = locationName;
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}` +
      `&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,precipitation_probability` +
      `&hourly=temperature_2m,weather_code,precipitation_probability` +
      `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max` +
      `&temperature_unit=celsius&wind_speed_unit=mph&timezone=auto&forecast_days=7`;

    const res = await fetch(url);
    if (!res.ok) throw new Error("Weather fetch failed");
    weatherData = await res.json();
    renderWeatherBadge(weatherData);
    prerenderWeatherModal(weatherData, locationName);
  } catch (err) {
    console.warn("Weather fetch error:", err);
    updateWeatherBadge("🌡️", "--°F", "Unavailable");
  }
}

function updateWeatherBadge(icon, temp, desc) {
  const iconEl = document.getElementById("weather-badge-icon");
  const tempEl = document.getElementById("weather-badge-temp");
  const descEl = document.getElementById("weather-badge-desc");
  if (iconEl) iconEl.textContent = icon;
  if (tempEl) tempEl.textContent = temp;
  if (descEl) descEl.textContent = desc;
}

function renderWeatherBadge(data) {
  const current = data.current;
  const { icon, desc } = getWeatherIcon(current.weather_code);
  const tempF = celsiusToF(current.temperature_2m);
  updateWeatherBadge(icon, `${tempF}°F`, desc);
}

function prerenderWeatherModal(data, locationName) {
  const content = document.getElementById("weather-modal-content");
  if (!content) return;

  const current = data.current;
  const daily = data.daily;
  const { icon, desc } = getWeatherIcon(current.weather_code);
  const tempF = celsiusToF(current.temperature_2m);
  const feelsF = celsiusToF(current.apparent_temperature);
  const humidity = current.relative_humidity_2m;
  const wind = Math.round(current.wind_speed_10m);
  const rainChance = current.precipitation_probability || 0;

  const today = new Date().toISOString().split("T")[0];

  const forecastDays = daily.time.map((date, i) => {
    const { icon: dIcon } = getWeatherIcon(daily.weather_code[i]);
    const high = celsiusToF(daily.temperature_2m_max[i]);
    const low = celsiusToF(daily.temperature_2m_min[i]);
    const isToday = date === today;
    return `
      <div class="forecast-day ${isToday ? "today" : ""}">
        <span class="forecast-day-name">${isToday ? "Today" : getDayName(date)}</span>
        <span class="forecast-icon">${dIcon}</span>
        <span class="forecast-high">${high}°</span>
        <span class="forecast-low">${low}°</span>
      </div>`;
  }).join("");

  content.innerHTML = `
    <div class="weather-current">
      <div class="weather-current-icon">${icon}</div>
      <div class="weather-current-info">
        <p class="weather-location">📍 ${locationName}</p>
        <p class="weather-temp-big">${tempF}°F</p>
        <p class="weather-desc-big">${desc}</p>
      </div>
    </div>
    <div class="weather-details-row">
      <div class="weather-detail-item">
        <span class="weather-detail-label">Feels Like</span>
        <span class="weather-detail-value">${feelsF}°F</span>
      </div>
      <div class="weather-detail-item">
        <span class="weather-detail-label">Humidity</span>
        <span class="weather-detail-value">${humidity}%</span>
      </div>
      <div class="weather-detail-item">
        <span class="weather-detail-label">Wind</span>
        <span class="weather-detail-value">${wind} mph</span>
      </div>
      <div class="weather-detail-item">
        <span class="weather-detail-label">Rain</span>
        <span class="weather-detail-value">${rainChance}%</span>
      </div>
    </div>
    ${renderHourlyForecast(data)}
    <p class="weather-forecast-title">7-Day Forecast</p>
    <div class="weather-forecast-grid">${forecastDays}</div>
  `;
}

function renderHourlyForecast(data) {
  if (!data.hourly || !data.hourly.time) return "";

  const now = new Date();
  const currentHour = now.getHours();
  const todayStr = now.toISOString().split("T")[0];

  const startIdx = data.hourly.time.findIndex(t => {
    const d = new Date(t);
    return d.toISOString().split("T")[0] === todayStr && d.getHours() >= currentHour;
  });

  if (startIdx < 0) return "";

  const hours = [];
  for (let i = startIdx; i < Math.min(startIdx + 6, data.hourly.time.length); i++) {
    const time = new Date(data.hourly.time[i]);
    const hour = time.getHours();
    const suffix = hour >= 12 ? "PM" : "AM";
    const hour12 = hour % 12 === 0 ? 12 : hour % 12;
    const { icon } = getWeatherIcon(data.hourly.weather_code[i]);
    const temp = celsiusToF(data.hourly.temperature_2m[i]);
    const rain = data.hourly.precipitation_probability[i] || 0;

    hours.push(`
      <div class="hourly-item" style="display:flex; flex-direction:column; align-items:center; gap:0.2rem; padding:0.5rem 0.25rem; min-width:48px;">
        <span style="font-size:0.6rem; font-weight:700; color:rgba(255,255,255,0.55); text-transform:uppercase; letter-spacing:0.04em; font-family:'Nunito',sans-serif;">${i === startIdx ? "Now" : `${hour12}${suffix}`}</span>
        <span style="font-size:1.2rem; line-height:1;">${icon}</span>
        <span style="font-size:0.85rem; font-weight:800; color:white; font-family:'Nunito',sans-serif;">${temp}°</span>
        ${rain > 10 ? `<span style="font-size:0.55rem; font-weight:700; color:rgba(100,200,255,0.8); font-family:'Nunito',sans-serif;">💧${rain}%</span>` : ""}
      </div>
    `);
  }

  return `
    <p class="weather-forecast-title">Next 6 Hours</p>
    <div style="display:flex; gap:0; padding:0 1rem 0.75rem; overflow-x:auto; justify-content:space-around;">
      ${hours.join("")}
    </div>
  `;
}

function openWeatherModal() {
  const overlay = document.getElementById("weather-modal-overlay");
  if (!overlay) return;
  if (weatherData && weatherLocation) {
    prerenderWeatherModal(weatherData, weatherLocation);
  }
  overlay.classList.remove("hidden");
  document.body.style.overflow = "hidden";
}

function closeWeatherModal() {
  const overlay = document.getElementById("weather-modal-overlay");
  if (!overlay) return;
  overlay.classList.add("hidden");
  document.body.style.overflow = "";
}

function initializeWeather() {
  const badge = document.getElementById("weather-badge");
  const closeBtn = document.getElementById("weather-modal-close");
  const overlay = document.getElementById("weather-modal-overlay");

  if (!badge) return;

  badge.addEventListener("click", openWeatherModal);
  badge.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openWeatherModal(); }
  });

  if (closeBtn) closeBtn.addEventListener("click", closeWeatherModal);
  if (overlay) overlay.addEventListener("click", (e) => { if (e.target === overlay) closeWeatherModal(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeWeatherModal(); });

  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords;
        fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`)
          .then(r => r.json())
          .then(geo => {
            const city = geo.address?.city || geo.address?.town || geo.address?.village || "Your Location";
            const state = geo.address?.state_code || "";
            fetchWeather(lat, lng, state ? `${city}, ${state}` : city);
          })
          .catch(() => fetchWeather(lat, lng, "Your Location"));
      },
      () => fetchWeather(WDW_COORDS.lat, WDW_COORDS.lng, WDW_COORDS.name),
      { timeout: 8000 }
    );
  } else {
    fetchWeather(WDW_COORDS.lat, WDW_COORDS.lng, WDW_COORDS.name);
  }
}

// ============================================================
// NAV RENDERING — Single source of truth for nav links
// Injects the e-ticket nav tray at runtime so the castle SVG
// and link list only exist in one place (here) instead of being
// copy-pasted into every HTML file.
// ============================================================

const NAV_ITEMS = [
  { href: "index.html",        label: "Dashboard",  pageClass: "page-dashboard"    },
  { href: "itinerary.html",    label: "Itinerary",  pageClass: "page-itinerary"    },
  { href: "budget.html",       label: "Budget",     pageClass: "page-budget"       },
  { href: "wishlist.html",     label: "Wishlist",   pageClass: "page-wishlist"     },
  { href: "photos.html",       label: "Photos",     pageClass: "page-photos"       },
  { href: "planner.html",      label: "Planner",    pageClass: "page-planner"      },
  { href: "tripcalendar.html", label: "Calendar",   pageClass: "page-tripcalendar" },
  { href: "history.html",      label: "History",    pageClass: "page-history"      },
  { href: "packing.html",      label: "Packing",    pageClass: "page-packing"      },
];

const CASTLE_SVG = `<svg class="ticket-castle" viewBox="0 0 40 36" xmlns="http://www.w3.org/2000/svg"><rect x="2" y="20" width="36" height="16" fill="currentColor"/><rect x="0" y="14" width="8" height="10" fill="currentColor"/><rect x="16" y="10" width="8" height="14" fill="currentColor"/><rect x="32" y="14" width="8" height="10" fill="currentColor"/><rect x="1" y="10" width="3" height="5" fill="currentColor"/><rect x="5" y="10" width="3" height="5" fill="currentColor"/><rect x="17" y="6" width="3" height="5" fill="currentColor"/><rect x="21" y="6" width="3" height="5" fill="currentColor"/><rect x="33" y="10" width="3" height="5" fill="currentColor"/><rect x="37" y="10" width="3" height="5" fill="currentColor"/><rect x="17" y="0" width="2" height="7" fill="currentColor"/><rect x="21" y="0" width="2" height="7" fill="currentColor"/><rect x="16" y="24" width="8" height="12" fill="white"/></svg>`;

function renderNav() {
  const tray = document.getElementById("nav-ticket-tray");
  if (!tray) return;

  // Detect current page by body class
  const bodyClasses = document.body.className;
  const currentPageClass = NAV_ITEMS.find(item => bodyClasses.includes(item.pageClass))?.pageClass || "";

  const linksHtml = NAV_ITEMS.map(item => {
    const isActive = bodyClasses.includes(item.pageClass);
    const holeHtml = isActive ? `<span class="ticket-hole"></span>` : "";
    return `<a href="${item.href}" class="nav-link${isActive ? " active" : ""}"><span class="ticket-perf"></span><span class="ticket-label-bar">${item.label}</span>${holeHtml}${CASTLE_SVG}</a>`;
  }).join("");

  // Preserve any existing dynamically-added links (profile, admin) already in scroll
  const scroll = tray.querySelector(".nav-ticket-scroll");
  if (scroll) {
    // Replace only the static links; dynamic ones (admin, profile) are added by initNavPill
    scroll.innerHTML = linksHtml;
  } else {
    tray.innerHTML = `<div class="nav-ticket-scroll hide-scrollbar">${linksHtml}</div>`;
  }
}



const PARK_CONFIG = {
  "magic kingdom": {
    label: "Magic Kingdom",
    logo: "assets/images/park-hours/magic-kingdom.png",
    images: ["assets/images/img_magic_kingdom.jpg"],
    fallbackColor: "linear-gradient(135deg, #003087 0%, #1565c0 100%)",
    defaultHours: "Park opens 9:00 AM",
    charLeft: "assets/images/mickey-mouse-pose1.png",
    charRight: "assets/images/minnie-mouse-pose1.png"
  },
  "epcot": {
    label: "EPCOT",
    logo: "assets/images/park-hours/epcot.png",
    images: ["assets/images/img_epcot.jpg"],
    fallbackColor: "linear-gradient(135deg, #0d47a1 0%, #1976d2 100%)",
    defaultHours: "Park opens 9:00 AM",
    charLeft: "assets/images/figment-pose1.png",
    charRight: "assets/images/figment-pose2.png"
  },
  "hollywood studios": {
    label: "Hollywood Studios",
    logo: "assets/images/park-hours/disney-hollywood-studios.webp",
    images: ["assets/images/img_hollywood_theater.jpg", "assets/images/img_hollywood_falcon.jpg"],
    fallbackColor: "linear-gradient(135deg, #1a237e 0%, #283593 100%)",
    defaultHours: "Park opens 9:00 AM",
    charLeft: "assets/images/toy-story-buzz-woody-flying.png",
    charRight: "assets/images/stormtroopers.png"
  },
  "animal kingdom": {
    label: "Animal Kingdom",
    logo: "assets/images/park-hours/animal-kingdom.png",
    images: ["assets/images/img_animal_kingdom.jpg"],
    fallbackColor: "linear-gradient(135deg, #1b5e20 0%, #388e3c 100%)",
    defaultHours: "Park opens 8:00 AM",
    charLeft: "assets/images/mufasa-simba1.png",
    charRight: "assets/images/simba-timon-pumbaa.png"
  },
  "disney springs": {
    label: "Disney Springs",
    logo: "",
    images: [],
    fallbackColor: "linear-gradient(135deg, #004d7a 0%, #008793 100%)",
    defaultHours: "Open 10:00 AM – 11:00 PM",
    charLeft: "assets/images/mickey-mouse-pose1.png",
    charRight: "assets/images/minnie-mouse-pose1.png"
  }
};

const PARK_ALIASES = {
  "mk": "magic kingdom",
  "magic": "magic kingdom",
  "kingdom": "magic kingdom",
  "cinderella": "magic kingdom",
  "ep": "epcot",
  "world showcase": "epcot",
  "future world": "epcot",
  "spaceship": "epcot",
  "hs": "hollywood studios",
  "hollywood": "hollywood studios",
  "studios": "hollywood studios",
  "galaxy": "hollywood studios",
  "star wars": "hollywood studios",
  "ak": "animal kingdom",
  "animal": "animal kingdom",
  "pandora": "animal kingdom",
  "tree of life": "animal kingdom",
  "springs": "disney springs",
};

function detectParkFromActivities(itinerary) {
  const todayStr = getTodayString();

  const todayActivities = itinerary.filter(a => (a.date || '') === todayStr);
  if (todayActivities.length === 0) return null;

  const scores = {};
  todayActivities.forEach(activity => {
    const text = `${activity.title} ${activity.location} ${activity.notes || ''}`.toLowerCase();
    for (const key of Object.keys(PARK_CONFIG)) {
      if (text.includes(key)) scores[key] = (scores[key] || 0) + 2;
    }
    for (const [alias, parkKey] of Object.entries(PARK_ALIASES)) {
      if (text.includes(alias)) scores[parkKey] = (scores[parkKey] || 0) + 1;
    }
  });

  const best = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
  return best ? best[0] : null;
}

const PLANNER_TO_CONFIG = {
  "magic-kingdom":     "magic kingdom",
  "epcot":             "epcot",
  "hollywood-studios": "hollywood studios",
  "animal-kingdom":    "animal kingdom",
  "disney-springs":    "disney springs",
};

function swapHeaderCharacters(parkKey) {
  const config = parkKey ? PARK_CONFIG[parkKey] : null;
  const leftImg = document.querySelector(".park-entrance .character-img.mickey");
  const rightImg = document.querySelector(".park-entrance .character-img.minnie");
  
  if (!leftImg || !rightImg) return;
  
  const leftSrc = (config && config.charLeft) || "assets/images/mickey-mouse-pose1.png";
  const rightSrc = (config && config.charRight) || "assets/images/minnie-mouse-pose1.png";
  
  leftImg.src = leftSrc;
  rightImg.src = rightSrc;
  
  const altNames = {
    "magic kingdom": ["Mickey Mouse", "Minnie Mouse"],
    "epcot": ["Figment", "Figment"],
    "hollywood studios": ["Buzz & Woody", "Stormtroopers"],
    "animal kingdom": ["Mufasa & Simba", "Simba, Timon & Pumbaa"],
    "disney springs": ["Mickey Mouse", "Minnie Mouse"],
  };
  const alts = (parkKey && altNames[parkKey]) || ["Mickey Mouse", "Minnie Mouse"];
  leftImg.alt = alts[0];
  rightImg.alt = alts[1];
}

async function fetchLiveParkHours(parkName, dateString) {
  const PARK_IDS = {
    "magic kingdom":     "75ea578a-adc8-4116-a54d-dccb60765ef9",
    "epcot":             "47f90d2c-e191-4239-a466-5892ef59a88b",
    "hollywood studios": "288747d1-8b4f-4a64-867e-ea7c9b27bad8",
    "animal kingdom":    "1c84a229-8862-4648-9c71-378ddd2c7693",
  };
  try {
    const parkId = PARK_IDS[parkName.toLowerCase()];
    if (!parkId) return null;
    const schedRes = await fetch(`https://api.themeparks.wiki/v1/entity/${parkId}/schedule`);
    const schedData = await schedRes.json();
    const daySchedule = schedData.schedule.find(s =>
      s.date === dateString && s.type === "OPERATING"
    );
    if (daySchedule) {
      const open  = new Date(daySchedule.openingTime).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
      const close = new Date(daySchedule.closingTime).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
      return `Open ${open} – ${close}`;
    }
  } catch (err) {
    console.warn("Failed to fetch live park hours, falling back to defaults.", err);
  }
  return null;
}

async function renderParkDayBanner() {
  const header   = document.querySelector(".site-header");
  const labelEl  = document.getElementById("park-day-label");
  const titleEl  = document.getElementById("park-day-title");
  const hoursEl  = document.getElementById("park-day-hours");

  if (!header) return;

  const todayStr = getTodayString();

  let detectedPark = null;
  let displayDate = todayStr;

  const allParkDays = await ParkDaysDB.getAll();

  const todayParkDay = allParkDays.find(pd => pd.date === todayStr);
  if (todayParkDay) {
    detectedPark = PLANNER_TO_CONFIG[todayParkDay.park] || null;
    displayDate = todayStr;
  }

  if (!detectedPark) {
    const allSorted = sortItineraryByTime(await getStoredItinerary());
    const tripActivities = await filterToCurrentTrip(allSorted);
    
    if (tripActivities.length > 0) {
      const tripDates = [...new Set(tripActivities.map(a => a.date).filter(Boolean))].sort();
      const nextParkDay = allParkDays
        .filter(pd => tripDates.includes(pd.date) && pd.date >= todayStr)
        .sort((a, b) => a.date.localeCompare(b.date))[0];
      
      if (nextParkDay) {
        detectedPark = PLANNER_TO_CONFIG[nextParkDay.park] || null;
        displayDate = nextParkDay.date;
      }
    }
  }

  if (!detectedPark) {
    const itinerary = await getStoredItinerary();
    detectedPark = detectParkFromActivities(itinerary);
  }

  if (!detectedPark || !PARK_CONFIG[detectedPark]) {
    const parkKeys = Object.keys(PARK_CONFIG).filter(k => PARK_CONFIG[k].images.length > 0);
    const randomParkKey = parkKeys[Math.floor(Math.random() * parkKeys.length)];
    const randomPark = PARK_CONFIG[randomParkKey];
    const chosen = randomPark.images[Math.floor(Math.random() * randomPark.images.length)];

    const bar = document.getElementById("park-day-bar");
    if (bar) bar.classList.add("no-park");

    swapHeaderCharacters(randomParkKey);

    const img = new Image();
    img.onload = () => {
      header.style.backgroundImage = `url('${chosen}')`;
      header.style.backgroundSize = "cover";
      header.style.backgroundPosition = "center 35%";
      document.body.classList.add("park-active");
    };
    img.onerror = () => {
      header.style.background = randomPark.fallbackColor;
      document.body.classList.add("park-active");
    };
    img.src = chosen;
    return;
  }

  const park = PARK_CONFIG[detectedPark];

  swapHeaderCharacters(detectedPark);

  let formattedDate = "";
  if (displayDate) {
    const [y, m, d] = displayDate.split("-").map(Number);
    formattedDate = new Date(y, m - 1, d).toLocaleDateString("en-US", {
      month: "long", day: "numeric", year: "numeric"
    });
  }

  if (labelEl) labelEl.textContent = park.label;
  if (titleEl) titleEl.textContent = park.label;

  const bar = document.getElementById("park-day-bar");
  if (bar) {
    bar.setAttribute("data-park", detectedPark);

    bar.querySelector(".park-day-bar-image")?.remove();
    const oldRight = bar.querySelector(".park-day-bar-right");

    if (park.logo) {
      const logoImg = document.createElement("img");
      logoImg.className = "park-day-bar-image";
      logoImg.src = park.logo;
      logoImg.alt = park.label;
      logoImg.draggable = false;
      if (oldRight) {
        oldRight.before(logoImg);
      } else if (hoursEl) {
        hoursEl.before(logoImg);
      } else {
        bar.appendChild(logoImg);
      }
    }

    if (oldRight && hoursEl) {
      bar.appendChild(hoursEl);
      oldRight.remove();
    }
  }
  
  if (hoursEl) {
    hoursEl.textContent = "Checking live hours...";
    
    fetchLiveParkHours(park.label, displayDate).then(liveHours => {
      hoursEl.textContent = liveHours || park.defaultHours;
    });
  }

  const images = park.images;
  if (!images || images.length === 0) {
    header.style.background = park.fallbackColor;
    document.body.classList.add("park-active");
    return;
  }
  const chosen = images[Math.floor(Math.random() * images.length)];

  const img = new Image();
  img.onload = () => {
    header.style.backgroundImage = `url('${chosen}')`;
    header.style.backgroundSize = "cover";
    header.style.backgroundPosition = "center 35%";
    document.body.classList.add("park-active");
  };
  img.onerror = () => {
    header.style.background = park.fallbackColor;
    document.body.classList.add("park-active");
  };
  img.src = chosen;
}

// ============================================================
// HAMBURGER NAV PILL + BUDGET QUICK-ADD PILL
// ============================================================

function initNavPill() {
  const pill = document.getElementById("nav-pill");
  const tray = document.getElementById("nav-ticket-tray");
  if (!pill || !tray) return;

  const utilitySlot = document.getElementById("utility-user-slot");
  if (utilitySlot) {
    const utilityBarInner = utilitySlot.closest(".utility-bar-inner");
    if (utilityBarInner) {
      utilitySlot.innerHTML = "";
      utilitySlot.appendChild(pill);
      const utilityBar = utilityBarInner.closest(".utility-bar");
      if (utilityBar) {
        utilityBar.after(tray);
      }
    }
  }

  tray.classList.remove("open");

  const scroll = tray.querySelector(".nav-ticket-scroll");
  if (!scroll) return;

  const user = Auth.getUser();

  if (user && !scroll.querySelector('.nav-tray-profile-link')) {
    const profileRow = document.createElement("div");
    profileRow.className = "nav-tray-profile-link";
    profileRow.style.cssText = "text-align:center; padding:0.5rem 0 0.25rem;";
    profileRow.innerHTML = `<a href="profile.html" style="color:rgba(255,255,255,0.7); font-family:'Nunito',sans-serif; font-size:0.8rem; font-weight:700; text-decoration:none; letter-spacing:0.04em;">👤 My Profile</a>`;
    scroll.insertBefore(profileRow, scroll.firstChild);
  }

  if (user && user.role === "admin" && !scroll.querySelector('[href="admin.html"]')) {
    const isAdminPage = document.body.classList.contains("page-admin");
    const adminLink = document.createElement("a");
    adminLink.href = "admin.html";
    adminLink.className = `nav-link${isAdminPage ? " active" : ""}`;
    adminLink.innerHTML = `<span class="ticket-perf"></span><span class="ticket-label-bar">⚙️ Admin</span>${isAdminPage ? '<span class="ticket-hole"></span>' : ''}<svg class="ticket-castle" viewBox="0 0 40 36" xmlns="http://www.w3.org/2000/svg"><rect x="2" y="20" width="36" height="16" fill="currentColor"/><rect x="0" y="14" width="8" height="10" fill="currentColor"/><rect x="16" y="10" width="8" height="14" fill="currentColor"/><rect x="32" y="14" width="8" height="10" fill="currentColor"/><rect x="1" y="10" width="3" height="5" fill="currentColor"/><rect x="5" y="10" width="3" height="5" fill="currentColor"/><rect x="17" y="6" width="3" height="5" fill="currentColor"/><rect x="21" y="6" width="3" height="5" fill="currentColor"/><rect x="33" y="10" width="3" height="5" fill="currentColor"/><rect x="37" y="10" width="3" height="5" fill="currentColor"/><rect x="17" y="0" width="2" height="7" fill="currentColor"/><rect x="21" y="0" width="2" height="7" fill="currentColor"/><rect x="16" y="24" width="8" height="12" fill="white"/></svg>`;
    scroll.appendChild(adminLink);
  }

  pill.addEventListener("click", (e) => {
    e.stopPropagation();
    const isOpen = tray.classList.contains("open");
    closeBudgetPopover();

    if (isOpen) {
      closeNavTray();
    } else {
      pill.classList.add("open");
      tray.classList.add("open");
      const overlay = document.getElementById("nav-overlay");
      if (overlay) overlay.classList.remove("hidden");
    }
  });

  document.addEventListener("click", (e) => {
    if (tray.contains(e.target) || pill.contains(e.target)) return;
    closeNavTray();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeAllPillDropdowns();
  });
}

function closeBudgetPopover() {
  const quickAdd = document.getElementById("budget-quick-add");
  const overlay = document.getElementById("nav-overlay");
  if (quickAdd) quickAdd.classList.remove("open");
  if (overlay) overlay.classList.add("hidden");
}

function closeNavTray() {
  const pill = document.getElementById("nav-pill");
  const tray = document.getElementById("nav-ticket-tray");
  const overlay = document.getElementById("nav-overlay");
  if (pill) pill.classList.remove("open");
  if (tray) tray.classList.remove("open");
  if (overlay) overlay.classList.add("hidden");
}

function closeAllPillDropdowns() {
  closeNavTray();
  closeBudgetPopover();
}

// ── Budget Quick-Add Pill ─────────────────────────────────

let _budgetPillTripData = null;

async function initBudgetPill() {
  const pill = document.getElementById("budget-pill");
  const quickAdd = document.getElementById("budget-quick-add");
  const overlay = document.getElementById("nav-overlay");
  if (!pill) return;

  await refreshBudgetPill();

  pill.addEventListener("click", (e) => {
    e.stopPropagation();
    const isOpen = quickAdd && quickAdd.classList.contains("open");

    closeNavTray();

    if (isOpen) {
      closeBudgetPopover();
    } else if (quickAdd) {
      quickAdd.classList.add("open");
      if (overlay) overlay.classList.remove("hidden");
      const descInput = document.getElementById("bqa-description");
      const dateInput = document.getElementById("bqa-date");
      if (dateInput) dateInput.value = new Date().toISOString().split("T")[0];
      if (descInput) {
        descInput.placeholder = DISNEY_PROMPTS[Math.floor(Math.random() * DISNEY_PROMPTS.length)];
        setTimeout(() => descInput.focus(), 100);
      }
    }
  });

  if (quickAdd) {
    quickAdd.addEventListener("click", (e) => e.stopPropagation());
  }

  if (overlay) {
    overlay.addEventListener("click", () => closeBudgetPopover());
  }

  const closeBtn = document.getElementById("budget-quick-add-close");
  if (closeBtn) {
    closeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      closeBudgetPopover();
    });
  }

  const form = document.getElementById("budget-quick-add-form");
  if (form) {
    form.addEventListener("submit", handleQuickAddTransaction);
  }
}

async function refreshBudgetPill() {
  const amountEl = document.getElementById("budget-pill-amount");
  const pill = document.getElementById("budget-pill");
  if (!amountEl || !pill) return;

  try {
    const allTrips = await apiFetch("/trip-budgets");
    const today = new Date().toISOString().split("T")[0];
    const trip = allTrips.find(t => today >= t.start_date && today <= t.end_date)
      || allTrips.find(t => t.start_date > today)
      || allTrips[0];

    if (!trip) {
      amountEl.textContent = "No budget";
      pill.classList.add("no-budget");
      pill.classList.remove("over-budget");
      _budgetPillTripData = null;
      return;
    }

    _budgetPillTripData = trip;

    // Use personal budget if available, fall back to trip-level
    const hasMyBudget = trip.myBudget && (trip.myTotal > 0);
    const total = hasMyBudget ? trip.myTotal : trip.total;
    const spent = hasMyBudget ? trip.mySpent : trip.spent;
    const remaining = total - spent;

    pill.classList.remove("no-budget", "over-budget");
    if (total === 0) {
      amountEl.textContent = "Set budget";
      pill.classList.add("no-budget");
    } else if (remaining < 0) {
      pill.classList.add("over-budget");
      amountEl.textContent = `-$${Math.abs(remaining).toFixed(2)}`;
    } else {
      amountEl.textContent = `$${remaining.toFixed(2)}`;
    }
  } catch (err) {
    console.warn("[BudgetPill] Failed to load:", err);
    amountEl.textContent = "No budget";
    pill.classList.add("no-budget");
    _budgetPillTripData = null;
  }
}

async function handleQuickAddTransaction(e) {
  e.preventDefault();

  if (!_budgetPillTripData) {
    showToast("⚠️ No trip budget set. Go to the Budget page to create one.");
    closeAllPillDropdowns();
    return;
  }

  const descInput = document.getElementById("bqa-description");
  const amountInput = document.getElementById("bqa-amount");
  const categoryInput = document.getElementById("bqa-category");

  const description = descInput.value.trim();
  const amount = parseFloat(amountInput.value);
  const category = categoryInput.value;

  if (!description || !amount || amount <= 0) return;

  const newTransaction = {
    id: `trans-${Date.now()}`,
    description,
    amount,
    category,
    date: document.getElementById("bqa-date")?.value || new Date().toISOString().split("T")[0],
    trip_id: _budgetPillTripData.trip_id,
  };

  try {
    await apiFetch("/budget/transactions", {
      method: "POST",
      body: JSON.stringify(newTransaction),
    });

    descInput.value = "";
    amountInput.value = "";

    const formEl = document.getElementById("budget-quick-add-form");
    const successEl = document.createElement("div");
    successEl.className = "budget-quick-add-success";
    successEl.textContent = "✅ Expense added!";
    formEl.style.display = "none";
    formEl.parentNode.insertBefore(successEl, formEl.nextSibling);

    await refreshBudgetPill();

    if (typeof loadBudget === "function" && document.getElementById("budget-summary")) {
      loadBudget();
    }

    if (typeof renderDashboardBudgetCard === "function") {
      renderDashboardBudgetCard();
    }

    setTimeout(() => {
      successEl.remove();
      formEl.style.display = "";
      closeAllPillDropdowns();
    }, 1200);

  } catch (err) {
    console.error("[QuickAdd] Failed:", err);
    showToast("❌ Failed to add expense. Try again.");
  }
}