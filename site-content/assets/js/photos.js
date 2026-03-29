// ============================================================
// PHOTOS PAGE — Trip photos, upload zone, lightbox
// Depends on: script.js (core)
// ============================================================

let photosCurrentTrip = null;
let photosData = [];
let photosLightboxIndex = 0;

async function initializePhotosPage() {
  const bubblesEl = document.getElementById("photos-trip-bubbles");
  if (!bubblesEl) return;

  let trips = [];
  try { trips = await apiFetch("/trip-budgets"); } catch (e) { }

  // Sort: active trip first, then upcoming (chronological), then past (reverse chronological)
  const todaySrt = new Date().toISOString().split("T")[0];
  trips.sort((a, b) => {
    const score = t => (todaySrt >= t.start_date && todaySrt <= t.end_date) ? 0 : t.start_date > todaySrt ? 1 : 2;
    const sa = score(a), sb = score(b);
    if (sa !== sb) return sa - sb;
    return sa === 1 ? a.start_date.localeCompare(b.start_date) : b.start_date.localeCompare(a.start_date);
  });

  if (trips.length === 0) {
    bubblesEl.innerHTML = `<p style="color:var(--muted); font-style:italic;">No trips yet. Create one in the Planner!</p>`;
    return;
  }

  const today = new Date().toISOString().split("T")[0];
  const tripOptions = trips.map(t => {
    const start = new Date(t.start_date + "T00:00:00");
    const end = new Date(t.end_date + "T00:00:00");
    const fmt = d => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    const status = today >= t.start_date && today <= t.end_date ? " 🌟 Now" :
                   t.start_date > today ? " 🗓️ Upcoming" : " ✅ Past";

    let countdown = "";
    if (t.start_date > today) {
      const [fy, fm, fd] = t.start_date.split("-").map(Number);
      const tripStart = new Date(fy, fm - 1, fd);
      const todayDate = new Date(); todayDate.setHours(0,0,0,0);
      const daysUntil = Math.ceil((tripStart - todayDate) / (1000 * 60 * 60 * 24));
      if (daysUntil === 1) countdown = " — Tomorrow!";
      else if (daysUntil > 0) countdown = ` — ${daysUntil} days away`;
    }

    return `<option value="${t.trip_id}">${fmt(start)} – ${fmt(end)} (${t.label || "Trip"})${status}${countdown}</option>`;
  }).join("");

  bubblesEl.innerHTML = `
    <div class="budget-trip-pill">
      <label class="card-label">Viewing Photos For</label>
      <select id="photos-trip-select">${tripOptions}</select>
    </div>
  `;

  const selectEl = document.getElementById("photos-trip-select");
  if (selectEl) {
    selectEl.addEventListener("change", () => {
      photosCurrentTrip = selectEl.value;
      loadTripPhotos(photosCurrentTrip);
    });
  }

  // Check for ?trip= query param (linked from history page)
  const urlParams = new URLSearchParams(window.location.search);
  const preselectedTrip = urlParams.get("trip");
  if (preselectedTrip && selectEl) {
    selectEl.value = preselectedTrip;
  }

  if (selectEl && selectEl.value) {
    photosCurrentTrip = selectEl.value;
    loadTripPhotos(photosCurrentTrip);
  }

  initPhotosUpload();
  initPhotosLightbox();
}

async function loadTripPhotos(tripId) {
  const emptyState = document.getElementById("photos-empty-state");
  const uploadSection = document.getElementById("photos-upload-section");
  const gridSection = document.getElementById("photos-grid-section");
  const grid = document.getElementById("photos-grid");
  const countEl = document.getElementById("photos-count");

  if (emptyState) emptyState.classList.add("hidden");
  if (uploadSection) uploadSection.classList.remove("hidden");
  if (gridSection) gridSection.classList.remove("hidden");

  try {
    photosData = await apiFetch(`/trips/${tripId}/photos`);
  } catch (e) {
    photosData = [];
  }

  if (countEl) countEl.textContent = `${photosData.length} photo${photosData.length !== 1 ? "s" : ""}`;

  if (!grid) return;

  if (photosData.length === 0) {
    grid.innerHTML = `<div class="photos-grid-empty">No photos yet — be the first to share!</div>`;
    return;
  }

  grid.innerHTML = photosData.map((photo, i) => `
    <div class="photo-card" data-index="${i}" tabindex="0" role="button" aria-label="View ${photo.media_type === 'video' ? 'video' : 'photo'}">
      <img src="/api/photos/${photo.id}/thumbnail" alt="${escapeHtml(photo.caption || "")}" loading="lazy" />
      ${photo.media_type === "video" ? `<div class="photo-card-play-badge">▶</div>` : ""}
      <div class="photo-card-overlay">
        <span class="photo-card-uploader">${escapeHtml(photo.uploaded_by_name || "")}</span>
      </div>
    </div>
  `).join("");

  grid.querySelectorAll(".photo-card").forEach(card => {
    card.addEventListener("click", () => {
      openPhotoLightbox(parseInt(card.dataset.index, 10));
    });
  });
}

