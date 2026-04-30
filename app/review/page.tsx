"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Sparkles, AlertTriangle, Loader2 } from "lucide-react";
import { SiteNav } from "@/components/site-nav";
import { LabelUploader } from "@/components/LabelUploader";
import { ExpectedDataForm } from "@/components/ExpectedDataForm";
import { ExtractedDataCard } from "@/components/ExtractedDataCard";
import { Button } from "@/components/ui/button";
import { DEMO_SCENARIO_01 } from "@/lib/demo/scenarios";
import type {
  ApplicationData,
  ExtractedLabelData,
} from "@/lib/ai/schema";

interface ExtractionResult {
  extracted: ExtractedLabelData;
  expected: ApplicationData;
  processingTimeMs: number;
  aiSpend: { primaryUsd: number };
}

type ExtractionStatus =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "success"; result: ExtractionResult };

export default function ReviewPage() {
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [status, setStatus] = useState<ExtractionStatus>({ kind: "idle" });
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // Allocate the object URL inside an effect so we never run the side-effect
  // during render (which can leak URLs under React strict mode + StrictEffects
  // re-entry). The cleanup runs whenever the file changes or the page
  // unmounts, revoking the previous URL deterministically.
  //
  // The lint rule `react-hooks/set-state-in-effect` flags the `setPreviewUrl`
  // calls below — but `URL.createObjectURL` is an external-system side
  // effect, and the React docs recommend exactly this pattern for resources
  // that must be allocated/freed in lockstep with a prop or state value.
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

  const handleLoadDemoImage = async () => {
    try {
      const response = await fetch(DEMO_SCENARIO_01.labelPath);
      const blob = await response.blob();
      const file = new File([blob], "01-spirits-pass.jpg", {
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
              New review
            </h1>
            <p className="text-muted-foreground text-sm">
              Upload one alcohol-label image, enter the expected application
              data, and we will extract the visible fields. Verification logic
              ships in the next slice.
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
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleLoadDemoImage}
              >
                <Sparkles className="size-3.5" /> Load demo image
              </Button>
            </div>
            <LabelUploader
              onFileSelected={setImageFile}
              previewUrl={previewUrl}
              previewAlt="Uploaded label preview"
            />

            <h2 className="text-foreground text-sm font-semibold pt-2">
              Expected application data
            </h2>
            <ExpectedDataForm
              onSubmit={handleSubmit}
              isSubmitting={status.kind === "loading"}
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
                Upload a label and submit the form to see the extracted fields
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
                  Extracting label fields with the vision model…
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

            {status.kind === "success" ? (
              <ExtractedDataCard
                extracted={status.result.extracted}
                processingTimeMs={status.result.processingTimeMs}
                primaryUsd={status.result.aiSpend.primaryUsd}
              />
            ) : null}
          </section>
        </div>
      </main>
    </>
  );
}
