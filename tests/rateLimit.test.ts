import { describe, expect, it } from "vitest";
import { createMemoryLimiter, hashIp, limitsFromEnv } from "@/lib/rateLimit";

describe("memory rate limiter", () => {
  it("allows up to the per-IP limit, then blocks with a retry time", async () => {
    const rl = createMemoryLimiter({ perHour: 2, perDay: 100 });
    expect((await rl.check("1.1.1.1")).ok).toBe(true);
    expect((await rl.check("1.1.1.1")).ok).toBe(true);
    const third = await rl.check("1.1.1.1");
    expect(third).toMatchObject({ ok: false, scope: "ip" });
    if (!third.ok) expect(third.retryAfterSec).toBeGreaterThan(0);
  });

  it("tracks IPs separately", async () => {
    const rl = createMemoryLimiter({ perHour: 1, perDay: 100 });
    expect((await rl.check("1.1.1.1")).ok).toBe(true);
    expect((await rl.check("2.2.2.2")).ok).toBe(true);
    expect((await rl.check("1.1.1.1")).ok).toBe(false);
  });

  it("enforces the global daily cap across all IPs", async () => {
    const rl = createMemoryLimiter({ perHour: 100, perDay: 2 });
    await rl.check("1.1.1.1");
    await rl.check("2.2.2.2");
    expect(await rl.check("3.3.3.3")).toMatchObject({ ok: false, scope: "global" });
  });
});

describe("question-weighted limits", () => {
  it("counts questions, not requests, against the per-IP limit", async () => {
    const rl = createMemoryLimiter({ perHour: 10, perDay: 100 });
    expect((await rl.check("1.1.1.1", 6)).ok).toBe(true);
    expect((await rl.check("1.1.1.1", 5)).ok).toBe(false); // 6 + 5 > 10
    expect((await rl.check("1.1.1.1", 4)).ok).toBe(true); // 6 + 4 = 10
  });

  it("does not charge a blocked request", async () => {
    const rl = createMemoryLimiter({ perHour: 10, perDay: 100 });
    await rl.check("1.1.1.1", 8);
    await rl.check("1.1.1.1", 50);
    expect((await rl.check("1.1.1.1", 2)).ok).toBe(true);
  });

  it("does not charge the IP when the global cap blocks the request", async () => {
    const rl = createMemoryLimiter({ perHour: 10, perDay: 5 });
    await rl.check("2.2.2.2", 5);
    expect(await rl.check("1.1.1.1", 3)).toMatchObject({ ok: false, scope: "global" });
  });

  it("reads question limits from the environment", () => {
    process.env.QUESTIONS_PER_HOUR_PER_IP = "40";
    process.env.DAILY_QUESTION_CAP = "400";
    expect(limitsFromEnv()).toEqual({ perHour: 40, perDay: 400 });
    delete process.env.QUESTIONS_PER_HOUR_PER_IP;
    delete process.env.DAILY_QUESTION_CAP;
    expect(limitsFromEnv()).toEqual({ perHour: 100, perDay: 1000 });
  });
});

describe("hashIp", () => {
  it("does not keep the raw IP and is stable", () => {
    expect(hashIp("1.2.3.4")).not.toContain("1.2.3.4");
    expect(hashIp("1.2.3.4")).toBe(hashIp("1.2.3.4"));
    expect(hashIp("1.2.3.4")).not.toBe(hashIp("1.2.3.5"));
  });
});