function initPhotosUpload() {
  const zone = document.getElementById("photos-upload-zone");
  const fileInput = document.getElementById("photos-file-input");
  const previewEl = document.getElementById("photos-upload-preview");
  const actionsEl = document.getElementById("photos-upload-actions");
  const uploadBtn = document.getElementById("photos-upload-btn");
  const cancelBtn = document.getElementById("photos-upload-cancel");
  const progressEl = document.getElementById("photos-upload-progress");
  const progressFill = document.getElementById("photos-progress-fill");
  const progressText = document.getElementById("photos-progress-text");

  if (!zone || !fileInput) return;

  let pendingFiles = [];

  zone.addEventListener("click", () => fileInput.click());

  zone.addEventListener("dragover", (e) => { e.preventDefault(); zone.classList.add("drag-over"); });
  zone.addEventListener("dragleave", () => zone.classList.remove("drag-over"));
  zone.addEventListener("drop", (e) => {
    e.preventDefault();
    zone.classList.remove("drag-over");
    handleFiles(e.dataTransfer.files);
  });

  fileInput.addEventListener("change", () => {
    handleFiles(fileInput.files);
    fileInput.value = "";
  });

  function handleFiles(fileList) {
    pendingFiles = Array.from(fileList).filter(f => f.type.startsWith("image/") || f.type.startsWith("video/")).slice(0, 20);
    if (pendingFiles.length === 0) return;

    previewEl.innerHTML = pendingFiles.map(f => {
      const url = URL.createObjectURL(f);
      if (f.type.startsWith("video/")) {
        return `<div class="photos-preview-thumb" style="position:relative;display:flex;align-items:center;justify-content:center;background:#1a1a2e;">
          <video src="${url}" style="width:100%;height:100%;object-fit:cover;border-radius:inherit;" muted></video>
          <span style="position:absolute;font-size:1.5rem;color:white;text-shadow:0 2px 6px rgba(0,0,0,0.5);">▶</span>
        </div>`;
      }
      return `<img src="${url}" class="photos-preview-thumb" />`;
    }).join("");
    previewEl.classList.remove("hidden");
    actionsEl.classList.remove("hidden");
    zone.classList.add("hidden");
  }

  if (cancelBtn) {
    cancelBtn.addEventListener("click", () => {
      resetUpload();
    });
  }

  if (uploadBtn) {
    uploadBtn.addEventListener("click", async () => {
      if (!photosCurrentTrip || pendingFiles.length === 0) return;

      const caption = document.getElementById("photos-caption")?.value || "";
      const user = Auth.getUser();

      actionsEl.classList.add("hidden");
      progressEl.classList.remove("hidden");

      let uploaded = 0;
      for (const file of pendingFiles) {
        const formData = new FormData();
        formData.append("photos", file);
        formData.append("caption", caption);
        formData.append("uploaded_by", user ? user.id : "");
        formData.append("uploaded_by_name", user ? user.name : "Guest");

        try {
          const token = localStorage.getItem("session_token");
          await fetch(`/api/trips/${photosCurrentTrip}/photos`, {
            method: "POST",
            headers: token ? { "Authorization": `Bearer ${token}` } : {},
            body: formData,
          });
        } catch (e) {
          console.error("Photo upload failed:", e);
        }

        uploaded++;
        const pct = Math.round((uploaded / pendingFiles.length) * 100);
        if (progressFill) progressFill.style.width = pct + "%";
        if (progressText) progressText.textContent = `${uploaded} of ${pendingFiles.length} uploaded`;
      }

      resetUpload();
      loadTripPhotos(photosCurrentTrip);
    });
  }

  function resetUpload() {
    pendingFiles = [];
    if (previewEl) { previewEl.innerHTML = ""; previewEl.classList.add("hidden"); }
    if (actionsEl) actionsEl.classList.add("hidden");
    if (progressEl) progressEl.classList.add("hidden");
    if (progressFill) progressFill.style.width = "0%";
    if (zone) zone.classList.remove("hidden");
    const captionInput = document.getElementById("photos-caption");
    if (captionInput) captionInput.value = "";
  }
}

