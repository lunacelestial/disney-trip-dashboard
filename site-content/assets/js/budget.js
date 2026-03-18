// ============================================================
// BUDGET PAGE — Personal per-user budgets
// Each user sets and tracks their own budget for each trip.
// Depends on: script.js (core), header.js (refreshBudgetPill, DISNEY_PROMPTS)
// ============================================================

// ── State ──────────────────────────────────────────────────
let activeTripId = null;

// ── Helpers ───────────────────────────────────────────────
function buildTripId(startDate, endDate) {
  return `trip-${startDate}-${endDate}`;
}

function tripLabel(startDate, endDate) {
  const fmt = d => new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  return `${fmt(startDate)} – ${fmt(endDate)}`;
}

// ── Disney expense prompts (shared with header quick-add) ────
const DISNEY_PROMPTS = [
  "What treasure did we find?",
  "Which Disney dream did we fund?",
  "Treats, toys, or trinkets?",
  "What's the latest souvenir?",
  "What did Mickey talk us into?",
  "Add an item to your adventure...",
  "Log a piece of the story...",
  "Record a magical expense...",
  "What's the latest addition to the trip?",
  "What made the magic happen?",
  "Describe the deliciousness...",
];

// Sort trips: active first, then upcoming, then past
function sortTripsByStatus(allTrips) {
  const today = new Date().toISOString().split('T')[0];
  return [...allTrips].sort((a, b) => {
    const statusScore = t => {
      if (today >= t.start_date && today <= t.end_date) return 0;
      if (t.start_date > today) return 1;
      return 2;
    };
    const sa = statusScore(a), sb = statusScore(b);
    if (sa !== sb) return sa - sb;
    return sa === 1
      ? a.start_date.localeCompare(b.start_date)
      : b.start_date.localeCompare(a.start_date);
  });
}

// ── Load & render ─────────────────────────────────────────

async function loadBudget(tripId) {
  try {
    const allTrips = await apiFetch('/trip-budgets');
    const user = Auth.getUser();

    if (tripId) {
      activeTripId = tripId;
    } else if (!activeTripId) {
      const today = new Date().toISOString().split("T")[0];
      const current = allTrips.find(t => today >= t.start_date && today <= t.end_date);
      const upcoming = allTrips.find(t => t.start_date > today);
      activeTripId = (current || upcoming || allTrips[0])?.trip_id || null;
    }

    const trip = activeTripId ? allTrips.find(t => t.trip_id === activeTripId) : null;

    // Trip member gating check
    if (trip && activeTripId) {
      const isMember = await checkTripMembership(activeTripId);
      if (!isMember) {
        const summaryContainer = document.getElementById("budget-summary");
        const transContainer = document.getElementById("transactions-section");
        if (summaryContainer) {
          const sortedTrips = sortTripsByStatus(allTrips);
          const tripOptions = sortedTrips.map(t =>
            `<option value="${t.trip_id}" ${t.trip_id === trip.trip_id ? 'selected' : ''}>${t.label}</option>`
          ).join('');
          summaryContainer.innerHTML = `
            <div class="budget-trip-pill">
              <label class="card-label">Viewing Budget For</label>
              <select id="trip-select" onchange="loadBudget(this.value)">${tripOptions}</select>
            </div>
          `;
          showTripGatingMessage(transContainer || summaryContainer, trip.label);
        }
        return;
      }
    }

    // Fetch the current user's personal budget for this trip
    let myBudget = null;
    if (activeTripId && user) {
      try {
        myBudget = await apiFetch(`/trips/${activeTripId}/my-budget`);
      } catch (e) {
        console.warn("[Budget] Could not fetch personal budget:", e);
      }
    }

    renderBudgetSummary(trip, allTrips, myBudget);
    renderTransactions(myBudget ? myBudget.transactions : [], trip, myBudget);
  } catch (err) {
    console.error('Error loading budget:', err.message || err);
    const summaryContainer = document.getElementById("budget-summary");
    if (summaryContainer) {
      summaryContainer.innerHTML = `
        <div class="budget-remaining-hero no-budget">
          <div class="remaining-hero-inner">
            <p class="card-label">🥺 No Trip Budget Set 🥺</p>
            <h4>READY TO PLAN YOUR MAGIC?</h4>
            <button onclick="openBudgetWizard()" class="btn-primary">✨ Set My Budget</button>
          </div>
        </div>
      `;
    }
  }
}

