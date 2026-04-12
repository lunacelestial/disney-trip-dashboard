// ============================================================
// ADMIN PANEL
// Manages users, venues, and pending venue changes.
// Requires admin login.
// ============================================================

function getAuthToken() {
  return localStorage.getItem("disney-auth-token") || "";
}

function getAuthHeaders() {
  return {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${getAuthToken()}`,
  };
}

async function adminFetch(path, options = {}) {
  const res = await fetch(`/api${path}`, {
    headers: getAuthHeaders(),
    ...options,
  });
  if (res.status === 401 || res.status === 403) {
    renderAdminLogin("You need to be logged in as an admin.");
    throw new Error("Unauthorized");
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || res.statusText);
  }
  return res.json();
}

// ── Render Logic ───────────────────────────────────────────

async function initAdmin() {
  const app = document.getElementById("admin-app");
  if (!app) return;

  const token = getAuthToken();
  if (!token) {
    renderAdminLogin();
    return;
  }

  try {
    const user = await adminFetch("/auth/me");
    if (user.role !== "admin") {
      app.innerHTML = `
        <div class="wizard-step-card" style="text-align:center; padding:3rem;">
          <h2>Access Denied</h2>
          <p style="color:var(--slate);">Your account (${user.name}) doesn't have admin access.</p>
          <a href="index.html" class="primary-button" style="text-decoration:none; display:inline-block; margin-top:1rem;">← Back to Dashboard</a>
        </div>
      `;
      return;
    }
    renderAdminDashboard(user);
  } catch (e) {
    if (e.message !== "Unauthorized") {
      renderAdminLogin("Session expired. Please log in again.");
    }
  }
}

function renderAdminLogin(message = "") {
  const app = document.getElementById("admin-app");
  app.innerHTML = `
    <div class="wizard-step-card" style="max-width:450px; margin:2rem auto;">
      <div class="wizard-step-header">
        <span class="wizard-step-emoji">🔐</span>
        <div>
          <h2>Admin Login</h2>
          <p class="wizard-step-subtitle">Enter your email to access the admin panel.</p>
        </div>
      </div>
      ${message ? `<p style="color:var(--magic-red); font-weight:700; margin-bottom:1rem;">${message}</p>` : ""}
      <div class="wizard-field">
        <label for="admin-email">Email</label>
        <input type="email" id="admin-email" placeholder="your@email.com" />
      </div>
      <button type="button" class="primary-button" id="admin-login-btn" style="width:100%; margin-top:1.25rem;">
        Log In
      </button>
    </div>
  `;

  const loginBtn = document.getElementById("admin-login-btn");
  const emailInput = document.getElementById("admin-email");

  loginBtn.addEventListener("click", handleAdminLogin);
  emailInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") handleAdminLogin();
  });
  setTimeout(() => emailInput.focus(), 50);
}

async function handleAdminLogin() {
  const email = document.getElementById("admin-email").value.trim();
  if (!email) return;

  try {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });

    if (!res.ok) {
      const err = await res.json();
      renderAdminLogin(err.error || "Login failed");
      return;
    }

    const data = await res.json();
    localStorage.setItem("disney-auth-token", data.token);
    localStorage.setItem("disney-user", JSON.stringify(data.user));
    initAdmin();
  } catch (err) {
    renderAdminLogin("Network error. Is the API running?");
  }
}

async function renderAdminDashboard(user) {
  const app = document.getElementById("admin-app");

  // Get counts for dashboard
  let pendingCount = 0;
  try {
    const pending = await adminFetch("/admin/pending");
    pendingCount = pending.length;
  } catch (e) {}

  app.innerHTML = `
    <div style="margin-bottom:2rem;">
      <h2 style="margin:0;">Welcome, ${user.name}!</h2>
      <p style="color:var(--muted); margin:0.25rem 0 0;">Admin Panel • <button type="button" id="admin-logout-btn" style="background:none; border:none; color:var(--magic-red); cursor:pointer; font-weight:700; font-family:inherit; font-size:inherit; padding:0;">Log Out</button></p>
    </div>

    ${pendingCount > 0 ? `
      <div class="wizard-step-card" style="border-color:var(--pixie-gold); margin-bottom:1.5rem; cursor:pointer;" id="pending-alert-card">
        <div style="display:flex; align-items:center; gap:1rem;">
          <span style="font-size:2rem;">🔔</span>
          <div>
            <h3 style="margin:0;">${pendingCount} Pending Venue Change${pendingCount !== 1 ? "s" : ""}</h3>
            <p style="margin:0.25rem 0 0; color:var(--slate);">Someone suggested changes to the venue database. Review them here.</p>
          </div>
        </div>
      </div>
    ` : ""}

    <div class="card-grid" style="margin-bottom:2rem;">
      <div class="info-card" style="cursor:pointer;" id="admin-nav-users">
        <p class="card-label">👥 User Management</p>
        <h3>Manage Users</h3>
        <p>Add, edit, or remove family members.</p>
      </div>
      <div class="info-card" style="cursor:pointer;" id="admin-nav-venues">
        <p class="card-label">📍 Venue Database</p>
        <h3>Manage Venues</h3>
        <p>Browse, edit, or seed the venue database.</p>
      </div>
      <div class="info-card" style="cursor:pointer;" id="admin-nav-pending">
        <p class="card-label">📋 Pending Changes</p>
        <h3>Review Queue ${pendingCount > 0 ? `<span style="color:var(--magic-red);">(${pendingCount})</span>` : ""}</h3>
        <p>Approve or reject venue suggestions.</p>
      </div>
      <div class="info-card" style="cursor:pointer;" id="admin-nav-pulse">
        <p class="card-label">🎢 Park Pulse</p>
        <h3>Collector Status</h3>
        <p>Wait time data health, last sample, and coverage.</p>
      </div>
      <div class="info-card" style="cursor:pointer;" id="admin-nav-pins">
        <p class="card-label">📌 Pin Collector</p>
        <h3>Manage Pins</h3>
        <p>Upload, tag, and organize trading pins.</p>
      </div>
    </div>

    <div id="admin-section-content"></div>
  `;

  document.getElementById("admin-logout-btn").addEventListener("click", () => {
    localStorage.removeItem("disney-auth-token");
    localStorage.removeItem("disney-user");
    initAdmin();
  });

  document.getElementById("admin-nav-users").addEventListener("click", renderUserManagement);
  document.getElementById("admin-nav-venues").addEventListener("click", renderVenueManagement);
  document.getElementById("admin-nav-pending").addEventListener("click", renderPendingChanges);
  document.getElementById("admin-nav-pulse").addEventListener("click", renderParkPulseStatus);
  document.getElementById("admin-nav-pins").addEventListener("click", renderPinManagement);
  if (document.getElementById("pending-alert-card")) {
    document.getElementById("pending-alert-card").addEventListener("click", renderPendingChanges);
  }
}

// ── User Management ────────────────────────────────────────

async function renderUserManagement() {
  const section = document.getElementById("admin-section-content");
  const users = await adminFetch("/admin/users");

  section.innerHTML = `
    <div class="wizard-step-card">
      <h3>👥 Users</h3>
      <div id="users-list" style="margin:1rem 0;">
        ${users.map(u => `
          <div style="display:flex; justify-content:space-between; align-items:center; padding:0.75rem 1rem; border:1px solid #e2e8f0; border-radius:10px; margin-bottom:0.5rem; background:white;">
            <div>
              <strong>${u.name}</strong> <span style="font-size:0.8rem; color:var(--muted);">${u.email}</span>
              ${u.role === "admin" ? '<span style="font-size:0.7rem; background:var(--castle-blue); color:white; padding:0.15rem 0.4rem; border-radius:4px; margin-left:0.5rem; font-weight:700;">ADMIN</span>' : ""}
            </div>
            <div style="display:flex; gap:0.4rem; align-items:center;">
              <button type="button" class="revoke-sessions-btn" data-id="${u.id}" title="Force logout — revoke all sessions" style="background:none; border:1px solid #fca5a5; cursor:pointer; color:#b91c1c; font-size:0.72rem; font-weight:700; padding:0.2rem 0.55rem; border-radius:6px; font-family:'Nunito',sans-serif;">⛔ Logout</button>
              <button type="button" class="delete-user-btn" data-id="${u.id}" style="background:none; border:none; cursor:pointer; color:#94a3b8; font-size:1.1rem;">✕</button>
            </div>
          </div>
        `).join("")}
      </div>
      <h4 style="margin:1.5rem 0 0.75rem;">Add New User</h4>
      <div class="wizard-form-grid">
        <div class="wizard-field">
          <label for="new-user-name">Display Name</label>
          <input type="text" id="new-user-name" placeholder="Mom" />
        </div>
        <div class="wizard-field">
          <label for="new-user-email">Email</label>
          <input type="email" id="new-user-email" placeholder="mom@email.com" />
        </div>
      </div>
      <div class="wizard-field" style="margin-top:0.75rem;">
        <label>Role</label>
        <div class="wizard-toggle-group">
          <button type="button" class="wizard-toggle active" data-val="member" id="role-member">Member</button>
          <button type="button" class="wizard-toggle" data-val="admin" id="role-admin">Admin</button>
        </div>
      </div>
      <button type="button" class="primary-button" id="add-user-btn" style="margin-top:1rem;">+ Add User</button>
    </div>
  `;

  let selectedRole = "member";
  section.querySelectorAll(".wizard-toggle").forEach(btn => {
    btn.addEventListener("click", () => {
      section.querySelectorAll(".wizard-toggle").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      selectedRole = btn.dataset.val;
    });
  });

  document.getElementById("add-user-btn").addEventListener("click", async () => {
    const name = document.getElementById("new-user-name").value.trim();
    const email = document.getElementById("new-user-email").value.trim();
    if (!name || !email) return alert("Name and email are required.");
    await adminFetch("/admin/users", { method: "POST", body: JSON.stringify({ name, email, role: selectedRole }) });
    renderUserManagement();
  });

  section.querySelectorAll(".delete-user-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      if (!confirm("Remove this user?")) return;
      await adminFetch(`/admin/users/${btn.dataset.id}`, { method: "DELETE" });
      renderUserManagement();
    });
  });

  section.querySelectorAll(".revoke-sessions-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      if (!confirm("Force log out this user? Their current sessions will be invalidated immediately.")) return;
      const result = await adminFetch(`/admin/users/${btn.dataset.id}/revoke-sessions`, { method: "POST" });
      alert(`✅ Revoked ${result.revoked} session${result.revoked !== 1 ? "s" : ""}.`);
    });
  });
}

// ── Venue Management ───────────────────────────────────────

const PARK_FILTERS = [
  { key: "all", label: "All", emoji: "📍" },
  { key: "magic-kingdom", label: "Magic Kingdom", emoji: "🏰", match: "magic kingdom" },
  { key: "epcot", label: "EPCOT", emoji: "🌍", match: "epcot" },
  { key: "hollywood-studios", label: "Hollywood Studios", emoji: "🎬", match: "hollywood studios" },
  { key: "animal-kingdom", label: "Animal Kingdom", emoji: "🌿", match: "animal kingdom" },
  { key: "disney-springs", label: "Disney Springs", emoji: "🛍️", match: "disney springs" },
];

const TYPE_OPTIONS = [
  "Ride / Attraction",
  "Restaurant (Table Service)",
  "Restaurant (Quick Service)",
  "Hotel / Resort",
  "Show / Entertainment",
  "Shop / Merch",
  "Character Meet & Greet",
  "Water Park",
  "Bar / Lounge",
  "Experience",
];

let currentParkFilter = "all";

async function renderVenueManagement() {
  const section = document.getElementById("admin-section-content");
  const venues = await adminFetch("/admin/venues");

  section.innerHTML = `
    <div class="wizard-step-card">
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:1rem; margin-bottom:1rem;">
        <h3 style="margin:0;">📍 Venues (${venues.length})</h3>
        <div style="display:flex; gap:0.5rem;">
          <button type="button" class="primary-button" id="add-venue-btn" style="font-size:0.85rem;">+ Add Venue</button>
          <button type="button" class="secondary-button" id="seed-venues-btn" style="font-size:0.85rem;">🌱 Seed Defaults</button>
        </div>
      </div>

      <!-- Park filter tabs -->
      <div style="display:flex; gap:0.4rem; flex-wrap:wrap; margin-bottom:1rem;" id="park-filter-tabs">
        ${PARK_FILTERS.map(p => `
          <button type="button" class="park-filter-tab ${p.key === currentParkFilter ? "active" : ""}" data-park="${p.key}" style="padding:0.35rem 0.75rem; border-radius:999px; border:1.5px solid ${p.key === currentParkFilter ? "var(--castle-blue)" : "#d1d5db"}; background:${p.key === currentParkFilter ? "var(--castle-blue)" : "white"}; color:${p.key === currentParkFilter ? "white" : "var(--ink)"}; font-family:'Nunito',sans-serif; font-size:0.78rem; font-weight:700; cursor:pointer;">
            ${p.emoji} ${p.label}
          </button>
        `).join("")}
      </div>

      <div class="wizard-field" style="margin-bottom:1rem;">
        <input type="text" id="venue-mgmt-search" placeholder="Search venues..." />
      </div>

      <div id="venue-mgmt-list" style="max-height:500px; overflow-y:auto;">
        ${venues.map(v => {
          const parkKey = detectVenuePark(v);
          return `
          <div class="venue-mgmt-row" data-name="${v.name.toLowerCase()}" data-park="${parkKey}" style="cursor:pointer;">
            <div style="flex:1; min-width:0;" class="venue-row-click" data-id="${v.id}">
              <strong>${v.name}</strong>
              <span style="font-size:0.8rem; color:var(--muted); display:block;">
                ${v.location || "No location"}
                ${v.type ? ` • <span style="font-weight:700; color:${typeColor(v.type)}">${v.type}</span>` : ""}
                ${v.avg_wait ? ` • ⏱️ ~${v.avg_wait}m` : ""}
                ${v.description ? " • 📝" : ""}
                ${v.image_url ? " • 🖼️" : ""}
                ${v.url ? " • 🔗" : ""}
                • Used ${v.use_count}×
              </span>
            </div>
            <button type="button" class="delete-venue-btn" data-id="${v.id}" style="background:none; border:none; cursor:pointer; color:#94a3b8; font-size:1rem;" title="Delete">✕</button>
          </div>`;
        }).join("")}
      </div>
    </div>

    <!-- Edit/Add Modal -->
    <div id="venue-modal-overlay" style="display:none; position:fixed; inset:0; background:rgba(0,0,0,0.5); z-index:100; display:none; align-items:center; justify-content:center;">
      <div id="venue-modal" style="background:white; border-radius:16px; padding:2rem; max-width:550px; width:90%; max-height:85vh; overflow-y:auto; box-shadow:0 20px 60px rgba(0,0,0,0.3);"></div>
    </div>
  `;

  // Filter by park
  section.querySelectorAll(".park-filter-tab").forEach(tab => {
    tab.addEventListener("click", () => {
      currentParkFilter = tab.dataset.park;
      applyVenueFilters(section);
      section.querySelectorAll(".park-filter-tab").forEach(t => {
        t.style.background = t.dataset.park === currentParkFilter ? "var(--castle-blue)" : "white";
        t.style.color = t.dataset.park === currentParkFilter ? "white" : "var(--ink)";
        t.style.borderColor = t.dataset.park === currentParkFilter ? "var(--castle-blue)" : "#d1d5db";
      });
    });
  });

  // Search filter
  document.getElementById("venue-mgmt-search").addEventListener("input", () => applyVenueFilters(section));

  // Click venue row → open edit modal
  section.querySelectorAll(".venue-row-click").forEach(row => {
    row.addEventListener("click", () => {
      const v = venues.find(x => x.id === row.dataset.id);
      if (v) openVenueModal(v);
    });
  });

  // Add venue button
  document.getElementById("add-venue-btn").addEventListener("click", () => openVenueModal(null));

  // Seed button
  document.getElementById("seed-venues-btn").addEventListener("click", async () => {
    const btn = document.getElementById("seed-venues-btn");
    btn.textContent = "Seeding..."; btn.disabled = true;
    try {
      const seedRes = await fetch("/seed-venues.json");
      const seedData = await seedRes.json();
      const result = await adminFetch("/admin/venues/seed", { method: "POST", body: JSON.stringify(seedData) });
      alert(`Done! Added ${result.added} new venues (${result.total} total).`);
      renderVenueManagement();
    } catch (err) { alert("Seed failed: " + err.message); btn.textContent = "🌱 Seed Defaults"; btn.disabled = false; }
  });

  // Delete buttons
  section.querySelectorAll(".delete-venue-btn").forEach(btn => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      if (!confirm("Delete this venue?")) return;
      await adminFetch(`/admin/venues/${btn.dataset.id}`, { method: "DELETE" });
      btn.closest(".venue-mgmt-row").remove();
    });
  });
}

function applyVenueFilters(section) {
  const q = (document.getElementById("venue-mgmt-search")?.value || "").toLowerCase();
  section.querySelectorAll(".venue-mgmt-row").forEach(row => {
    const nameMatch = row.dataset.name.includes(q);
    const parkMatch = currentParkFilter === "all" || row.dataset.park === currentParkFilter;
    row.style.display = (nameMatch && parkMatch) ? "" : "none";
  });
}

function detectVenuePark(v) {
  const loc = ((v.park || "") + " " + (v.location || "")).toLowerCase();
  if (loc.includes("magic kingdom") || loc.includes("fantasyland") || loc.includes("tomorrowland") || loc.includes("frontierland") || loc.includes("adventureland") || loc.includes("liberty square") || loc.includes("main street")) return "magic-kingdom";
  if (loc.includes("epcot") || loc.includes("world showcase") || loc.includes("world celebration") || loc.includes("world discovery") || loc.includes("world nature")) return "epcot";
  if (loc.includes("hollywood studios") || loc.includes("galaxy") || loc.includes("toy story land") || loc.includes("sunset boulevard")) return "hollywood-studios";
  if (loc.includes("animal kingdom") || loc.includes("pandora") || loc.includes("africa") || loc.includes("asia") || loc.includes("dinoland")) return "animal-kingdom";
  if (loc.includes("disney springs") || loc.includes("marketplace") || loc.includes("the landing") || loc.includes("west side")) return "disney-springs";
  return "other";
}

function typeColor(type) {
  const t = (type || "").toLowerCase();
  if (t === "ride") return "#1a3a7a";
  if (t === "dining") return "#c45e10";
  if (t === "show") return "#7c3aed";
  if (t === "merch" || t === "shopping") return "#b8860b";
  if (t === "travel") return "#059669";
  return "var(--slate)";
}

function openVenueModal(venue) {
  const overlay = document.getElementById("venue-modal-overlay");
  const modal = document.getElementById("venue-modal");
  const isNew = !venue;

  modal.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.5rem;">
      <h3 style="margin:0;">${isNew ? "➕ Add New Venue" : "✏️ Edit Venue"}</h3>
      <button type="button" id="venue-modal-close" style="background:none; border:none; font-size:1.3rem; cursor:pointer; color:#94a3b8;">✕</button>
    </div>

    <div style="display:flex; flex-direction:column; gap:1rem;">
      <div class="wizard-field">
        <label>Venue Name *</label>
        <input type="text" id="vm-name" value="${isNew ? "" : escAttr(venue.name)}" placeholder="Space Mountain" />
      </div>

      <div class="wizard-form-grid">
        <div class="wizard-field">
          <label>Type</label>
          <select id="vm-type" style="padding:0.6rem 0.9rem; border:1.5px solid #d1d5db; border-radius:10px; font-family:'Nunito',sans-serif; font-size:0.95rem; width:100%;">
            <option value="">Select type...</option>
            ${TYPE_OPTIONS.map(t => `<option value="${t}" ${(!isNew && venue.type === t) ? "selected" : ""}>${t}</option>`).join("")}
          </select>
        </div>
        <div class="wizard-field">
          <label>Avg Wait (min)</label>
          <input type="number" id="vm-wait" value="${isNew ? "" : (venue.avg_wait || "")}" placeholder="45" min="0" />
        </div>
      </div>

      <div class="wizard-field">
        <label>Location (Land, Park)</label>
        <input type="text" id="vm-location" value="${isNew ? "" : escAttr(venue.location)}" placeholder="Fantasyland, Magic Kingdom" />
      </div>

      <div class="wizard-field">
        <label>Description</label>
        <textarea id="vm-description" rows="3" style="padding:0.6rem 0.9rem; border:1.5px solid #d1d5db; border-radius:10px; font-family:'Nunito',sans-serif; font-size:0.95rem; width:100%; resize:vertical; box-sizing:border-box;" placeholder="A magical flight over London with Peter Pan...">${isNew ? "" : escAttr(venue.description || "")}</textarea>
      </div>

      <div class="wizard-field">
        <label>Disney URL</label>
        <input type="url" id="vm-url" value="${isNew ? "" : escAttr(venue.url)}" placeholder="https://disneyworld.disney.go.com/..." />
      </div>

      <div class="wizard-field">
        <label>Venue Image</label>
        ${(!isNew && venue.image_url) ? `
          <div style="margin-bottom:0.5rem;">
            <img src="/api/venues/image/${escAttr(venue.image_url)}" style="width:100%; max-height:180px; object-fit:cover; border-radius:10px;" onerror="this.style.display='none'" />
          </div>
        ` : ""}
        <div style="display:flex; align-items:center; gap:0.75rem;">
          <label style="display:inline-flex; align-items:center; gap:0.5rem; padding:0.5rem 1rem; background:var(--castle-blue); color:white; border-radius:10px; cursor:pointer; font-family:'Nunito',sans-serif; font-size:0.85rem; font-weight:700;">
            📷 ${(!isNew && venue.image_url) ? "Change Image" : "Upload Image"}
            <input type="file" id="vm-image-file" accept="image/*" style="display:none;" />
          </label>
          <span id="vm-image-status" style="font-size:0.8rem; color:var(--muted);">${(!isNew && venue.image_url) ? "Image uploaded ✓" : "No image"}</span>
        </div>
      </div>

      <div class="wizard-field">
        <label>Tags (comma separated)</label>
        <input type="text" id="vm-tags" value="${isNew ? "" : escAttr(venue.tags || "")}" placeholder="thrill, dark ride, classic, must-do" />
      </div>

      <div style="display:flex; gap:0.75rem; margin-top:0.5rem;">
        <button type="button" class="primary-button" id="vm-save" style="flex:1;">${isNew ? "Add Venue" : "Save Changes"}</button>
        <button type="button" class="secondary-button" id="vm-cancel" style="flex:0.5;">Cancel</button>
      </div>
    </div>
  `;

  overlay.style.display = "flex";

  document.getElementById("venue-modal-close").addEventListener("click", () => overlay.style.display = "none");
  document.getElementById("vm-cancel").addEventListener("click", () => overlay.style.display = "none");
  overlay.addEventListener("click", (e) => { if (e.target === overlay) overlay.style.display = "none"; });

  // Track selected image file
  let pendingImageFile = null;
  const imageInput = document.getElementById("vm-image-file");
  if (imageInput) {
    imageInput.addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (file) {
        pendingImageFile = file;
        document.getElementById("vm-image-status").textContent = file.name;
        document.getElementById("vm-image-status").style.color = "var(--castle-blue)";
      }
    });
  }

  document.getElementById("vm-save").addEventListener("click", async () => {
    const data = {
      name: document.getElementById("vm-name").value.trim(),
      type: document.getElementById("vm-type").value,
      location: document.getElementById("vm-location").value.trim(),
      description: document.getElementById("vm-description").value.trim(),
      url: document.getElementById("vm-url").value.trim(),
      image_url: isNew ? "" : (venue.image_url || ""),
      avg_wait: parseInt(document.getElementById("vm-wait").value) || 0,
      tags: document.getElementById("vm-tags").value.trim(),
      park: "", land: "",
    };
    if (!data.name) { alert("Name is required"); return; }

    const saveBtn = document.getElementById("vm-save");
    saveBtn.textContent = "Saving...";
    saveBtn.disabled = true;

    try {
      let venueId;

      if (isNew) {
        const result = await adminFetch("/admin/venues", { method: "POST", body: JSON.stringify(data) });
        venueId = result.id;
      } else {
        venueId = venue.id;
        await adminFetch(`/admin/venues/${venue.id}`, { method: "PUT", body: JSON.stringify(data) });
      }

      // Upload image if one was selected
      if (pendingImageFile && venueId) {
        const formData = new FormData();
        formData.append("image", pendingImageFile);
        await fetch(`/api/admin/venues/${venueId}/image`, {
          method: "POST",
          headers: { "Authorization": `Bearer ${getAuthToken()}` },
          body: formData,
        });
      }

      overlay.style.display = "none";
      renderVenueManagement();
    } catch (err) {
      alert("Error: " + err.message);
      saveBtn.textContent = isNew ? "Add Venue" : "Save Changes";
      saveBtn.disabled = false;
    }
  });
}

