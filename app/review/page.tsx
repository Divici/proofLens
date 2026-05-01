"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowLeft,
  Sparkles,
  AlertTriangle,
  Loader2,
  Camera,
} from "lucide-react";
import { SiteNav } from "@/components/site-nav";
import { LabelUploader } from "@/components/LabelUploader";
import { ExpectedDataForm } from "@/components/ExpectedDataForm";
import { VerificationDetail } from "@/components/VerificationDetail";
import { CameraCapture } from "@/components/CameraCapture";
import { ExportMenu } from "@/components/ExportMenu";
import { Button } from "@/components/ui/button";
import { DEMO_SCENARIOS, DEMO_SCENARIO_01 } from "@/lib/demo/scenarios";
import type {
  ApplicationData,
  ExtractedLabelData,
} from "@/lib/ai/schema";
import type { FieldOverride, FieldResult, OverallStatus } from "@/lib/verify/types";
import type { ImageQualityFlag } from "@/lib/quality/types";
import type { HumanDecision } from "@/lib/storage/types";
import { composeReview } from "@/lib/storage/compose-review";
import { generateThumbnail } from "@/lib/image/thumbnail";
import {
  createReview,
  getReview,
  updateReview,
} from "@/lib/storage/review-repo";
import {
  getReviewerName,
  setReviewerName as persistReviewerName,
} from "@/lib/storage/settings-repo";
import { getQuotaStatus, isQuotaWarning } from "@/lib/storage/quota";

/**
 * Inline helper component — given a saved review id, fetches the IDB
 * record and renders an `<ExportMenu mode="single">`. We isolate this
 * here so the menu can read the persisted Review (which carries the
 * thumbnail Blob and the canonical FieldResults the PDF/JSON exporters
 * expect) instead of stitching state together from page-level pieces.
 */
function SavedReviewExport({ reviewId }: { reviewId: string }) {
  const [review, setReview] = useState<
    import("@/lib/storage/types").Review | null
  >(null);

  useEffect(() => {
    let cancelled = false;
    getReview(reviewId)
      .then((r) => {
        if (!cancelled && r) setReview(r);
      })
      .catch(() => {
        // Non-fatal — export menu just won't appear.
      });
    return () => {
      cancelled = true;
    };
  }, [reviewId]);

  if (!review) return null;
  return (
    <div className="flex justify-end">
      <ExportMenu mode="single" review={review} />
    </div>
  );
}

interface ExtractionResult {
  extracted: ExtractedLabelData;
  expected: ApplicationData;
  rawText: string;
  fieldResults: FieldResult[];
  overall: OverallStatus;
  processingTimeMs: number;
  aiSpend: { primaryUsd: number; fallbackUsd: number };
  ocrConfidence: number;
  imageWidth: number;
  imageHeight: number;
  imageQualityFlags?: ImageQualityFlag[];
  imageQualityPoor?: boolean;
}

type ExtractionStatus =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "success"; result: ExtractionResult };

function ReviewPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const reviewId = searchParams?.get("reviewId") ?? null;
  const startInCameraMode = searchParams?.get("source") === "camera";

  const [imageFile, setImageFile] = useState<File | null>(null);
  const [status, setStatus] = useState<ExtractionStatus>({ kind: "idle" });
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [cameraOpen, setCameraOpen] = useState<boolean>(startInCameraMode);
  /**
   * When the page is opened with `?reviewId=`, we pull the persisted
   * thumbnail Blob from IndexedDB and stash it here. A dedicated effect
   * (below) then allocates an object URL for it and revokes that URL on
   * unmount or when the user navigates to a different review — fixing
   * the per-visit memory leak the previous inline allocation caused.
   */
  const [reopenThumbnail, setReopenThumbnail] = useState<Blob | null>(null);
  const [demoScenarioId, setDemoScenarioId] = useState<string>(
    DEMO_SCENARIO_01.id,
  );
  const [reviewerName, setReviewerNameState] = useState<string>("");
  const [fieldResults, setFieldResults] = useState<FieldResult[]>([]);
  const [savedReviewId, setSavedReviewId] = useState<string | null>(null);
  const [existingDecision, setExistingDecision] = useState<
    HumanDecision | undefined
  >(undefined);
  const [saving, setSaving] = useState(false);
  const [quotaWarning, setQuotaWarning] = useState<{
    percentage: number;
  } | null>(null);

  // Pre-fill reviewer name from settings on mount.
  useEffect(() => {
    let cancelled = false;
    getReviewerName()
      .then((name) => {
        if (!cancelled && name) setReviewerNameState(name);
      })
      .catch(() => {
        // Storage read failure shouldn't block the page.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Compute quota status whenever results land.
  useEffect(() => {
    if (status.kind !== "success") return;
    let cancelled = false;
    getQuotaStatus()
      .then((q) => {
        if (cancelled) return;
        setQuotaWarning(isQuotaWarning(q) ? { percentage: q.percentage } : null);
      })
      .catch(() => {
        // Non-fatal — banner just won't render.
      });
    return () => {
      cancelled = true;
    };
  }, [status.kind]);

  // Hydrate from saved review when ?reviewId is present.
  useEffect(() => {
    if (!reviewId) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStatus({ kind: "loading" });
    getReview(reviewId)
      .then((review) => {
        if (cancelled) return;
        if (!review) {
          toast.error(
            "We couldn't find that saved review — start a new one below.",
          );
          setStatus({ kind: "idle" });
          return;
        }
        setSavedReviewId(review.id);
        setExistingDecision(review.decision);
        setReviewerNameState(review.reviewerName);
        setFieldResults(review.fieldResults);
        // Hand the persisted thumbnail to the dedicated object-URL effect
        // below so the URL is properly revoked on unmount / navigation.
        setReopenThumbnail(review.thumbnail);
        setStatus({
          kind: "success",
          result: {
            extracted: review.extracted,
            expected: review.expectedData,
            rawText: review.rawText,
            fieldResults: review.fieldResults,
            overall: review.overall,
            processingTimeMs: review.processingTimeMs,
            aiSpend: {
              primaryUsd: review.aiSpend.primaryUsd,
              fallbackUsd: review.aiSpend.fallbackUsd,
            },
            ocrConfidence: review.ocrConfidence,
            imageWidth: review.imageWidth,
            imageHeight: review.imageHeight,
            imageQualityFlags: review.imageQualityFlags,
            imageQualityPoor: review.imageQualityFlags.length > 0,
          },
        });
      })
      .catch((cause) => {
        console.error("[review] failed to hydrate saved review", cause);
        if (!cancelled) {
          toast.error("We couldn't load that saved review.");
          setStatus({ kind: "idle" });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [reviewId]);

  useEffect(() => {
    if (!imageFile) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(imageFile);
    setPreviewUrl(url);
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [imageFile]);

  // Mirror the upload-driven preview-URL pattern for the reopen path so
  // the object URL is revoked on unmount / navigation. The previous
  // inline allocation never revoked, leaking one Blob URL per visit.
  useEffect(() => {
    if (!reopenThumbnail) return;
    const url = URL.createObjectURL(reopenThumbnail);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPreviewUrl(url);
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [reopenThumbnail]);

  // Mirror status.success.fieldResults into local state so overrides can mutate.
  useEffect(() => {
    if (status.kind === "success") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setFieldResults(status.result.fieldResults);
    }
  }, [status]);

  const handleLoadDemoImage = async () => {
    const scenario =
      DEMO_SCENARIOS.find((s) => s.id === demoScenarioId) ??
      DEMO_SCENARIO_01;
    try {
      const response = await fetch(scenario.labelPath);
      const blob = await response.blob();
      const file = new File([blob], `${scenario.id}.jpg`, {
        type: blob.type || "image/jpeg",
      });
      setImageFile(file);
    } catch (cause) {
      console.error("[review] failed to load demo image", cause);
      setStatus({
        kind: "error",
        message: "We could not load the demo image. Please upload one manually.",
      });
    }
  };

  const handleSubmit = async (data: ApplicationData) => {
    if (!imageFile) {
      setStatus({
        kind: "error",
        message: "Upload a label image before verifying.",
      });
      return;
    }

    setStatus({ kind: "loading" });

    const formData = new FormData();
    formData.set("image", imageFile);
    formData.set("expected", JSON.stringify(data));

    try {
      const response = await fetch("/api/extract-label", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        const message =
          typeof body?.error === "string"
            ? body.error
            : "Extraction failed. Please try again.";
        setStatus({ kind: "error", message });
        return;
      }

      const result = (await response.json()) as ExtractionResult;
      setStatus({ kind: "success", result });
    } catch (cause) {
      console.error("[review] extraction request failed", cause);
      setStatus({
        kind: "error",
        message:
          "We could not reach the extraction service. Check your connection and try again.",
      });
    }
  };

  const handleOverrideSave = useCallback(
    (field: string, override: FieldOverride) => {
      setFieldResults((prev) =>
        prev.map((fr) =>
          fr.field === field ? { ...fr, humanOverride: override } : fr,
        ),
      );
      toast.success(`Override saved for ${field}.`);
    },
    [],
  );

  const handleOverrideClear = useCallback((field: string) => {
    setFieldResults((prev) =>
      prev.map((fr) => {
        if (fr.field !== field) return fr;
        const next: FieldResult = { ...fr };
        delete next.humanOverride;
        return next;
      }),
    );
    toast.message(`Override removed for ${field}.`);
  }, []);

  const handleReviewerNameChange = useCallback((name: string) => {
    setReviewerNameState(name);
  }, []);

  const handleSaveDecision = useCallback(
    async (decision: HumanDecision) => {
      if (status.kind !== "success") return;
      const file = imageFile;
      const result = status.result;

      setSaving(true);
      try {
        let thumbnail: Blob;
        if (file) {
          thumbnail = await generateThumbnail(file);
        } else {
          // Reopen flow — we already have the previous thumbnail.
          if (savedReviewId) {
            const existing = await getReview(savedReviewId);
            if (!existing)
              throw new Error("Saved review vanished — please start over.");
            thumbnail = existing.thumbnail;
          } else {
            throw new Error("Upload a label image before saving.");
          }
        }

        const id = savedReviewId ?? crypto.randomUUID();
        const review = composeReview({
          id,
          now: () => new Date(),
          reviewerName: decision.reviewerName,
          expectedData: result.expected,
          extracted: result.extracted,
          fieldResults,
          overall: result.overall,
          imageQualityFlags: result.imageQualityFlags ?? [],
          thumbnail,
          rawText: result.rawText,
          processingTimeMs: result.processingTimeMs,
          aiSpend: {
            primaryUsd: result.aiSpend.primaryUsd,
            fallbackUsd: result.aiSpend.fallbackUsd,
          },
          ocrConfidence: result.ocrConfidence,
          imageWidth: result.imageWidth,
          imageHeight: result.imageHeight,
          decision,
        });

        if (savedReviewId) {
          await updateReview(review);
        } else {
          await createReview(review);
        }
        await persistReviewerName(decision.reviewerName);
        setSavedReviewId(id);
        setExistingDecision(decision);
        toast.success("Review saved to your browser history.");
        // Also update the URL so a refresh keeps us in reopen mode.
        router.replace(`/review?reviewId=${id}`);
      } catch (cause) {
        console.error("[review] save failed", cause);
        const message =
          cause instanceof Error
            ? cause.message
            : "We couldn't save the review. Please try again.";
        toast.error(message);
      } finally {
        setSaving(false);
      }
    },
    [fieldResults, imageFile, router, savedReviewId, status],
  );

  const successResult = useMemo(
    () => (status.kind === "success" ? status.result : null),
    [status],
  );

  return (
    <>
      <SiteNav />
      <main
        id="main"
        className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6"
      >
        <div className="flex flex-col gap-3">
          <Link
            href="/"
            className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-xs"
          >
            <ArrowLeft className="size-3.5" /> Back to home
          </Link>
          <div className="flex flex-col gap-1">
            <h1 className="text-foreground text-2xl font-semibold tracking-tight">
              {savedReviewId ? "Reopened review" : "New review"}
            </h1>
            <p className="text-muted-foreground text-sm">
              {savedReviewId
                ? "Editing a previously saved review. Saving again updates the existing record."
                : "Upload one alcohol-label image, enter the expected application data, and proofLens will extract the visible fields, run the verification pipeline, and highlight evidence on the image."}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <section
            aria-label="Label image and expected data"
            className="flex flex-col gap-4"
          >
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-foreground text-sm font-semibold">
                Label image
              </h2>
              <div className="flex items-center gap-2">
                <label htmlFor="demo-scenario" className="sr-only">
                  Demo scenario
                </label>
                <select
                  id="demo-scenario"
                  className="border-border bg-background rounded-md border px-2 py-1 text-xs"
                  value={demoScenarioId}
                  onChange={(e) => setDemoScenarioId(e.target.value)}
                >
                  {DEMO_SCENARIOS.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleLoadDemoImage}
                >
                  <Sparkles className="size-3.5" /> Load demo image
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setCameraOpen((open) => !open)}
                  aria-pressed={cameraOpen}
                >
                  <Camera className="size-3.5" />
                  {cameraOpen ? "Close camera" : "Camera"}
                </Button>
              </div>
            </div>
            {cameraOpen ? (
              <div className="border-border bg-card/40 rounded-xl border p-4">
                <CameraCapture
                  onCapture={({ blob, width, height }) => {
                    const file = new File([blob], `capture-${Date.now()}.jpg`, {
                      type: blob.type || "image/jpeg",
                    });
                    setImageFile(file);
                    setCameraOpen(false);
                    toast.success(
                      `Captured ${width}×${height} — review the photo, then submit for verification.`,
                    );
                  }}
                  onCancel={() => setCameraOpen(false)}
                />
              </div>
            ) : (
              <LabelUploader
                onFileSelected={setImageFile}
                previewUrl={previewUrl}
                previewAlt="Uploaded label preview"
              />
            )}

            <h2 className="text-foreground text-sm font-semibold pt-2">
              Expected application data
            </h2>
            <ExpectedDataForm
              onSubmit={handleSubmit}
              isSubmitting={status.kind === "loading"}
              demoScenarioId={demoScenarioId}
            />
          </section>

          <section
            aria-label="Extraction results"
            aria-live="polite"
            className="flex flex-col gap-4"
          >
            <h2 className="text-foreground text-sm font-semibold">Results</h2>

            {status.kind === "idle" ? (
              <div className="text-muted-foreground rounded-xl border border-dashed border-border bg-card/40 p-6 text-center text-sm">
                Upload a label and submit the form to see verification results
                here.
              </div>
            ) : null}

            {status.kind === "loading" ? (
              <div
                role="status"
                className="flex items-center gap-3 rounded-xl border border-border bg-card/40 p-6 text-sm"
              >
                <Loader2
                  className="size-4 animate-spin text-muted-foreground"
                  aria-hidden="true"
                />
                <span className="text-muted-foreground">
                  Running OCR + vision-LLM extraction in parallel…
                </span>
              </div>
            ) : null}

            {status.kind === "error" ? (
              <div
                role="alert"
                className="border-destructive/40 bg-destructive/5 text-destructive flex items-start gap-2 rounded-xl border p-4 text-sm"
              >
                <AlertTriangle
                  className="mt-0.5 size-4 shrink-0"
                  aria-hidden="true"
                />
                <span>{status.message}</span>
              </div>
            ) : null}

            {successResult ? (
              <>
                <VerificationDetail
                  imageSrc={previewUrl}
                  fieldResults={fieldResults}
                  overall={successResult.overall}
                  processingTimeMs={successResult.processingTimeMs}
                  primaryUsd={successResult.aiSpend.primaryUsd}
                  ocrConfidence={successResult.ocrConfidence}
                  imageQualityFlags={successResult.imageQualityFlags ?? []}
                  beverageType={successResult.expected.beverageType}
                  reviewerName={reviewerName}
                  onOverrideSave={handleOverrideSave}
                  onOverrideClear={handleOverrideClear}
                  onReviewerNameChange={handleReviewerNameChange}
                  onSaveDecision={handleSaveDecision}
                  existingDecision={existingDecision}
                  saving={saving}
                  quotaWarning={quotaWarning}
                />
                {/* Export menu — only available after the review has been
                    saved (the export packs the IndexedDB Review record). */}
                {savedReviewId ? (
                  <SavedReviewExport reviewId={savedReviewId} />
                ) : (
                  <p className="text-muted-foreground text-xs">
                    Save the review to enable PDF / JSON export.
                  </p>
                )}
              </>
            ) : null}
          </section>
        </div>
      </main>
    </>
  );
}

export default function ReviewPage() {
  return (
    <Suspense
      fallback={
        <>
          <SiteNav />
          <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6">
            <div className="text-muted-foreground text-sm">Loading review…</div>
          </main>
        </>
      }
    >
      <ReviewPageInner />
    </Suspense>
  );
}
