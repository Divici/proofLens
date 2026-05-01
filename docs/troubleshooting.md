# proofLens troubleshooting

Common issues and how to fix them. If you hit something that isn't
covered here, file an issue and include `pnpm --version`, your Node
version, and the browser/OS combo.

## Camera permissions

**Symptom**: "Camera" button on `/review` shows "We can't access your
camera" even after clicking Allow.

- Make sure you're served over `https://` (or `http://localhost`).
  `getUserMedia` requires a secure context.
- Some browsers cache permission denials at the site level. Open the
  site permissions panel (the lock icon in the address bar) and reset
  Camera to "Ask" / "Allow".
- On macOS, also check System Settings → Privacy & Security → Camera
  and confirm your browser is in the allow-list.
- If you're on a corporate device, an MDM profile may block camera
  access. The fallback is uploading a JPEG / PNG via the file
  picker.

## OpenRouter rate limits

**Symptom**: Single-label flow returns "The vision provider could not
extract this label. Please try again in a moment." Or the batch flow
shows several rows in a Failed state with a 429-flavoured error.

- The default rate-limit pacing in the batch pool is `600 ms` between
  requests (~100/min). If you're sharing the API key across teammates,
  raise this in `app/batch/page.tsx`'s `RATE_LIMIT_MIN_INTERVAL_MS`.
- OpenRouter dashboards show your live limit and remaining budget.
  Check there before assuming the upstream is down.
- Use **Retry all failed** on the batch page once the limit window
  rolls over — failed rows retain their expected data and re-run
  cleanly.

## Provider unreachable banner

**Symptom**: A red alert at the top of `/review` and `/batch` says
"AI extraction is unavailable."

- Open `/settings` and check the OpenRouter row. If it's
  Unreachable, the upstream is down or your API key is rejected.
- Open `/api/health` directly. A 503 with `providers.openrouter:
  false` confirms the probe failed.
- If you see Reachable on `/settings` but the banner persists, the
  banner polls every 60 s. Refresh once your fix lands.
- Saved review history and exports continue to work even when
  OpenRouter is unreachable — the banner is informational about new
  extractions only.

## IndexedDB quota

**Symptom**: Amber banner on `/review` or `/history` saying "History
is nearly full ([n]% used). Export and clear before adding many more
reviews."

- Click any saved review's **Export** menu and download a JSON
  bundle (your machine-readable archive) and / or PDF (the human-
  readable audit copy).
- Clear individual reviews via your browser's storage panel (DevTools
  → Application → IndexedDB → `prooflens`). The app does not yet
  ship a one-click clear control — that's a future improvement.
- Uploaded images themselves are never persisted; only the 256-px
  thumbnail. If you're hitting quota, it's the cumulative weight of
  many reviews, not a single oversized one.

## Reviewer name doesn't pre-fill on a fresh tab

**Symptom**: You named yourself on `/review` last week, but
`/review` and `/batch` are showing a blank reviewer field today.

- The reviewer name is stored in IndexedDB's `settings` store. If
  you cleared site data, the value is gone.
- Open DevTools → Application → IndexedDB → `prooflens` → `settings`
  and check the `reviewerName` key. If absent, just type your name
  again — saving a review re-persists it.

## Batch save lost on tab close

**Symptom**: You ran a 200-file batch, closed the tab while the
queue was still mid-flight, and now `/history` shows nothing.

- Saves are atomic at batch-completion. Per-row results are buffered
  in memory until every row finishes (success or failure).
- For batches under a few hundred files, keep the tab open until the
  green **Saved to history** pill appears.
- For very large batches, plan to leave the tab open in the
  background — it doesn't need focus, but it does need to keep
  running.

## Tesseract.js cold-start latency

**Symptom**: The first single-label extraction after deploy takes
visibly longer than subsequent calls.

- Tesseract.js loads its language model on first use; subsequent
  calls reuse the cached worker. Cold start adds roughly 0.5 s.
- A planned warm-keep cron at `/api/health` (every 5 minutes) is
  documented in the future-improvements list. Until it ships, expect
  the first call after a Vercel function spin-up to be slower.

## Vercel deploy issues

### "OPENROUTER_API_KEY is required" on first deploy

The validator at `lib/env.ts` runs on every server route. Add the
env vars in Vercel project settings (do **not** check secrets into
the repo), redeploy, and confirm `/api/health` returns 200.

### Long PDF render times

`@react-pdf/renderer` boots a tiny rendering pipeline; for very long
batches the All PDFs (zip) export is intentionally sequential to
keep memory pressure low. If you need speed, batch the export in
chunks of 5 (manual) or run renders in parallel (`Promise.all` in
`exportBatch.allPdfsZip`) — the trade-off is more peak memory.

### Sharp native binary mismatch

If the Vercel deploy fails on `sharp`, ensure the deployment region
matches the binary you have locally. Vercel's Node 20 runtime ships
the right `sharp` for `iad1`; if you've forced a different region,
re-install via `pnpm install --force` after pinning the region.

## Test suite issues

### "fullyParallel: true + IndexedDB cross-test contamination"

Each Playwright spec touching IDB now wipes `indexedDB
.deleteDatabase('prooflens')` in `beforeEach`. If you see flake on a
new spec, mirror that pattern (see `test/e2e/override-and-history
.spec.ts` for the canonical example).

### Vitest `--localstorage-file` warnings

Harmless. Comes from a transitive dep's startup probe; the warning
doesn't affect test results.

### Playwright "port 3000 already in use"

The Playwright config picks the port from `PORT`. Run
`PORT=3210 pnpm test:e2e` (or any free port).