function escAttr(s) { return String(s || "").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

// ── Pending Changes ────────────────────────────────────────

async function renderPendingChanges() {
  const section = document.getElementById("admin-section-content");
  const pending = await adminFetch("/admin/pending");

  section.innerHTML = `
    <div class="wizard-step-card">
      <h3>📋 Pending Venue Changes (${pending.length})</h3>
      ${pending.length === 0 ? `<p style="color:var(--muted); text-align:center; padding:2rem 0;">No pending changes. All caught up!</p>` : ""}
      <div id="pending-list">
        ${pending.map(p => `
          <div style="padding:1rem; border:1.5px solid #e2e8f0; border-radius:12px; margin-bottom:0.75rem; background:white;">
            <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:0.5rem;">
              <div>
                <span style="font-size:0.7rem; font-weight:800; text-transform:uppercase; letter-spacing:0.06em; color:${p.change_type === "new" ? "var(--sky-blue)" : "var(--pixie-gold-dark)"}; background:${p.change_type === "new" ? "#dbeafe" : "#fef3c7"}; padding:0.15rem 0.5rem; border-radius:4px;">${p.change_type === "new" ? "New Venue" : "Update"}</span>
                <span style="font-size:0.75rem; color:var(--muted); margin-left:0.5rem;">by ${p.submitted_by}</span>
              </div>
              <span style="font-size:0.75rem; color:var(--muted);">${new Date(p.created).toLocaleDateString()}</span>
            </div>
            <strong style="font-size:1.1rem;">${p.venue_name}</strong>
            <p style="margin:0.25rem 0; font-size:0.9rem; color:var(--slate);">
              ${p.venue_location || "No location"} ${p.venue_url ? "• 🔗 Has link" : ""} ${p.venue_type ? `• ${p.venue_type}` : ""}
            </p>
            <div style="display:flex; gap:0.5rem; margin-top:0.75rem;">
              <button type="button" class="primary-button approve-btn" data-id="${p.id}" style="flex:1; font-size:0.85rem;">✅ Approve</button>
              <button type="button" class="danger-button reject-btn" data-id="${p.id}" style="flex:1; font-size:0.85rem;">❌ Reject</button>
            </div>
          </div>
        `).join("")}
      </div>
    </div>
  `;

  section.querySelectorAll(".approve-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      await adminFetch(`/admin/pending/${btn.dataset.id}/approve`, { method: "POST" });
      renderPendingChanges();
    });
  });

  section.querySelectorAll(".reject-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      await adminFetch(`/admin/pending/${btn.dataset.id}/reject`, { method: "POST" });
      renderPendingChanges();
    });
  });
}

