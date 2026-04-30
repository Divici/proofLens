# Loop 0 Research: AI Vision / OCR Landscape

**Date:** 2026-04-29
**Scope:** PRD §20.2 — AI vision / OCR / extraction approach for proofLens
**Hard constraints recap:** verdict accuracy ≥ 95%, p50 ≤ 5s / p95 ≤ 8s end-to-end, ≤ $0.05 per label, 100% recall on gov-warning strict-fail, all four TTB beverage categories, Vercel/Railway hosting only.

---

## Comparison table — vision-capable LLMs

All token prices are USD per 1M tokens. Image cost shown for a typical 1024x1024 label after preprocessing. Latency numbers from Artificial Analysis benchmarks (April 2026) and provider docs.

| Provider | Model | Input $/1M tok | Output $/1M tok | Image cost (1024px square) | TTFT p50 | Output speed | Native bbox? | Per-field conf? | JSON-schema | Caching |
|---|---|---|---|---|---|---|---|---|---|---|
| Anthropic | Claude Sonnet 4.6 | $3.00 | $15.00 | ~1,400 tok = ~$0.0042 | 1.12s | 44 t/s | Coords on request (resized image space) | No | Tool-use schema (strict) | 5m / 1h, read = 0.1x |
| Anthropic | Claude Haiku 4.5 | $1.00 | $5.00 | ~1,400 tok = ~$0.0014 | 0.56–0.74s | 91–98 t/s | Coords on request | No | Tool-use schema (strict) | 5m / 1h, read = 0.1x |
| Anthropic | Claude Opus 4.7 | $5.00 | $25.00 | ~1,400 tok = ~$0.007 (up to 4,000 tok at 2576px hi-res) | 1.5–2s | 40–50 t/s | Coords on request, hi-res native | No | Tool-use schema (strict) | 5m / 1h, read = 0.1x |
| OpenAI | GPT-5.4 | $2.50 | $15.00 | Tokenized image (≈1.4k tok ≈ $0.0035) | 0.60s | 57 t/s | Coords on request (less reliable) | logprobs available | json_schema strict mode | Cached input 10x discount |
| OpenAI | GPT-5.4-mini | $0.75 | $4.50 | Same tokenization, ≈ $0.001 | ~0.5s | 80–100 t/s | Coords on request | logprobs | json_schema strict | Cached input |
| OpenAI | GPT-5.5 | $5.00 | $30.00 | ≈ $0.007 | ~1s | ~50 t/s | Coords on request | logprobs | json_schema strict | Cached input |
| Google | Gemini 2.5 Pro | $1.25 (≤200k) / $2.50 (>200k) | $10.00 / $15.00 | Per-token, very cheap | ~0.8s | ~150 t/s | Yes (`box_2d` first-class JSON, [y0,x0,y1,x1] / 1000) | No | responseSchema strict | Context cache 0.125 |
| Google | Gemini 2.5 Flash | $0.30 | $2.50 | Per-token, very cheap | 0.73s | 194 t/s | Yes (`box_2d` first-class) | No | responseSchema strict | Context cache 0.03 |
| Google | Gemini 2.5 Flash-Lite | $0.10 | $0.40 | Per-token, very cheap | <0.5s | 230+ t/s | Yes (`box_2d` first-class) | No | responseSchema strict | Context cache 0.01 |
| Mistral | Pixtral Large | $2.00 | $6.00 | Tokenized | ~1s | ~50 t/s | Limited / unofficial | No | JSON mode | None public |
| Mistral | Pixtral 12B | $0.15 | $0.15 | Tokenized | ~0.5s | ~80 t/s | Limited | No | JSON mode | None |

**Key takeaways:**
- Gemini 2.5 Flash and Flash-Lite are ~3–10x cheaper than the next-cheapest tier and have first-class bounding-box support.
- Claude Haiku 4.5 has the best raw latency (0.56s TTFT) and is the cheapest Anthropic option that still has strong tool-use / structured-output reliability.
- OpenAI GPT-5.4 is competitive on price and has the best per-token logprobs for confidence inference, but its bounding-box quality is weaker than Gemini's for label imagery.

