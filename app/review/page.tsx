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
} from "lucide-react";
import { SiteNav } from "@/components/site-nav";
import { LabelUploader } from "@/components/LabelUploader";
import { ExpectedDataForm } from "@/components/ExpectedDataForm";
import { ApplicationDataView } from "@/components/ApplicationDataView";
import { VerificationDetail } from "@/components/VerificationDetail";
import { ExportMenu } from "@/components/ExportMenu";
import { ProviderHealthBanner } from "@/components/ProviderHealthBanner";
import { ImageLightbox } from "@/components/ImageLightbox";
import { JumpToFinalReviewButton } from "@/components/JumpToFinalReviewButton";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Maximize2 } from "lucide-react";
import { DEMO_SCENARIOS, DEMO_SCENARIO_01 } from "@/lib/demo/scenarios";
import { REAL_SCENARIOS } from "@/lib/demo/real-scenarios";
import { listApplications } from "@/lib/queue/applications";
import type {
  ApplicationData,
  ExtractedLabelData,
} from "@/lib/ai/schema";
import type { FieldOverride, FieldResult, OverallStatus } from "@/lib/verify/types";
import type { ImageQualityFlag } from "@/lib/quality/types";
import type { HumanDecision } from "@/lib/storage/types";
import { composeReview } from "@/lib/storage/compose-review";
import { rollUpOverall } from "@/lib/verify/status-engine";
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

/**
 * Resolve a queue scenario id (synthetic or real) to a uniform shape the
 * page can preload. Real scenario ids start with `real-`. The brief
 * (`PROJECT_BRIEF.md`, Sarah Chen) frames the agent workflow as the
 * application data being already on file — `/queue` -> click row ->
 * `/review?scenario=...` simulates that COLA pre-load.
 */
function resolveScenario(
  scenarioId: string | null,
): { labelPath: string; data: ApplicationData } | null {
  if (!scenarioId) return null;
  if (scenarioId.startsWith("real-")) {
    const real = REAL_SCENARIOS.find((s) => s.id === scenarioId);
    return real
      ? { labelPath: real.labelPath, data: real.data }
      : null;
  }
  const synth = DEMO_SCENARIOS.find((s) => s.id === scenarioId);
  return synth ? { labelPath: synth.labelPath, data: synth.data } : null;
}

function applicationIdForScenario(scenarioId: string): string | null {
  const match = listApplications().find((a) => a.scenarioId === scenarioId);
  return match ? match.applicationId : null;
}

function ReviewPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const reviewId = searchParams?.get("reviewId") ?? null;
  const scenarioParam = searchParams?.get("scenario") ?? null;
  const fromQueue = Boolean(scenarioParam);
  const queueAppId = useMemo(
    () => (scenarioParam ? applicationIdForScenario(scenarioParam) : null),
    [scenarioParam],
  );

  const [imageFile, setImageFile] = useState<File | null>(null);
  const [status, setStatus] = useState<ExtractionStatus>({ kind: "idle" });
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
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
  /**
   * Application-data defaults applied to the next mount of
   * `<ExpectedDataForm>`. The "Load demo scenario" button populates this
   * AND bumps `formKey` so RHF remounts the form with the new values
   * (RHF holds form state per-mount; the only correct way to swap
   * defaults is to remount). Falsy → form starts empty as before.
   */
  const [loadedDemoData, setLoadedDemoData] = useState<
    Partial<ApplicationData> | undefined
  >(undefined);
  const [formKey, setFormKey] = useState<number>(0);
  const [reviewerName, setReviewerNameState] = useState<string>("");
  const [fieldResults, setFieldResults] = useState<FieldResult[]>([]);
  const [savedReviewId, setSavedReviewId] = useState<string | null>(null);
  const [existingDecision, setExistingDecision] = useState<
    HumanDecision | undefined
  >(undefined);
  const [saving, setSaving] = useState(false);
  const [imageLightboxOpen, setImageLightboxOpen] = useState(false);
  const tabParam = searchParams?.get("tab") ?? null;
  // Tab state lives in the URL (`?tab=results`) so a refresh keeps the
  // reviewer where they were. Initial value: results tab when reopening
  // a saved review (?reviewId), otherwise honor ?tab=, otherwise default
  // to the application-data tab so the agent reads the application
  // before seeing the AI's read of the label.
  const initialTab: "data" | "results" =
    tabParam === "results" || tabParam === "data"
      ? tabParam
      : reviewId
        ? "results"
        : "data";
  const [activeTab, setActiveTab] = useState<"data" | "results">(initialTab);
  const handleTabChange = useCallback(
    (next: string) => {
      const value = next === "results" ? "results" : "data";
      setActiveTab(value);
      // Mirror to URL so refresh keeps the tab. Only push when it
      // changes meaningfully (avoid history thrash).
      const sp = new URLSearchParams(searchParams?.toString() ?? "");
      sp.set("tab", value);
      router.replace(`/review?${sp.toString()}`, { scroll: false });
    },
    [router, searchParams],
  );
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

  // Pre-load image + form when the page is opened from the queue
  // (`/review?scenario=<id>`). Mirrors the brief's COLA-pre-load
  // workflow — the application data is already on file when the agent
  // pulls up an application. Direct `/review` entry (no `?scenario=`)
  // remains supported and shows no breadcrumb.
  useEffect(() => {
    if (!scenarioParam || reviewId) return;
    const resolved = resolveScenario(scenarioParam);
    if (!resolved) {
      toast.warning(
        "We couldn't find that queue scenario — start from the application form below.",
      );
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch(resolved.labelPath);
        const blob = await response.blob();
        const file = new File(
          [blob],
          `${scenarioParam}${blob.type === "image/png" ? ".png" : ".jpg"}`,
          { type: blob.type || "image/jpeg" },
        );
        if (cancelled) return;
        setImageFile(file);
        setLoadedDemoData(resolved.data);
        setFormKey((n) => n + 1);
      } catch (cause) {
        console.error("[review] failed to preload scenario", cause);
        if (!cancelled) {
          toast.error("We couldn't load the scenario artwork — try again.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [scenarioParam, reviewId]);

  const handleLoadDemoScenario = async () => {
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
      // Populate the form with the matching expected-data in the same
      // click. Bumping `formKey` remounts ExpectedDataForm so RHF picks
      // up the new defaultValues — the documented React pattern for
      // swapping defaults at runtime.
      setLoadedDemoData(scenario.data);
      setFormKey((n) => n + 1);
    } catch (cause) {
      console.error("[review] failed to load demo scenario", cause);
      setStatus({
        kind: "error",
        message:
          "We could not load the demo scenario. Please upload an image and enter expected data manually.",
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
      // Auto-switch to the Results tab so the agent doesn't have to
      // hunt for the verdict (also persists ?tab=results in the URL).
      handleTabChange("results");
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

  const handleJumpToFinalReview = useCallback(() => {
    // Switch to results first so the anchor exists in the DOM, then
    // smooth-scroll to it on the next paint.
    handleTabChange("results");
    requestAnimationFrame(() => {
      const el = document.getElementById("final-decision");
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, [handleTabChange]);

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
        // Stamp the reviewer name from the FinalDecisionPanel into any
        // override that lacks one. The HumanOverridePanel no longer
        // requires a name at edit time — a single name gate at final
        // approval is enough, and matches the brief's audit model
        // (one reviewer per saved Review record).
        const stampedFieldResults = fieldResults.map((fr) =>
          fr.humanOverride && !fr.humanOverride.reviewerName.trim()
            ? {
                ...fr,
                humanOverride: {
                  ...fr.humanOverride,
                  reviewerName: decision.reviewerName,
                },
              }
            : fr,
        );
        // Recompute overall from the override-applied fieldResults
        // before persisting — otherwise the saved Review record (and
        // every history surface that reads from it) keeps the original
        // AI verdict despite reviewer overrides. R-012.
        const persistedOverall = rollUpOverall(stampedFieldResults);
        const review = composeReview({
          id,
          now: () => new Date(),
          reviewerName: decision.reviewerName,
          expectedData: result.expected,
          extracted: result.extracted,
          fieldResults: stampedFieldResults,
          overall: persistedOverall,
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
          ...(scenarioParam ? { scenarioId: scenarioParam } : {}),
        });

        if (savedReviewId) {
          await updateReview(review);
        } else {
          await createReview(review);
        }
        await persistReviewerName(decision.reviewerName);
        setSavedReviewId(id);
        setExistingDecision(decision);
        // Mirror the name-stamped overrides into local state so the
        // UI immediately shows "<reviewer name>" on every override
        // note (instead of an empty author).
        setFieldResults(stampedFieldResults);
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
    [fieldResults, imageFile, router, savedReviewId, scenarioParam, status],
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
        <ProviderHealthBanner />
        <div className="flex flex-col gap-3">
          {fromQueue ? (
            <nav
              aria-label="Breadcrumb"
              className="text-xs text-muted-foreground"
            >
              <ol className="flex items-center gap-1.5">
                <li>
                  <Link
                    href="/queue"
                    className="hover:text-foreground rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    Application Queue
                  </Link>
                </li>
                <li aria-hidden="true" className="text-muted-foreground/60">
                  ›
                </li>
                <li>
                  <span className="font-mono text-foreground">
                    {queueAppId ?? "—"}
                  </span>
                </li>
              </ol>
            </nav>
          ) : (
            <Link
              href="/queue"
              className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
            >
              <ArrowLeft className="size-3.5" aria-hidden="true" /> Back to queue
            </Link>
          )}
          <div className="flex flex-col gap-1">
            <h1 className="text-foreground text-2xl font-semibold tracking-tight">
              {savedReviewId
                ? "Reopened review"
                : fromQueue
                  ? "Active review"
                  : "New review"}
            </h1>
            <p className="text-muted-foreground text-sm">
              {savedReviewId
                ? "Editing a previously saved review. Saving again updates the existing record."
                : fromQueue
                  ? "Verify that what's on the label matches what's in the application. Brand, ABV, government warning — agent's eyes still make the call."
                  : "Upload one alcohol-label image, enter the expected application data, and proofLens will extract the visible fields, run the verification pipeline, and highlight evidence on the image."}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Left column — label image. On lg+ shown full size next to
              the tab block; below lg, clamped to a thumbnail above the
              tabs with tap-to-expand into a fullscreen lightbox. */}
          <section
            aria-label="Label artwork"
            className="flex flex-col gap-3"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-foreground text-sm font-semibold">
                Label image
              </h2>
              {fromQueue ? null : (
                <div className="flex flex-wrap items-center gap-2">
                  <label htmlFor="demo-scenario" className="sr-only">
                    Demo scenario
                  </label>
                  <select
                    id="demo-scenario"
                    className="border-border bg-background min-w-0 max-w-[180px] truncate rounded-md border px-2 py-1 text-xs"
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
                    onClick={handleLoadDemoScenario}
                  >
                    <Sparkles className="size-3.5" /> Load demo scenario
                  </Button>
                </div>
              )}
            </div>
            {/* Mobile: clamped thumbnail with tap-to-expand. */}
            <div className="lg:hidden">
              {previewUrl ? (
                <button
                  type="button"
                  onClick={() => setImageLightboxOpen(true)}
                  aria-label="Tap to expand label artwork"
                  className="relative block w-full cursor-pointer overflow-hidden rounded-xl border border-border bg-card/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={previewUrl}
                    alt="Uploaded label preview — tap to expand"
                    className="block max-h-40 w-full object-contain"
                  />
                  <span className="bg-background/80 absolute right-2 top-2 inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-medium text-muted-foreground">
                    <Maximize2 className="size-3" aria-hidden="true" /> Expand
                  </span>
                </button>
              ) : fromQueue ? (
                <div
                  role="status"
                  className="flex min-h-32 items-center justify-center rounded-xl border border-dashed border-border bg-card/40 text-xs text-muted-foreground"
                >
                  Loading label artwork…
                </div>
              ) : (
                <LabelUploader
                  onFileSelected={setImageFile}
                  previewUrl={previewUrl}
                  previewAlt="Uploaded label preview"
                />
              )}
            </div>
            {/* Desktop: full-size preview. Queue flow → read-only static
                <img>; direct flow → editable LabelUploader. */}
            <div className="hidden lg:block">
              {fromQueue ? (
                previewUrl ? (
                  <div className="overflow-hidden rounded-xl border border-border bg-card/40 p-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={previewUrl}
                      alt="Label artwork on file"
                      className="mx-auto block max-h-[480px] w-auto rounded-lg object-contain"
                    />
                  </div>
                ) : (
                  <div
                    role="status"
                    className="flex min-h-72 items-center justify-center rounded-xl border border-dashed border-border bg-card/40 text-sm text-muted-foreground"
                  >
                    Loading label artwork…
                  </div>
                )
              ) : (
                <LabelUploader
                  onFileSelected={setImageFile}
                  previewUrl={previewUrl}
                  previewAlt="Uploaded label preview"
                />
              )}
            </div>
          </section>

          {/* Right column — tabbed [Application data | Results]. */}
          <section
            aria-label="Application data and verification results"
            className="flex flex-col gap-3"
          >
            <Tabs value={activeTab} onValueChange={handleTabChange}>
              <TabsList aria-label="Review sections">
                <TabsTrigger value="data">Application data</TabsTrigger>
                <TabsTrigger
                  value="results"
                  disabled={status.kind === "idle"}
                >
                  Results
                </TabsTrigger>
              </TabsList>

              <TabsContent value="data" className="pt-4">
                {fromQueue ? (
                  loadedDemoData ? (
                    <ApplicationDataView
                      data={loadedDemoData as ApplicationData}
                      onVerify={() =>
                        handleSubmit(loadedDemoData as ApplicationData)
                      }
                      isVerifying={status.kind === "loading"}
                    />
                  ) : (
                    <div
                      role="status"
                      className="text-muted-foreground flex items-center gap-2 rounded-xl border border-dashed border-border bg-card/40 p-6 text-sm"
                    >
                      <Loader2
                        className="size-4 animate-spin"
                        aria-hidden="true"
                      />
                      Loading application from the queue…
                    </div>
                  )
                ) : (
                  <ExpectedDataForm
                    key={formKey}
                    onSubmit={handleSubmit}
                    isSubmitting={status.kind === "loading"}
                    initialValues={loadedDemoData}
                  />
                )}
              </TabsContent>

              <TabsContent
                value="results"
                className="flex flex-col gap-4 pt-4"
                aria-live="polite"
              >
                {status.kind === "idle" ? (
                  <div className="text-muted-foreground rounded-xl border border-dashed border-border bg-card/40 p-6 text-center text-sm">
                    Verify a label to see results here.
                  </div>
                ) : null}

                {status.kind === "loading" ? (
                  <div
                    role="status"
                    aria-label="Running verification"
                    className="flex min-h-80 flex-col items-center justify-center gap-3 rounded-xl border border-border bg-card/40 p-6 text-sm"
                  >
                    <Loader2
                      className="size-8 animate-spin text-primary"
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
                      overall={rollUpOverall(fieldResults)}
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
                    {savedReviewId ? (
                      <SavedReviewExport reviewId={savedReviewId} />
                    ) : (
                      <p className="text-muted-foreground text-xs">
                        Save the review to enable PDF / JSON export.
                      </p>
                    )}
                  </>
                ) : null}
              </TabsContent>
            </Tabs>
          </section>
        </div>
      </main>

      <JumpToFinalReviewButton
        visible={status.kind === "success"}
        onJump={handleJumpToFinalReview}
      />

      <ImageLightbox
        open={imageLightboxOpen}
        src={previewUrl}
        alt="Label artwork (expanded)"
        onClose={() => setImageLightboxOpen(false)}
      />
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
