"use client";

import { useId } from "react";
import { useForm, type SubmitHandler } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import {
  ApplicationDataSchema,
  type ApplicationData,
} from "@/lib/ai/schema";
import { DEMO_SCENARIOS, DEMO_SCENARIO_01 } from "@/lib/demo/scenarios";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export interface ExpectedDataFormProps {
  onSubmit: (data: ApplicationData) => void | Promise<void>;
  isSubmitting?: boolean;
  initialValues?: Partial<ApplicationData>;
  /** Optional demo scenario id for the "Load demo data" button. */
  demoScenarioId?: string;
}

const DEFAULT_FORM_VALUES: ApplicationData = {
  brand: "",
  classType: "",
  abv: 0,
  netContents: "",
  bottlerName: "",
  bottlerAddress: "",
  countryOfOrigin: "",
  govWarningRequired: true,
  applicationNotes: "",
  beverageType: "distilled-spirits",
};

const BEVERAGE_OPTIONS: Array<{
  value: ApplicationData["beverageType"];
  label: string;
}> = [
  { value: "distilled-spirits", label: "Distilled spirits" },
  { value: "wine", label: "Wine" },
  { value: "malt-beverage", label: "Malt beverage" },
  { value: "unknown", label: "Unknown / other" },
];

/**
 * Manual entry form for `ApplicationData` (PRD §13.1).
 *
 * Wired to react-hook-form with a Zod resolver so submit is gated on
 * schema validity. The "Load demo data" button replaces every field
 * with the slice 0002 placeholder scenario, letting reviewers preview
 * the verification flow without typing.
 */
export function ExpectedDataForm({
  onSubmit,
  isSubmitting = false,
  initialValues,
  demoScenarioId,
}: ExpectedDataFormProps) {
  const formId = useId();
  const form = useForm<ApplicationData>({
    resolver: zodResolver(ApplicationDataSchema),
    defaultValues: { ...DEFAULT_FORM_VALUES, ...initialValues },
    mode: "onTouched",
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = form;

  const submitHandler: SubmitHandler<ApplicationData> = async (data) => {
    // Guard against unexpected throws from the parent handler so the form
    // never gets stuck in a "submitting" UI state. RHF clears `isSubmitting`
    // automatically when this promise settles, so we just need to surface
    // a generic toast and let the parent decide what to render.
    try {
      await onSubmit(data);
    } catch (cause) {
      console.error("[ExpectedDataForm] onSubmit threw", cause);
      toast.error("Something went wrong, please try again.");
    }
  };

  const handleLoadDemo = () => {
    const scenario =
      DEMO_SCENARIOS.find((s) => s.id === demoScenarioId) ??
      DEMO_SCENARIO_01;
    reset(scenario.data);
  };

  return (
    <form
      onSubmit={handleSubmit(submitHandler)}
      noValidate
      className="flex flex-col gap-4"
      id={formId}
    >
      <Field
        id={`${formId}-brand`}
        label="Brand name"
        error={errors.brand?.message}
      >
        <Input
          id={`${formId}-brand`}
          autoComplete="off"
          {...register("brand")}
        />
      </Field>

      <Field
        id={`${formId}-classType`}
        label="Class / type designation"
        error={errors.classType?.message}
      >
        <Input
          id={`${formId}-classType`}
          autoComplete="off"
          {...register("classType")}
        />
      </Field>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field
          id={`${formId}-abv`}
          label="ABV (%)"
          error={errors.abv?.message}
        >
          <Input
            id={`${formId}-abv`}
            type="number"
            step="0.1"
            min={0}
            max={100}
            {...register("abv", { valueAsNumber: true })}
          />
        </Field>
        <Field
          id={`${formId}-netContents`}
          label="Net contents"
          error={errors.netContents?.message}
        >
          <Input
            id={`${formId}-netContents`}
            placeholder="e.g. 750 mL"
            {...register("netContents")}
          />
        </Field>
      </div>

      <Field
        id={`${formId}-bottlerName`}
        label="Bottler / producer name"
        error={errors.bottlerName?.message}
      >
        <Input
          id={`${formId}-bottlerName`}
          autoComplete="off"
          {...register("bottlerName")}
        />
      </Field>

      <Field
        id={`${formId}-bottlerAddress`}
        label="Bottler / producer address"
        error={errors.bottlerAddress?.message}
      >
        <Input
          id={`${formId}-bottlerAddress`}
          autoComplete="off"
          {...register("bottlerAddress")}
        />
      </Field>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field
          id={`${formId}-country`}
          label="Country of origin"
          error={errors.countryOfOrigin?.message}
        >
          <Input
            id={`${formId}-country`}
            autoComplete="off"
            {...register("countryOfOrigin")}
          />
        </Field>
        <Field
          id={`${formId}-beverageType`}
          label="Beverage type"
          error={errors.beverageType?.message}
        >
          <select
            id={`${formId}-beverageType`}
            className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            {...register("beverageType")}
          >
            {BEVERAGE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div className="flex items-center gap-2">
        <input
          id={`${formId}-govWarning`}
          type="checkbox"
          className="size-4 rounded border-input"
          {...register("govWarningRequired")}
        />
        <Label htmlFor={`${formId}-govWarning`} className="text-sm">
          Government warning required for this beverage
        </Label>
      </div>

      <Field
        id={`${formId}-notes`}
        label="Application notes / reference"
        error={errors.applicationNotes?.message}
      >
        <Input
          id={`${formId}-notes`}
          placeholder="e.g. TTB application ID"
          {...register("applicationNotes")}
        />
      </Field>

      <div className="flex items-center justify-between gap-2 pt-2">
        <Button
          type="button"
          variant="outline"
          onClick={handleLoadDemo}
        >
          Load demo data
        </Button>
        <Button
          type="submit"
          disabled={isSubmitting}
          aria-label="Verify label"
        >
          {isSubmitting ? "Verifying…" : "Verify label"}
        </Button>
      </div>
    </form>
  );
}

interface FieldProps {
  id: string;
  label: string;
  error?: string | undefined;
  children: React.ReactNode;
}

function Field({ id, label, error, children }: FieldProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error ? (
        <p
          role="alert"
          className={cn("text-destructive text-xs")}
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}
