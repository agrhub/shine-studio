/**
 * In-process runtime metrics measured from real traffic (no sampled or
 * synthetic values). Kept in small rolling windows so they stay cheap:
 * - HTTP request latency + 5xx rate (last 15 minutes, up to 5,000 requests)
 * - AI provider call latency (last 15 minutes, up to 1,000 calls)
 * Values are null when there is no data yet, so the UI can show "no data".
 */
const WINDOW_MS = 15 * 60 * 1000;

interface Sample {
  at: number;
  ms: number;
  status?: number;
}

class RollingWindow {
  private samples: Sample[] = [];
  constructor(private readonly max: number) {}

  push(sample: Sample) {
    this.samples.push(sample);
    if (this.samples.length > this.max) this.samples.splice(0, this.samples.length - this.max);
  }

  recent(now = Date.now()): Sample[] {
    const cutoff = now - WINDOW_MS;
    const firstFresh = this.samples.findIndex((s) => s.at >= cutoff);
    if (firstFresh === -1) this.samples = [];
    else if (firstFresh > 0) this.samples.splice(0, firstFresh);
    return this.samples;
  }
}

export function percentile(values: number[], p: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

const http = new RollingWindow(5000);
const ai = new RollingWindow(1000);
let websocketCounter: (() => number) | null = null;

export const runtimeMetrics = {
  recordHttp(ms: number, status: number) {
    http.push({ at: Date.now(), ms, status });
  },
  recordAiCall(ms: number) {
    ai.push({ at: Date.now(), ms });
  },
  setWebsocketCounter(fn: () => number) {
    websocketCounter = fn;
  },

  snapshot(now = Date.now()) {
    const reqs = http.recent(now);
    const calls = ai.recent(now);
    const p99 = percentile(reqs.map((r) => r.ms), 99);
    const aiP50 = percentile(calls.map((c) => c.ms), 50);
    return {
      window_minutes: WINDOW_MS / 60000,
      http_requests: reqs.length,
      http_request_duration_p99_ms: p99 === null ? null : Math.round(p99),
      api_error_rate_percentage: reqs.length ? Number(((reqs.filter((r) => (r.status || 0) >= 500).length / reqs.length) * 100).toFixed(2)) : null,
      ai_calls: calls.length,
      ai_inference_latency_seconds: aiP50 === null ? null : Number((aiP50 / 1000).toFixed(2)),
      websocket_connected_clients: websocketCounter ? websocketCounter() : null,
    };
  },
};