// Add venue management row styles
const adminStyles = document.createElement("style");
adminStyles.textContent = `
  .venue-mgmt-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.6rem 0.75rem;
    border-bottom: 1px solid #f1f5f9;
  }
  .venue-mgmt-row:hover { background: #f8fafc; }
`;
document.head.appendChild(adminStyles);

// ============================================================
// PARK PULSE STATUS — Admin Section
// ============================================================

async function renderParkPulseStatus() {
  const section = document.getElementById("admin-section-content");

  section.innerHTML = `
    <div class="wizard-step-card">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.25rem;">
        <h3 style="margin:0;">🎢 Park Pulse Status</h3>
        <div style="display:flex; gap:0.5rem;">
          <button type="button" class="primary-button" id="pulse-view-data-btn" style="font-size:0.82rem;">📊 View Data</button>
          <button type="button" class="secondary-button" id="pulse-status-refresh" style="font-size:0.82rem;">↻ Refresh</button>
        </div>
      </div>
      <div id="pulse-status-body">
        <div style="text-align:center; padding:2rem; color:var(--muted);">
          Loading collector status…
        </div>
      </div>
    </div>
  `;

  document.getElementById("pulse-status-refresh").addEventListener("click", renderParkPulseStatus);
  document.getElementById("pulse-view-data-btn").addEventListener("click", openPulseDataModal);
  await loadPulseStatus();
}

async function loadPulseStatus() {
  const body = document.getElementById("pulse-status-body");
  if (!body) return;

  let stats;
  try {
    stats = await adminFetch("/wait-times/status");
  } catch (e) {
    body.innerHTML = `
      <div style="text-align:center; padding:2rem;">
        <p style="font-size:2rem;">⚠️</p>
        <p style="color:var(--muted);">Could not load pulse status.<br><small>${e.message}</small></p>
      </div>
    `;
    return;
  }

  if (!stats.available) {
    const nextAt = stats.next_sample_at || "next :00/:15/:30/:45 mark";

    // Parks open check (Eastern Time)
    const etHour = parseInt(new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York", hour: "numeric", hour12: false,
    }).format(new Date()), 10);
    const parksOpenNow = etHour >= 8 && etHour < 24;

    const nextBanner = parksOpenNow
      ? `<div style="display:inline-flex; align-items:center; gap:0.5rem; background:#f0fdf4;
           border:1.5px solid #86efac; border-radius:10px; padding:0.5rem 1rem; margin-top:0.75rem;">
           <span>🟢</span>
           <span style="font-size:0.88rem; color:#166534; font-weight:700;">
             Parks are open — next scheduled sample: <strong>${nextAt}</strong>
           </span>
         </div>`
      : `<div style="display:inline-flex; align-items:center; gap:0.5rem; background:#fefce8;
           border:1.5px solid #fbbf24; border-radius:10px; padding:0.5rem 1rem; margin-top:0.75rem;">
           <span>🌙</span>
           <span style="font-size:0.88rem; color:#92400e; font-weight:700;">
             Parks are closed right now — collector will skip until opening. Next check: <strong>${nextAt}</strong>
           </span>
         </div>`;

    body.innerHTML = `
      <div style="padding:1.5rem; background:#f8fafc; border-radius:14px;">

        <div style="display:flex; align-items:flex-start; gap:1rem; margin-bottom:1.5rem;">
          <span style="font-size:2rem; flex-shrink:0;">⏳</span>
          <div>
            <h4 style="margin:0 0 0.35rem;">No samples recorded yet</h4>
            <p style="color:var(--muted); margin:0; font-size:0.9rem;">
              The collector is running but hasn't written data yet. This is normal right after
              a fresh container start — the first sample fires at the next 15-minute mark,
              and only when at least one park is open.
            </p>
            ${nextBanner}
          </div>
        </div>

        <div style="border-top:1px solid #e2e8f0; padding-top:1.25rem;">
          <p style="font-family:'Nunito',sans-serif; font-size:0.72rem; font-weight:800;
            text-transform:uppercase; letter-spacing:0.06em; color:var(--muted); margin:0 0 0.75rem;">
            If you're not seeing data after the expected time, run these diagnostics on moonpi1
          </p>

          <div style="display:flex; flex-direction:column; gap:0.6rem;">

            <div style="background:#1e293b; border-radius:10px; padding:0.75rem 1rem;">
              <div style="font-size:0.68rem; font-weight:700; text-transform:uppercase;
                letter-spacing:0.06em; color:#64748b; margin-bottom:0.4rem;">
                1 · Check collector logs for errors
              </div>
              <code style="color:#7dd3fc; font-size:0.82rem; font-family:monospace; word-break:break-all;">
                docker logs disney_api_dev -f --tail=50
              </code>
              <div style="font-size:0.75rem; color:#94a3b8; margin-top:0.4rem;">
                Look for
                <code style="color:#a5f3fc;">🎢 Collecting</code> or
                <code style="color:#a5f3fc;">🌙 All parks closed</code> —
                any other output indicates an error
              </div>
            </div>

            <div style="background:#1e293b; border-radius:10px; padding:0.75rem 1rem;">
              <div style="font-size:0.68rem; font-weight:700; text-transform:uppercase;
                letter-spacing:0.06em; color:#64748b; margin-bottom:0.4rem;">
                2 · Confirm the /waittimes mount exists and is writable
              </div>
              <code style="color:#7dd3fc; font-size:0.82rem; font-family:monospace; word-break:break-all;">
                ls /mnt/motherbrain/ironwolf_02/disney-wait-times/
              </code>
              <div style="font-size:0.75rem; color:#94a3b8; margin-top:0.4rem;">
                Should show <code style="color:#a5f3fc;">waittimes.db</code> once the first sample fires.
                If the directory is missing: <code style="color:#a5f3fc;">sudo mkdir -p /mnt/motherbrain/ironwolf_02/disney-wait-times</code>
              </div>
            </div>

            <div style="background:#1e293b; border-radius:10px; padding:0.75rem 1rem;">
              <div style="font-size:0.68rem; font-weight:700; text-transform:uppercase;
                letter-spacing:0.06em; color:#64748b; margin-bottom:0.4rem;">
                3 · Confirm both processes are running inside the container
              </div>
              <code style="color:#7dd3fc; font-size:0.82rem; font-family:monospace; word-break:break-all;">
                docker exec disney_api_dev ps aux
              </code>
              <div style="font-size:0.75rem; color:#94a3b8; margin-top:0.4rem;">
                Should show two <code style="color:#a5f3fc;">node</code> processes:
                <code style="color:#a5f3fc;">server.js</code> and <code style="color:#a5f3fc;">wait-collector.js</code>
              </div>
            </div>

            <div style="background:#1e293b; border-radius:10px; padding:0.75rem 1rem;">
              <div style="font-size:0.68rem; font-weight:700; text-transform:uppercase;
                letter-spacing:0.06em; color:#64748b; margin-bottom:0.4rem;">
                4 · Force a full rebuild if something looks wrong
              </div>
              <code style="color:#7dd3fc; font-size:0.82rem; font-family:monospace; word-break:break-all; white-space:pre-wrap;">cd /homelab/disney/disney-site-dev
docker compose down
docker compose build --no-cache disney-api
docker compose up -d</code>
            </div>

          </div>

          <p style="font-size:0.75rem; color:var(--muted); margin:1rem 0 0; text-align:center;">
            Hit <strong>↻ Refresh</strong> after the expected sample time — this panel updates automatically once data arrives.
          </p>
        </div>

      </div>
    `;
    return;
  }

  const minsAgo = stats.mins_since_last_sample;
  let healthDot, healthLabel, healthColor;
  if (minsAgo === null) {
    healthDot = "⚫"; healthLabel = "No data";                        healthColor = "#94a3b8";
  } else if (minsAgo <= 20) {
    healthDot = "🟢"; healthLabel = "Healthy";                        healthColor = "#16a34a";
  } else if (minsAgo <= 45) {
    healthDot = "🟡"; healthLabel = "Delayed";                        healthColor = "#ca8a04";
  } else {
    healthDot = "🔴"; healthLabel = "Stale — collector may be down";  healthColor = "#dc2626";
  }

  function fmtAgo(mins) {
    if (mins === null) return "—";
    if (mins < 1)  return "just now";
    if (mins < 60) return `${Math.round(mins)}m ago`;
    const h = Math.floor(mins / 60), m = Math.round(mins % 60);
    return m > 0 ? `${h}h ${m}m ago` : `${h}h ago`;
  }

  function fmtDate(iso) {
    if (!iso) return "—";
    return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }

  function fmtDateTime(iso) {
    if (!iso) return "—";
    return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  }

  let nextSampleHtml = "—";
  if (minsAgo !== null) {
    const minsUntilNext = Math.max(0, 15 - minsAgo);
    nextSampleHtml = minsUntilNext < 1
      ? `<span style="color:#16a34a; font-weight:700;">Due now</span>`
      : `<span style="color:var(--castle-blue); font-weight:700;">~${Math.round(minsUntilNext)}m</span>`;
  }

  const PARK_EMOJI = {
    "Magic Kingdom": "🏰", "EPCOT": "🌍",
    "Hollywood Studios": "🎬", "Animal Kingdom": "🦁",
  };

  const parkRows = (stats.parks || []).map(p => {
    const emoji  = PARK_EMOJI[p.park_name] || "🎡";
    const pctBar = Math.min(100, Math.round((p.today_samples / Math.max(p.today_samples, 96)) * 100));
    return `
      <div style="display:flex; align-items:center; gap:0.75rem; padding:0.65rem 0; border-bottom:1px solid #f1f5f9;">
        <span style="font-size:1.1rem; flex-shrink:0;">${emoji}</span>
        <div style="flex:1; min-width:0;">
          <div style="display:flex; justify-content:space-between; align-items:baseline; gap:0.5rem;">
            <span style="font-family:'Mouse Memoirs',sans-serif; font-size:1rem; color:var(--castle-blue);">${p.park_name}</span>
            <span style="font-size:0.75rem; color:var(--muted); white-space:nowrap;">${p.today_samples} samples today</span>
          </div>
          <div style="height:5px; background:#e2e8f0; border-radius:999px; margin-top:0.3rem; overflow:hidden;">
            <div style="height:100%; width:${pctBar}%; background:var(--castle-blue); border-radius:999px;"></div>
          </div>
        </div>
        <span style="font-size:0.8rem; font-weight:700; color:${p.today_samples > 0 ? "#16a34a" : "#94a3b8"}; flex-shrink:0;">
          ${p.today_samples > 0 ? "✓" : "—"}
        </span>
      </div>
    `;
  }).join("");

  const bannerBg    = minsAgo !== null && minsAgo <= 20 ? "#f0fdf4" : minsAgo !== null && minsAgo <= 45 ? "#fefce8" : "#fef2f2";
  const collectorMsg = minsAgo !== null && minsAgo <= 20 ? "sampling on schedule"
                     : minsAgo !== null && minsAgo <= 45 ? "running slightly behind"
                     : "not responding — check Docker logs";

  body.innerHTML = `
    <div style="display:flex; align-items:center; gap:1rem; padding:1rem 1.25rem;
      background:${bannerBg}; border:1.5px solid ${healthColor}30;
      border-left:4px solid ${healthColor}; border-radius:12px; margin-bottom:1.25rem;">
      <span style="font-size:1.5rem;">${healthDot}</span>
      <div>
        <div style="font-family:'Mouse Memoirs',sans-serif; font-size:1.1rem; color:${healthColor}; letter-spacing:0.03em;">${healthLabel}</div>
        <div style="font-size:0.78rem; color:var(--muted); margin-top:0.1rem;">Collector is ${collectorMsg}</div>
      </div>
    </div>

    <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(140px, 1fr)); gap:0.75rem; margin-bottom:1.25rem;">

      <div class="info-card" style="padding:1rem; text-align:center;">
        <div style="font-size:1.6rem; margin-bottom:0.25rem;">📅</div>
        <div style="font-family:'Nunito',sans-serif; font-size:0.7rem; font-weight:800; text-transform:uppercase; letter-spacing:0.06em; color:var(--muted);">Data since</div>
        <div style="font-weight:800; font-size:0.95rem; color:var(--castle-blue); margin-top:0.2rem;">${fmtDate(stats.oldest_sample)}</div>
      </div>

      <div class="info-card" style="padding:1rem; text-align:center;">
        <div style="font-size:1.6rem; margin-bottom:0.25rem;">🕐</div>
        <div style="font-family:'Nunito',sans-serif; font-size:0.7rem; font-weight:800; text-transform:uppercase; letter-spacing:0.06em; color:var(--muted);">Last sample</div>
        <div style="font-weight:800; font-size:0.95rem; color:var(--castle-blue); margin-top:0.2rem;">${fmtAgo(minsAgo)}</div>
        <div style="font-size:0.72rem; color:var(--muted);">${fmtDateTime(stats.last_sample_at)}</div>
      </div>

      <div class="info-card" style="padding:1rem; text-align:center;">
        <div style="font-size:1.6rem; margin-bottom:0.25rem;">⏭</div>
        <div style="font-family:'Nunito',sans-serif; font-size:0.7rem; font-weight:800; text-transform:uppercase; letter-spacing:0.06em; color:var(--muted);">Next sample</div>
        <div style="font-size:0.95rem; margin-top:0.2rem;">${nextSampleHtml}</div>
      </div>

      <div class="info-card" style="padding:1rem; text-align:center;">
        <div style="font-size:1.6rem; margin-bottom:0.25rem;">📊</div>
        <div style="font-family:'Nunito',sans-serif; font-size:0.7rem; font-weight:800; text-transform:uppercase; letter-spacing:0.06em; color:var(--muted);">Total samples</div>
        <div style="font-weight:800; font-size:0.95rem; color:var(--castle-blue); margin-top:0.2rem;">${stats.total_summary_rows.toLocaleString()}</div>
        <div style="font-size:0.72rem; color:var(--muted);">park summaries stored</div>
      </div>

      <div class="info-card" style="padding:1rem; text-align:center;">
        <div style="font-size:1.6rem; margin-bottom:0.25rem;">🗓</div>
        <div style="font-family:'Nunito',sans-serif; font-size:0.7rem; font-weight:800; text-transform:uppercase; letter-spacing:0.06em; color:var(--muted);">Days of history</div>
        <div style="font-weight:800; font-size:0.95rem; color:var(--castle-blue); margin-top:0.2rem;">${stats.days_of_history ?? "—"}</div>
        <div style="font-size:0.72rem; color:var(--muted);">30-day max retention</div>
      </div>

      <div class="info-card" style="padding:1rem; text-align:center;">
        <div style="font-size:1.6rem; margin-bottom:0.25rem;">🎢</div>
        <div style="font-family:'Nunito',sans-serif; font-size:0.7rem; font-weight:800; text-transform:uppercase; letter-spacing:0.06em; color:var(--muted);">Attraction rows</div>
        <div style="font-weight:800; font-size:0.95rem; color:var(--castle-blue); margin-top:0.2rem;">${stats.total_snapshot_rows.toLocaleString()}</div>
        <div style="font-size:0.72rem; color:var(--muted);">individual wait times</div>
      </div>

    </div>

    <div style="background:#f8fafc; border-radius:12px; padding:1rem;">
      <p style="font-family:'Nunito',sans-serif; font-size:0.72rem; font-weight:800; text-transform:uppercase;
        letter-spacing:0.06em; color:var(--muted); margin:0 0 0.5rem;">Today's coverage</p>
      ${parkRows || `<p style="color:var(--muted); font-size:0.85rem; text-align:center; padding:1rem 0;">No samples recorded today yet.</p>`}
    </div>

    <p style="font-size:0.7rem; color:var(--muted); text-align:center; margin:1rem 0 0;">
      Collector skips parks that are closed · Data purged after 30 days (summaries after 90)
    </p>
  `;
}