function initPhotosLightbox() {
  const lightbox = document.getElementById("photo-lightbox");
  const img = document.getElementById("photo-lightbox-img");
  const caption = document.getElementById("photo-lightbox-caption");
  const meta = document.getElementById("photo-lightbox-meta");
  const downloadLink = document.getElementById("photo-lightbox-download");
  const deleteBtn = document.getElementById("photo-lightbox-delete");
  const closeBtn = document.getElementById("photo-lightbox-close");
  const prevBtn = document.getElementById("photo-lightbox-prev");
  const nextBtn = document.getElementById("photo-lightbox-next");
  const backdrop = lightbox?.querySelector(".photo-lightbox-backdrop");

  if (!lightbox) return;

  // Video element (created once, reused)
  let videoEl = null;
  function getVideoEl() {
    if (!videoEl) {
      videoEl = document.createElement("video");
      videoEl.className = "photo-lightbox-video";
      videoEl.controls = true;
      videoEl.playsInline = true;
      videoEl.preload = "metadata";
      img.parentNode.insertBefore(videoEl, img.nextSibling);
    }
    return videoEl;
  }

  function show(index) {
    if (!photosData[index]) return;
    photosLightboxIndex = index;
    const photo = photosData[index];
    const src = `/api/photos/${photo.id}/file`;
    const isVideo = photo.media_type === "video";

    if (isVideo) {
      const vid = getVideoEl();
      vid.src = src;
      vid.style.display = "";
      img.style.display = "none";
      vid.load();
    } else {
      img.src = src;
      img.style.display = "";
      if (videoEl) { videoEl.pause(); videoEl.src = ""; videoEl.style.display = "none"; }
    }

    caption.textContent = photo.caption || "";
    const d = new Date(photo.created);
    meta.textContent = `${photo.uploaded_by_name || "Unknown"} • ${d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;
    downloadLink.href = src;
    downloadLink.download = photo.filename || (isVideo ? "video.mp4" : "photo.jpg");

    lightbox.classList.remove("hidden");
    document.body.style.overflow = "hidden";
  }

  function close() {
    lightbox.classList.add("hidden");
    document.body.style.overflow = "";
    img.src = "";
    if (videoEl) { videoEl.pause(); videoEl.src = ""; }
  }

  function prev() {
    if (photosLightboxIndex > 0) show(photosLightboxIndex - 1);
  }

  function next() {
    if (photosLightboxIndex < photosData.length - 1) show(photosLightboxIndex + 1);
  }

  window.openPhotoLightbox = show;

  if (closeBtn) closeBtn.addEventListener("click", close);
  if (backdrop) backdrop.addEventListener("click", close);
  if (prevBtn) prevBtn.addEventListener("click", prev);
  if (nextBtn) nextBtn.addEventListener("click", next);

  document.addEventListener("keydown", (e) => {
    if (lightbox.classList.contains("hidden")) return;
    if (e.key === "Escape") close();
    if (e.key === "ArrowLeft") prev();
    if (e.key === "ArrowRight") next();
  });

  if (deleteBtn) {
    deleteBtn.addEventListener("click", async () => {
      const photo = photosData[photosLightboxIndex];
      if (!photo) return;
      if (!confirm("Delete this photo?")) return;

      try {
        await apiFetch(`/photos/${photo.id}`, { method: "DELETE" });
      } catch (e) { }

      close();
      loadTripPhotos(photosCurrentTrip);
    });
  }
}
