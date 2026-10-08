import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { certifyLive, allowedOrigins, renderReport } from '../scripts/certify-live-readiness.mjs';

function fakeProduction({ kv = 'ready' } = {}) {
  const calls = [];
  const fetcher = async (url, init = {}) => {
    calls.push({ url, method: init.method || 'GET', origin: init.headers?.origin });
    if (url.endsWith('/health')) {
      return Response.json({
        ok: true, service: 'nestai', state: 'operational', billingMode: 'FREE_ONLY', appCheck: 'required',
        layers: Object.fromEntries(['edge','auth','config','d1','kv','queue','vectorize','r2'].map(x => [x, x === 'kv' ? kv : 'ready'])),
      });
    }
    if (url.endsWith('/v1/health/providers')) return Response.json({
      ok: true, billingMode: 'FREE_ONLY',
      probes: { groq: { state: 'ready' }, gemini: { state: 'restricted' }, mistral: { state: 'blocked' } },
    });
    if (url.endsWith('/api/v1/ai/jwks')) return Response.json({
      keys: [{ kty:'EC', crv:'P-256', alg:'ES256', kid:'test-key', x:'public-x', y:'public-y' }],
    });
    if (init.method === 'OPTIONS') {
      if (!allowedOrigins.includes(init.headers?.origin)) return new Response(null, { status: 403 });
      return new Response(null, { status: 204, headers: {
        'access-control-allow-origin': init.headers.origin, 'vary': 'Origin',
      } });
    }
    if (url.endsWith('/v1/run')) return Response.json({ error: 'AUTH_MISSING_BEARER' }, { status: 401 });
    if (url.endsWith('/v1/admin/overview')) return Response.json({ error: 'AUTH_MISSING_BEARER' }, { status: 401 });
    if (url.endsWith('/') || url.endsWith('/providers')) return new Response('<title>NestAI — MillionsNest Intelligence Platform</title>', { status: 200 });
    return Response.json({ error: 'unexpected' }, { status: 404 });
  };
  return { fetcher, calls };
}

test('live probe verifies all public invariants without running paid AI', async () => {
  const fake = fakeProduction();
  const report = await certifyLive({ fetcher: fake.fetcher, now: new Date('2026-10-07T20:00:00Z') });
  assert.equal(report.passed, true, JSON.stringify(report.checks));
  assert.equal(report.checks.length, 8);
  assert.equal(report.liveAuthenticatedEndToEndCertified, false);
  assert.equal(report.paidInferenceCalls, 0);
  assert.equal(report.customerDataWrites, 0);
  assert.equal(fake.calls.filter(call => call.method === 'POST').length, 1);
  assert.ok(renderReport(report).includes('Result: PASS'));
});

test('missing KV infrastructure causes an explicit gate failure', async () => {
  const report = await certifyLive({ fetcher: fakeProduction({ kv: 'unconfigured' }).fetcher });
  assert.equal(report.passed, false);
  const failure = report.checks.find(check => check.id === 'nestai.official-health');
  assert.equal(failure?.status, 'FAIL');
  assert.equal(failure?.reason, 'HEALTH_LAYER_KV_NOT_READY');
});


test('public certification is scheduled after a successful production deploy', () => {
  const yaml = readFileSync('.github/workflows/certify-live-readiness.yml', 'utf8');
  assert.match(yaml, /workflow_run:/);
  assert.match(yaml, /workflows: \['Deploy production'\]/);
  assert.match(yaml, /branches: \[production\]/);
  assert.match(yaml, /workflow_run.conclusion == 'success'/);
  assert.match(yaml, /node scripts\/certify-live-readiness\.mjs/);
  assert.match(yaml, /actions\/upload-artifact@v4/);
});