// ============================================================
// PARK PULSE DATA VIEWER MODAL
// 5 views: Live, Trend, Comparison, History, Hop Ranking
// Uses Chart.js via CDN
// ============================================================

const PULSE_PARK_IDS = {
  "Magic Kingdom":     "75ea578a-adc8-4116-a54d-dccb60765ef9",
  "EPCOT":             "47f90d2c-e191-4239-a466-5892ef59a88b",
  "Hollywood Studios": "288747d1-8b4f-4a64-867e-ea7c9b27bad8",
  "Animal Kingdom":    "1c84a229-8862-4648-9c71-378ddd2c7693",
};
const PULSE_PARK_LIST = Object.entries(PULSE_PARK_IDS).map(([name, id]) => ({ name, id }));
const PULSE_COLORS = {
  "Magic Kingdom":     { line: "#0030A0", bg: "rgba(0,48,160,0.12)"     },
  "EPCOT":             { line: "#007A5E", bg: "rgba(0,122,94,0.12)"     },
  "Hollywood Studios": { line: "#9B2335", bg: "rgba(155,35,53,0.12)"    },
  "Animal Kingdom":    { line: "#2D6A4F", bg: "rgba(45,106,79,0.12)"    },
};
const PULSE_EMOJI = {
  "Magic Kingdom": "🏰", "EPCOT": "🌍",
  "Hollywood Studios": "🎬", "Animal Kingdom": "🦁",
};

let pulseChartInstances = [];

function destroyPulseCharts() {
  pulseChartInstances.forEach(c => { try { c.destroy(); } catch(e) {} });
  pulseChartInstances = [];
}

async function loadChartJs() {
  if (window.Chart) return;
  await new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js";
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

function ensurePulseModal() {
  if (document.getElementById("pulse-data-modal-overlay")) return;
  document.body.insertAdjacentHTML("beforeend", `
    <div id="pulse-data-modal-overlay" style="
      display:none; position:fixed; inset:0; background:rgba(0,0,0,0.55);
      z-index:1000; align-items:flex-start; justify-content:center;
      padding:2rem 1rem; overflow-y:auto;">
      <div style="
        background:var(--warm-cream, #FFFDF4); border-radius:20px;
        width:100%; max-width:860px; min-height:400px;
        box-shadow:0 20px 60px rgba(0,0,0,0.25); overflow:hidden;
        margin:auto;">
        <!-- Modal header -->
        <div style="
          display:flex; align-items:center; justify-content:space-between;
          padding:1.25rem 1.5rem;
          background:var(--castle-blue,#0030A0); color:white;">
          <div style="display:flex; align-items:center; gap:0.75rem;">
            <span style="font-size:1.4rem;">🎢</span>
            <div>
              <div style="font-family:'Mouse Memoirs',sans-serif; font-size:1.3rem; letter-spacing:0.04em;">Park Pulse Data</div>
              <div style="font-size:0.72rem; opacity:0.75; font-family:'Nunito',sans-serif;">Wait time history &amp; trends</div>
            </div>
          </div>
          <button id="pulse-data-modal-close" style="
            background:rgba(255,255,255,0.15); border:none; color:white;
            border-radius:8px; width:2rem; height:2rem; font-size:1.1rem;
            cursor:pointer; display:flex; align-items:center; justify-content:center;">✕</button>
        </div>
        <!-- Tab bar -->
        <div style="display:flex; background:#f1f5f9; border-bottom:1px solid #e2e8f0; overflow-x:auto;">
          ${[
            ["live",       "📡 Live"],
            ["trend",      "📈 Trend"],
            ["compare",    "⚖️ Compare"],
            ["history",    "🗓 History"],
            ["hop",        "🎯 Hop Ranking"],
            ["ride",       "🎢 Ride History"],
          ].map(([key, label]) => `
            <button class="pulse-tab-btn" data-tab="${key}" style="
              flex-shrink:0; padding:0.75rem 1.1rem; border:none; background:none;
              font-family:'Nunito',sans-serif; font-size:0.82rem; font-weight:700;
              color:var(--muted); cursor:pointer; border-bottom:3px solid transparent;
              white-space:nowrap; transition:color 0.15s;">
              ${label}
            </button>
          `).join("")}
        </div>
        <!-- Tab content -->
        <div id="pulse-tab-content" style="padding:1.5rem; min-height:300px;">
          <div style="text-align:center; padding:3rem; color:var(--muted);">Loading…</div>
        </div>
      </div>
    </div>
  `);

  document.getElementById("pulse-data-modal-close").addEventListener("click", closePulseDataModal);
  document.getElementById("pulse-data-modal-overlay").addEventListener("click", e => {
    if (e.target === e.currentTarget) closePulseDataModal();
  });

  document.querySelectorAll(".pulse-tab-btn").forEach(btn => {
    btn.addEventListener("click", () => switchPulseTab(btn.dataset.tab));
  });
}

function openPulseDataModal() {
  ensurePulseModal();
  document.getElementById("pulse-data-modal-overlay").style.display = "flex";
  switchPulseTab("live");
}

function closePulseDataModal() {
  destroyPulseCharts();
  const overlay = document.getElementById("pulse-data-modal-overlay");
  if (overlay) overlay.style.display = "none";
}

function setActiveTab(tabKey) {
  document.querySelectorAll(".pulse-tab-btn").forEach(btn => {
    const active = btn.dataset.tab === tabKey;
    btn.style.color        = active ? "var(--castle-blue)" : "var(--muted)";
    btn.style.borderBottom = active ? "3px solid var(--castle-blue)" : "3px solid transparent";
    btn.style.background   = active ? "white" : "none";
  });
}

async function switchPulseTab(tabKey) {
  destroyPulseCharts();
  setActiveTab(tabKey);
  const content = document.getElementById("pulse-tab-content");
  content.innerHTML = `<div style="text-align:center;padding:3rem;color:var(--muted);">Loading…</div>`;

  await loadChartJs();

  switch (tabKey) {
    case "live":    await renderPulseTabLive(content);    break;
    case "trend":   await renderPulseTabTrend(content);   break;
    case "compare": await renderPulseTabCompare(content); break;
    case "history": await renderPulseTabHistory(content); break;
    case "hop":     await renderPulseTabHop(content);     break;
    case "ride":    await renderPulseTabRide(content);    break;
  }
}

// ── Helper ────────────────────────────────────────────────
function pulseLoading(content) {
  content.innerHTML = `<div style="text-align:center;padding:3rem;color:var(--muted);">Loading…</div>`;
}
function pulseError(content, msg) {
  content.innerHTML = `<div style="text-align:center;padding:2rem;">
    <p style="font-size:2rem;">⚠️</p>
    <p style="color:var(--muted);">${msg}</p>
  </div>`;
}
function todayET() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
}
function fmtHour(h) {
  const n = parseInt(h, 10);
  if (n === 0)  return "12am";
  if (n < 12)   return `${n}am`;
  if (n === 12) return "12pm";
  return `${n - 12}pm`;
}

