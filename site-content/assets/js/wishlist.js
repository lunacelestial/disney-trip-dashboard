// ============================================================
// WISHLIST PAGE — Rendering + add form with image upload
// Depends on: script.js (core)
// ============================================================

async function renderWishlistPage() {
  const list = document.getElementById("wishlist-list");
  if (!list) return;

  const items = await WishlistDB.getAll();

  const catEmoji = {
    Ride: "🎢", Dining: "🍽️", Food: "🍽️", Merch: "🛍️",
    Show: "🎭", Snack: "🍦", Resort: "🏨", Character: "📸",
    Other: "✨"
  };

  const catClass = {
    Ride: "ride", Dining: "dining", Food: "dining", Merch: "merch",
    Show: "show", Snack: "dining", Resort: "travel", Character: "show",
    Other: "default"
  };

  let html = "";

  if (items.length === 0) {
    html = `
      <div class="wishlist-empty">
        <div class="wishlist-empty-icon">⭐</div>
        <h3>No wishes yet!</h3>
        <p>See something magical while browsing? Add it here so everyone knows what you're dreaming about.</p>
      </div>
    `;
  } else {
    html = items.map(item => {
      const emoji = catEmoji[item.category] || "✨";
      const badgeClass = catClass[item.category] || "default";
      const isBase64 = item.image && item.image.startsWith("data:");
      const isFile = item.image && !item.image.startsWith("data:") && item.image.length > 0;
      const hasImage = isBase64 || isFile;
      const imageSrc = isBase64 ? item.image : isFile ? `/api/wishlist/image/${item.image}` : "";
      const hasUrl = item.url && item.url.trim();
      const initial = (item.added_by_name || "?")[0].toUpperCase();

      return `
        <div class="wishlist-card${hasImage ? " has-image" : ""}">
          ${hasImage ? `<div class="wishlist-card-image" data-id="${item.id}" role="button" tabindex="0" aria-label="View larger image for ${escapeHtml(item.title)}" style="background-image: url('${imageSrc}')"></div>` : ""}
          <div class="wishlist-card-body">
            <div class="wishlist-card-top">
              <span class="activity-badge ${badgeClass}">${emoji} ${escapeHtml(item.category || "Other")}</span>
              <button class="wishlist-delete-btn" data-id="${item.id}" aria-label="Remove" title="Remove from wishlist">✕</button>
            </div>
            <h3 class="wishlist-card-title">${escapeHtml(item.title)}</h3>
            ${item.description ? `<p class="wishlist-card-desc">${escapeHtml(item.description)}</p>` : ""}
            ${hasUrl ? `<a href="${escapeHtml(item.url)}" target="_blank" rel="noopener" class="wishlist-card-link">🔗 View Link</a>` : ""}
            <div class="wishlist-card-footer">
              <div class="wishlist-card-avatar" title="${escapeHtml(item.added_by_name || "Unknown")}">${initial}</div>
              <span class="wishlist-card-added-by">Added by ${escapeHtml(item.added_by_name || "Unknown")}</span>
            </div>
          </div>
        </div>
      `;
    }).join("");
  }

  list.innerHTML = html;

  // Wire delete buttons
  list.querySelectorAll(".wishlist-delete-btn").forEach(btn => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const id = btn.dataset.id;
      if (confirm("Remove this wish?")) {
        await WishlistDB.remove(id);
        renderWishlistPage();
      }
    });
  });

  // Wire thumbnail → lightbox
  list.querySelectorAll(".wishlist-card-image").forEach(thumb => {
    const open = () => {
      const item = items.find(i => i.id === thumb.dataset.id);
      if (item) openWishlistLightbox(item);
    };
    thumb.addEventListener("click", open);
    thumb.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); }
    });
  });
}

