# Research Findings 04: Architecture & Infrastructure

**Project:** proofLens — AI-powered alcohol-label compliance verification
**Scope:** PRD §20.5 — architecture, file upload strategy, image preprocessing,
batch jobs, history storage, exports, deployment, security posture, restricted-network
behavior. Plus three input modalities (file, batch + CSV/JSON, live camera) and
auth-with-guest-mode.

**Hard constraints assumed (from ALIGNMENT.md):**
- p50 ≤ 5s, p95 ≤ 8s for single-label end-to-end
- Real auth + guest mode (anonymous → linkable account)
- Originals ephemeral by default; opt-in retention for authenticated users
- Batch: 250-file cap, 10 concurrent extractions, soft-warn at 50
- Polished, deployed live URL — not v1, MVP, or thin slice
- Forge defaults: Next.js + TypeScript + shadcn/ui + Tailwind v4 +
  Vercel/Railway

---

## Q1 — Next.js version & router model

**Recommendation:** **Next.js 16.2 (App Router, RSC).** Production-stable as of
April 2026. Use a hybrid of **Server Actions for mutations** and **Route
Handlers for streaming + binary uploads + LLM I/O**.

### Stability & Toolchain

- Next.js 16.0 shipped Oct 21, 2025; 16.2 shipped Mar 18, 2026; 16.2.2 patch
  shipped Apr 1, 2026. Stable.
- App Router is the production default. Pages Router is now legacy-only.
- Turbopack is the default bundler for `next dev` and `next build` in 16.x.
  ~400% faster dev startup, ~50% faster rendering vs 15.x.
- React Compiler 1.0 is built-in and stable.
- React 19.2 features available (Suspense improvements, `<Activity>`,
  `<ViewTransition>`, useEffectEvent).

### Server Actions vs Route Handlers — Decision Matrix

| Use case | Pick | Why |
|---|---|---|
| Form submit (verify single label, save override, save final decision) | Server Action | Built-in CSRF, progressive enhancement, automatic revalidation |
| File upload + multipart (single image, batch ZIP) | Route Handler (`POST /api/labels/upload`) | Native multipart parsing, controllable Content-Length limits, easy signed-URL handoff |
| LLM streaming (token-by-token reasoning) | Route Handler with `ReadableStream` | Vercel AI SDK lives natively here; Server Actions can stream but ergonomics are worse |
| Batch progress feed (per-label status updates) | Route Handler with **SSE** | One server-to-client channel; survives reconnect; works with Inngest realtime hooks |
| Opt-in retention upload to object storage | Route Handler that returns **pre-signed URL**; client uploads direct to R2 | Avoids streaming the full image through Vercel; no 4.5 MB body cap concern |
| Webhooks from Inngest, Helicone | Route Handler | Standard HTTP contract |

**SSE boilerplate gotcha:** every SSE route must declare
`export const dynamic = 'force-dynamic'` and `export const runtime = 'nodejs'`.
Otherwise Vercel's static optimizer breaks streaming.

### Streaming for Batch — SSE > Server Actions

For 250-file batch progress, SSE on a Route Handler is cleaner than Server
Action revalidation:
- One persistent server-push channel; no client polling.
- Native browser `EventSource` API — zero deps.
- Plays well with Inngest's `realtime` channel publishes.
- Server Actions stream React payloads, not arbitrary JSON events; the model
  is awkward when you want `{labelId, status, fieldsCompleted}` deltas at high
  frequency.

---

## Q2 — Database

### Comparison

| Option | Pricing (low-traffic demo) | Cold start | Branching | Auth/Storage included | Pooling |
|---|---|---|---|---|---|
| **Neon** | Free tier: 100 compute-hr/mo, 0.5 GB/project, **never expires**; Launch $19/mo | ~500 ms (suspends after 5 min idle) | First-class (instant DB branches per PR) | No | Built-in serverless pooler (PgBouncer) |
| **Supabase** | Free tier: 2 projects, 500 MB DB, 1 GB storage, pauses after 7 days inactivity; Pro $25/mo | None (always-on) | Branching available on paid plan | Yes (Auth + Storage + Realtime + Edge Fns) | Supavisor (PgBouncer-based) |
| **Vercel Postgres** | Powered by Neon under the hood; sold via Vercel marketplace | Same as Neon | Same as Neon | No | Same as Neon |
| **Railway Postgres** | $5 credit/mo on Hobby; pay-per-resource | None | Manual branch via DB copy | No | Plug a PgBouncer container next to it |

### Recommendation: **Neon (via Vercel Marketplace)**

**Why:**
- Scale-to-zero is ideal for a demo — most demo windows are idle.
- Branching per PR is gold for the eval phase and demo prep.
- Marketplace integration provisions `DATABASE_URL` straight into the Vercel
  project; no manual env wiring.
- Databricks acquisition (early 2026) reduced compute costs 15–25%.
- Neon's serverless pooler handles serverless function fan-out without an
  external PgBouncer.

**Why not Supabase:** would conflict with our Better Auth + R2 choices below.
Supabase is great when you want one platform; we'd use a fraction of it and
duplicate work.

**Why not Railway Postgres:** we're deploying the app on Vercel (see Q13),
and a Vercel-frontend → Railway-DB cross-cloud round trip adds ~15–40 ms per
query. Not catastrophic, but unnecessary.

### Connection Pooling

- Use Neon's **pooled connection string** (`pooler.neon.tech`) for serverless
  function code paths.
- Use the **direct connection string** for migration scripts and Drizzle
  migrate command.
- Hard-cap concurrent DB connections per function; serverless fan-out can
  exhaust pools fast.

---

## Q3 — ORM / DB client

### Comparison

