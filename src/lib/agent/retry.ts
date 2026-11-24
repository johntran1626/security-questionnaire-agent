// Retry transient provider errors (overloaded, rate limited) with exponential backoff and jitter.
// Anything else (bad request, auth) fails at once, since retrying can't fix it.

const TRANSIENT = /\b(429|500|502|503|504)\b|UNAVAILABLE|RESOURCE_EXHAUSTED|overloaded|ECONNRESET|ETIMEDOUT|fetch failed/i;

export async function withRetry<T>(fn: () => Promise<T>, { attempts = 4, baseMs = 1000 } = {}): Promise<T> {
  for (let i = 1; ; i++) {
    try {
      return await fn();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (i >= attempts || !TRANSIENT.test(msg)) throw err;
      await new Promise((r) => setTimeout(r, baseMs * 2 ** (i - 1) * (1 + Math.random() * 0.5)));
    }
  }
}