---

## Comparison table — doc-AI / OCR-only services

| Service | API | Price (1K pages, low volume) | Price at scale | Bbox? | Conf? | Latency | Notes |
|---|---|---|---|---|---|---|---|
| AWS Textract | Detect Document Text | $1.50 | $0.60 | Yes (per word + per line) | Yes (per element) | <2s typical | Best raw OCR, no semantic interpretation |
| AWS Textract | Analyze Document — Forms | $50 | $40 | Yes | Yes | 2–4s | Key-value pair detection. Overkill for labels. |
| AWS Textract | Analyze Document — Queries | $15 | $12 | Yes | Yes | 2–4s | Ask up to 30 NL questions per doc. Useful for targeted field extraction. |
| Google Document AI | Enterprise Document OCR | $1.50 | $0.60 | Yes | Yes | <2s | Pure OCR baseline. |
| Google Document AI | Custom Extractor / Form Parser | $30 | $20 | Yes | Yes | 2–5s | Requires custom processor training (out of scope). |
| Azure AI Doc Intelligence | Read OCR | $1.50 | $0.53 (commit tier) | Yes | Yes | 1–2s | Solid baseline, supports curved text. |
| Azure AI Doc Intelligence | Layout | $10 | ~$3.50 (commit) | Yes | Yes | 2–3s | Returns paragraphs + reading order. |
| Azure AI Doc Intelligence | Custom Neural | $10 + training | varies | Yes | Yes | 2–4s | Custom-trained model — out of scope. |

**Key takeaways:**
- For pure OCR with bbox + confidence, AWS Textract DDT, Google Doc AI Enterprise OCR, and Azure Read OCR all converge on $1.50 / 1K pages = $0.0015 per label.
- These services give you raw text + geometry, but no semantic field assignment ("which token is the brand name?"). That layer must come from an LLM.

---

## Q1 — Detailed findings on vision-LLMs