| ORM | Bundle | Cold start | TS DX | Migration story | Edge runtime |
|---|---|---|---|---|---|
| **Drizzle** | ~33 KB | < 500 ms | Excellent (SQL-like, type-inferred) | `drizzle-kit generate` → SQL files in repo, `drizzle-kit migrate` to apply | Yes (native) |
| **Prisma 7** | ~250 KB (post-Rust-engine removal) | ~500 ms (down from 1–3 s in v6) | Excellent (codegen schema → client) | `prisma migrate dev` / `deploy` with `migrations/` directory | Improved but heavier |
| **Kysely** | ~28 KB | < 500 ms | Excellent (pure type-safe query builder, no schema model) | DIY (typically `kysely-codegen` + raw SQL files via `umzug` or `kysely-migration-cli`) | Yes |

### Recommendation: **Drizzle**

**Why:**
- Smallest serverless cold start (matters for p50 ≤ 5 s).
- Schema lives in TypeScript (`src/db/schema.ts`); types flow naturally; no
  separate `schema.prisma` DSL to learn.
- Migrations are plain SQL files committed to the repo — auditable, reviewable,
  diff-friendly.
- Drizzle Studio is a free GUI for inspection; rivals Prisma Studio.
- Edge-runtime native — option to move read paths to Edge functions later
  without rewriting.
- Pairs cleanly with Better Auth (Better Auth ships first-class Drizzle adapter).

**Why not Prisma 7:** even after the Rust engine removal, Prisma carries more
runtime weight, and our reviewers/agents need fast cold starts. The DX edge
Prisma had is gone now that Drizzle's tooling has matured.

**Why not Kysely:** no schema model means we hand-roll migration tooling and
lose a unified definition of tables. For a polished product with audit-trail
schemas, Drizzle's schema-as-code is a better fit.

---

## Q4 — Auth with guest mode

### Comparison

| Library | Guest/anonymous support | Pricing | Hosting | Notes |
|---|---|---|---|---|
| **Better Auth** | Built-in `anonymous` plugin with `onLinkAccount` hook for guest → real-account migration | Free, OSS, MIT | Self-hosted in your Next.js app | Modern (2025–2026), Drizzle adapter, passkeys, 2FA, organizations, magic links |
| **Auth.js v5 (NextAuth)** | No first-class anon support; community pattern uses a Credentials provider issuing temp JWTs; manual data migration on signup | Free, OSS | Self-hosted | Largest ecosystem; missing built-in 2FA/RBAC; v5 stable since late 2024 |
| **Clerk** | "Anonymous users" as a paid feature; clean conversion API | Free up to 10k MAU; $25/mo + $0.02/MAU after | Hosted SaaS | Best UI components; vendor lock-in; cost grows with traction |
| **Supabase Auth** | Anonymous sign-in is built-in; converts via `linkIdentity()` | Bundled with Supabase Pro $25/mo | Hosted | Only makes sense if we use Supabase elsewhere; we don't |
| **Lucia** | Was a leading choice but **deprecated March 2025**; author pointed users to Better Auth | — | — | Skip |

### Recommendation: **Better Auth**

**Why:**
- The `anonymous` plugin is purpose-built for our exact requirement — a
  guest session that can convert into a real account without losing history.
  `onLinkAccount(anonymousUser, newUser)` callback is the migration hook;
  the anonymous user record is auto-deleted after.
- OSS, MIT, no per-MAU cost — predictable economics for a demo and beyond.
- First-class Drizzle adapter; tables live in our Postgres alongside the
  rest of the schema (no separate identity store).
- Modern stack: passkeys, 2FA, magic-link, OAuth, organizations all included
  if we want to enable them without swapping libraries.
- Native Next.js App Router integration; Server Actions and middleware both
  supported.

**Implementation note:** for the audit trail's `Guest – {session id}` format
(per ALIGNMENT.md Q1), use the anonymous user's UUID truncated to 8 chars +
created-at timestamp. Persist via the cookie session for the duration of the
browser session.

---

## Q5 — Object storage for opt-in retention

### Comparison

| Storage | Pricing (10 GB demo) | Egress | Signed-URL upload | Notes |
|---|---|---|---|---|
| **Cloudflare R2** | Free up to 10 GB/mo storage + 1M Class A ops + 10M Class B ops; then $0.015/GB/mo | **$0** (zero egress) | Yes (S3-compatible pre-signed URLs) | Best $/GB at any scale once free tier exceeded |
| **Vercel Blob** | $0.023/GB/mo storage; 100 GB free on Pro; egress included up to 1 TB/mo on Pro | Bundled but capped | Yes via `@vercel/blob/client` | Simplest Vercel integration; pricier; tied to Vercel project |
| **Supabase Storage** | 1 GB free; $0.021/GB/mo + $0.09/GB egress on Pro | Charged | Yes (auth-policy-driven) | Only worth it if also using Supabase elsewhere |
| **AWS S3** | $0.023/GB/mo + $0.09/GB egress | Charged | Yes | Most mature; ops overhead higher; egress kills demo budgets |

### Recommendation: **Cloudflare R2**

**Why:**
- Free tier covers the entire 10 GB demo with room.
- **Zero egress** is the killer feature: every time a reviewer reopens a
  retained label image, we serve the original through R2 directly without
  metering bandwidth.
- S3-compatible API → standard `@aws-sdk/client-s3` with custom endpoint;
  pre-signed PUT URLs work identically to S3.
- Pre-signed PUT URLs let the client (camera capture or upload form) put
  bytes directly to R2 without streaming through Vercel's function — keeps
  Vercel function payloads small (avoids the 4.5 MB body cap on serverless
  functions even with Fluid compute).