// ── TAB 1: Live wait times ────────────────────────────────
async function renderPulseTabLive(content) {
  try {
    const results = await Promise.all(
      PULSE_PARK_LIST.map(p => adminFetch(`/wait-times/live/${p.id}`))
    );

    let html = `<div style="display:flex; flex-direction:column; gap:1.5rem;">`;

    results.forEach((data, i) => {
      const park = PULSE_PARK_LIST[i];
      const col  = PULSE_COLORS[park.name];
      const emoji = PULSE_EMOJI[park.name];

      if (!data.available) {
        html += `
          <div style="background:#f8fafc; border-radius:12px; padding:1rem;">
            <p style="font-family:'Mouse Memoirs',sans-serif; color:var(--castle-blue);">${emoji} ${park.name}</p>
            <p style="color:var(--muted); font-size:0.85rem;">No data yet for this park.</p>
          </div>`;
        return;
      }

      const sampledAt = new Date(data.sampled_at).toLocaleTimeString("en-US", {
        hour: "numeric", minute: "2-digit", timeZone: "America/New_York",
      }) + " ET";

      const operating = data.attractions.filter(a => a.status === "OPERATING" && a.wait_minutes !== null);
      const top5 = operating.slice(0, 5);

      html += `
        <div style="background:#f8fafc; border-radius:12px; overflow:hidden;">
          <div style="background:${col.line}; color:white; padding:0.75rem 1rem;
            display:flex; justify-content:space-between; align-items:center;">
            <span style="font-family:'Mouse Memoirs',sans-serif; font-size:1.1rem; letter-spacing:0.03em;">
              ${emoji} ${park.name}
            </span>
            <span style="font-size:0.72rem; opacity:0.8;">as of ${sampledAt}</span>
          </div>
          <div style="padding:0.75rem 1rem;">
            ${data.attractions.length === 0
              ? `<p style="color:var(--muted); font-size:0.85rem; text-align:center; padding:0.5rem 0;">No attraction data available.</p>`
              : `
                <!-- Top waits bar chart -->
                <p style="font-size:0.7rem; font-weight:800; text-transform:uppercase;
                  letter-spacing:0.06em; color:var(--muted); margin:0.25rem 0 0.6rem;">
                  Top wait times right now
                </p>
                <div style="position:relative; height:160px; margin-bottom:0.75rem;">
                  <canvas id="live-chart-${i}"></canvas>
                </div>
                <!-- Full list -->
                <details style="margin-top:0.5rem;">
                  <summary style="font-size:0.78rem; font-weight:700; color:var(--castle-blue);
                    cursor:pointer; list-style:none; user-select:none;">
                    ▸ All attractions (${data.attractions.length})
                  </summary>
                  <div style="margin-top:0.5rem; display:flex; flex-direction:column; gap:2px;">
                    ${data.attractions.map(a => {
                      const statusDot = a.status === "OPERATING" ? "🟢" : a.status === "DOWN" ? "🔴" : "⚫";
                      const waitStr = a.status !== "OPERATING" ? `<em style="color:var(--muted);font-size:0.8rem;">${a.status.toLowerCase()}</em>`
                                    : a.wait_minutes !== null   ? `<strong>${a.wait_minutes} min</strong>`
                                    : `<span style="color:var(--muted);">—</span>`;
                      return `<div style="display:flex; align-items:center; gap:0.5rem;
                        padding:0.3rem 0; border-bottom:1px solid #f1f5f9; font-size:0.82rem;">
                        <span style="font-size:0.65rem;">${statusDot}</span>
                        <span style="flex:1; color:var(--slate);">${a.attraction_name}</span>
                        <span>${waitStr}</span>
                      </div>`;
                    }).join("")}
                  </div>
                </details>
              `
            }
          </div>
        </div>`;
    });

    html += `</div>`;
    content.innerHTML = html;

    // Draw bar charts
    results.forEach((data, i) => {
      const park = PULSE_PARK_LIST[i];
      const col  = PULSE_COLORS[park.name];
      const operating = data.attractions?.filter(a => a.status === "OPERATING" && a.wait_minutes !== null) || [];
      const top5 = operating.slice(0, 5);
      if (!top5.length) return;

      const canvas = document.getElementById(`live-chart-${i}`);
      if (!canvas) return;

      const chart = new Chart(canvas, {
        type: "bar",
        data: {
          labels: top5.map(a => a.attraction_name.length > 22 ? a.attraction_name.slice(0, 20) + "…" : a.attraction_name),
          datasets: [{ data: top5.map(a => a.wait_minutes), backgroundColor: col.line, borderRadius: 6 }],
        },
        options: {
          indexAxis: "y",
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            x: { beginAtZero: true, ticks: { font: { size: 10 } }, grid: { color: "#f1f5f9" } },
            y: { ticks: { font: { size: 10 } }, grid: { display: false } },
          },
        },
      });
      pulseChartInstances.push(chart);
    });

  } catch(e) {
    pulseError(content, "Could not load live data: " + e.message);
  }
}

// ── TAB 2: Hourly trend for a selected day ────────────────
async function renderPulseTabTrend(content) {
  const today = todayET();
  content.innerHTML = `
    <div style="display:flex; align-items:center; gap:0.75rem; margin-bottom:1.25rem; flex-wrap:wrap;">
      <label style="font-size:0.82rem; font-weight:700; color:var(--slate);">Park:</label>
      <select id="trend-park-select" style="padding:0.4rem 0.75rem; border:1.5px solid #d1d5db;
        border-radius:8px; font-family:'Nunito',sans-serif; font-size:0.85rem;">
        ${PULSE_PARK_LIST.map(p => `<option value="${p.id}" data-name="${p.name}">${PULSE_EMOJI[p.name]} ${p.name}</option>`).join("")}
      </select>
      <label style="font-size:0.82rem; font-weight:700; color:var(--slate);">Date:</label>
      <input type="date" id="trend-date-input" value="${today}" max="${today}"
        style="padding:0.4rem 0.75rem; border:1.5px solid #d1d5db; border-radius:8px;
        font-family:'Nunito',sans-serif; font-size:0.85rem;" />
      <button type="button" class="primary-button" id="trend-load-btn" style="font-size:0.82rem;">Load</button>
    </div>
    <div id="trend-chart-area" style="position:relative; height:280px;">
      <div style="text-align:center; padding:2rem; color:var(--muted);">Select a park and date, then hit Load.</div>
    </div>
    <div id="trend-stats" style="margin-top:1rem;"></div>
  `;

  document.getElementById("trend-load-btn").addEventListener("click", () => loadTrendChart());
  // Auto-load today for first park
  loadTrendChart();
}

async function loadTrendChart() {
  const parkId   = document.getElementById("trend-park-select").value;
  const parkName = document.getElementById("trend-park-select").selectedOptions[0]?.dataset.name || "";
  const date     = document.getElementById("trend-date-input").value;
  const area     = document.getElementById("trend-chart-area");
  const statsEl  = document.getElementById("trend-stats");
  if (!area) return;

  destroyPulseCharts();
  area.innerHTML = `<div style="text-align:center;padding:2rem;color:var(--muted);">Loading…</div>`;

  try {
    const data = await adminFetch(`/wait-times/trends/${parkId}?date=${date}`);
    if (!data.available || !data.trend?.length) {
      area.innerHTML = `<div style="text-align:center;padding:2rem;color:var(--muted);">No trend data for this park on ${date}.</div>`;
      statsEl.innerHTML = "";
      return;
    }

    const col = PULSE_COLORS[parkName] || { line: "#0030A0", bg: "rgba(0,48,160,0.12)" };
    const labels   = data.trend.map(t => fmtHour(t.hour));
    const avgWaits = data.trend.map(t => t.avg_wait);

    area.innerHTML = `<canvas id="trend-canvas"></canvas>`;
    const chart = new Chart(document.getElementById("trend-canvas"), {
      type: "line",
      data: {
        labels,
        datasets: [{
          label: "Avg wait (min)",
          data: avgWaits,
          borderColor: col.line,
          backgroundColor: col.bg,
          fill: true,
          tension: 0.35,
          pointRadius: 4,
          pointHoverRadius: 6,
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { color: "#f1f5f9" }, ticks: { font: { size: 10 } } },
          y: { beginAtZero: true, grid: { color: "#f1f5f9" }, ticks: { font: { size: 10 } } },
        },
      },
    });
    pulseChartInstances.push(chart);

    const maxWait = Math.max(...avgWaits);
    const minWait = Math.min(...avgWaits);
    const avgAll  = Math.round(avgWaits.reduce((a,b)=>a+b,0) / avgWaits.length);
    const peakHour = labels[avgWaits.indexOf(maxWait)];

    statsEl.innerHTML = `
      <div style="display:flex; gap:0.75rem; flex-wrap:wrap;">
        ${[
          ["Peak wait",  `${maxWait} min @ ${peakHour}`],
          ["Lowest wait", `${minWait} min`],
          ["Day average", `${avgAll} min`],
          ["Samples",     data.trend.reduce((s,t) => s + t.sample_count, 0)],
        ].map(([label, val]) => `
          <div style="flex:1; min-width:100px; background:#f8fafc; border-radius:10px;
            padding:0.6rem 0.75rem; text-align:center;">
            <div style="font-size:0.68rem; font-weight:800; text-transform:uppercase;
              letter-spacing:0.06em; color:var(--muted);">${label}</div>
            <div style="font-weight:800; color:var(--castle-blue); margin-top:0.2rem;">${val}</div>
          </div>`).join("")}
      </div>`;

  } catch(e) {
    pulseError(area, "Could not load trend: " + e.message);
  }
}

// ── TAB 3: All-park comparison ────────────────────────────
async function renderPulseTabCompare(content) {
  const today = todayET();
  content.innerHTML = `
    <div style="display:flex; align-items:center; gap:0.75rem; margin-bottom:1.25rem; flex-wrap:wrap;">
      <label style="font-size:0.82rem; font-weight:700; color:var(--slate);">Date:</label>
      <input type="date" id="compare-date-input" value="${today}" max="${today}"
        style="padding:0.4rem 0.75rem; border:1.5px solid #d1d5db; border-radius:8px;
        font-family:'Nunito',sans-serif; font-size:0.85rem;" />
      <button type="button" class="primary-button" id="compare-load-btn" style="font-size:0.82rem;">Load</button>
    </div>
    <div id="compare-chart-area" style="position:relative; height:300px;"></div>
  `;

  document.getElementById("compare-load-btn").addEventListener("click", loadCompareChart);
  loadCompareChart();
}

async function loadCompareChart() {
  const date = document.getElementById("compare-date-input").value;
  const area = document.getElementById("compare-chart-area");
  if (!area) return;

  destroyPulseCharts();
  area.innerHTML = `<div style="text-align:center;padding:2rem;color:var(--muted);">Loading…</div>`;

  try {
    const results = await Promise.all(
      PULSE_PARK_LIST.map(p => adminFetch(`/wait-times/trends/${p.id}?date=${date}`))
    );

    // Build unified hour labels across all parks
    const allHours = [...new Set(results.flatMap(r => (r.trend||[]).map(t => t.hour)))].sort();
    if (!allHours.length) {
      area.innerHTML = `<div style="text-align:center;padding:2rem;color:var(--muted);">No data for ${date}.</div>`;
      return;
    }

    area.innerHTML = `<canvas id="compare-canvas"></canvas>`;
    const datasets = PULSE_PARK_LIST.map((park, i) => {
      const col      = PULSE_COLORS[park.name];
      const trendMap = {};
      (results[i].trend || []).forEach(t => { trendMap[t.hour] = t.avg_wait; });
      return {
        label: park.name,
        data: allHours.map(h => trendMap[h] ?? null),
        borderColor: col.line,
        backgroundColor: col.bg,
        fill: false,
        tension: 0.35,
        pointRadius: 3,
        spanGaps: true,
      };
    });

    const chart = new Chart(document.getElementById("compare-canvas"), {
      type: "line",
      data: { labels: allHours.map(fmtHour), datasets },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: {
            display: true,
            position: "bottom",
            labels: { font: { size: 11 }, boxWidth: 14 },
          },
        },
        scales: {
          x: { grid: { color: "#f1f5f9" }, ticks: { font: { size: 10 } } },
          y: { beginAtZero: true, grid: { color: "#f1f5f9" }, ticks: { font: { size: 10 } } },
        },
      },
    });
    pulseChartInstances.push(chart);

  } catch(e) {
    pulseError(area, "Could not load comparison: " + e.message);
  }
}

// ── TAB 4: Historical day picker ──────────────────────────
async function renderPulseTabHistory(content) {
  const today = todayET();
  content.innerHTML = `
    <div style="display:flex; align-items:center; gap:0.75rem; margin-bottom:1.25rem; flex-wrap:wrap;">
      <label style="font-size:0.82rem; font-weight:700; color:var(--slate);">Date:</label>
      <input type="date" id="history-date-input" value="${today}" max="${today}"
        style="padding:0.4rem 0.75rem; border:1.5px solid #d1d5db; border-radius:8px;
        font-family:'Nunito',sans-serif; font-size:0.85rem;" />
      <button type="button" class="primary-button" id="history-load-btn" style="font-size:0.82rem;">Load</button>
    </div>
    <div id="history-content-area"></div>
  `;

  document.getElementById("history-load-btn").addEventListener("click", loadHistoryDay);
  loadHistoryDay();
}

