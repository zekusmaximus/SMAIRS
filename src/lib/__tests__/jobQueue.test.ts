import { describe, it, expect, vi, beforeEach, Mock } from "vitest";
import { enqueue, setMaxConcurrent } from "@/lib/jobQueue";
import * as events from "@/lib/events";

describe("jobQueue", () => {
  beforeEach(() => {
    setMaxConcurrent(2);
    vi.useFakeTimers();
    vi.spyOn(events, "emitJobEvent").mockResolvedValue();
  });

  it("enqueues and emits done", async () => {
    const run = vi.fn().mockResolvedValueOnce("ok");
    const id = enqueue(run, { id: "j1", hash: "h1" });
    expect(id).toBe("j1");
    // Let microtasks flush
  // allow promise chain flush
  await Promise.resolve();
    // Progress/done events eventually fire via async; fast-forward timers for safety
    await vi.runAllTimersAsync();
    expect(run).toHaveBeenCalled();
  const calls = (events.emitJobEvent as unknown as Mock).mock.calls as unknown[];
  expect((calls as unknown[][]).some((args: unknown[]) => args[1] === "done")).toBe(true);
  });

  it("deduplicates by hash", async () => {
    const run = vi.fn().mockResolvedValue("ok");
  const id1 = enqueue(run, { hash: "same" });
    const id2 = enqueue(run, { hash: "same" });
  expect(id2).toBeDefined();
  // Current behavior: duplicate returns the hash string
  expect(id2).toBe("same");
  // Process the single job
  await Promise.resolve();
  await vi.runAllTimersAsync();
  expect(run).toHaveBeenCalledTimes(1);
  expect(typeof id1).toBe("string");
  });

  it("retries on failure with backoff", async () => {
    const run = vi.fn()
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce("ok");
    enqueue(run, { id: "r1", hash: "hr1", retries: 1, backoffMs: 500 });
    // First attempt
  await Promise.resolve();
    // Backoff then retry
    await vi.advanceTimersByTimeAsync(500);
    // Flush any queued
    await vi.runAllTimersAsync();
    expect(run).toHaveBeenCalledTimes(2);
  const calls2 = (events.emitJobEvent as unknown as Mock).mock.calls as unknown[];
  expect((calls2 as unknown[][]).some((args: unknown[]) => args[1] === "done")).toBe(true);
  });
});
