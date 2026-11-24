import { createHash } from "node:crypto";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

// Two limits protect the paid model API on the public demo: questions per IP per hour, and questions per day across
// everyone. Limits count questions, not requests, because cost grows with questions: one 50-question run costs about
// as much as fifty 1-question runs. Serverless instances share no memory, so production uses Redis (Upstash).
// Locally, with no Redis configured, an in-memory limiter gives the same behaviour for one process. Only a salted
// hash of the IP is used as the key.

export type LimitResult = { ok: true } | { ok: false; scope: "ip" | "global"; retryAfterSec: number };

export interface RateLimiter {
  // cost = number of questions in the run. A blocked run is not charged.
  check(ip: string, cost?: number): Promise<LimitResult>;
}

export function hashIp(ip: string): string {
  const salt = process.env.RATE_LIMIT_SALT ?? "security-questionnaire-agent";
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex").slice(0, 32);
}

const HOUR = 3600_000;
const DAY = 24 * HOUR;

type Hit = { t: number; n: number };

export function createMemoryLimiter({ perHour, perDay }: { perHour: number; perDay: number }): RateLimiter {
  const hits = new Map<string, Hit[]>();
  const recentHits = (key: string, windowMs: number, now: number) => {
    const recent = (hits.get(key) ?? []).filter((h) => now - h.t < windowMs);
    hits.set(key, recent);
    return recent;
  };
  // Seconds until enough old hits expire to make room for `cost`; null when it fits now.
  const waitFor = (recent: Hit[], cost: number, limit: number, windowMs: number, now: number): number | null => {
    let used = recent.reduce((sum, h) => sum + h.n, 0);
    if (used + cost <= limit) return null;
    for (const h of recent) {
      used -= h.n;
      if (used + cost <= limit) return Math.max(1, Math.ceil((h.t + windowMs - now) / 1000));
    }
    return Math.ceil(windowMs / 1000);
  };
  return {
    async check(ip, cost = 1) {
      const now = Date.now();
      const ipKey = `ip:${hashIp(ip)}`;
      const ipHits = recentHits(ipKey, HOUR, now);
      const globalHits = recentHits("global", DAY, now);
      const ipWait = waitFor(ipHits, cost, perHour, HOUR, now);
      if (ipWait !== null) return { ok: false, scope: "ip", retryAfterSec: ipWait };
      const globalWait = waitFor(globalHits, cost, perDay, DAY, now);
      if (globalWait !== null) return { ok: false, scope: "global", retryAfterSec: globalWait };
      ipHits.push({ t: now, n: cost });
      globalHits.push({ t: now, n: cost });
      return { ok: true };
    },
  };
}

function createUpstashLimiter({ perHour, perDay }: { perHour: number; perDay: number }): RateLimiter {
  const redis = Redis.fromEnv();
  const perIp = new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(perHour, "1 h"), prefix: "sqa:ip" });
  const global = new Ratelimit({ redis, limiter: Ratelimit.fixedWindow(perDay, "1 d"), prefix: "sqa:global" });
  const wait = (reset: number) => Math.max(1, Math.ceil((reset - Date.now()) / 1000));
  return {
    async check(ip, cost = 1) {
      const id = hashIp(ip);
      // Read both budgets first so a run blocked by one limit is not charged to the other. Two concurrent runs can
      // both pass this read; the charge below is still atomic per limit, so at most one run's worth of overshoot.
      const [ipLeft, globalLeft] = await Promise.all([perIp.getRemaining(id), global.getRemaining("all")]);
      if (ipLeft.remaining < cost) return { ok: false, scope: "ip", retryAfterSec: wait(ipLeft.reset) };
      if (globalLeft.remaining < cost) return { ok: false, scope: "global", retryAfterSec: wait(globalLeft.reset) };
      const a = await perIp.limit(id, { rate: cost });
      if (!a.success) return { ok: false, scope: "ip", retryAfterSec: wait(a.reset) };
      const b = await global.limit("all", { rate: cost });
      if (!b.success) return { ok: false, scope: "global", retryAfterSec: wait(b.reset) };
      return { ok: true };
    },
  };
}

// Defaults: 100 questions per IP per hour (two full 50-question runs), 300 questions per day overall. At the demo
// model's measured ~$0.001 per question this bounds worst-case spend to about $0.30 a day.
export function limitsFromEnv() {
  return {
    perHour: Number(process.env.QUESTIONS_PER_HOUR_PER_IP) || 100,
    perDay: Number(process.env.DAILY_QUESTION_CAP) || 300,
  };
}

let limiter: RateLimiter | undefined;

export function getRateLimiter(): RateLimiter {
  if (!limiter) {
    const limits = limitsFromEnv();
    limiter = process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN ? createUpstashLimiter(limits) : createMemoryLimiter(limits);
  }
  return limiter;
}