function renderBudgetSummary(trip, allTrips, myBudget) {
  const summaryContainer = document.getElementById('budget-summary');
  if (!summaryContainer) return;

  const user = Auth.getUser();
  const firstName = user ? user.name.split(" ")[0] : "You";

  if (!trip) {
    summaryContainer.innerHTML = `
      <div class="budget-remaining-hero no-budget">
        <div class="remaining-hero-inner">
          <p class="card-label">🥺 No Trip Budget Set 🥺</p>
          <h4>READY TO PLAN YOUR MAGIC?</h4>
          <button onclick="openBudgetWizard()" class="btn-primary">✨ Set My Budget</button>
        </div>
      </div>
    `;
    return;
  }

  const sortedTrips = sortTripsByStatus(allTrips);
  const tripOptions = sortedTrips.map(t =>
    `<option value="${t.trip_id}" ${t.trip_id === trip.trip_id ? 'selected' : ''}>${t.label}</option>`
  ).join('');

  // Use personal budget if it exists, otherwise show setup prompt
  const hasBudget = myBudget && myBudget.exists;
  const budgetTotal = hasBudget ? myBudget.total : 0;
  const budgetSpent = myBudget ? myBudget.spent : 0;
  const remaining = budgetTotal - budgetSpent;
  const pct = budgetTotal > 0 ? Math.min(100, (budgetSpent / budgetTotal) * 100) : 0;
  const overBudget = hasBudget && remaining < 0;

  let budgetHeroHtml = "";
  if (!hasBudget) {
    budgetHeroHtml = `
      <div class="budget-remaining-hero no-budget">
        <div class="remaining-hero-inner">
          <p class="card-label">👋 Hey ${escapeHtml(firstName)}!</p>
          <h4>Set Your Personal Budget</h4>
          <p style="color:var(--slate); font-size:0.9rem; margin:0.5rem 0 1rem;">Everyone tracks their own spending. Set your budget to get started!</p>
          <button onclick="openBudgetWizard('${trip.trip_id}')" class="btn-primary">✨ Set My Budget</button>
        </div>
      </div>
    `;
  } else {
    budgetHeroHtml = `
      <div class="budget-remaining-hero ${overBudget ? 'over-budget' : ''}">
        <div class="remaining-hero-inner">
          <p class="card-label">${escapeHtml(firstName)}'s Remaining</p>
          <h2 class="remaining-amount">${overBudget ? '-' : ''}$${Math.abs(remaining).toFixed(2)}</h2>
          ${overBudget ? '<p class="over-budget-msg">⚠️ Over budget</p>' : ''}
          <div class="budget-progress-bar">
            <div class="budget-progress-fill ${overBudget ? 'over' : ''}" style="width:${pct}%"></div>
          </div>
          <p class="budget-progress-label">$${budgetSpent.toFixed(2)} spent of $${budgetTotal.toFixed(2)}</p>
        </div>
      </div>

      <div class="budget-category-cards">
        ${renderCategoryCard('🏨', 'Hotel', myBudget.hotel, myBudget)}
        ${renderCategoryCard('🍔', 'Dining', myBudget.food, myBudget)}
        ${renderCategoryCard('✨', 'Enchanting Extras', myBudget.extras, myBudget)}
        ${renderCategoryCard('🛍️', 'Souvenirs', myBudget.souvenirs, myBudget)}
      </div>
    `;
  }

  summaryContainer.innerHTML = `
    <div class="budget-trip-pill">
      <label class="card-label">Viewing Budget For</label>
      <select id="trip-select" onchange="loadBudget(this.value)">${tripOptions}</select>
      <div class="budget-actions-row">
        ${hasBudget ? `<button onclick="openBudgetWizard('${trip.trip_id}')" class="budget-action-btn">✏️ Edit My Budget</button>` : ''}
        ${user && user.role === 'admin' ? `<button onclick="cancelTrip('${trip.trip_id}', '${escapeHtml(trip.label)}')" class="budget-action-btn" style="color:#b91c1c; border-color:#fca5a5;">🗑️ Cancel Trip</button>` : ''}
      </div>
    </div>

    <div class="budget-main-layout">
      ${budgetHeroHtml}
    </div>
  `;
}