### Anthropic Claude
- **Pricing math:** Image tokens = `(width * height) / 750` for non-Opus-4.7 models; image is auto-downscaled to long edge ≤ 1568 px and padded to multiples of 28 px. A 1568×1568 image is the cap at 1568 tokens. A 1024×1024 image ≈ 1,400 tokens. Source: [Claude vision docs](https://platform.claude.com/docs/en/build-with-claude/vision).
- **Sonnet 4.6:** $3 in / $15 out. A typical proofLens label call (1 image ≈ 1,400 tok, 200-token system prompt, 600-token JSON output) costs ~$0.0048 + ~$0.009 = **~$0.014/label**.
- **Haiku 4.5:** $1 in / $5 out. Same call costs ~$0.0016 + ~$0.003 = **~$0.0046/label**. TTFT 0.56s and 91–98 t/s, so a 600-token response completes in ~6.7s of generation + 0.6s TTFT. End-to-end = ~7.3s. To hit p50 ≤ 5s we must keep output tokens ≤ ~400 OR use streaming and start showing fields as they arrive.
- **Opus 4.7:** $5 in / $25 out, with high-res 2576-px native (up to ~4,000 image tokens). Probably overkill; cost per label rises to ~$0.05+ once outputs are factored in.
- **Structured output:** Anthropic recommends "tool use" with a strict input schema rather than asking for raw JSON. Reliability is ≥ 99% in practice for fixed schemas. Cache the system prompt + schema (5-min cache, 1.25x write, 0.1x read) — for proofLens the gov-warning-strict-fail prompt section is identical across labels and benefits hugely.
- **Bounding boxes:** Claude can return coordinates when asked (in the resized/padded image space). Quality is good but not advertised as a primary feature; it is reliable enough for "rough box around the field" highlighting but not pixel-perfect text-line geometry.
- **Confidence:** No first-class per-field confidence. We must ask the model to output a confidence enum (e.g., "high"/"medium"/"low") per field as part of the schema, which is a known reliable pattern.
- **Image limits:** 100 images per request on 200k models, max 8000×8000 px native (auto-resized).

### OpenAI GPT-5 family
- **Pricing math:** Image tokens are calculated similarly to a per-megapixel formula. The rough cost is competitive with Claude.
- **GPT-5.4:** $2.50 in / $15 out. ~1.4k image tokens + 200 sys + 600 out = **~$0.013/label**. TTFT 0.60s, 57 t/s — so a 600-token output takes ~10.5s + 0.6s = 11s. **GPT-5.4 will not meet p50 ≤ 5s on its own at full output length** without streaming or output-length compression.
- **GPT-5.4-mini:** $0.75 in / $4.50 out. ~$0.004/label. TTFT ~0.5s, 80–100 t/s. End-to-end ~7s; still tight for p50.
- **Structured output:** OpenAI's `json_schema` strict mode is the gold standard for schema reliability — guarantees exact schema match. Best in class.
- **Confidence:** Logprobs are available per token; can be aggregated to per-field confidence with effort.
- **Bounding boxes:** Less reliable than Gemini for label imagery. OpenAI does not advertise box prediction as a first-class feature.

### Google Gemini 2.5 family
- **Pricing math:** Tokenized images, very cheap.
- **Gemini 2.5 Flash:** $0.30 in / $2.50 out. ~$0.0006 in + ~$0.0015 out = **~$0.0021/label**. TTFT 0.73s, 194 t/s. End-to-end ~3.8s. **Easily fits p50 ≤ 5s.**
- **Gemini 2.5 Flash-Lite:** $0.10 in / $0.40 out. ~$0.0004/label. TTFT <0.5s, 230+ t/s. End-to-end <2s. Cheapest plausible option.
- **Gemini 2.5 Pro:** $1.25 in / $10 out. ~$0.008/label. Slower but higher quality on hard cases.
- **Structured output:** `responseSchema` (Pydantic-compatible, strict) is reliable. Gemini Pro is "much better at not returning invalid outputs" per benchmarks.
- **Bounding boxes:** **First-class.** Returns `box_2d` in [y0, x0, y1, x1] normalized to 1000. Gemini Pro 2.5 hits ~0.34 mAP on COCO — roughly YOLOv3-level. Good enough for evidence highlighting on labels, where we don't need pixel-perfect boxes; we need "show me roughly where the ABV text is."
- **Caveat:** Bounding box quality drops on Flash-Lite vs. Flash and Pro. For per-field evidence highlighting, prefer Flash or Pro.

### Mistral Pixtral
- **Pricing:** Pixtral Large $2/$6, Pixtral 12B $0.15/$0.15. Cheap.
- **Structured output:** JSON mode only; no strict schema enforcement.
- **Bounding boxes:** Not a first-class feature.
- **Verdict:** No compelling reason to use Pixtral over Gemini Flash or Haiku 4.5 for this use case. Skip.

### Recommendation for Q1
**Use Anthropic Claude Haiku 4.5 as primary** with Sonnet 4.6 fallback. Reasons:
1. The user's environment is already Claude-aligned (CLAUDE_API skill, internal tooling).
2. Haiku 4.5's 0.56s TTFT is the lowest in class.
3. Tool-use + strict input schema gives ≥ 99% schema reliability.
4. Prompt caching (0.1x cache reads) makes the static system prompt + schema effectively free after the first call.

**Gemini 2.5 Flash is the strong alternative** if cost or bbox quality becomes the binding constraint.

---

## Q2 — OCR-only / specialized doc-AI services

| Service | $/label | Bbox quality | Confidence | Time | Pros | Cons |
|---|---|---|---|---|---|---|
| AWS Textract DDT | $0.0015 | Pixel-perfect per-word | Per-word | 1–2s | Best raw OCR | No semantic field labeling |
| Google Doc AI OCR | $0.0015 | Pixel-perfect | Per-word | 1–2s | Best on curved/skewed text | No semantic |
| Azure Read OCR | $0.0015 | Pixel-perfect | Per-word | 1–2s | Strong on multiple fonts | No semantic |

**On label imagery specifically (curved bottle labels, stylized fonts, foil text):**
- Google Doc AI is widely considered the strongest on irregular/curved text.
- AWS Textract is strongest when the label has a form-like layout (which alcohol labels rarely do).
- Azure Read is the most balanced.

**Recommendation for Q2:** Use only as a fallback for the gov-warning strict check (see Q7). Pure OCR cannot meet the structured-extraction requirement on its own.

---

## Q3 — Hybrid OCR + LLM vs. vision-LLM-only

**Hybrid wins when:**
- Image quality is poor and OCR has been engineered (preprocessing, deskew, super-resolution) for many years that an LLM doesn't replicate well.
- You need precise pixel coordinates of every word for legal / forensic reasons.
- The text is dense (financial statements, multi-column documents) and a vision-LLM would miss tokens.

**Vision-LLM-only wins when:**
- The schema and number of fields is small (< 20).
- You want one provider, one billing line, simple integration.
- You need semantic interpretation, not just extraction (e.g., "is this ABV value plausibly the alcohol content vs. a freight weight?").
- Latency budget is tight — round-tripping OCR → LLM doubles the network hops.

**For proofLens (7 fields, semantic gov-warning check, ≤ 5s budget):** vision-LLM-only is the right primary path. Add OCR only as a **strict-fail safety net for the government-warning check** (see Q7).

---

## Q4 — Bounding-box / evidence highlighting

| Provider | First-class bbox? | Coordinate space | Accuracy | Notes |
|---|---|---|---|---|
| Gemini 2.5 (Flash, Pro) | **Yes** | `[y0, x0, y1, x1]` normalized 0–1000 | ~0.34 mAP (YOLOv3-class) | Most polished API surface for this. Disable thinking budget for best structured results. |
| Claude (any) | On request | Resized/padded image dims | Good qualitatively, no published mAP | Must rescale client-side using known resize ratio |
| GPT-5.4 | On request | Pixel coords | Unreliable in our use case | Not recommended for evidence overlays |
| AWS Textract | Yes | Normalized 0–1 | Pixel-perfect (per word) | Best raw geometry, no semantic labels |
| Google Doc AI OCR | Yes | Normalized 0–1 | Pixel-perfect | Best on curved labels |
| Azure Read | Yes | Pixel | Pixel-perfect | Very accurate |

**Recommendation for Q4:** For PRD §9.13 (evidence highlighting), ask Claude/Gemini to return a `bbox` per field as part of the structured output schema — `[x_min, y_min, x_max, y_max]` in pixels of the **resized image** that we control. Then render the overlay client-side scaled back to display dimensions. Acceptable accuracy for "click field → highlight region" UX; not acceptable for legal proofs.

If we ever need pixel-perfect text-line boxes (e.g., to overlay individual gov-warning words), call AWS Textract DDT once and cross-reference to the LLM's field extraction.

---

## Q5 — Confidence scores

| Provider | Native per-field confidence? | Workaround |
|---|---|---|
| AWS Textract | **Yes**, per word + per field (0–100) | None needed |
| Google Doc AI | **Yes**, per element | None needed |
| Azure Read | **Yes**, per word | None needed |
| OpenAI GPT-5.4 | **Logprobs available** per output token | Aggregate across the field's tokens — moderate effort |
| Gemini 2.5 | No native confidence | Ask in schema for `confidence: "high"|"medium"|"low"` |
| Anthropic Claude | No native confidence | Ask in schema for `confidence` enum |

**Recommendation for Q5:** Use schema-driven self-rated confidence (`high`/`medium`/`low`) on the LLM output. This is a documented reliable pattern. For high-stakes "low confidence" UI flags, also run an OCR fallback (Textract DDT) and compare — if the OCR text doesn't contain the LLM-extracted value, flag as low confidence regardless of self-rating.

---

## Q6 — Hallucination mitigation

Documented patterns that work for vision-LLM extraction:

1. **Allow null.** Schema must include `null` as a valid value for every optional field. Prompt: "If the field is not visible on the label, set it to null. Do not guess." This single change reduces fabrication dramatically.
2. **Demand bbox proof.** Require a `bbox` for every non-null field. The model has to "point at" the evidence. Models that fabricate values often refuse to provide bboxes — this signal alone catches many hallucinations.
3. **Verbatim quoting.** Require a `verbatim_text` field that must be an exact substring of the visible label text. We can post-validate this against an OCR pass.
4. **Two-pass cross-check.** First pass: extract. Second pass (different prompt, same image): "Here is the extracted JSON. For each field, confirm it is visible on the label and return `confirmed: true|false`." Mismatches go to human review.
5. **Image-grounded guidance (research).** MARINE-style techniques use a small detector to constrain LLM outputs. Probably overkill for proofLens — patterns 1–4 are sufficient for ≥ 95% accuracy.
6. **Temperature 0** + **strict schema** (Claude tool-use, OpenAI strict mode, Gemini responseSchema). All three providers have this.

**Recommendation for Q6:** Implement patterns 1, 2, 3, and 6 in the primary extraction. Pattern 4 (cross-check) only when the first pass returns any "low" confidence field — keeps cost predictable.

---

## Q7 — Tiered routing strategy

**Two-tier strategy ("Haiku-first, Sonnet-fallback") cost model:**

Per-label assumptions:
- Image: 1024×1024 px ≈ 1,400 image tokens.
- System prompt + schema: ~600 tokens (cached after first call → 60 effective tokens at 0.1x).
- User prompt: ~50 tokens.
- Output JSON: ~500 tokens (7 fields with verbatim, bbox, confidence).

**Tier 1 — Haiku 4.5 primary (every label):**
- Input: 1,400 + 60 (cached) + 50 = 1,510 tok at $1/M = $0.00151
- Output: 500 tok at $5/M = $0.00250
- **Subtotal: ~$0.0040/label**

**Tier 2 — Sonnet 4.6 fallback (~20% of labels):**
- Input: 1,400 + 60 (cached) + 50 = 1,510 tok at $3/M = $0.00453
- Output: 500 tok at $15/M = $0.00750
- **Subtotal: ~$0.0120/label**

**Tier 3 — OCR strict-fail safety net (every label, parallel) — Textract DDT:**
- $0.0015/label

**Blended cost-per-label = $0.0040 + 0.20 × $0.0120 + $0.0015 = ~$0.0079/label.**

That is **6.3x under the $0.05 budget**, leaving budget headroom for:
- Pattern 4 cross-check (~10% of labels): + $0.0008
- Higher-resolution Opus 4.7 fallback for very poor images (~2% of labels): + $0.001
- Per-batch context caching writes amortized over batches.

**Realistic blended: ~$0.010/label — comfortably under $0.05.**

**Routing rules:**
1. Run Haiku 4.5 + Textract DDT in parallel.
2. If any field returns confidence ∈ {medium, low} OR the gov-warning-strict-fail check fails on Haiku's output → re-run that field (or whole label) on Sonnet 4.6 with the OCR text appended as additional context.
3. If Sonnet still returns low confidence → mark the label "needs human review" with the issue list.
4. Gov-warning strict-fail uses the OCR text as ground truth (Textract gives exact text including capitalization). LLM is used only for "is this the gov-warning paragraph or some other paragraph that mentions warnings?" classification.

**This tier 3 OCR layer is the mechanism that hits the 100% recall requirement on gov-warning strict-fail.** Vision-LLMs occasionally normalize "GOVERNMENT WARNING:" → "Government Warning:" in output even when the label has it correctly capitalized. OCR is character-faithful.

---

## Q8 — Image preprocessing

**Library: `sharp` server-side, browser canvas client-side.**

| Preprocessing step | Latency cost | Accuracy benefit | Recommendation |
|---|---|---|---|
| EXIF auto-orient (`sharp.autoOrient()`) | < 50ms | Critical — iPhone photos come in sideways | **Always.** First op on the pipeline. |
| Resize to 1568 px long edge | 50–150ms | Avoids server-side resize, predictable token count, faster upload | **Always.** Match Claude's native resolution. |
| JPEG quality 85 reencode | 50–100ms | 30–50% smaller payload → faster network, no measurable accuracy loss | **Always for JPEG inputs.** Skip if input is already small. |
| Auto-rotate via OCR detection | 200–500ms | Helps with photos taken sideways without EXIF | Only if EXIF is missing. |
| Deskew (perspective correction) | 200–800ms | Big accuracy gain on bottle photos taken at an angle | **Worth it** for camera-capture path; skip for digital uploads. |
| Glare / shadow removal (CLAHE) | 100–300ms | Modest gain for live-capture | Apply only when image quality classifier flags it. |
| Super-resolution upscale | 500ms–2s | Large gain on small/blurry images | Don't do client-side; defer to a "retry with enhancement" button. |

**Vercel/Railway considerations:**
- Sharp is supported on Vercel (mark `serverExternalPackages: ['sharp']` in `next.config.js`).
- Sharp on Vercel cold start is ~200ms; warm is < 10ms. Use Edge Runtime for upload endpoints? **No** — sharp requires Node runtime.
- For Railway, sharp installs cleanly. No issues.
- **Do as much as possible client-side** (browser canvas) to reduce upload size and avoid Vercel function execution time. EXIF rotation, resize, and JPEG reencoding are all 100% feasible client-side.

**Pre-resize before upload is the single highest-leverage optimization:** an iPhone photo at 4032×3024 px (~3MB) becomes a 1568×1176 px (~250KB) image. That cuts upload time from 2–4s on cellular to 200–400ms.

---

## Q9 — Live camera-capture quality issues

**Common failure modes (in order of frequency observed in document-capture literature):**

1. **Glare / specular highlights** on glossy labels (foil, metallic ink, plastic-coated paper). Mitigation: ask user to tilt bottle ~15° from light source; client-side glare detection (look for blown-out pixel regions); server-side glare-removal CLAHE.
2. **Perspective distortion / curved labels.** Bottles are cylindrical — the label looks curved unless the user is square-on. Mitigation: client-side framing guide ("align label inside this rectangle"); server-side dewarp using detected label boundaries (works for ~70% of cases, not 100%).
3. **Motion blur / focus.** Phone cameras autofocus on the wrong thing. Mitigation: require user to tap-to-focus on the label region before capture; client-side blur detection (Laplacian variance threshold) before upload — reject and re-prompt.
4. **Low light / underexposure.** Bar lighting, dim store aisles. Mitigation: client-side brightness check; auto-flash; if accepted, server-side brightness boost.
5. **Cropping / cut-off label.** User frames too tight. Mitigation: detect label boundaries before submission; warn if any edge touches the frame.
6. **Reflection of the user / phone in glossy bottle.** Especially on dark glass. Mitigation: hard to fix automatically; UI guidance is the best lever.

**Quality-gate UX recommendation:**
- Client-side, before upload: run a small JS image-quality check (size, blur via Laplacian, brightness via histogram, edge-touching detection). If any check fails, show inline warning + "retake" button. This single step prevents most server-side extraction failures.
- After server-side extraction, if any field returns low confidence with a quality-related root-cause flag, surface a "image quality issue: glare on warning paragraph — retake?" message rather than silently passing the label through.

---

## Recommended approach for proofLens

**Primary recommendation:** Tiered Anthropic Claude vision pipeline with parallel OCR safety net for the government-warning strict-fail check, served from a Next.js 16 app on Vercel.

```
[Browser] → resize+EXIF+JPEG-q85 (client-side canvas)
       ↓
[Vercel /api/extract] → fan out:
       ├─→ Claude Haiku 4.5 (vision) — primary structured extraction
       └─→ AWS Textract DDT — raw OCR text + per-word bbox
       ↓
[Merge + verify]
   if any LLM field confidence ∈ {medium, low} OR gov-warning text mismatch
     → re-run on Claude Sonnet 4.6 with OCR text as additional context
   else → return verdict
```

**Why:**
1. Haiku 4.5's 0.56s TTFT and 91 t/s output rate land us in the ~3–4s end-to-end zone, safely under the 5s p50 budget. Sonnet 4.6 fallback covers the harder ~20% of labels and still completes within the 8s p95 budget.
2. The parallel Textract DDT call is character-faithful for the gov-warning strict-fail check (capitalization, exact wording), which the LLM cannot guarantee at 100% recall on its own.
3. Strict tool-use schemas + null-allowed fields + verbatim-quoting + bbox-per-field together get us past 95% verdict accuracy with documented hallucination-mitigation patterns.

**Cost-per-label estimate:** **~$0.010** blended (assumes 20% Sonnet fallback, 100% Textract DDT, 10% cross-check pass on Sonnet, prompt caching enabled on the system prompt + schema).
- 6.3× headroom under the $0.05 budget.
- Headroom is intentionally large because (a) image tokens are the dominant cost and may go up if we discover labels need higher resolution, and (b) cross-check passes will be more frequent during the eval-and-tune phase.

**Latency estimate:**
- p50: **~3.8s end-to-end** (client preprocessing 0.3s + upload 0.4s + Haiku 4.5 + Textract parallel 2.5s + merge 0.1s + UI render 0.5s).
- p95: **~7.0s** (adds Sonnet 4.6 fallback round-trip ~3s when triggered).
- Well within the 5s p50 / 8s p95 constraints.

**Biggest risk:** **Haiku 4.5 occasionally normalizes the government-warning text** (e.g., changes "GOVERNMENT WARNING:" to "Government Warning:" or expands abbreviations) even when the source label is correct. If we trusted only the LLM output for the strict-fail check, we'd false-flag compliant labels and miss non-compliant ones.
**Mitigation:** Run AWS Textract DDT in parallel on every label and use the **OCR-extracted text** as ground truth for the gov-warning strict-fail check. The LLM is only used to *locate* the gov-warning paragraph; the comparison is done character-by-character against the OCR text.

**Alternative if primary fails:** Switch primary to **Gemini 2.5 Flash** with the same Textract sidecar. Gemini Flash is ~5x cheaper than Haiku 4.5, has first-class bbox support (better for evidence highlighting), and TTFT ~0.7s with 194 t/s output. The trade is slightly weaker tool-use schema enforcement vs. Anthropic. If Anthropic's structured-output reliability turns out to be worse than tested on real label data, Gemini Flash with `responseSchema` is a clean drop-in.

**Second alternative:** OpenAI GPT-5.4-mini with strict `json_schema`. Best-in-class schema enforcement, $0.75/$4.50 pricing, but TTFT 0.5–0.6s and ~80–100 t/s puts end-to-end at ~7s without aggressive output compression — tight for p50.

---

## Sources

- [Anthropic pricing](https://platform.claude.com/docs/en/about-claude/pricing) — official model pricing table
- [Claude vision docs](https://platform.claude.com/docs/en/build-with-claude/vision) — image tokenization formula and limits
- [Artificial Analysis — Claude Sonnet 4.6](https://artificialanalysis.ai/models/claude-sonnet-4-6/providers) — TTFT and t/s benchmarks
- [Artificial Analysis — Claude 4.5 Haiku](https://artificialanalysis.ai/models/claude-4-5-haiku/providers)
- [Artificial Analysis — Gemini 2.5 Flash](https://artificialanalysis.ai/models/gemini-2-5-flash)
- [Gemini API pricing](https://ai.google.dev/gemini-api/docs/pricing)
- [AWS Textract pricing](https://aws.amazon.com/textract/pricing/)
- [Google Document AI pricing](https://cloud.google.com/document-ai/pricing)
- [Azure Document Intelligence pricing](https://azure.microsoft.com/en-us/pricing/details/document-intelligence/)
- [Vellum: LLMs vs OCRs for document extraction](https://www.vellum.ai/blog/document-data-extraction-llms-vs-ocrs)
- [Roboflow: Gemini 2.5 zero-shot detection](https://blog.roboflow.com/gemini-2-5-object-detection-segmentation/)
- [Mitigating object hallucination in LVLMs (arXiv 2402.08680)](https://arxiv.org/abs/2402.08680)
- [Sharp + Next.js EXIF rotation guidance](https://sharp.pixelplumbing.com/api-operation/)
