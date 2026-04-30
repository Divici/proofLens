# Slice 0006 — Live camera capture — execution plan

## Source-of-truth spec

`issues/0006-camera-capture.md`.

## Branch

`slice/0006-camera-capture` off main. Worktree:
`.worktrees/slice-0006-camera-capture/`.

## Context delta

After slice 0005: full single-label review flow with override + history
+ reopen ships. The only missing input modality is camera capture.
This slice adds it as a third entry point alongside file upload and
batch (slice 0007).

## What's in / what's out

**In scope:**
- `getUserMedia` wrapper with rear-camera preference on mobile
- iOS Safari quirks handled (`playsInline`, `muted`, `autoplay`,
  `srcObject` set after `play()` resolves)
- Live preview → capture → review-captured-image → retake-or-submit
  flow
- Browser-side preprocessing on capture: EXIF rotation (Canvas
  `image-orientation`), resize ≤ 1568px via Web Worker
  (`OffscreenCanvas`), JPEG q85
- Camera permissions UX: explicit prompt, helpful error UI on denial,
  fallback to "use file upload instead"
- Camera button on `/review` and `/page.tsx`
- Camera off / stream stopped on unmount or after capture

**Out of scope:**
- Batch + Web Worker pool (slice 0007)
- Exports (slice 0008)
- Final polish + a11y + docs (slice 0009)

## Task graph

### Track 1 — `getUserMedia` wrapper (TDD)
1. **Failing tests first**: `lib/camera/capture.test.ts`
   - `requestCameraStream({ facingMode: 'environment' })` calls
     getUserMedia with the right constraints
   - On rejection returns a typed error with codes:
     `permission-denied | not-found | not-readable | insecure-context`
2. `lib/camera/capture.ts` — typed wrapper:
   ```ts
   type CameraError = { code: '...'; message: string };
   async function requestCameraStream(opts: {
     facingMode?: 'environment' | 'user';
     deviceId?: string;
   }): Promise<MediaStream>;
   async function listCameras(): Promise<MediaDeviceInfo[]>;
   function stopStream(stream: MediaStream): void;
   ```

### Track 2 — Preprocessing Web Worker (TDD)
3. **Failing tests first**: `lib/camera/preprocess-worker.test.ts`
   - Worker accepts a Blob, returns a JPEG ≤ 1568px at q85
   - EXIF rotation applied (test fixture with rotated EXIF)
   - Falls back to main-thread when OffscreenCanvas missing
4. `lib/camera/preprocess-worker.ts` — Web Worker. Use
   `OffscreenCanvas` to draw → `convertToBlob({ type: 'image/jpeg',
   quality: 0.85 })`.
5. Main-thread fallback path for older Safari.

### Track 3 — Camera UI (TDD)
6. **Failing tests first**: `components/CameraCapture.test.tsx`
   - Renders preview when stream available
   - Capture button emits Blob
   - Retake clears captured frame
   - Permissions denied state shows the file-upload fallback link
7. `components/CameraCapture.tsx` — preview + capture + retake/submit
   states. Internal state machine:
   ```
   idle → requesting-permissions → previewing →
     captured-pending-review → submitting → done
                          ↓
                       retake → previewing
   ```
   - Mobile: defaults `facingMode: { ideal: 'environment' }`
   - Desktop: dropdown for multiple devices (via `enumerateDevices`)
   - Stops stream on unmount
   - Big primary "Capture" button (sized for thumbs)
   - "Retake" + "Submit" buttons after capture
8. **Failing tests first**:
   `components/CameraPermissionsPrompt.test.tsx` — denied state shows
   the file-upload fallback link.
9. `components/CameraPermissionsPrompt.tsx`.

### Track 4 — Wire-up
10. Update `app/review/page.tsx`: add a "Camera" button alongside the
    upload control. Clicking opens the `CameraCapture` flow (modal or
    full-page on mobile). On submit, the captured Blob feeds the same
    `/api/extract-label` POST as upload — no server changes needed.
11. Update `app/page.tsx`: add "Capture from camera" CTA on the home
    page nav.
12. Browser-only preprocessing: when the Blob arrives from the worker,
    pass straight to the existing `verifyLabel` flow.

### Track 5 — E2E
13. **Failing test first**: `test/e2e/camera-capture.spec.ts` —
    Playwright with `page.context.grantPermissions(['camera'])` and
    `--use-fake-ui-for-media-stream` Chromium flag (fakes a video
    stream). Click Camera button → preview → capture → submit →
    verification result rendered.

### Track 6 — STUDY_GUIDE.md
14. Add section "How we handle iOS Safari camera quirks".

## Acceptance gate

Per `issues/0006-camera-capture.md`. All 9 acceptance criteria checked.
Vitest grows from 341 to ~370. Playwright grows from 13 to 14. All
quality gates green. Mutation fuzz still 100/100.

## Estimated effort

4-5h. iOS Safari quirks are the unknown unknown.

## Reasonable deviations

- If `OffscreenCanvas` test setup is fragile in jsdom, mock the worker
  surface in unit tests and rely on Playwright e2e for the real worker
  path.
- Camera capture for batch is single-image-at-a-time → adds to the
  batch queue (slice 0007 wires that). For now the camera capture
  delivers to the single-review flow only.
- Playwright `--use-fake-ui-for-media-stream` may need a config
  adjustment in `playwright.config.ts` browser launchOptions.