function renderCategoryCard(icon, label, budgeted, myBudget) {
  const catKey = { 'Hotel': 'Hotel', 'Dining': 'Food', 'Enchanting Extras': 'Extras', 'Souvenirs': 'Merch' }[label];
  const transactions = myBudget.transactions || [];
  const spent = transactions
    .filter(t => t.category === catKey)
    .reduce((s, t) => s + t.amount, 0);
  const remaining = budgeted - spent;
  const over = remaining < 0;
  return `
    <div class="budget-cat-card ${over ? 'over' : ''}">
      <span class="cat-icon">${icon}</span>
      <span class="cat-label">${label}</span>
      <span class="cat-budgeted">$${budgeted.toFixed(2)}</span>
      <span class="cat-spent ${over ? 'over' : ''}">$${spent.toFixed(2)} spent</span>
    </div>
  `;
}

// ── Transactions ──────────────────────────────────────────

function renderTransactions(transactions, trip, myBudget) {
  const container = document.getElementById('transactions-section');
  if (!container) return;

  if (!trip) {
    container.innerHTML = '';
    return;
  }

  const user = Auth.getUser();
  const firstName = user ? user.name.split(" ")[0] : "You";
  const randomPrompt = DISNEY_PROMPTS[Math.floor(Math.random() * DISNEY_PROMPTS.length)];

  let html = `
    <div class="card transaction-entry-card">
      <h2>Add Magical Expense</h2>
      <form id="add-transaction-form" class="transaction-form">
        <input type="text" id="t-description" placeholder="${randomPrompt}" required />
        <input type="number" id="t-amount" placeholder="Cost ($)" step="0.01" min="0.01" required />
        <select id="t-category">
          <option value="Food">Dining 🍔</option>
          <option value="Merch">Souvenirs 🛍️</option>
          <option value="Hotel">Hotel 🏨</option>
          <option value="Extras">Enchanting Extras ✨</option>
          <option value="Tickets">Tickets/Genie+ 🎟️</option>
          <option value="Other">Other</option>
        </select>
        <input type="date" id="t-date" value="${new Date().toISOString().split('T')[0]}" title="Date of expense" />
        <button type="submit" class="btn-primary">Add Expense</button>
      </form>
    </div>

    <div class="card recent-transactions-card">
      <h2>${escapeHtml(firstName)}'s Transactions</h2>
      <div class="transaction-list">
  `;

  if (transactions.length === 0) {
    html += `<p class="empty-msg">No transactions yet. Add one above!</p>`;
  } else {
    transactions.forEach(t => {
      html += `
        <div class="transaction-item">
          <div class="t-main">
            <span class="t-desc">${escapeHtml(t.description)}</span>
            <span class="t-cat badge">${t.category || 'Other'}</span>
          </div>
          <div class="t-side">
            <span class="t-amt">$${t.amount.toFixed(2)}</span>
            <button onclick="deleteTransaction('${t.id}')" class="btn-delete">✕</button>
          </div>
        </div>
      `;
    });
  }

  html += `</div></div>`;
  container.innerHTML = html;

  const form = document.getElementById('add-transaction-form');
  if (form) form.addEventListener('submit', handleAddTransaction);
}

async function handleAddTransaction(e) {
  e.preventDefault();
  if (!activeTripId) return;

  const newTransaction = {
    id:          `trans-${Date.now()}`,
    description: document.getElementById('t-description').value,
    amount:      parseFloat(document.getElementById('t-amount').value),
    category:    document.getElementById('t-category').value,
    date:        document.getElementById('t-date')?.value || new Date().toISOString().split('T')[0],
    trip_id:     activeTripId,
  };

  try {
    await apiFetch('/budget/transactions', {
      method: 'POST',
      body: JSON.stringify(newTransaction)
    });
    loadBudget();
    if (typeof refreshBudgetPill === "function") refreshBudgetPill();
  } catch (err) {
    console.error('Error adding transaction:', err);
  }
}

async function deleteTransaction(id) {
  try {
    await apiFetch(`/budget/transactions/${id}`, { method: 'DELETE' });
    loadBudget();
    if (typeof refreshBudgetPill === "function") refreshBudgetPill();
  } catch (err) {
    console.error('Error deleting transaction:', err);
  }
}

// ── Budget Wizard (per-user) ──────────────────────────────

async function openBudgetWizard(editTripId) {
  try {
    const allTrips = await apiFetch('/trip-budgets').catch(() => []);

    // If editing a specific trip, prefill from the user's personal budget
    let prefill = null;
    if (editTripId) {
      try {
        const myBudget = await apiFetch(`/trips/${editTripId}/my-budget`);
        if (myBudget.exists) {
          prefill = { ...myBudget, trip_id: editTripId };
        }
      } catch (e) { }
    }

    showBudgetWizardModal(allTrips, prefill, editTripId);
  } catch (err) {
    console.error('openBudgetWizard error:', err);
    alert('Could not open budget wizard. Check the console for details.');
  }
}

