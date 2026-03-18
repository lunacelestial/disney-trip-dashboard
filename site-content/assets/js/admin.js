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
            <button type="button" class="delete-user-btn" data-id="${u.id}" style="background:none; border:none; cursor:pointer; color:#94a3b8; font-size:1.1rem;">✕</button>
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

document.addEventListener("DOMContentLoaded", initAdmin);