**Pre-signed URL flow:**
1. Client requests upload slot from `/api/uploads/sign`.
2. Server generates a pre-signed PUT URL (15-min TTL) using R2 credentials.
3. Client PUTs binary directly to R2.
4. Client tells server "uploaded" — server records the R2 key in DB and
   triggers verification.
5. For ephemeral uploads, server schedules a delete after processing.

---

## Q6 — Batch processing infrastructure

### Comparison

| Option | Concurrency control | Progress streaming | Cold start | Self-host | Pricing |
|---|---|---|---|---|---|
| **Inngest** | Per-step + per-function concurrency keys; multi-tenant fairness | `realtime` channels (built-in SSE/WS) | Functions run on Vercel/your infra | Yes (OSS) | Free up to 25k runs/mo; $20/mo Hobby+ |
| **Trigger.dev v3** | Concurrency limits on tasks; checkpoint-resume | Built-in run subscriptions | Runs on Trigger's compute (no Vercel timeout) | Yes (v3 OSS) | Free up to 5k runs/mo; $20/mo Hobby+ |
| **Vercel Queues** | Newer; concurrency configured per consumer | Limited; you build the streaming layer | Same as Vercel Functions | Vercel-only | Bundled with Functions usage |
| **QStash + Upstash Redis** | DIY rate control via Redis token buckets | DIY | Fast | Cloud-only | $1/100k messages |
| **Node `worker_threads` on Railway** | DIY (`p-limit`, `bottleneck`) | DIY (SSE from same process) | None | Self-managed | Railway compute-only |

### Recommendation: **Inngest**

**Why for proofLens specifically:**
- The batch flow is a textbook fan-out: parent function "process batch of N",
  child step "process one label" looped via `step.parallel()` with
  `concurrency: { limit: 10, key: 'event.data.userId' }`. This satisfies the
  10-concurrent-per-user requirement out of the box, and the per-user keying
  prevents one big batch from starving everyone else.
- `inngest.realtime()` publishes per-step status updates that we consume via
  SSE in the Next.js Route Handler — exactly the progress-stream story we need.
- Automatic retries (with exponential backoff) on transient AI provider errors
  → fewer manual error-handling branches in our code.
- Step-level observability built in (you can replay individual steps); pairs
  well with Helicone (Q7) for cost+latency at the model-call layer.
- Free tier covers the demo; per-step pricing aligns with our 250-files-max
  workload (a 250-label batch is ~250–500 step executions).

**Why not Trigger.dev v3:** also excellent, especially for jobs that exceed
Vercel's 300 s default duration. But our single-label target is 5 s, and 250
labels at 10-concurrent finishes in ~125 s — well under any Vercel limit.
Inngest's tighter Next.js integration and free-tier sweet spot win here.

**Why not Vercel Queues:** newer, fewer docs/examples for fan-out + progress
streaming. Save it for v-next of the architecture.

**Why not in-process worker threads on Railway:** loses the retry, replay,
and observability primitives we get for free with Inngest, and forces us off
Vercel.

---

## Q7 — LLM observability

### Comparison

