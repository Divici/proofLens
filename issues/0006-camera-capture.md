# 0006: Live camera capture

**Blocked by:** 0005
**Blocks:** 0009
**Requirements addressed:** R-003
**Demoable:** Reviewer on either a desktop (with webcam) or a phone (rear camera) clicks the Camera button, sees a live preview, frames a label, captures a still, reviews the captured image with retake/submit options, and submits to the same verification pipeline as upload. Mobile uses rear camera by default. iOS Safari works.
**Estimated effort:** 4-5h

## Acceptance criteria
- [ ] R-003: `/review` and `/batch` (single-add) entry both expose a Camera button
- [ ] `lib/camera/capture.ts` thin wrapper around `getUserMedia` + `enumerateDevices`
- [ ] Mobile defaults to `facingMode: { ideal: 'environment' }` (rear camera); falls back to user-facing if rear not available
- [ ] Desktop defaults to first available video device; if multiple, dropdown to pick
- [ ] iOS Safari quirks handled: video element needs `playsInline` + `muted` + `autoplay`; `srcObject` set after `play()` resolves
- [ ] Capture flow: live preview → big "Capture" button → freeze on capture → preview captured frame with [Retake] [Submit] buttons → submit kicks off `/api/extract-label`
- [ ] Browser-side preprocessing on capture: EXIF rotation (none on canvas-derived images, but we set `image-orientation`), resize ≤ 1568px via `OffscreenCanvas` in a Web Worker (avoids main-thread jank), JPEG q85 export
- [ ] Permissions UX: explicit prompt before requesting access; helpful error UI if denied; "you can still use file upload" link
- [ ] Camera off / stream stop on unmount or after capture
- [ ] All quality gates green; Playwright test grants camera permission via `page.context.grantPermissions(['camera'])`
- [ ] `STUDY_GUIDE.md` updated: "How we handle iOS Safari camera quirks"

## Files to touch
- **Create:** `lib/camera/capture.ts` (typed wrapper)
- **Create:** `lib/camera/preprocess-worker.ts` (Web Worker for EXIF/resize/encode)
- **Create:** `components/CameraCapture.tsx` (preview + capture + retake/submit UI)
- **Create:** `components/CameraPermissionsPrompt.tsx`
- **Modify:** `app/review/page.tsx` (add Camera button → opens capture modal/screen)
- **Modify:** `app/page.tsx` (add Camera as a top-level action)
- **Create:** `public/icons/camera.svg` (or use lucide-react)

## Test specs (write first per TDD)
1. `lib/camera/capture.test.ts` — `requestCameraStream({ facingMode: 'environment' })` calls getUserMedia with the right constraints; on rejection returns a typed error with `permission-denied` / `not-found` / `not-readable` codes.
2. `lib/camera/preprocess-worker.test.ts` — Worker accepts a Blob, returns a JPEG ≤ 1568px at q85.
3. `components/CameraCapture.test.tsx` — RTL with mocked `getUserMedia`; renders preview; capture button emits Blob; retake button clears state.
4. `components/CameraPermissionsPrompt.test.tsx` — denied state shows the file-upload fallback link.
5. `test/e2e/camera-capture.spec.ts` — Playwright with `grantPermissions(['camera'])` + mock video stream; click Camera → preview → capture → submit → verification result rendered.

## Notes
- iOS Safari requires user-gesture for `getUserMedia`; the Camera button click is the trigger.
- `OffscreenCanvas` support varies; provide a main-thread fallback for older Safari.
- Captured images go through the same `/api/extract-label` endpoint; no server changes needed.
- Camera capture for batch is single-image-at-a-time → adds to the batch queue (slice 7 enables that wiring).
- Test fixture: Playwright supports a `--use-fake-ui-for-media-stream` Chromium flag that auto-grants and fakes a video. We use this for E2E.
- Document the iOS Safari quirks in code-comments; future maintainers will thank us.
