"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
} from "react";
import { cn } from "@/lib/utils";

/**
 * Minimal ARIA-compliant tabs primitive. Hand-rolled (vs. shadcn-add'd)
 * to avoid pulling in a Radix dep for a 40-line component used in
 * exactly one place. API mirrors the shadcn/Radix shape so a future
 * migration to shadcn's Tabs is mechanical:
 *
 *   <Tabs value={tab} onValueChange={setTab}>
 *     <TabsList>
 *       <TabsTrigger value="data">Application data</TabsTrigger>
 *       <TabsTrigger value="results">Results</TabsTrigger>
 *     </TabsList>
 *     <TabsContent value="data">…</TabsContent>
 *     <TabsContent value="results">…</TabsContent>
 *   </Tabs>
 *
 * Controlled: callers own the `value` and update it via `onValueChange`.
 * That keeps URL-state plumbing (?tab=...) trivial in the page above.
 */

interface TabsContextValue {
  value: string;
  onValueChange: (value: string) => void;
  baseId: string;
  registerTrigger: (value: string, el: HTMLButtonElement | null) => void;
}

const TabsContext = createContext<TabsContextValue | null>(null);

function useTabsContext(component: string): TabsContextValue {
  const ctx = useContext(TabsContext);
  if (!ctx) {
    throw new Error(`<${component}> must be rendered inside <Tabs>`);
  }
  return ctx;
}

export interface TabsProps {
  value: string;
  onValueChange: (value: string) => void;
  className?: string;
  children: React.ReactNode;
}

export function Tabs({ value, onValueChange, className, children }: TabsProps) {
  const baseId = useId();
  const triggerRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

  const registerTrigger = useCallback(
    (key: string, el: HTMLButtonElement | null) => {
      if (el) {
        triggerRefs.current.set(key, el);
      } else {
        triggerRefs.current.delete(key);
      }
    },
    [],
  );

  const ctx = useMemo(
    () => ({ value, onValueChange, baseId, registerTrigger }),
    [value, onValueChange, baseId, registerTrigger],
  );

  return (
    <TabsContext.Provider value={ctx}>
      <div
        className={className}
        data-tabs-root=""
        data-active-tab={value}
        onKeyDown={(e) => {
          // Roving arrow-key navigation across triggers in this Tabs root.
          if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
          const triggers = Array.from(triggerRefs.current.entries());
          if (triggers.length === 0) return;
          const currentIndex = triggers.findIndex(([k]) => k === value);
          if (currentIndex < 0) return;
          e.preventDefault();
          const delta = e.key === "ArrowRight" ? 1 : -1;
          const nextIndex =
            (currentIndex + delta + triggers.length) % triggers.length;
          const next = triggers[nextIndex];
          if (next) {
            const [nextValue, nextEl] = next;
            onValueChange(nextValue);
            nextEl.focus();
          }
        }}
      >
        {children}
      </div>
    </TabsContext.Provider>
  );
}

export interface TabsListProps {
  className?: string;
  "aria-label"?: string;
  children: React.ReactNode;
}

export function TabsList({
  className,
  "aria-label": ariaLabel,
  children,
}: TabsListProps) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn(
        "border-border/60 inline-flex h-9 items-center gap-1 rounded-lg border bg-muted/40 p-1 text-sm",
        className,
      )}
    >
      {children}
    </div>
  );
}

export interface TabsTriggerProps {
  value: string;
  className?: string;
  disabled?: boolean;
  children: React.ReactNode;
}

export function TabsTrigger({
  value,
  className,
  disabled,
  children,
}: TabsTriggerProps) {
  const ctx = useTabsContext("TabsTrigger");
  const ref = useRef<HTMLButtonElement | null>(null);
  const active = ctx.value === value;
  const triggerId = `${ctx.baseId}-trigger-${value}`;
  const panelId = `${ctx.baseId}-panel-${value}`;

  useEffect(() => {
    ctx.registerTrigger(value, ref.current);
    return () => {
      ctx.registerTrigger(value, null);
    };
  }, [ctx, value]);

  return (
    <button
      ref={ref}
      type="button"
      role="tab"
      id={triggerId}
      aria-selected={active}
      aria-controls={panelId}
      tabIndex={active ? 0 : -1}
      disabled={disabled}
      data-state={active ? "active" : "inactive"}
      onClick={() => ctx.onValueChange(value)}
      className={cn(
        "inline-flex cursor-pointer items-center gap-1.5 rounded-md px-3 py-1 text-sm font-medium transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        "data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm",
        "data-[state=inactive]:text-muted-foreground data-[state=inactive]:hover:text-foreground",
        "disabled:cursor-not-allowed disabled:pointer-events-none disabled:opacity-50",
        className,
      )}
    >
      {children}
    </button>
  );
}

export interface TabsContentProps {
  value: string;
  className?: string;
  children: React.ReactNode;
}

export function TabsContent({ value, className, children }: TabsContentProps) {
  const ctx = useTabsContext("TabsContent");
  const active = ctx.value === value;
  const triggerId = `${ctx.baseId}-trigger-${value}`;
  const panelId = `${ctx.baseId}-panel-${value}`;
  if (!active) return null;
  return (
    <div
      role="tabpanel"
      id={panelId}
      aria-labelledby={triggerId}
      tabIndex={0}
      className={cn("focus-visible:outline-none", className)}
    >
      {children}
    </div>
  );
}