| Tool | Setup | Cost tracking | Self-host | Free tier | Best for |
|---|---|---|---|---|---|
| **Helicone** | One-line proxy: change `baseURL` to `https://oai.helicone.ai/v1` + add header | Automatic per-call $/latency/tokens | Yes (OSS) | Generous; up to 100k requests/mo free | Drop-in; fastest to ship |
| **Langfuse** | SDK instrumentation, manual trace/span calls | Yes, but PostgreSQL + ClickHouse + Redis + S3 to self-host | Yes (OSS, MIT) | Cloud free tier; paid from $29/mo | Full evals + datasets + prompt mgmt |
| **Braintrust** | SDK + automatic CI/CD eval blocking | Per-request breakdown + tags | No (SaaS) | Limited | Eval-driven dev with merge gates |
| **LangSmith** | LangChain-native | Yes | No | Limited | LangChain-only stacks (we're not) |

### Recommendation: **Helicone (proxy mode) for production telemetry + Langfuse Cloud for eval datasets**

**Two-layer approach:**

1. **Helicone** wraps every production AI call — single line of config in our
   `@ai-sdk/openai` and `@ai-sdk/anthropic` instances. Automatic per-request
   cost, latency, tokens, error rate. Dashboard satisfies the PRD §10
   per-call cost + latency requirement.
2. **Langfuse Cloud** holds golden-set datasets and runs offline evals during
   the eval phase (PRD §22). Free tier covers <50k traces/mo which is plenty
   for our 30-label golden set + iteration cycles.

**Why not just Helicone:** Helicone is great for production logging but its
eval/dataset story is thinner. Langfuse Cloud handles the structured-eval
side without us self-hosting their stack.

**Why not just Langfuse:** self-hosting Langfuse means running ClickHouse,
Redis, and S3 — overkill for one demo app, and a distraction from the
actual product. Langfuse Cloud is fine, but Helicone's drop-in proxy with
zero markup beats it for the production-instrumentation slot.

**Why not Braintrust:** strong product but more expensive and we don't need
CI/CD merge-gate evals at this scale.

---

## Q8 — Rate-limit / circuit-breaker for AI providers

**Recommendation:** **`bottleneck`** for primary rate-limit/concurrency
control + a custom **circuit breaker** wrapper for provider-failure detection.

### Why bottleneck

- Mature, MIT-licensed, ~250 KB.
- Supports `maxConcurrent` (our 10-concurrent rule) and `minTime` (RPM
  smoothing) simultaneously.
- Has Redis-backed clustering mode → rate limits hold across multiple
  serverless function instances. Important: without distributed state, each
  Vercel instance has its own counter, which means 10 instances × 10 concurrent
  = 100 actual in-flight calls.
- Built-in priority queues, retries, scheduling.

### Why not p-limit alone

`p-limit` is great for in-process concurrency but offers no per-time-window
limiting and no distributed state. Fine for `Promise.all` slicing, not for
provider-level protection.

### Circuit breaker

Wrap the LLM call site in a small custom breaker (or `opossum`) that opens
on consecutive 429/5xx, sleeps 30 s, half-opens with one probe call.
Combined with Inngest's automatic retry-with-backoff, this gives us defense
in depth: bottleneck smooths request rate, Inngest retries on transient
errors, the breaker stops the bleed when a provider is having an outage.

### Provider rate limits to engineer for (April 2026)

- Anthropic Claude Sonnet 4.5 Tier 1: ~50k input TPM, 50 RPM
- Anthropic at Tier 4 ($400+ spend): 400k TPM
- OpenAI GPT-5 Tier 1: ~500k TPM, 1k RPM
- OpenAI Tier 5 ($1000+ spend): 5M TPM, 10k RPM

Anthropic is the binding constraint. Plan to start on OpenAI/Vercel AI
Gateway-routed providers and have Claude as a secondary or judge-only path
until tier-up.

---

## Q9 — Image preprocessing

**Server-side:** `sharp` on Node runtime. Already strongly recommended by
Next.js for production image optimization.

### Server pipeline (single label)

```
incoming buffer
  → sharp().rotate()            // auto-EXIF orient
  → sharp().resize(2048, 2048, { fit: 'inside', withoutEnlargement: true })
  → sharp().toFormat('jpeg', { quality: 85 })
  → buffer ready for AI call
```

### Server pipeline (thumbnail for history)

```
buffer
  → sharp().rotate()
  → sharp().resize(256, 256, { fit: 'cover' })
  → sharp().toFormat('webp', { quality: 80 })
  → store with extracted record
```

### Browser-side (camera capture)

For the live-camera flow we want some preprocessing in-browser to ship
smaller payloads to Vercel:

- **Canvas / OffscreenCanvas** for resize + JPEG encode before upload.
- Run encode in a **Web Worker** so the UI stays responsive on mobile.
- `createImageBitmap()` is fastest for the decode step on iOS Safari 17+.
- Keep client-side compression conservative (q=0.92, max 2048 px) — over-
  compression destroys label small text and hurts extraction accuracy.

### Vercel deployment note

`sharp` ships as a native binary. On Vercel it works out of the box on the
default Node runtime. **It does NOT work on the Edge runtime** — keep all
sharp-touching Route Handlers on `runtime = 'nodejs'`.

---

## Q10 — Live camera capture

**Recommendation:** **Roll our own thin wrapper** around `getUserMedia` +
`enumerateDevices`. Don't pull in `react-webcam` or similar — they don't
handle the iOS Safari `facingMode` bugs, and they add a layer between us and
the bug fix.

### iOS Safari quirks to engineer around

1. **`facingMode: 'environment'` is reported as supported but often ignored.**
   - Workaround: call `navigator.mediaDevices.enumerateDevices()`, find a
     device whose `label` contains "Back" or "Rear", request stream by
     `deviceId`. Fall back to `facingMode` only if enumeration fails.
   - On iOS 16.4+: `facingMode: 'environment'` may select the **ultra-wide**
     lens instead of the standard rear camera — looks distorted on labels.
     Add explicit `advanced: [{ zoom: 1 }]` and prefer the device with
     `label` containing "back camera" or first non-ultra-wide.
2. **`enumerateDevices()` returns empty labels until permission is granted.**
   - Strategy: request a stream with no constraints first to trigger the
     permission prompt → call `enumerateDevices()` → re-acquire stream
     with the right deviceId.
3. **Calling `getUserMedia()` again kills the previous stream's video display.**
   - Always `track.stop()` on the previous stream before requesting a new one.
4. **`getUserMedia` requires HTTPS.** Vercel is HTTPS by default; localhost
   (`localhost:3000`) is also fine for dev.
5. **Multiple permission prompts.** iOS 18 has a regression where camera
   permission is re-requested on every page load. Document this in a small
   help string in the camera UI.

### MediaStream Image Capture API

`ImageCapture` is *not* supported on iOS Safari (any version) and is behind
a flag in Firefox. **Skip it**. Instead:

- Use a `<video>` element with the live `MediaStream` as `srcObject`.
- On capture, draw the current video frame to a `<canvas>` of the same
  dimensions (`drawImage(videoElement, 0, 0)`), then `canvas.toBlob('image/jpeg', 0.92)`.
- This works on every browser including iOS Safari.

### Capture-and-retake flow

```
1. Request stream (rear cam preferred)
2. Show <video autoplay playsinline muted> covering the viewport
3. "Capture" → draw frame to canvas → freeze, hide video
4. Show preview with "Retake" / "Use this photo" buttons
5. On accept → canvas.toBlob → handoff to upload pipeline
```

---

## Q11 — PDF generation

**Recommendation:** **`@react-pdf/renderer` server-side** for the per-label
review report.

### Why

- We already have React skills; report layout is a React component.
- Renders to a PDF stream from Node — no headless browser needed.
- Supports embedded images (the 256 px thumbnail), tables (field results),
  custom fonts, page breaks, and footer signature line.
- ~60 KB to render a typical review report on server.
- Output is reproducible / deterministic — no browser version drift.

### Why not `pdf-lib`

Best for *modifying* existing PDFs (form filling, annotation). Building a
report layout from scratch is verbose.

### Why not `pdfkit`

Powerful, lower-level, but no built-in tables / pagination / responsive
layout. We'd build everything by hand.

### Why not Puppeteer / headless Chrome

Heavyweight (~150 MB Chromium binary; doesn't fit Vercel function size).
Only worth it if we already had a polished HTML print stylesheet, which we
don't need to.

### PDF report contents (per ALIGNMENT.md export specs)

```
+--------------------------------------------------+
| proofLens Compliance Review Report               |
| Label: <filename>          Reviewed: <timestamp>  |
| Reviewer: <user or Guest – {sid}>                |
+--------------------------------------------------+
| [256px thumbnail] | Beverage type: <…>            |
|                   | Brand:        <expected>      |
|                   |               <found>         |
|                   | …             …               |
+--------------------------------------------------+
| Field-by-field results                            |
| ┌────────────┬────────┬────────┬───────────────┐ |
| │ Field      │ Status │ Conf.  │ Explanation   │ |
| ├────────────┼────────┼────────┼───────────────┤ |
| │ Brand      │ Pass   │ 0.97   │ Exact match   │ |
| │ ABV        │ Fail   │ 0.95   │ 40 vs 45      │ |
| │ Gov Warn   │ Fail   │ 1.00   │ Lowercase     │ |
| └────────────┴────────┴────────┴───────────────┘ |
| Overall: Fail                                     |
| Image quality notes: Mild glare on lower right    |
| Human notes: <reviewer notes if any>              |
| Final decision: <Approve|Reject|MR|RBI>           |
| Signature: ____________________                   |
+--------------------------------------------------+
```

---

## Q12 — CSV / JSON export & import

**Recommendation:**
- **CSV import & export:** `papaparse` (browser + Node, streaming, malformed-
  input tolerant).
- **JSON:** built-in `JSON.stringify` / `JSON.parse`.
- **ZIP for batch exports:** **`archiver`** on the server (stream-based, can
  write directly to the HTTP response). Use **`jszip`** in-browser only if a
  client-side bundle is requested.

### Why archiver over JSZip server-side

- `archiver` streams the ZIP to the response as it builds — no buffering the
  entire archive in memory. Critical for 250-PDF batch exports.
- `jszip` builds the entire archive in memory before serializing → a 250-PDF
  archive blows past Vercel function memory (4 GB on Pro Fluid compute, but
  we shouldn't need 4 GB).

### Batch CSV/JSON pairing

The batch import path needs to auto-pair `<filename>.png` with
`<filename>.csv` rows or a single `expected.json` array keyed by filename.
Workflow:

1. User drops up to 250 image files + one CSV/JSON of expected values.
2. Client parses CSV in-browser via `papaparse` (worker mode to avoid
   blocking UI on big CSVs).
3. Auto-pair by filename match (case-insensitive, basename only).
4. Show a pre-flight table: filename | matched? | expected values →
   user can edit before submit.

---

## Q13 — Vercel vs Railway

### Workload profile

- Web frontend: standard Next.js SSR + RSC.
- AI calls: outbound HTTP to OpenAI / Anthropic, durations 2–6 s typical.
  Streaming in some flows.
- Image preprocessing: `sharp` on Node, ~50–200 ms per image.
- Batch: orchestrated by Inngest (off-platform compute); Next.js only
  receives webhook callbacks.
- DB: Postgres (Neon), serverless-friendly.
- Storage: R2 (off-platform).
- PDF gen: `@react-pdf/renderer` on Node, ~100–500 ms per report.

### Vercel limits relevant to us

- Node Function default duration with **Fluid compute**: 300 s (Hobby/Pro/Ent).
- Pro Fluid max duration: 800 s.
- Memory per function: up to 4 GB.
- Body size cap: 4.5 MB on serverless functions; signed-URL uploads bypass
  this entirely.
- HTTPS, global CDN, preview deployments per branch — all free.

### Decision factors

| Factor | Vercel | Railway |
|---|---|---|
| Next.js fit | Native (made by them) | Manual Dockerfile or Nixpacks |
| Cold start | Fluid compute keeps warm pool | None (always-on container) |
| Long jobs | Fluid 300 s default, 800 s max — our longest path is ~125 s for full batch | Unlimited |
| Image preprocessing | `sharp` works natively | Works natively |
| Background jobs | Off-platform (Inngest) | Could run in-process |
| Cost at our scale | Pro plan $20/user/mo + Fluid usage; demo well under $50/mo | Hobby $5/mo + usage; demo $5–20/mo |
| Preview URLs | Built-in per PR | Via plugins |
| Deployment friction | Push to git → deployed | Push to git → deployed |

### Recommendation: **Vercel Pro**

**Decisive factors for THIS workload:**

1. Our hot path (single-label verify) is 5–8 s — well within Fluid compute's
   300 s default. We do not need Railway's unlimited duration.
2. Heavy lifting (batch fan-out) lives off-platform on Inngest, so Railway's
   "always-on container" advantage doesn't apply.
3. Native Next.js integration cuts build/config friction; preview URLs per
   PR are free and accelerate review.
4. Marketplace-provisioned Neon DB → zero env-var wiring.
5. Vercel's edge CDN is essentially free image / static asset distribution
   for the (small) marketing pages and `/dist` assets.
6. Forge default rule says "recommend Railway for backend-heavy". Our
   backend-heavy work is *outsourced to Inngest*, so the rule's underlying
   constraint (long-running compute) is already addressed elsewhere.

**Where we'd flip:** if AI calls regularly exceeded 250 s end-to-end (they
won't — single-label target is 5 s), or if batch ran in-process (it doesn't
— Inngest), Railway would win.

---

## Q14 — Restricted-network posture (PRD §14)

The PRD acknowledges environments where outbound to certain domains may be
blocked. Our pattern:

### Configurable provider allow-list

`AI_PROVIDERS` environment variable lists enabled providers in priority
order, e.g. `openai,anthropic,vertex`. Code paths:

```
- AI gateway layer reads AI_PROVIDERS at boot.
- For each verification, attempts providers in order with circuit breaker
  per provider.
- If all configured providers are blocked/down → user sees a polished
  "AI services are temporarily unavailable" message + offer to save the
  expected data and retry later.
```

### Graceful degradation modes

1. **All providers reachable:** normal operation.
2. **Primary blocked, secondary OK:** transparent failover; logged in
   Helicone.
3. **All providers blocked:** UI enters a "manual review only" mode —
   user can still upload, fill expected data, and mark a final decision
   manually. The AI extraction step is skipped with a clear banner.
4. **Egress to Helicone/Langfuse blocked:** observability falls back to
   structured `console.log` with the same JSON shape; a future log
   shipper can backfill traces.

### Documented exit lanes for IT evaluators

A `docs/SECURITY_AND_NETWORK.md` lists every outbound domain the app
contacts:

```
- *.vercel.app, *.vercel.com  – host
- *.neon.tech                  – database
- *.r2.cloudflarestorage.com   – object storage
- api.openai.com               – LLM provider
- api.anthropic.com            – LLM provider
- *.inngest.com                – batch orchestration
- oai.helicone.ai              – LLM proxy / observability
- cloud.langfuse.com           – eval telemetry (optional)
```

Plus a self-host fallback note: every dependency in the list above has an
OSS or private-network alternative (Inngest is OSS, Helicone is OSS, R2 →
on-prem MinIO, Neon → managed Postgres of your choice).

---

## Q15 — Testing stack

### Recommendation

| Layer | Choice | Why |
|---|---|---|
| Unit + component | **Vitest + React Testing Library + jsdom** | 3–5× faster than Jest in 2026; native ESM; native TS; first-class Next.js support |
| Property-based | **`fast-check`** (alongside Vitest) | For the per-field rule logic (ABV normalization, volume-unit equivalence, gov-warning matcher) |
| E2E | **Playwright** | The Next.js docs explicitly endorse it for async server components; cross-browser; deterministic; built-in trace viewer |
| API mocking | **MSW v2** | Intercepts at the network layer; same mocks reused in unit + E2E |
| Visual regression | **Playwright snapshots** | Already in Playwright; no separate Chromatic dependency for a demo |

### Property-based usage

The per-field verification rules are exactly the kind of logic property-
based testing is designed for. Examples:

```ts
// ABV equivalence: 45% Alc./Vol., 45% ABV, 0.45, "Alcohol 45% by Volume"
// should all normalize to the same canonical value.
test.prop([fc.float({ min: 0, max: 80, noNaN: true })])(
  'normalizeAbv is idempotent across format variants',
  (v) => {
    const canon = normalizeAbv(`${v}% ABV`);
    expect(normalizeAbv(`${v}% Alc./Vol.`)).toBe(canon);
    expect(normalizeAbv(`Alcohol ${v}% by Volume`)).toBe(canon);
  }
);

// Volume normalization
test.prop([fc.constantFrom('mL', 'ml', 'ML'), fc.integer({ min: 1, max: 9999 })])(
  'unit casing does not change milliliter value',
  (unit, n) => {
    expect(normalizeVolumeMl(`${n} ${unit}`)).toBe(n);
  }
);
```

### Per-artifact TDD coverage (per `tdd.md` rule)

- **Field-rule utilities:** failing fast-check tests first.
- **Route Handlers (`/api/labels/verify`, `/api/uploads/sign`):** failing
  Vitest integration tests using MSW for AI mocks + a transient SQLite
  test DB (or testcontainers Postgres in CI).
- **React components:** failing Testing Library tests first (interaction +
  a11y).
- **Critical user flows:** failing Playwright tests first (single-label
  happy path, batch upload, camera capture, override + final decision,
  PDF export).
- **Bug fixes:** regression test reproducing the bug before the fix.

---

## Recommended Stack Summary

| Layer | Choice | Alternative | Reason |
|---|---|---|---|
| Framework | Next.js 16.2 (App Router, RSC) | — | Forge default; stable; Turbopack default; React 19.2 |
| Language | TypeScript (strict) | — | Forge default |
| UI | shadcn/ui + Tailwind v4 | — | Forge default |
| Database | **Neon Postgres** (via Vercel Marketplace) | Supabase | Scale-to-zero, branching per PR, Drizzle-friendly |
| ORM | **Drizzle ORM** | Prisma 7 | Smaller bundle, faster cold start, edge-compatible, plays with Better Auth |
| Auth | **Better Auth** (anonymous plugin) | Auth.js v5 | Native guest-mode → real-account migration via `onLinkAccount` |
| Object storage | **Cloudflare R2** | Vercel Blob | Zero egress, generous free tier, S3-compatible signed URLs |
| Batch infra | **Inngest** | Trigger.dev v3 | Fan-out + per-key concurrency + realtime SSE built-in |
| LLM observability | **Helicone (proxy) + Langfuse Cloud (eval data)** | Braintrust | One-line setup; zero markup; eval datasets in Langfuse |
| Rate-limit / breaker | **bottleneck** + custom circuit breaker | p-limit + opossum | Distributed via Redis; concurrency + RPM smoothing |
| Image preprocessing | **sharp** (server) + Canvas/Worker (browser) | — | Native Next.js integration; required for serverless |
| Camera capture | Custom hook around `getUserMedia` + `enumerateDevices` | react-webcam | Need bug-by-bug iOS Safari workarounds; thin layer wins |
| PDF generation | **@react-pdf/renderer** (server) | pdf-lib | React-based layout; no headless browser; small footprint |
| CSV | **papaparse** (browser + Node) | csv-parse | Streaming + malformed-input tolerant |
| ZIP export (batch) | **archiver** (server) | jszip | Streams to response; doesn't buffer 250 PDFs in memory |
| Deployment | **Vercel Pro** + Fluid compute | Railway | Native Next.js, preview URLs, marketplace DB; Inngest moves long jobs off-platform |
| Unit / component | **Vitest + RTL + jsdom** | Jest | 3–5× faster, ESM-native |
| Property-based | **fast-check** | — | For field-rule logic (ABV, volume, gov-warning) |
| E2E | **Playwright** | Cypress | Cross-browser, async-RSC-friendly, trace viewer |
| API mocking | **MSW v2** | nock | Network-layer; reusable in unit + E2E |

---

## Data-Flow Diagram

```
                                    ┌──────────────────────────┐
                                    │         CLIENT           │
                                    │  (Next.js RSC + Browser) │
                                    └────────────┬─────────────┘
                                                 │
        ┌────────────────────────────────────────┼────────────────────────┐
        │                                        │                        │
        ▼                                        ▼                        ▼
 ┌────────────────┐                    ┌──────────────────┐     ┌──────────────────┐
 │  Live Camera   │                    │  Upload Form     │     │  Batch Upload    │
 │  getUserMedia  │                    │  (single label)  │     │  (250 files +    │
 │  rear cam      │                    │  drag-and-drop   │     │   CSV/JSON)      │
 │  + retake UI   │                    │                  │     │  papaparse       │
 └────────┬───────┘                    └────────┬─────────┘     └────────┬─────────┘
          │                                     │                        │
          │  Canvas → JPEG blob                 │                        │
          │  (Web Worker preprocess)            │                        │
          │                                     │                        │
          ▼                                     ▼                        ▼
 ┌──────────────────────────────────────────────────────────────────────────────┐
 │   POST /api/uploads/sign  →  returns pre-signed PUT URL                       │
 │   (Better Auth session cookie or anonymous guest cookie attached)             │
 └──────────────────────────┬───────────────────────────────────────────────────┘
                            │ pre-signed URL
                            ▼
 ┌──────────────────────────────────────────────────────────────────────────────┐
 │                  CLOUDFLARE R2 (object storage)                               │
 │   Direct PUT from client. Server never streams the full image.                │
 │   Ephemeral by default (TTL delete after processing).                         │
 │   Opt-in retention → flag in DB → no auto-delete.                             │
 └──────────────────────────┬───────────────────────────────────────────────────┘
                            │ object key returned to client → "uploaded" ack
                            ▼
 ┌──────────────────────────────────────────────────────────────────────────────┐
 │   POST /api/labels/verify   (Route Handler, runtime: nodejs)                  │
 │   1. Fetch object from R2 into buffer                                         │
 │   2. sharp.rotate() + resize 2048 + JPEG q85   →  preprocessed buffer         │
 │   3. sharp.resize(256) → webp thumbnail        →  store on R2 (always)        │
 │   4. Bottleneck-limited LLM call(s) via Helicone proxy:                       │
 │        Helicone → OpenAI / Anthropic                                          │
 │   5. Parse structured output → field results → overall verdict                │
 │   6. Persist to Postgres (Neon) via Drizzle:                                  │
 │        - reviews, fields, image_assets (thumbnail key + retention flag),      │
 │          extraction_raw, audit_log                                            │
 │   7. If !retain_originals → schedule R2 delete of original                    │
 │   8. Return JSON to client (200 OK + verdict payload)                         │
 └──────────────────────┬───────────────────────────────────────────────────────┘
                        │
            ┌───────────┴───────────┬───────────────────────────┐
            ▼                       ▼                           ▼
 ┌──────────────────────┐ ┌──────────────────────┐ ┌─────────────────────────┐
 │  NEON POSTGRES       │ │  HELICONE (proxy +   │ │  CLOUDFLARE R2          │
 │  (Drizzle ORM)       │ │  per-call cost +     │ │  (thumbnail always;     │
 │                      │ │  latency telemetry)  │ │   original if opt-in)   │
 │  users               │ └──────────────────────┘ └─────────────────────────┘
 │  guest_sessions      │
 │  reviews             │
 │  field_results       │
 │  audit_log (overrides)│
 │  image_assets        │
 │  batch_jobs          │
 └──────────────────────┘

 ┌─── BATCH PATH ───────────────────────────────────────────────────────────────┐
 │                                                                              │
 │  Client → POST /api/batch/start  (returns batchId + Inngest event)           │
 │                                                                              │
 │           ┌────────────────────────────────────────────────────────┐         │
 │           │                  INNGEST                                │         │
 │           │  parent step: process-batch                             │         │
 │           │     fan-out via step.parallel() with                    │         │
 │           │       concurrency: { limit: 10, key: userId }           │         │
 │           │     child step: verify-one-label  ───────────►          │         │
 │           │       (calls /api/labels/verify internally per file)    │         │
 │           │     publishes to inngest.realtime(batchId)              │         │
 │           └─────────────────────┬──────────────────────────────────┘         │
 │                                 │                                            │
 │  Client opens GET /api/batch/:id/stream  (SSE Route Handler)                 │
 │  Server subscribes to inngest.realtime(batchId) → forwards as SSE events     │
 │                                                                              │
 └──────────────────────────────────────────────────────────────────────────────┘

 ┌─── EXPORT PATH ──────────────────────────────────────────────────────────────┐
 │                                                                              │
 │  GET /api/reviews/:id/pdf  → @react-pdf/renderer streams PDF response        │
 │  GET /api/batch/:id/csv    → papaparse.unparse → text/csv stream             │
 │  GET /api/batch/:id/json   → JSON.stringify stream                           │
 │  GET /api/batch/:id/zip    → archiver streams ZIP of N×PDF + summary.csv     │
 │                                                                              │
 └──────────────────────────────────────────────────────────────────────────────┘
```

---

## Sources

- [Next.js 16 release blog](https://nextjs.org/blog/next-16)
- [Next.js 16.2 release blog](https://nextjs.org/blog/next-16-2)
- [Server Actions vs Route Handlers (makerkit)](https://makerkit.dev/blog/tutorials/server-actions-vs-route-handlers)
- [SSE in Next.js Route Handlers (pedroalonso.net)](https://www.pedroalonso.net/blog/sse-nextjs-real-time-notifications/)
- [Strapi: Next.js 16 Route Handlers — 3 advanced use cases](https://strapi.io/blog/nextjs-16-route-handlers-explained-3-advanced-usecases)
- [Neon vs Supabase (designrevision)](https://designrevision.com/blog/supabase-vs-neon)
- [Neon vs Supabase vs PlanetScale for Next.js 2026 (dev.to)](https://dev.to/whoffagents/neon-vs-supabase-vs-planetscale-managed-postgres-for-nextjs-in-2026-2el4)
- [Neon for Vercel marketplace](https://vercel.com/marketplace/neon)
- [Drizzle vs Prisma vs Kysely 2026 (BuildPilot)](https://trybuildpilot.com/447-drizzle-vs-prisma-vs-kysely-2026)
- [Drizzle vs Prisma in 2026 (AnotherWrapper)](https://anotherwrapper.com/blog/drizzle-vs-prisma)
- [Better Auth vs NextAuth vs Clerk 2026 (supastarter)](https://supastarter.dev/blog/better-auth-vs-nextauth-vs-clerk)
- [Better Auth Anonymous plugin docs](https://better-auth.com/docs/plugins/anonymous)
- [LogRocket: Best auth library for Next.js 2026](https://blog.logrocket.com/best-auth-library-nextjs-2026/)
- [Hatchet vs Trigger.dev vs Inngest 2026 (PkgPulse)](https://www.pkgpulse.com/blog/hatchet-vs-trigger-dev-v3-vs-inngest-durable-workflows-2026)
- [Background jobs on Vercel: Inngest vs Trigger.dev (nextbuild.co)](https://nextbuild.co/blog/background-jobs-vercel-inngest-trigger)
- [Inngest GitHub](https://github.com/inngest/inngest)
- [Vercel Blob pricing](https://vercel.com/docs/vercel-blob/usage-and-pricing)
- [Cloud storage pricing comparison 2026 (buildmvpfast)](https://www.buildmvpfast.com/api-costs/cloud-storage)
- [Best LLM observability tools 2026 (Firecrawl)](https://www.firecrawl.dev/blog/best-llm-observability-tools)
- [Helicone Vercel AI SDK integration](https://docs.helicone.ai/getting-started/integration-method/vercelai)
- [Helicone GitHub](https://github.com/Helicone/helicone)
- [Langfuse alternatives 2026 (Braintrust)](https://www.braintrust.dev/articles/langfuse-alternatives-2026)
- [AI API rate limits 2026 (DevTk)](https://devtk.ai/en/blog/ai-api-rate-limits-comparison-2026/)
- [Claude API rate limits April 2026 (TokenCalculator)](https://tokencalculator.com/blog/claude-api-rate-limits-april-2026)
- [Managing OpenAI rate limits (Vellum)](https://www.vellum.ai/blog/how-to-manage-openai-rate-limits-as-you-scale-your-app)
- [getUserMedia complete guide / Safari fixes 2026 (copyprogramming)](https://copyprogramming.com/howto/how-can-i-fix-navigator-mediadevices-getusermedia-for-safari)
- [WebKit bug 253186: iOS 16.4 selects ultra-wide for facingMode environment](https://bugs.webkit.org/show_bug.cgi?id=253186)
- [Choose front/back camera stream (Progressier)](https://progressier.com/choose-front-back-camera-stream)
- [Top JavaScript PDF libraries 2026 (Nutrient)](https://www.nutrient.io/blog/top-js-pdf-libraries/)
- [pdf-lib vs pdfkit vs pdfmake comparison](https://npm-compare.com/pdf-lib,pdfkit,pdfmake)
- [Vercel Functions duration limits](https://vercel.com/docs/functions/configuring-functions/duration)
- [Vercel Fluid compute (changelog)](https://vercel.com/changelog/higher-defaults-and-limits-for-vercel-functions-running-fluid-compute)
- [Vercel vs Railway 2026 (designrevision)](https://designrevision.com/blog/vercel-vs-railway)
- [Railway vs Vercel docs](https://docs.railway.com/platform/compare-to-vercel)
- [Vercel vs Railway vs Render for AI 2026 (Athenic)](https://getathenic.com/blog/vercel-vs-railway-vs-render-ai-deployment)
- [Vitest + Jest + Playwright complete testing stack 2026 (PkgPulse)](https://www.pkgpulse.com/blog/vitest-jest-playwright-complete-testing-stack-2026)
- [Next.js Vitest testing guide](https://nextjs.org/docs/app/guides/testing/vitest)
- [Next.js Playwright testing guide](https://nextjs.org/docs/pages/guides/testing/playwright)
- [Sharp + Next.js production image optimization](https://nextjs.org/docs/messages/install-sharp)
- [Papa Parse Node.js streaming guide (Better Stack)](https://betterstack.com/community/guides/scaling-nodejs/parsing-csv-files-with-papa-parse/)