function showBudgetWizardModal(allTrips, prefill, preselectedTripId) {
  document.getElementById('budget-wizard-overlay')?.remove();

  const user = Auth.getUser();
  const firstName = user ? user.name.split(" ")[0] : "You";
  const today = new Date().toISOString().split('T')[0];

  let tripOptions = allTrips.map(t => {
    const tag = today >= t.start_date && today <= t.end_date ? ' 🌟 Current' :
                t.start_date > today ? ' ⏳ Upcoming' : ' 📅 Past';
    const hasMyBudget = t.myBudget ? ' ✓' : '';
    return `<option value="${t.trip_id}" data-start="${t.start_date}" data-end="${t.end_date}"
      ${preselectedTripId === t.trip_id ? 'selected' : ''}>${t.label}${tag}${hasMyBudget}</option>`;
  }).join('');

  if (!allTrips.length) {
    tripOptions = `<option value="" disabled>No trips yet — create one in the Planner</option>`;
  }

  const p = prefill || {};
  const overlay = document.createElement('div');
  overlay.id = 'budget-wizard-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;z-index:99999;padding:1rem;';

  overlay.innerHTML = `
    <div style="background:#fff;border-radius:20px;padding:2rem;max-width:480px;width:100%;max-height:90vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,0.3);">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1.5rem;">
        <h2 style="margin:0;font-size:1.4rem;color:#1a1a2e;">✨ ${escapeHtml(firstName)}'s Budget</h2>
        <button onclick="document.getElementById('budget-wizard-overlay').remove()" style="background:none;border:none;font-size:1.5rem;cursor:pointer;color:#94a3b8;">✕</button>
      </div>

      <div class="wizard-step" id="wizard-step-1"${preselectedTripId ? ' style="display:none;"' : ''}>
        <p style="font-weight:700;color:#1a1a2e;margin:0 0 0.5rem;">Which trip?</p>
        ${allTrips.length ? `<select id="wizard-trip-select" style="width:100%;padding:0.75rem;border-radius:10px;border:2px solid #e2e8f0;font-size:1rem;margin-bottom:1rem;">${tripOptions}</select>` : ''}
        <p style="color:var(--slate);font-size:0.85rem;margin:0 0 1rem;">Each person sets their own budget. This is just for you!</p>
        ${allTrips.length ? `<button onclick="wizardGoToStep2()" class="btn-primary" style="width:100%;">Next →</button>` : `<a href="planner.html" class="btn-primary" style="display:block;text-align:center;text-decoration:none;width:100%;">Go to Planner</a>`}
      </div>

      <div class="wizard-step${preselectedTripId ? '' : ' hidden'}" id="wizard-step-2">
        <p style="font-weight:700;color:#1a1a2e;margin:0 0 0.25rem;">How much are you planning to spend?</p>
        <p style="color:var(--slate);font-size:0.85rem;margin:0 0 1rem;">This is your personal budget — others set theirs separately.</p>
        <div style="display:flex;flex-direction:column;gap:0.75rem;margin-bottom:1rem;">
          ${wizardInput('🏨', 'Hotel', 'wizard-hotel', p.hotel)}
          ${wizardInput('🍔', 'Food & Dining', 'wizard-food', p.food)}
          ${wizardInput('✨', 'Enchanting Extras', 'wizard-extras', p.extras)}
          ${wizardInput('🛍️', 'Souvenirs', 'wizard-souvenirs', p.souvenirs)}
        </div>
        <div style="background:#f8fafc;border-radius:12px;padding:1rem;margin-bottom:1rem;text-align:center;">
          <p style="margin:0;font-size:0.85rem;color:#64748b;font-weight:600;">${escapeHtml(firstName).toUpperCase()}'S TOTAL</p>
          <p id="wizard-total" style="margin:0;font-size:2rem;font-weight:900;color:#1a1a2e;">$0.00</p>
        </div>
        <div style="display:flex;gap:0.75rem;">
          ${!preselectedTripId ? `<button onclick="wizardGoToStep1()" style="flex:1;padding:0.75rem;border-radius:10px;border:2px solid #e2e8f0;background:#fff;font-weight:700;cursor:pointer;">← Back</button>` : ''}
          <button onclick="wizardSave()" class="btn-primary" style="flex:2;">Save My Budget ✨</button>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  ['wizard-hotel','wizard-food','wizard-extras','wizard-souvenirs'].forEach(id => {
    document.getElementById(id)?.addEventListener('input', updateWizardTotal);
  });
  updateWizardTotal();
}

function wizardInput(icon, label, id, value) {
  return `
    <div style="display:flex;align-items:center;gap:0.75rem;background:#f8fafc;border-radius:10px;padding:0.75rem;">
      <span style="font-size:1.4rem;">${icon}</span>
      <label style="flex:1;font-weight:600;color:#1a1a2e;font-size:0.95rem;">${label}</label>
      <input type="number" id="${id}" min="0" step="0.01" placeholder="$0.00"
        value="${value > 0 ? value : ''}"
        style="width:100px;padding:0.5rem;border-radius:8px;border:2px solid #e2e8f0;text-align:right;font-size:1rem;font-weight:700;">
    </div>
  `;
}

function updateWizardTotal() {
  const total = ['wizard-hotel','wizard-food','wizard-extras','wizard-souvenirs']
    .reduce((s, id) => s + (parseFloat(document.getElementById(id)?.value) || 0), 0);
  const el = document.getElementById('wizard-total');
  if (el) el.textContent = `$${total.toFixed(2)}`;
}

function wizardGoToStep1() {
  document.getElementById('wizard-step-1')?.classList.remove('hidden');
  document.getElementById('wizard-step-1').style.display = '';
  document.getElementById('wizard-step-2')?.classList.add('hidden');
}

function wizardGoToStep2() {
  const sel = document.getElementById('wizard-trip-select');
  if (!sel || !sel.value) return;

  document.getElementById('wizard-step-1')?.classList.add('hidden');
  document.getElementById('wizard-step-2')?.classList.remove('hidden');
  document.getElementById('wizard-hotel')?.focus();
}

async function wizardSave() {
  const sel = document.getElementById('wizard-trip-select');
  let trip_id;

  if (sel) {
    trip_id = sel.value;
  } else {
    trip_id = activeTripId;
  }

  if (!trip_id) {
    alert("No trip selected.");
    return;
  }

  const body = {
    hotel:     parseFloat(document.getElementById('wizard-hotel')?.value) || 0,
    food:      parseFloat(document.getElementById('wizard-food')?.value) || 0,
    extras:    parseFloat(document.getElementById('wizard-extras')?.value) || 0,
    souvenirs: parseFloat(document.getElementById('wizard-souvenirs')?.value) || 0,
  };

  console.log('[wizardSave] Saving personal budget:', { trip_id, body });

  try {
    await apiFetch(`/trips/${trip_id}/my-budget`, {
      method: 'PUT',
      body: JSON.stringify(body),
    });
    document.getElementById('budget-wizard-overlay')?.remove();
    invalidateTripBudgetsCache();
    activeTripId = trip_id;
    loadBudget();
    if (typeof refreshBudgetPill === "function") refreshBudgetPill();
    showToast("✅ Budget saved!");
  } catch (err) {
    console.error('Error saving personal budget:', err);
    alert('Failed to save: ' + String(err?.message || err));
  }
}

// ── Cancel Trip ──────────────────────────────────────────

async function cancelTrip(tripId, tripLabel) {
  if (!tripId) return;

  const confirmed = await showConfirmDialog(
    `Cancel trip "${tripLabel || tripId}"?\n\nThis will permanently delete ALL activities, park days, budgets, transactions, trip members, and photos for this trip. This cannot be undone.`
  );
  if (!confirmed) return;

  const reallyConfirmed = await showConfirmDialog(
    `Are you absolutely sure? Everything for this trip will be gone forever.`
  );
  if (!reallyConfirmed) return;

  try {
    await apiFetch(`/trips/${tripId}/cancel`, { method: "DELETE" });
    showToast("🗑️ Trip cancelled and all data removed.");

    invalidateTripBudgetsCache();
    activeTripId = null;
    selectedTripIndex = -1;

    if (document.getElementById("budget-summary")) loadBudget();
    if (document.getElementById("itinerary-list")) { await renderTripSwitcher(); await renderItinerary(); }
    if (document.getElementById("photos-trip-bubbles")) location.reload();

    if (typeof refreshBudgetPill === "function") await refreshBudgetPill();
  } catch (err) {
    console.error("Trip cancellation failed:", err);
    showToast("❌ Failed to cancel trip. Check console.");
  }
}

// ── Init ─────────────────────────────────────────────────

function initializeBudgetPage() {
  if (!document.getElementById("budget-summary")) return;
  loadBudget();
}