import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.JWT_SECRET = 'test_jwt_secret_that_is_definitely_longer_than_32_chars';
const { runtimeMetrics, percentile } = await import('../src/services/observability/RuntimeMetrics.js');
const { GrafanaObservabilityService } = await import('../src/services/observability/GrafanaObservabilityService.js');

test('no traffic → null metrics, not sample values', () => {
  const s = runtimeMetrics.snapshot();
  assert.equal(s.http_request_duration_p99_ms, null);
  assert.equal(s.api_error_rate_percentage, null);
  assert.equal(s.ai_inference_latency_seconds, null);
  assert.equal(s.websocket_connected_clients, null);
});

test('measured traffic → p99, 5xx rate, AI latency, websocket count', () => {
  for (let i = 1; i <= 100; i++) runtimeMetrics.recordHttp(i, i <= 2 ? 500 : 200); // 1..100 ms, two 5xx
  runtimeMetrics.recordAiCall(1200);
  runtimeMetrics.recordAiCall(1800);
  runtimeMetrics.recordAiCall(2400);
  runtimeMetrics.setWebsocketCounter(() => 7);
  const s = runtimeMetrics.snapshot();
  assert.equal(s.http_requests, 100);
  assert.equal(s.http_request_duration_p99_ms, 99);
  assert.equal(s.api_error_rate_percentage, 2);
  assert.equal(s.ai_inference_latency_seconds, 1.8);
  assert.equal(s.websocket_connected_clients, 7);
  // Samples older than the 15-minute window are dropped
  const later = runtimeMetrics.snapshot(Date.now() + 16 * 60 * 1000);
  assert.equal(later.http_requests, 0);
  assert.equal(later.http_request_duration_p99_ms, null);
});

test('percentile helper and empty metric history', () => {
  assert.equal(percentile([], 99), null);
  assert.equal(percentile([5, 1, 3], 50), 3);
  assert.deepEqual(GrafanaObservabilityService.getInstance().queryMetricsHistory(), [], 'no seeded random history');
});