async function loadHistoryDay() {
  const date = document.getElementById("history-date-input").value;
  const area = document.getElementById("history-content-area");
  if (!area) return;

  destroyPulseCharts();
  area.innerHTML = `<div style="text-align:center;padding:2rem;color:var(--muted);">Loading…</div>`;

  try {
    const results = await Promise.all(
      PULSE_PARK_LIST.map(p => adminFetch(`/wait-times/trends/${p.id}?date=${date}`))
    );

    let html = `<div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(280px,1fr)); gap:1rem;">`;

    results.forEach((data, i) => {
      const park = PULSE_PARK_LIST[i];
      const col  = PULSE_COLORS[park.name];
      const emoji = PULSE_EMOJI[park.name];
      const trend = data.trend || [];

      if (!trend.length) {
        html += `
          <div style="background:#f8fafc; border-radius:12px; padding:1rem;">
            <p style="font-family:'Mouse Memoirs',sans-serif; color:var(--castle-blue); margin:0 0 0.5rem;">
              ${emoji} ${park.name}
            </p>
            <p style="color:var(--muted); font-size:0.82rem; margin:0;">No data for this date.</p>
          </div>`;
        return;
      }

      const waits   = trend.map(t => t.avg_wait).filter(v => v !== null);
      const maxWait = waits.length ? Math.max(...waits) : 0;
      const avgWait = waits.length ? Math.round(waits.reduce((a,b)=>a+b,0) / waits.length) : 0;
      const peakHour = trend.find(t => t.avg_wait === maxWait);
      const totalSamples = trend.reduce((s,t) => s + t.sample_count, 0);

      html += `
        <div style="background:#f8fafc; border-radius:12px; overflow:hidden;">
          <div style="background:${col.line}; color:white; padding:0.6rem 1rem;
            display:flex; justify-content:space-between; align-items:center;">
            <span style="font-family:'Mouse Memoirs',sans-serif; font-size:1rem; letter-spacing:0.03em;">
              ${emoji} ${park.name}
            </span>
            <span style="font-size:0.7rem; opacity:0.8;">${totalSamples} samples</span>
          </div>
          <div style="padding:0.75rem;">
            <div style="position:relative; height:120px; margin-bottom:0.6rem;">
              <canvas id="hist-chart-${i}"></canvas>
            </div>
            <div style="display:flex; justify-content:space-between; font-size:0.75rem; color:var(--muted);">
              <span>Peak: <strong style="color:var(--castle-blue);">${maxWait} min${peakHour ? " @ " + fmtHour(peakHour.hour) : ""}</strong></span>
              <span>Avg: <strong style="color:var(--castle-blue);">${avgWait} min</strong></span>
            </div>
          </div>
        </div>`;
    });

    html += `</div>`;
    area.innerHTML = html;

    // Draw mini charts
    results.forEach((data, i) => {
      const park  = PULSE_PARK_LIST[i];
      const col   = PULSE_COLORS[park.name];
      const trend = data.trend || [];
      if (!trend.length) return;
      const canvas = document.getElementById(`hist-chart-${i}`);
      if (!canvas) return;
      const chart = new Chart(canvas, {
        type: "bar",
        data: {
          labels: trend.map(t => fmtHour(t.hour)),
          datasets: [{
            data: trend.map(t => t.avg_wait),
            backgroundColor: col.line,
            borderRadius: 3,
          }],
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            x: { grid: { display: false }, ticks: { font: { size: 8 }, maxRotation: 0 } },
            y: { beginAtZero: true, grid: { color: "#f1f5f9" }, ticks: { font: { size: 8 } } },
          },
        },
      });
      pulseChartInstances.push(chart);
    });

  } catch(e) {
    pulseError(area, "Could not load history: " + e.message);
  }
}

// ── TAB 5: Hop ranking history ────────────────────────────
async function renderPulseTabHop(content) {
  content.innerHTML = `
    <div style="margin-bottom:1rem;">
      <p style="font-size:0.82rem; color:var(--muted); margin:0 0 1rem;">
        Shows how park rankings shifted throughout today based on average wait times.
        Lower avg wait = better hop destination.
      </p>
    </div>
    <div id="hop-chart-area" style="position:relative; height:300px;"></div>
    <div id="hop-ranking-now" style="margin-top:1.25rem;"></div>
  `;

  const area    = document.getElementById("hop-chart-area");
  const rankNow = document.getElementById("hop-ranking-now");

  try {
    const [rankData, ...trendResults] = await Promise.all([
      adminFetch("/wait-times/hop-ranking"),
      ...PULSE_PARK_LIST.map(p => adminFetch(`/wait-times/trends/${p.id}?date=${todayET()}`)),
    ]);

    // Build comparison chart — all parks by hour today
    const allHours = [...new Set(trendResults.flatMap(r => (r.trend||[]).map(t => t.hour)))].sort();

    if (!allHours.length) {
      area.innerHTML = `<div style="text-align:center;padding:2rem;color:var(--muted);">No data collected yet today.</div>`;
    } else {
      area.innerHTML = `<canvas id="hop-canvas"></canvas>`;
      const datasets = PULSE_PARK_LIST.map((park, i) => {
        const col      = PULSE_COLORS[park.name];
        const trendMap = {};
        (trendResults[i].trend || []).forEach(t => { trendMap[t.hour] = t.avg_wait; });
        return {
          label: park.name,
          data: allHours.map(h => trendMap[h] ?? null),
          borderColor: col.line,
          backgroundColor: col.bg,
          fill: false,
          tension: 0.35,
          pointRadius: 3,
          spanGaps: true,
        };
      });

      const chart = new Chart(document.getElementById("hop-canvas"), {
        type: "line",
        data: { labels: allHours.map(fmtHour), datasets },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: {
            legend: { display: true, position: "bottom", labels: { font: { size: 11 }, boxWidth: 14 } },
            tooltip: {
              callbacks: {
                title: ctx => `${ctx[0].label} ET`,
                label: ctx => ` ${ctx.dataset.label}: ${ctx.parsed.y} min avg`,
              },
            },
          },
          scales: {
            x: { grid: { color: "#f1f5f9" }, ticks: { font: { size: 10 } } },
            y: { beginAtZero: true, grid: { color: "#f1f5f9" }, ticks: { font: { size: 10 } } },
          },
        },
      });
      pulseChartInstances.push(chart);
    }

    // Current ranking
    if (rankData.available && rankData.ranking?.length) {
      const medals = ["🥇","🥈","🥉","4️⃣"];
      rankNow.innerHTML = `
        <p style="font-family:'Nunito',sans-serif; font-size:0.72rem; font-weight:800;
          text-transform:uppercase; letter-spacing:0.06em; color:var(--muted); margin:0 0 0.6rem;">
          Current hop ranking
        </p>
        <div style="display:flex; flex-direction:column; gap:0.4rem;">
          ${rankData.ranking.map((p, i) => {
            const col = PULSE_COLORS[p.park_name] || { line: "#0030A0" };
            const trendArrow = p.trend === "rising" ? "↑" : p.trend === "falling" ? "↓" : "→";
            const trendColor = p.trend === "rising" ? "#ef4444" : p.trend === "falling" ? "#16a34a" : "#94a3b8";
            return `
              <div style="display:flex; align-items:center; gap:0.75rem; padding:0.65rem 0.9rem;
                background:white; border:1.5px solid #e2e8f0; border-left:4px solid ${col.line};
                border-radius:10px;">
                <span style="font-size:1.2rem;">${medals[i] || (i+1)}</span>
                <div style="flex:1;">
                  <div style="font-family:'Mouse Memoirs',sans-serif; font-size:1rem; color:var(--castle-blue);">
                    ${PULSE_EMOJI[p.park_name] || ""} ${p.park_name}
                  </div>
                  <div style="font-size:0.75rem; color:var(--muted);">${p.verdict}</div>
                </div>
                <div style="text-align:right;">
                  <div style="font-weight:800; font-size:0.9rem; color:var(--castle-blue);">
                    ${p.current_avg !== null ? p.current_avg + " min" : "—"}
                    <span style="color:${trendColor}; font-size:0.85rem;">${trendArrow}</span>
                  </div>
                  <div style="font-size:0.7rem; color:var(--muted);">avg wait</div>
                </div>
              </div>`;
          }).join("")}
        </div>`;
    }

  } catch(e) {
    pulseError(area, "Could not load hop ranking: " + e.message);
  }
}


// ── TAB 6: Ride-level historical data ────────────────────
async function renderPulseTabRide(content) {
  const today = todayET();
  const sevenDaysAgo = (() => {
    const d = new Date();
    d.setDate(d.getDate() - 6);
    return d.toISOString().slice(0, 10);
  })();

  content.innerHTML = `
    <div style="display:flex; align-items:center; gap:0.75rem; margin-bottom:1rem; flex-wrap:wrap;">
      <label style="font-size:0.82rem; font-weight:700; color:var(--slate);">Park:</label>
      <select id="ride-park-select" style="padding:0.4rem 0.75rem; border:1.5px solid #d1d5db;
        border-radius:8px; font-family:'Nunito',sans-serif; font-size:0.85rem;">
        ${PULSE_PARK_LIST.map(p => `<option value="${p.id}" data-name="${p.name}">${PULSE_EMOJI[p.name]} ${p.name}</option>`).join("")}
      </select>
      <label style="font-size:0.82rem; font-weight:700; color:var(--slate);">Ride:</label>
      <select id="ride-attraction-select" style="padding:0.4rem 0.75rem; border:1.5px solid #d1d5db;
        border-radius:8px; font-family:'Nunito',sans-serif; font-size:0.85rem; min-width:200px;">
        <option value="">— select park first —</option>
      </select>
    </div>
    <div style="display:flex; align-items:center; gap:0.75rem; margin-bottom:1.25rem; flex-wrap:wrap;">
      <label style="font-size:0.82rem; font-weight:700; color:var(--slate);">From:</label>
      <input type="date" id="ride-from-input" value="${sevenDaysAgo}" max="${today}"
        style="padding:0.4rem 0.75rem; border:1.5px solid #d1d5db; border-radius:8px;
        font-family:'Nunito',sans-serif; font-size:0.85rem;" />
      <label style="font-size:0.82rem; font-weight:700; color:var(--slate);">To:</label>
      <input type="date" id="ride-to-input" value="${today}" max="${today}"
        style="padding:0.4rem 0.75rem; border:1.5px solid #d1d5db; border-radius:8px;
        font-family:'Nunito',sans-serif; font-size:0.85rem;" />
      <button type="button" class="primary-button" id="ride-load-btn" style="font-size:0.82rem;" disabled>Load</button>
    </div>
    <div id="ride-chart-area" style="position:relative; min-height:200px;">
      <div style="text-align:center; padding:2rem; color:var(--muted);">
        Select a park to load its attractions.
      </div>
    </div>
    <div id="ride-stats-area" style="margin-top:1rem;"></div>
  `;

  // Load attractions when park changes
  async function loadAttractions() {
    const parkId = document.getElementById("ride-park-select").value;
    const sel    = document.getElementById("ride-attraction-select");
    sel.innerHTML = `<option value="">Loading…</option>`;
    sel.disabled = true;
    document.getElementById("ride-load-btn").disabled = true;

    try {
      const data = await adminFetch(`/wait-times/attractions/${parkId}`);
      if (!data.available || !data.attractions.length) {
        sel.innerHTML = `<option value="">No attraction data yet</option>`;
        return;
      }
      sel.innerHTML = `<option value="">— choose a ride —</option>` +
        data.attractions.map(a => `<option value="${a}">${a}</option>`).join("");
      sel.disabled = false;
    } catch(e) {
      sel.innerHTML = `<option value="">Error loading attractions</option>`;
    }
  }

  document.getElementById("ride-park-select").addEventListener("change", loadAttractions);
  document.getElementById("ride-attraction-select").addEventListener("change", () => {
    const hasRide = !!document.getElementById("ride-attraction-select").value;
    document.getElementById("ride-load-btn").disabled = !hasRide;
  });
  document.getElementById("ride-load-btn").addEventListener("click", loadRideHistory);

  // Auto-load attractions for first park
  loadAttractions();
}

