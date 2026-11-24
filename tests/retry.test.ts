import { describe, expect, it } from "vitest";
import { withRetry } from "@/lib/agent/retry";

describe("withRetry", () => {
  it("retries overload errors, then succeeds", async () => {
    let n = 0;
    const r = await withRetry(async () => {
      if (++n < 3) throw new Error('{"error":{"code":503,"status":"UNAVAILABLE"}}');
      return "ok";
    }, { baseMs: 1 });
    expect(r).toBe("ok");
    expect(n).toBe(3);
  });

  it("gives up after the last attempt", async () => {
    let n = 0;
    await expect(withRetry(async () => { n++; throw new Error("429 RESOURCE_EXHAUSTED"); }, { attempts: 3, baseMs: 1 })).rejects.toThrow(/429/);
    expect(n).toBe(3);
  });

  it("does not retry other errors", async () => {
    let n = 0;
    await expect(withRetry(async () => { n++; throw new Error("400 INVALID_ARGUMENT"); }, { baseMs: 1 })).rejects.toThrow(/400/);
    expect(n).toBe(1);
  });
});
