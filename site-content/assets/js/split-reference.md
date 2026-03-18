# script.js Split — HTML Page Script Tags Reference

Every page loads `script.js` first (core + auth), then only the files it needs.
Cache-bust version: `?v=15` (bump from current v=13/14)

## index.html (Dashboard)
```html
<script src="assets/js/script.js?v=15"></script>
<script src="assets/js/dashboard.js?v=15"></script>
<script src="assets/js/modals.js?v=15"></script>
<script src="assets/js/header.js?v=15"></script>
<script src="assets/js/budget.js?v=15"></script>
```

## itinerary.html
```html
<script src="assets/js/script.js?v=15"></script>
<script src="assets/js/dashboard.js?v=15"></script>
<script src="assets/js/itinerary.js?v=15"></script>
<script src="assets/js/modals.js?v=15"></script>
<script src="assets/js/header.js?v=15"></script>
<script src="assets/js/budget.js?v=15"></script>
```
Note: itinerary needs dashboard.js for `renderTripSwitcher()` and `getNextActivity()`

## budget.html
```html
<script src="assets/js/script.js?v=15"></script>
<script src="assets/js/budget.js?v=15"></script>
<script src="assets/js/header.js?v=15"></script>
```

## wishlist.html
```html
<script src="assets/js/script.js?v=15"></script>
<script src="assets/js/wishlist.js?v=15"></script>
<script src="assets/js/header.js?v=15"></script>
```

## photos.html
```html
<script src="assets/js/script.js?v=15"></script>
<script src="assets/js/photos.js?v=15"></script>
<script src="assets/js/header.js?v=15"></script>
```

## profile.html
```html
<script src="assets/js/script.js?v=15"></script>
<script src="assets/js/header.js?v=15"></script>
```

## history.html
```html
<script src="assets/js/script.js?v=15"></script>
<script src="assets/js/header.js?v=15"></script>
```

## pretrip.html
```html
<script src="assets/js/script.js?v=15"></script>
<script src="assets/js/header.js?v=15"></script>
```

## tv.html
```html
<script src="assets/js/script.js?v=15"></script>
<script src="assets/js/dashboard.js?v=15"></script>
<script src="assets/js/header.js?v=15"></script>
```

## admin.html — unchanged (already has its own admin.js)
```html
<script src="assets/js/script.js?v=15"></script>
<script src="assets/js/header.js?v=15"></script>
```

## planner.html — unchanged (already has its own planner.js)
```html
<script src="assets/js/script.js?v=15"></script>
<script src="assets/js/header.js?v=15"></script>
```

---

## File Responsibilities

| File | Lines | What it contains |
|------|-------|------------------|
| `script.js` | 998 | API client, DB wrappers (Itinerary/Wishlist/Budget/ParkDays/Venues), Auth + login, shared helpers, E-ticket config, trip separation, Disney location map, confirm dialog, animations, `initApp()` |
| `dashboard.js` | 457 | Next Activity hero + countdown, Later Today row, budget/wishlist snapshot cards, trip switcher, dashboard init |
| `itinerary.js` | 851 | Itinerary day-by-day rendering, activity form CRUD, undo toast, venue autocomplete + browser, edit trip modal |
| `header.js` | 787 | Weather widget (badge + modal + hourly), park day banner + config + character swap + live hours, nav pill, budget quick-add pill |
| `budget.js` | 545 | Budget page load/render, transactions, budget wizard, cancel trip |
| `modals.js` | 381 | Activity detail modal (map, walk time, navigate), dining memories, dining feedback modal |
| `wishlist.js` | 178 | Wishlist page rendering + add form with image upload |
| `photos.js` | 290 | Photos page + trip selector, upload zone with drag/drop, lightbox |

## Deployment Steps

1. Copy all 8 .js files to `~/homelab/disney/disney-site/site-content/assets/js/`
2. Update each HTML file's `<script>` tags per the reference above
3. Purge Cloudflare cache
4. Hard refresh on mobile