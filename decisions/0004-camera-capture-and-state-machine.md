# 0004: Camera capture + permissions state machine

**Date:** 2026-04-30
**Status:** Superseded by ADR 0008 (2026-05-02)
**Slice:** 0006 (camera capture milestone)

> **Superseded.** Camera capture was removed in the queue redesign.
> `PROJECT_BRIEF.md` does not mention live photo capture — Jenny Park's
> image-quality discussion describes brewery-submitted artwork the
> agent reads, not the agent taking new photos themselves. The queue
> model assumes agents review submitted artifacts. Marcus Williams's
> "our network blocks outbound traffic to a lot of domains" further
> argues against features that depend on browser-device APIs in the
> deployed posture. See ADR 0008 for the full rationale.

## Context

Mobile reviewers in the field need to capture a label image directly
without a separate phone-to-desktop transfer step. Browser
`getUserMedia` is the only portable path; the friction sits in the
permissions surface and the state-machine that drives the user
through "request permission → live preview → capture → review →
submit" without dead-ends.

Slice 0006 ships that camera path end-to-end on `/review?source=camera`
and reuses the existing extract-label flow once a frame has been
captured.

## Decision

### State machine

```
                  click "Camera"
                        │
                        ▼
       ┌─────────────────────────────────┐
       │ permission-prompt               │
       │  - "Allow camera"               │
       │  - "Cancel"                     │
       └────────┬────────────────────────┘
                │  navigator.mediaDevices.getUserMedia({ video })
                ▼
       ┌─────────────────────────────────┐
       │ live-preview                    │
       │  <video autoplay playsInline />│
       │  - Capture button               │
       │  - Cancel                       │
       └────────┬────────────────────────┘
                │  canvas.getContext('2d').drawImage(video,...)
                ▼
       ┌─────────────────────────────────┐
       │ captured-pending-review         │
       │  <img src="blob:..." />        │
       │  - Submit                       │
       │  - Retake                       │
       └────────┬────────────────────────┘
                │  onCapture({ blob, width, height })
                ▼
       (camera shell closes; the captured image becomes the
        active label image for the standard review flow)
```

Closed-loop transitions:

- Permission denied → re-show prompt with the documented retry hint
  (link to site permission settings).
- Stream errors mid-preview → fall back to permission-prompt with a
  toast.
- "Retake" wipes the captured Blob URL and returns to `live-preview`
  without re-prompting.

### Permissions surface

`<CameraPermissionsPrompt>` is a small component that:

- Renders inside `<CameraCapture>` while
  `state.kind === "permission-prompt"`.
- Exposes a single primary action ("Allow camera") that calls
  `navigator.mediaDevices.getUserMedia`.
- Surfaces the documented retry path on denial (copy + a deep link
  to `chrome://settings/content/camera` is intentionally omitted —
  Chrome blocks programmatic navigation there; we describe the path
  in plain English instead).

### Capture pipeline

- A hidden `<canvas>` element matched to the live video's
  `videoWidth × videoHeight` does the actual frame grab.
- `canvas.toBlob('image/jpeg', 0.92)` produces the Blob.
- We pass `width` and `height` up via `onCapture` so the parent can
  size the resulting File correctly.

### MediaStream lifecycle

- `getUserMedia` is invoked exactly once per "Allow camera" click,
  not on mount, so an unused camera shell never trips the OS
  permission popup.
- The MediaStream is stopped (`tracks.forEach((t) => t.stop())`)
  when the component unmounts or the user clicks "Close camera".
- All `URL.createObjectURL` calls have matching revoke calls in the
  effect cleanup.

### E2E coverage

Playwright runs camera tests in a dedicated project with
`--use-fake-ui-for-media-stream` and
`--use-fake-device-for-media-stream` flags scoped to the project so
they don't auto-grant getUserMedia for any other spec. The fake
device pipes a synthetic colored frame as the video source.

The test exercises:
- click "Camera" → permission prompt
- "Allow camera" → live preview
- wait for `videoWidth > 0` (capture path throws otherwise)
- "Capture" → captured-pending-review with the captured-frame `<img>`
- "Submit" → camera shell closes; the captured image flows into the
  standard review flow.

## Consequences

### Positive

- Mobile reviewers can use the same `/review` UI from a field
  device without a phone-to-desktop transfer step.
- The state machine is exhaustive: every kind has a documented
  transition, no `as any` or `null` shortcuts.
- Permission denial is recoverable — we don't strand the user in a
  permanent error state.
- E2E coverage uses the documented Playwright/Chromium flags, so
  the test exercises the same `getUserMedia` API path as production.

### Negative

- Camera capture quality varies wildly across devices. Image-quality
  heuristics catch most field-shot defects, but a dim ambient lit
  bottle is still hard to extract from.
- iOS Safari `getUserMedia` requires the page to remain in the
  foreground — backgrounding the tab kills the preview without
  warning. We ship the docs note, not a UI signal.

### Deferred to later slices

- Live device picker (front vs. rear camera) — useful for tablets,
  not in scope for the slice.
- Auto-capture on detected motion-stop — out of scope; reviewers
  push the shutter manually.

## References

- `issues/0006-camera-capture.md` — slice spec
- `memory-bank/plans/slice-6-detail.md` — execution plan
- `components/CameraCapture.tsx` — state machine + capture pipeline
- `components/CameraPermissionsPrompt.tsx` — permissions surface
- `lib/camera/get-user-media.ts` — `getUserMedia` wrapper
- `test/e2e/camera-capture.spec.ts` — E2E coverage
- `playwright.config.ts` — dedicated camera project with the fake
  media flags