async function loadRideHistory() {
  const parkId     = document.getElementById("ride-park-select").value;
  const parkName   = document.getElementById("ride-park-select").selectedOptions[0]?.dataset?.name
                  || document.getElementById("ride-park-select").selectedOptions[0]?.text || "";
  const attraction = document.getElementById("ride-attraction-select").value;
  const fromDate   = document.getElementById("ride-from-input").value;
  const toDate     = document.getElementById("ride-to-input").value;
  const area       = document.getElementById("ride-chart-area");
  const statsArea  = document.getElementById("ride-stats-area");
  if (!area || !attraction) return;

  destroyPulseCharts();
  area.innerHTML = `<div style="text-align:center;padding:2rem;color:var(--muted);">Loading…</div>`;
  statsArea.innerHTML = "";

  const col = PULSE_COLORS[parkName] || { line: "#0030A0", bg: "rgba(0,48,160,0.12)" };
  const isSingleDay = fromDate === toDate;

  try {
    const data = await adminFetch(
      `/wait-times/attraction-history/${parkId}?name=${encodeURIComponent(attraction)}&from=${fromDate}&to=${toDate}`
    );

    if (!data.available || (!data.daily.length && !data.hourly.length)) {
      area.innerHTML = `
        <div style="text-align:center; padding:2rem; background:#f8fafc; border-radius:12px;">
          <p style="font-size:1.5rem; margin:0 0 0.5rem;">🎢</p>
          <p style="color:var(--muted); margin:0;">No data for <strong>${attraction}</strong> in this date range.</p>
          <p style="font-size:0.78rem; color:var(--muted); margin:0.5rem 0 0;">
            Remember: individual ride data is only kept for 30 days.
          </p>
        </div>`;
      return;
    }

    // Single day = hourly breakdown; multi-day = daily avg
    const points  = isSingleDay ? data.hourly  : data.daily;
    const labels  = isSingleDay
      ? points.map(p => fmtHour(p.hour))
      : points.map(p => {
          const d = new Date(p.day + "T12:00:00");
          return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
        });
    const avgs    = points.map(p => p.avg_wait);
    const maxes   = points.map(p => p.max_wait);
    const mins    = points.map(p => p.min_wait);

    area.innerHTML = `
      <div style="margin-bottom:0.5rem;">
        <p style="font-family:'Mouse Memoirs',sans-serif; font-size:1.1rem; color:var(--castle-blue); margin:0;">
          ${PULSE_EMOJI[parkName] || "🎢"} ${attraction}
        </p>
        <p style="font-size:0.75rem; color:var(--muted); margin:0.15rem 0 0;">
          ${isSingleDay
            ? `Hourly breakdown · ${new Date(fromDate + "T12:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}`
            : `Daily average · ${labels[0]} – ${labels[labels.length - 1]}`
          }
        </p>
      </div>
      <div style="position:relative; height:240px;">
        <canvas id="ride-main-canvas"></canvas>
      </div>`;

    const datasets = [
      {
        label: "Avg wait",
        data: avgs,
        borderColor: col.line,
        backgroundColor: col.bg,
        fill: true,
        tension: 0.35,
        pointRadius: 4,
        pointHoverRadius: 6,
        order: 1,
      },
    ];

    // Only show min/max band on multi-day view where variance is meaningful
    if (!isSingleDay) {
      datasets.push({
        label: "Max wait",
        data: maxes,
        borderColor: col.line + "55",
        backgroundColor: "transparent",
        borderDash: [4, 3],
        fill: false,
        tension: 0.35,
        pointRadius: 2,
        order: 2,
      });
      datasets.push({
        label: "Min wait",
        data: mins,
        borderColor: col.line + "55",
        backgroundColor: "transparent",
        borderDash: [4, 3],
        fill: false,
        tension: 0.35,
        pointRadius: 2,
        order: 3,
      });
    }

    const chart = new Chart(document.getElementById("ride-main-canvas"), {
      type: isSingleDay ? "bar" : "line",
      data: { labels, datasets },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: {
            display: !isSingleDay,
            position: "bottom",
            labels: { font: { size: 11 }, boxWidth: 14 },
          },
          tooltip: {
            callbacks: {
              label: ctx => ` ${ctx.dataset.label}: ${ctx.parsed.y} min`,
            },
          },
        },
        scales: {
          x: { grid: { color: "#f1f5f9" }, ticks: { font: { size: 10 } } },
          y: {
            beginAtZero: true,
            grid: { color: "#f1f5f9" },
            ticks: { font: { size: 10 }, callback: v => v + "m" },
            title: { display: true, text: "Wait (min)", font: { size: 10 }, color: "#94a3b8" },
          },
        },
      },
    });
    pulseChartInstances.push(chart);

    // Stats row
    const allAvgs = avgs.filter(v => v !== null);
    if (allAvgs.length) {
      const overallAvg  = Math.round(allAvgs.reduce((a,b) => a+b, 0) / allAvgs.length);
      const overallMax  = Math.max(...points.map(p => p.max_wait).filter(v => v !== null));
      const overallMin  = Math.min(...points.map(p => p.min_wait).filter(v => v !== null));
      const totalSamples = points.reduce((s, p) => s + p.sample_count, 0);
      const peakPoint = isSingleDay
        ? points.find(p => p.avg_wait === Math.max(...avgs))
        : points.find(p => p.avg_wait === Math.max(...avgs));
      const peakLabel = isSingleDay
        ? (peakPoint ? fmtHour(peakPoint.hour) : "—")
        : (peakPoint ? new Date(peakPoint.day + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—");

      statsArea.innerHTML = `
        <div style="display:flex; gap:0.6rem; flex-wrap:wrap;">
          ${[
            ["Overall avg",    overallAvg + " min"],
            ["Peak wait",      overallMax + " min @ " + peakLabel],
            ["Lowest recorded", overallMin + " min"],
            ["Data points",    totalSamples + " samples"],
          ].map(([label, val]) => `
            <div style="flex:1; min-width:110px; background:#f8fafc; border-radius:10px;
              padding:0.6rem 0.75rem; text-align:center;">
              <div style="font-size:0.65rem; font-weight:800; text-transform:uppercase;
                letter-spacing:0.06em; color:var(--muted);">${label}</div>
              <div style="font-weight:800; font-size:0.88rem; color:var(--castle-blue); margin-top:0.2rem;">${val}</div>
            </div>`).join("")}
        </div>
        ${!isSingleDay ? `
          <p style="font-size:0.72rem; color:var(--muted); margin:0.75rem 0 0; text-align:center;">
            Dashed lines show daily min/max range · Solid line is daily average · Individual ride data kept 30 days
          </p>` : ""}`;
    }

  } catch(e) {
    pulseError(area, "Could not load ride history: " + e.message);
  }
}

// ============================================================
// PIN MANAGEMENT — Admin Section
// ============================================================

const PIN_OBTAIN_SOURCES = [
  { slug: "park", label: "Parks (Open Edition)" },
  { slug: "cast_trading", label: "Cast Member Trading" },
  { slug: "hot_topic", label: "Hot Topic" },
  { slug: "box_lunch", label: "BoxLunch" },
  { slug: "disney_pin_blog", label: "Disney Pin Blog" },
  { slug: "shop_disney", label: "shopDisney" },
  { slug: "other", label: "Other" },
];

function renderObtainFields(idPrefix, sourceCsv = "", notes = "") {
  const selected = new Set((sourceCsv || "").split(",").map(s => s.trim()).filter(Boolean));
  const boxes = PIN_OBTAIN_SOURCES.map(src => `
    <label style="display:inline-flex; align-items:center; gap:0.35rem; padding:0.35rem 0.65rem; border:1.5px solid #d1d5db; border-radius:999px; background:#fff; font-size:0.8rem; font-weight:700; color:var(--slate); cursor:pointer;">
      <input type="checkbox" class="${idPrefix}-obtain-src" value="${src.slug}" ${selected.has(src.slug) ? "checked" : ""} />
      ${src.label}
    </label>
  `).join("");
  const safeNotes = (notes || "").replace(/"/g, '&quot;').replace(/</g, '&lt;');
  return `
    <div class="wizard-field" style="margin-top:0.85rem; grid-column: 1 / -1;">
      <label style="display:block; margin-bottom:0.4rem;">How to Obtain</label>
      <div style="display:flex; flex-wrap:wrap; gap:0.4rem;">${boxes}</div>
    </div>
    <div class="wizard-field" style="margin-top:0.6rem; grid-column: 1 / -1;">
      <label for="${idPrefix}-obtain-notes">Obtain Notes (optional)</label>
      <textarea id="${idPrefix}-obtain-notes" rows="2" placeholder="e.g. Released 6/2024, check pinpics #12345" style="width:100%; padding:0.55rem 0.75rem; border-radius:10px; border:1.5px solid #d1d5db; font-family:'Nunito',sans-serif; font-size:0.9rem; resize:vertical;">${safeNotes}</textarea>
    </div>
  `;
}

function readObtainFields(idPrefix) {
  const checks = document.querySelectorAll(`.${idPrefix}-obtain-src:checked`);
  const sources = Array.from(checks).map(c => c.value).join(",");
  const notesEl = document.getElementById(`${idPrefix}-obtain-notes`);
  return { obtain_source: sources, obtain_notes: notesEl ? notesEl.value.trim() : "" };
}

async function renderPinManagement() {
  const section = document.getElementById("admin-section-content");

  section.innerHTML = `
    <div class="wizard-step-card">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.25rem; flex-wrap:wrap; gap:0.75rem;">
        <h3 style="margin:0;">📌 Pin Management</h3>
        <div style="display:flex; gap:0.5rem;">
          <button type="button" class="primary-button small-button" id="pin-add-single-btn">+ Add Pin</button>
          <button type="button" class="secondary-button small-button" id="pin-bulk-upload-btn">📤 Bulk Upload</button>
        </div>
      </div>

      <!-- Add Single Pin Form (hidden by default) -->
      <div id="pin-add-form" style="display:none; margin-bottom:1.5rem; padding:1.25rem; background:#f8fafc; border-radius:14px; border:1.5px solid #e2e8f0;">
        <h4 style="margin:0 0 1rem; font-size:1rem; font-family:'Nunito',sans-serif; font-weight:800; color:var(--castle-blue);">Add New Pin</h4>
        <div class="wizard-form-grid">
          <div class="wizard-field">
            <label for="pin-name">Pin Name *</label>
            <input type="text" id="pin-name" placeholder="Mickey Balloon Pin" />
          </div>
          <div class="wizard-field">
            <label for="pin-year">Year</label>
            <input type="text" id="pin-year" placeholder="2024" />
          </div>
          <div class="wizard-field">
            <label for="pin-series">Series Name</label>
            <input type="text" id="pin-series" placeholder="50th Anniversary" />
          </div>
          <div class="wizard-field">
            <label for="pin-tags">Tags (comma-separated)</label>
            <input type="text" id="pin-tags" placeholder="limited edition, mickey, balloon" />
          </div>
        </div>
        <div style="display:flex; gap:1rem; margin-top:0.75rem; align-items:center; flex-wrap:wrap;">
          <div class="wizard-field" style="flex:1; min-width:200px;">
            <label for="pin-image">Pin Image</label>
            <input type="file" id="pin-image" accept="image/*" style="font-size:0.9rem;" />
          </div>
          <div class="wizard-field" style="min-width:140px;">
            <label for="pin-chaser">Rarity</label>
            <select id="pin-chaser" style="padding:0.55rem 0.75rem; border-radius:10px; border:1.5px solid #d1d5db; font-family:'Nunito',sans-serif; font-size:0.9rem;">
              <option value="0">Standard</option>
              <option value="1">Chaser</option>
              <option value="2">Super Chaser</option>
            </select>
          </div>
        </div>
        ${renderObtainFields("pin")}
        <div style="display:flex; gap:0.5rem; margin-top:1rem;">
          <button type="button" class="primary-button small-button" id="pin-save-btn">Save Pin</button>
          <button type="button" class="secondary-button small-button" id="pin-cancel-btn">Cancel</button>
        </div>
      </div>

      <!-- Bulk Upload Form (hidden by default) -->
      <div id="pin-bulk-form" style="display:none; margin-bottom:1.5rem; padding:1.25rem; background:#f8fafc; border-radius:14px; border:1.5px solid #e2e8f0;">
        <h4 style="margin:0 0 1rem; font-size:1rem; font-family:'Nunito',sans-serif; font-weight:800; color:var(--castle-blue);">Bulk Upload Pins</h4>
        <p style="font-size:0.85rem; color:var(--muted); margin:0 0 1rem;">Upload up to 50 images at once. File names will be used as pin names (you can edit them later).</p>
        <div class="wizard-form-grid">
          <div class="wizard-field">
            <label for="pin-bulk-year">Year (applies to all)</label>
            <input type="text" id="pin-bulk-year" placeholder="2024" />
          </div>
          <div class="wizard-field">
            <label for="pin-bulk-series">Series Name (applies to all)</label>
            <input type="text" id="pin-bulk-series" placeholder="50th Anniversary" />
          </div>
          <div class="wizard-field">
            <label for="pin-bulk-tags">Tags (applies to all)</label>
            <input type="text" id="pin-bulk-tags" placeholder="limited edition" />
          </div>
        </div>
        <div style="display:flex; gap:1rem; margin-top:0.75rem; align-items:center; flex-wrap:wrap;">
          <div class="wizard-field" style="flex:1; min-width:200px;">
            <label for="pin-bulk-images">Pin Images *</label>
            <input type="file" id="pin-bulk-images" accept="image/*" multiple style="font-size:0.9rem;" />
          </div>
          <div class="wizard-field" style="min-width:140px;">
            <label for="pin-bulk-chaser">Rarity</label>
            <select id="pin-bulk-chaser" style="padding:0.55rem 0.75rem; border-radius:10px; border:1.5px solid #d1d5db; font-family:'Nunito',sans-serif; font-size:0.9rem;">
              <option value="0">Standard</option>
              <option value="1">Chaser</option>
              <option value="2">Super Chaser</option>
            </select>
          </div>
        </div>
        ${renderObtainFields("pin-bulk")}
        <div style="display:flex; gap:0.5rem; margin-top:1rem;">
          <button type="button" class="primary-button small-button" id="pin-bulk-save-btn">Upload All</button>
          <button type="button" class="secondary-button small-button" id="pin-bulk-cancel-btn">Cancel</button>
        </div>
        <div id="pin-bulk-progress" style="display:none; margin-top:0.75rem; font-size:0.85rem; color:var(--castle-blue); font-weight:700;"></div>
      </div>

      <!-- Pin List -->
      <div id="pin-admin-list">
        <div style="text-align:center; padding:2rem; color:var(--muted);">Loading pins...</div>
      </div>
    </div>
  `;

  // Toggle forms
  document.getElementById("pin-add-single-btn").addEventListener("click", () => {
    document.getElementById("pin-add-form").style.display = document.getElementById("pin-add-form").style.display === "none" ? "block" : "none";
    document.getElementById("pin-bulk-form").style.display = "none";
  });
  document.getElementById("pin-bulk-upload-btn").addEventListener("click", () => {
    document.getElementById("pin-bulk-form").style.display = document.getElementById("pin-bulk-form").style.display === "none" ? "block" : "none";
    document.getElementById("pin-add-form").style.display = "none";
  });
  document.getElementById("pin-cancel-btn").addEventListener("click", () => {
    document.getElementById("pin-add-form").style.display = "none";
  });
  document.getElementById("pin-bulk-cancel-btn").addEventListener("click", () => {
    document.getElementById("pin-bulk-form").style.display = "none";
  });

  // Save single pin
  document.getElementById("pin-save-btn").addEventListener("click", async () => {
    const name = document.getElementById("pin-name").value.trim();
    if (!name) return alert("Pin name is required");

    const formData = new FormData();
    formData.append("name", name);
    formData.append("year", document.getElementById("pin-year").value.trim());
    formData.append("series", document.getElementById("pin-series").value.trim());
    formData.append("tags", document.getElementById("pin-tags").value.trim());
    formData.append("chaser", document.getElementById("pin-chaser").value);
    const obtain = readObtainFields("pin");
    formData.append("obtain_source", obtain.obtain_source);
    formData.append("obtain_notes", obtain.obtain_notes);

    const fileInput = document.getElementById("pin-image");
    if (fileInput.files[0]) formData.append("image", fileInput.files[0]);

    try {
      const token = getAuthToken();
      const res = await fetch("/api/admin/pins", {
        method: "POST",
        headers: { "Authorization": `Bearer ${token}` },
        body: formData,
      });
      if (!res.ok) { const err = await res.json(); throw new Error(err.error); }

      document.getElementById("pin-add-form").style.display = "none";
      document.getElementById("pin-name").value = "";
      document.getElementById("pin-year").value = "";
      document.getElementById("pin-series").value = "";
      document.getElementById("pin-tags").value = "";
      fileInput.value = "";
      await loadAdminPinList();
    } catch (e) {
      alert("Failed to add pin: " + e.message);
    }
  });

  // Bulk upload
  document.getElementById("pin-bulk-save-btn").addEventListener("click", async () => {
    const fileInput = document.getElementById("pin-bulk-images");
    if (!fileInput.files.length) return alert("Select at least one image");

    const progress = document.getElementById("pin-bulk-progress");
    progress.style.display = "block";
    progress.textContent = `Uploading ${fileInput.files.length} pin(s)...`;

    const formData = new FormData();
    formData.append("year", document.getElementById("pin-bulk-year").value.trim());
    formData.append("series", document.getElementById("pin-bulk-series").value.trim());
    formData.append("tags", document.getElementById("pin-bulk-tags").value.trim());
    formData.append("chaser", document.getElementById("pin-bulk-chaser").value);
    const bulkObtain = readObtainFields("pin-bulk");
    formData.append("obtain_source", bulkObtain.obtain_source);
    formData.append("obtain_notes", bulkObtain.obtain_notes);

    for (const file of fileInput.files) {
      formData.append("images", file);
    }

    try {
      const token = getAuthToken();
      const res = await fetch("/api/admin/pins/bulk", {
        method: "POST",
        headers: { "Authorization": `Bearer ${token}` },
        body: formData,
      });
      if (!res.ok) { const err = await res.json(); throw new Error(err.error); }

      const result = await res.json();
      progress.textContent = `Successfully uploaded ${result.uploaded} pin(s)!`;
      progress.style.color = "#16a34a";

      setTimeout(() => {
        document.getElementById("pin-bulk-form").style.display = "none";
        progress.style.display = "none";
        progress.style.color = "var(--castle-blue)";
      }, 2000);

      fileInput.value = "";
      await loadAdminPinList();
    } catch (e) {
      progress.textContent = "Upload failed: " + e.message;
      progress.style.color = "#dc2626";
    }
  });

  await loadAdminPinList();
}

async function loadAdminPinList() {
  const list = document.getElementById("pin-admin-list");
  if (!list) return;

  try {
    const pins = await adminFetch("/admin/pins");

    if (pins.length === 0) {
      list.innerHTML = `
        <div style="text-align:center; padding:2rem; color:var(--muted);">
          <p style="font-size:2rem;">📌</p>
          <p>No pins yet. Click <strong>+ Add Pin</strong> or <strong>Bulk Upload</strong> to get started.</p>
        </div>
      `;
      return;
    }

    list.innerHTML = `
      <p style="font-size:0.8rem; color:var(--muted); margin-bottom:0.75rem;">${pins.length} pin(s) total</p>
      <div style="display:flex; flex-direction:column; gap:0.5rem;">
        ${pins.map(pin => `
          <div class="pin-admin-row" style="display:flex; align-items:center; gap:0.75rem; padding:0.65rem 0.85rem; border:1px solid #e2e8f0; border-radius:10px; background:white;">
            <div style="width:48px; height:48px; border-radius:8px; overflow:hidden; flex-shrink:0; background:#f1f5f9;">
              ${pin.image
                ? `<img src="/api/pins/thumbnail/${pin.image}" style="width:100%; height:100%; object-fit:cover;" />`
                : `<div style="width:100%; height:100%; display:flex; align-items:center; justify-content:center; font-size:1.5rem;">📌</div>`
              }
            </div>
            <div style="flex:1; min-width:0;">
              <strong style="display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${pin.name}</strong>
              <span style="font-size:0.75rem; color:var(--muted);">
                ${pin.chaser === 2 ? '<span style="background:#ffe4e6; color:#9f1239; padding:0.1rem 0.4rem; border-radius:4px; font-weight:800; font-size:0.65rem; text-transform:uppercase; letter-spacing:0.05em; margin-right:0.3rem;">Super Chaser</span>' : pin.chaser === 1 ? '<span style="background:#fef3c7; color:#92400e; padding:0.1rem 0.4rem; border-radius:4px; font-weight:800; font-size:0.65rem; text-transform:uppercase; letter-spacing:0.05em; margin-right:0.3rem;">Chaser</span>' : ""}
                ${[pin.year, pin.series].filter(Boolean).join(" · ") || "No tags"}
                ${pin.collectors > 0 ? ` · ${pin.collectors} collector(s)` : ""}
              </span>
            </div>
            <div style="display:flex; gap:0.3rem; flex-shrink:0;">
              <button type="button" class="pin-edit-btn" data-id="${pin.id}" style="background:none; border:1px solid #d1d5db; cursor:pointer; font-size:0.72rem; font-weight:700; padding:0.2rem 0.55rem; border-radius:6px; font-family:'Nunito',sans-serif; color:var(--slate);">Edit</button>
              <button type="button" class="pin-delete-btn" data-id="${pin.id}" style="background:none; border:none; cursor:pointer; color:#94a3b8; font-size:1.1rem;">✕</button>
            </div>
          </div>
        `).join("")}
      </div>
    `;

    // Delete handlers
    list.querySelectorAll(".pin-delete-btn").forEach(btn => {
      btn.addEventListener("click", async () => {
        if (!confirm("Delete this pin? This cannot be undone.")) return;
        try {
          await adminFetch(`/admin/pins/${btn.dataset.id}`, { method: "DELETE" });
          await loadAdminPinList();
        } catch (e) {
          alert("Delete failed: " + e.message);
        }
      });
    });

    // Edit handlers
    list.querySelectorAll(".pin-edit-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        const pin = pins.find(p => p.id === btn.dataset.id);
        if (pin) openPinEditForm(pin);
      });
    });
  } catch (e) {
    list.innerHTML = `<p style="color:var(--magic-red); text-align:center;">Failed to load pins: ${e.message}</p>`;
  }
}

function openPinEditForm(pin) {
  const section = document.getElementById("admin-section-content");
  const existing = document.getElementById("pin-edit-overlay");
  if (existing) existing.remove();

  const overlay = document.createElement("div");
  overlay.id = "pin-edit-overlay";
  overlay.style.cssText = "position:fixed; inset:0; background:rgba(10,15,40,0.65); backdrop-filter:blur(6px); z-index:1000; display:flex; align-items:center; justify-content:center; padding:1rem;";

  overlay.innerHTML = `
    <div style="background:var(--cream); border-radius:24px; width:min(500px,100%); max-height:90vh; overflow-y:auto; box-shadow:0 32px 80px rgba(0,48,135,0.25); border:1.5px solid rgba(255,255,255,0.9); padding:1.75rem; position:relative; box-sizing:border-box;">
      <button id="pin-edit-close" style="position:absolute; top:1rem; right:1rem; width:36px; height:36px; border-radius:50%; border:none; background:rgba(0,0,0,0.08); cursor:pointer; font-size:1rem; display:flex; align-items:center; justify-content:center;">✕</button>
      <h3 style="margin:0 0 1.25rem; font-family:'Mouse Memoirs',sans-serif; font-size:1.6rem; color:var(--castle-blue);">Edit Pin</h3>
      <div class="wizard-form-grid">
        <div class="wizard-field">
          <label>Pin Name</label>
          <input type="text" id="pin-edit-name" value="${pin.name.replace(/"/g, '&quot;')}" />
        </div>
        <div class="wizard-field">
          <label>Year</label>
          <input type="text" id="pin-edit-year" value="${pin.year || ""}" />
        </div>
        <div class="wizard-field">
          <label>Series</label>
          <input type="text" id="pin-edit-series" value="${pin.series || ""}" />
        </div>
        <div class="wizard-field">
          <label>Tags</label>
          <input type="text" id="pin-edit-tags" value="${(pin.tags || "").replace(/"/g, '&quot;')}" />
        </div>
      </div>
      <div style="display:flex; gap:1rem; margin-top:0.75rem; align-items:center; flex-wrap:wrap;">
        <div class="wizard-field" style="flex:1; min-width:200px;">
          <label>Replace Image</label>
          <input type="file" id="pin-edit-image" accept="image/*" style="font-size:0.9rem;" />
        </div>
        <div class="wizard-field" style="min-width:140px;">
          <label>Rarity</label>
          <select id="pin-edit-chaser" style="padding:0.55rem 0.75rem; border-radius:10px; border:1.5px solid #d1d5db; font-family:'Nunito',sans-serif; font-size:0.9rem;">
            <option value="0" ${pin.chaser === 0 ? "selected" : ""}>Standard</option>
            <option value="1" ${pin.chaser === 1 ? "selected" : ""}>Chaser</option>
            <option value="2" ${pin.chaser === 2 ? "selected" : ""}>Super Chaser</option>
          </select>
        </div>
      </div>
      <div class="wizard-form-grid" style="margin-top:0.75rem;">
        ${renderObtainFields("pin-edit", pin.obtain_source, pin.obtain_notes)}
      </div>
      <div style="display:flex; gap:0.5rem; margin-top:1.25rem;">
        <button type="button" class="primary-button" id="pin-edit-save">Save Changes</button>
        <button type="button" class="secondary-button" id="pin-edit-cancel">Cancel</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  const close = () => overlay.remove();
  document.getElementById("pin-edit-close").addEventListener("click", close);
  document.getElementById("pin-edit-cancel").addEventListener("click", close);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });

  document.getElementById("pin-edit-save").addEventListener("click", async () => {
    try {
      // Update metadata
      const editObtain = readObtainFields("pin-edit");
      await adminFetch(`/admin/pins/${pin.id}`, {
        method: "PUT",
        body: JSON.stringify({
          name: document.getElementById("pin-edit-name").value.trim(),
          year: document.getElementById("pin-edit-year").value.trim(),
          series: document.getElementById("pin-edit-series").value.trim(),
          tags: document.getElementById("pin-edit-tags").value.trim(),
          chaser: parseInt(document.getElementById("pin-edit-chaser").value) || 0,
          obtain_source: editObtain.obtain_source,
          obtain_notes: editObtain.obtain_notes,
        }),
      });

      // Replace image if selected
      const imageFile = document.getElementById("pin-edit-image").files[0];
      if (imageFile) {
        const formData = new FormData();
        formData.append("image", imageFile);
        const token = getAuthToken();
        await fetch(`/api/admin/pins/${pin.id}/image`, {
          method: "POST",
          headers: { "Authorization": `Bearer ${token}` },
          body: formData,
        });
      }

      close();
      await loadAdminPinList();
    } catch (e) {
      alert("Save failed: " + e.message);
    }
  });
}

document.addEventListener("DOMContentLoaded", initAdmin);