// ── Wishlist image lightbox ─────────────────────────────────
function openWishlistLightbox(item) {
  document.getElementById("wishlist-lightbox-overlay")?.remove();

  const catEmoji = {
    Ride: "🎢", Dining: "🍽️", Food: "🍽️", Merch: "🛍️",
    Show: "🎭", Snack: "🍦", Resort: "🏨", Character: "📸",
    Other: "✨"
  };
  const catClass = {
    Ride: "ride", Dining: "dining", Food: "dining", Merch: "merch",
    Show: "show", Snack: "dining", Resort: "travel", Character: "show",
    Other: "default"
  };

  const isBase64 = item.image && item.image.startsWith("data:");
  const isFile = item.image && !item.image.startsWith("data:") && item.image.length > 0;
  const imageSrc = isBase64 ? item.image : isFile ? `/api/wishlist/image/${item.image}` : "";
  const emoji = catEmoji[item.category] || "✨";
  const badgeClass = catClass[item.category] || "default";
  const hasUrl = item.url && item.url.trim();
  const hasCategory = !!item.category;

  const overlay = document.createElement("div");
  overlay.id = "wishlist-lightbox-overlay";
  overlay.className = "wishlist-lightbox-overlay";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-label", item.title || "Wishlist image");

  overlay.innerHTML = `
    <div class="wishlist-lightbox-card">
      <button class="wishlist-lightbox-close" aria-label="Close">✕</button>
      ${imageSrc ? `<img class="wishlist-lightbox-image" src="${imageSrc}" alt="${escapeHtml(item.title || "")}" />` : ""}
      <div class="wishlist-lightbox-body">
        <h2 class="wishlist-lightbox-title">${escapeHtml(item.title || "Untitled")}</h2>
        ${hasCategory ? `
          <div class="wishlist-lightbox-meta">
            <span class="activity-badge ${badgeClass}">${emoji} ${escapeHtml(item.category)}</span>
          </div>
        ` : ""}
        ${item.description ? `<p class="wishlist-lightbox-desc">${escapeHtml(item.description)}</p>` : ""}
        ${hasUrl ? `<a class="wishlist-lightbox-link" href="${escapeHtml(item.url)}" target="_blank" rel="noopener">🔗 Open Link</a>` : ""}
      </div>
    </div>
  `;

  const close = () => {
    overlay.remove();
    document.removeEventListener("keydown", onKey);
  };
  const onKey = (e) => { if (e.key === "Escape") close(); };

  overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
  overlay.querySelector(".wishlist-lightbox-close").addEventListener("click", close);
  document.addEventListener("keydown", onKey);

  document.body.appendChild(overlay);
}

function initializeWishlistPage() {
  if (!document.getElementById("wishlist-list")) return;

  renderWishlistPage();

  const form = document.getElementById("wishlist-add-form");
  if (!form) return;

  const imageInput = document.getElementById("wl-image");
  const imagePreview = document.getElementById("wl-image-preview");
  const imageClear = document.getElementById("wl-image-clear");
  let pendingFile = null;

  if (imagePreview && imageInput) {
    imagePreview.addEventListener("click", () => imageInput.click());
  }

  if (imageInput) {
    imageInput.addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (!file) return;

      if (file.size > 5 * 1024 * 1024) {
        alert("Image must be under 5MB. Try a screenshot instead!");
        imageInput.value = "";
        return;
      }

      pendingFile = file;
      const previewUrl = URL.createObjectURL(file);
      if (imagePreview) {
        imagePreview.style.backgroundImage = `url('${previewUrl}')`;
        imagePreview.classList.add("has-preview");
      }
      if (imageClear) imageClear.classList.remove("hidden");
    });
  }

  if (imageClear) {
    imageClear.addEventListener("click", () => {
      pendingFile = null;
      imageInput.value = "";
      imagePreview.style.backgroundImage = "";
      imagePreview.classList.remove("has-preview");
      imageClear.classList.add("hidden");
    });
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const title = document.getElementById("wl-title").value.trim();
    const category = document.getElementById("wl-category").value;
    const url = (document.getElementById("wl-url").value || "").trim();
    const description = (document.getElementById("wl-description").value || "").trim();

    if (!title) return;

    let imageFilename = "";
    if (pendingFile) {
      try {
        const formData = new FormData();
        formData.append("image", pendingFile);
        const token = localStorage.getItem("session_token");
        const res = await fetch("/api/wishlist/upload-image", {
          method: "POST",
          headers: token ? { "Authorization": `Bearer ${token}` } : {},
          body: formData,
        });
        const result = await res.json();
        imageFilename = result.filename || "";
      } catch (err) {
        console.error("Wishlist image upload failed:", err);
      }
    }

    const item = {
      id: "wl-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6),
      title,
      category,
      url,
      description,
      image: imageFilename,
    };

    await WishlistDB.add(item);

    form.reset();
    pendingFile = null;
    if (imagePreview) {
      imagePreview.style.backgroundImage = "";
      imagePreview.classList.remove("has-preview");
    }
    if (imageClear) imageClear.classList.add("hidden");

    renderWishlistPage();
  });
}
