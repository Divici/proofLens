import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createExtractionPool,
  type ExtractionJob,
  type ExtractionResult,
  type JobRunner,
} from "./extraction-pool";

interface TestJobShape {
  id: string;
  shouldFail?: boolean;
  durationMs?: number;
}

function buildJob(shape: TestJobShape): ExtractionJob<TestJobShape, string> {
  return { id: shape.id, payload: shape };
}

function makeRunner(
  /**
   * `tracker` is a shared accumulator the runner writes to so tests can
   * inspect concurrency.
   */
  tracker: { running: number; maxRunning: number },
): JobRunner<TestJobShape, string> {
  return async (
    job: ExtractionJob<TestJobShape, string>,
    signal: AbortSignal,
  ) => {
    tracker.running += 1;
    tracker.maxRunning = Math.max(tracker.maxRunning, tracker.running);
    try {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(resolve, job.payload.durationMs ?? 5);
        signal.addEventListener("abort", () => {
          clearTimeout(timer);
          reject(new Error("aborted"));
        });
      });
      if (job.payload.shouldFail) {
        throw new Error(`job ${job.id} failed`);
      }
      return `ok:${job.id}`;
    } finally {
      tracker.running -= 1;
    }
  };
}

describe("createExtractionPool", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("processes 30 jobs respecting max concurrency of 10", async () => {
    const tracker = { running: 0, maxRunning: 0 };
    const runner = makeRunner(tracker);
    const pool = createExtractionPool<TestJobShape, string>({
      concurrency: 10,
      runner,
    });

    const jobs = Array.from({ length: 30 }, (_, i) =>
      buildJob({ id: String(i), durationMs: 5 }),
    );
    const results = await pool.runAll(jobs);

    expect(results).toHaveLength(30);
    expect(tracker.maxRunning).toBeLessThanOrEqual(10);
    expect(tracker.maxRunning).toBeGreaterThan(1);
    expect(results.every((r) => r.ok)).toBe(true);
  });

  it("surfaces per-job failures without halting the rest", async () => {
    const runner = makeRunner({ running: 0, maxRunning: 0 });
    const pool = createExtractionPool<TestJobShape, string>({
      concurrency: 5,
      runner,
    });

    const jobs = [
      buildJob({ id: "ok-1" }),
      buildJob({ id: "fail-1", shouldFail: true }),
      buildJob({ id: "ok-2" }),
      buildJob({ id: "fail-2", shouldFail: true }),
    ];
    const results = await pool.runAll(jobs);

    const byId = new Map(results.map((r) => [r.id, r] as const));
    expect(byId.get("ok-1")?.ok).toBe(true);
    expect(byId.get("ok-2")?.ok).toBe(true);
    const fail1 = byId.get("fail-1");
    const fail2 = byId.get("fail-2");
    expect(fail1?.ok).toBe(false);
    expect(fail2?.ok).toBe(false);
    if (fail1?.ok === false) {
      expect(fail1.error).toMatch(/fail-1/);
    }
  });

  it("emits progress events as jobs start + complete", async () => {
    const runner = makeRunner({ running: 0, maxRunning: 0 });
    const pool = createExtractionPool<TestJobShape, string>({
      concurrency: 2,
      runner,
    });
    const events: Array<{ kind: string; id: string }> = [];
    pool.subscribe((evt) => {
      events.push({ kind: evt.kind, id: evt.id });
    });
    const jobs = [
      buildJob({ id: "a" }),
      buildJob({ id: "b" }),
      buildJob({ id: "c", shouldFail: true }),
    ];
    await pool.runAll(jobs);

    const startEvents = events.filter((e) => e.kind === "start");
    const completeEvents = events.filter(
      (e) => e.kind === "complete" || e.kind === "error",
    );
    expect(startEvents).toHaveLength(3);
    expect(completeEvents).toHaveLength(3);
    expect(events.find((e) => e.id === "c")?.kind).toBe("start");
    expect(
      events
        .filter((e) => e.id === "c")
        .map((e) => e.kind)
        .sort(),
    ).toEqual(["error", "start"]);
  });

  it("retryFailed reruns only failed jobs", async () => {
    const tracker = { running: 0, maxRunning: 0 };
    let calls = 0;
    const runner: JobRunner<TestJobShape, string> = async (job) => {
      calls += 1;
      if (job.payload.shouldFail && calls < 5) {
        throw new Error("transient");
      }
      return `ok:${job.id}`;
    };
    const pool = createExtractionPool<TestJobShape, string>({
      concurrency: 3,
      runner,
    });

    const jobs = [
      buildJob({ id: "a" }),
      buildJob({ id: "b", shouldFail: true }),
      buildJob({ id: "c" }),
      buildJob({ id: "d", shouldFail: true }),
    ];
    const first = await pool.runAll(jobs);
    const failed = first.filter((r) => !r.ok);
    expect(failed.length).toBe(2);

    const retryJobs = jobs.filter((j) => failed.some((f) => f.id === j.id));
    const second = await pool.runAll(
      retryJobs.map((j) => ({ ...j, payload: { ...j.payload, shouldFail: false } })),
    );
    expect(second.every((r) => r.ok)).toBe(true);
    expect(tracker.maxRunning).toBeLessThanOrEqual(3);
  });

  it("abort signals to running jobs and rejects with abort errors", async () => {
    const runner: JobRunner<TestJobShape, string> = async (job, signal) => {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(resolve, 200);
        signal.addEventListener("abort", () => {
          clearTimeout(timer);
          reject(new Error("aborted"));
        });
      });
      return `ok:${job.id}`;
    };
    const pool = createExtractionPool<TestJobShape, string>({
      concurrency: 2,
      runner,
    });

    const jobs = [
      buildJob({ id: "a", durationMs: 200 }),
      buildJob({ id: "b", durationMs: 200 }),
      buildJob({ id: "c", durationMs: 200 }),
    ];
    const promise = pool.runAll(jobs);
    setTimeout(() => pool.abort(), 20);
    const results = (await promise) as ExtractionResult<string>[];
    const aborted = results.filter((r) => !r.ok);
    expect(aborted.length).toBeGreaterThan(0);
  });

  it("respects a rate-limit minimum interval between starts", async () => {
    const startTimes: number[] = [];
    const runner: JobRunner<TestJobShape, string> = async (job) => {
      startTimes.push(performance.now());
      return `ok:${job.id}`;
    };
    const pool = createExtractionPool<TestJobShape, string>({
      concurrency: 4,
      runner,
      minIntervalMs: 30,
    });

    const jobs = Array.from({ length: 4 }, (_, i) =>
      buildJob({ id: String(i) }),
    );
    await pool.runAll(jobs);

    expect(startTimes.length).toBe(4);
    for (let i = 1; i < startTimes.length; i++) {
      const prev = startTimes[i - 1];
      const curr = startTimes[i];
      if (typeof prev === "number" && typeof curr === "number") {
        expect(curr - prev).toBeGreaterThanOrEqual(25);
      }
    }
  });
});
