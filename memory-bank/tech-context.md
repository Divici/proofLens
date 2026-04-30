# Technical Context

## Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript (strict, `noUncheckedIndexedAccess`) |
| UI components | shadcn/ui + Tailwind v4 |
| Forms | react-hook-form + Zod resolver |
| Browser persistence | IndexedDB via `idb` |
| LLM gateway | OpenRouter (OpenAI-compatible SDK) |
| LLM models | claude-haiku-4.5 (primary), claude-sonnet-4.6 (fallback) |
| OCR | Tesseract.js (in-process) |
| Server image preprocessing | `sharp` |
| Browser image preprocessing | Canvas / OffscreenCanvas in Web Worker |
| Camera | custom `getUserMedia` wrapper |
| Fuzzy matching | `fuzzball` |
| Levenshtein | `fastest-levenshtein` |
| Volume conversion | `convert-units` |
| Markdown strip | `remove-markdown` |
| Schema validation | `zod` |
| Property tests | `fast-check` |
| Concurrency | Web Worker pool (custom) + `bottleneck` |
| PDF | `@react-pdf/renderer` |
| CSV | `papaparse` |
| ZIP | `archiver` (streaming) |
| Production telemetry | OpenRouter dashboard |
| Eval traces | Langfuse Cloud |
| Testing | Vitest + RTL + jsdom + MSW + Playwright |
| Deployment | Vercel Hobby + Fluid compute |

## Environment variables (names only — values in .env.local, NEVER in repo)

- `OPENROUTER_API_KEY` — required at runtime
- `OPENROUTER_MODEL_PRIMARY` — default `anthropic/claude-haiku-4.5`
- `OPENROUTER_MODEL_FALLBACK` — default `anthropic/claude-sonnet-4.6`
- `OPENROUTER_MODEL_JUDGE` — default `anthropic/claude-haiku-4.5`
- `OPENROUTER_BASE_URL` — default `https://openrouter.ai/api/v1`
- `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY` — required at eval time only

## Quality gates

`pnpm typecheck && pnpm lint && pnpm test && pnpm test:e2e`

Plus the gov-warning mutation fuzz test embedded in `pnpm test`.

## Deployment

- Production: Vercel Hobby + Fluid compute, deployed on push to `main`
- Preview: per-PR preview URL on every push
- Fluid duration cap: 300s (well above our 5–8s hot-path)
- Tesseract.js WASM warm-keep: cron `/api/health` ping every 5 min in
  production (set up in slice 0009 deployment polish)

## Constraints (from rules + IT note)

- **No env contents in conversation/output** (`~/.claude/rules/no-env-contents.md`)
- **No server-side user data** (Marcus IT note)
- **TDD mandatory** (`~/.claude/rules/tdd.md`)
- **Auto-commit** at end of task with imperative msg + Co-Authored-By
  (`~/.claude/rules/commit-message.md`)
- **Polished product, no v1/MVP framing** (`~/.claude/rules/complete-product-default.md`)
- **Lightweight decoupling** — extract only when reuse/readability clearly
  improves (`~/.claude/rules/lightweight-decoupling.md`)
- **Maintain `STUDY_GUIDE.md`** as decisions get made
  (`~/.claude/rules/study-guide.md`, gitignored)

## Known limitations (documented in README under R-019)

- Tab close mid-batch → in-progress files reset; completed files persisted
- IndexedDB quota on heavy use → "export and clear" prompt at 80%
- No cross-device sync → review history is per-browser
- Vercel Hobby ToS technically restricts to non-commercial use
- Tesseract.js cold-start adds ~0.5s on first call after deploy

## File / directory structure

```
proofLens/
├── app/                 # Next.js App Router
│   ├── api/            # stateless Route Handlers
│   ├── review/
│   ├── batch/
│   ├── history/
│   ├── settings/
│   └── about/
├── components/         # React components (shadcn/ui under ui/)
├── lib/                # ai/, ocr/, verify/, quality/, storage/, workers/, export/, camera/
├── public/             # demo-labels/, demo-data/, icons/
├── test/               # unit, integration, e2e
├── memory-bank/        # 6-file persistent context
├── decisions/          # ADRs
├── docs/               # architecture.md, troubleshooting.md
├── issues/             # vertical-slice plans (this build)
└── research-findings/  # phase 1 deep dives
```
