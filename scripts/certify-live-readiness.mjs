#!/usr/bin/env node
// Read-only production infrastructure probe. Never transmits a valid user token,
// calls an LLM, updates customer data, or treats infrastructure health as app E2E proof.
import { writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export const allowedOrigins = Object.freeze([
  'https://ai.millionsnest.com',
  'https://millionsnest.com',
  'https://www.millionsnest.com',
  'https://musicscale.millionsnest.com',
  'https://nestfinance.millionsnest.com',
  'https://connect.millionsnest.com',
  'https://nestlocal.millionsnest.com',
  'https://nestjourney.millionsnest.com',
  'https://nestlume.millionsnest.com',
  'https://nestaffiliate.millionsnest.com',
]);

const NESTAI = 'https://ai.millionsnest.com';
const HUB_JWKS = 'https://www.millionsnest.com/api/v1/ai/jwks';

export async function certifyLive({ fetcher = globalThis.fetch, now = new Date() } = {}) {
  const checks = [];
  async function request(url, init) {
    return fetcher(url, {
      ...init,
      signal: globalThis.AbortSignal.timeout(15000),
      redirect: 'error',
      cache: 'no-store',
    });
  }
  async function check(id, action) {
    try {
      const details = await action();
      checks.push({ id, status: 'PASS', details: details ?? '' });
    } catch (error) {
      checks.push({ id, status: 'FAIL', reason: error instanceof Error ? error.message.slice(0, 180) : 'unknown error' });
    }
  }
  function ensure(value, code) {
    if (!value) throw new Error(code);
  }
  await check('nestai.official-health', async () => {
    const response = await request(NESTAI + '/health');
    ensure(response.status === 200, 'HEALTH_HTTP_' + response.status);
    const body = await response.json();
    ensure(body?.ok === true && body?.service === 'nestai' && body?.state === 'operational', 'HEALTH_NOT_OPERATIONAL');
    ensure(body.billingMode === 'FREE_ONLY', 'FREE_ONLY_NOT_CONFIRMED');
    ensure(body.appCheck === 'required', 'APP_CHECK_NOT_REQUIRED');
    for (const layer of ['edge', 'auth', 'config', 'd1', 'kv', 'queue', 'vectorize', 'r2']) {
      ensure(body.layers?.[layer] === 'ready', 'HEALTH_LAYER_' + layer.toUpperCase() + '_NOT_READY');
    }
    return 'operational; FREE_ONLY; App Check required; eight infrastructure layers ready';
  });
  await check('nestai.providers-metadata', async () => {
    const response = await request(NESTAI + '/v1/health/providers');
    ensure(response.status === 200, 'PROVIDER_HTTP_' + response.status);
    const body = await response.json();
    ensure(body?.ok === true && body?.billingMode === 'FREE_ONLY', 'PROVIDER_HEALTH_INVALID');
    for (const provider of ['groq', 'gemini', 'mistral']) {
      ensure(typeof body.probes?.[provider]?.state === 'string', 'PROVIDER_PROBE_' + provider.toUpperCase() + '_MISSING');
    }
    return 'readiness metadata available (does not certify actual model inference)';
  });
  await check('hub.public-jwks', async () => {
    const response = await request(HUB_JWKS);
    ensure(response.status === 200, 'HUB_JWKS_HTTP_' + response.status);
    const body = await response.json();
    ensure(Array.isArray(body?.keys) && body.keys.length > 0, 'HUB_JWKS_KEYS_MISSING');
    for (const key of body.keys) {
      ensure(key.kty === 'EC' && key.crv === 'P-256' && key.alg === 'ES256', 'HUB_JWKS_KEY_TYPE');
      ensure(typeof key.kid === 'string' && typeof key.x === 'string' && typeof key.y === 'string', 'HUB_JWKS_PUBLIC_FIELDS');
      ensure(!('d' in key) && !('p' in key) && !('q' in key), 'HUB_JWKS_PRIVATE_KEY_LEAK');
    }
    return 'public ES256 JWKS ready; no private key material';
  });
  await check('nestai.unauthed-run-rejected', async () => {
    const response = await request(NESTAI + '/v1/run', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-millionsnest-app': 'nestlume' },
      body: JSON.stringify({ task: 'nestlume.study.answer', input: 'synthetic readiness check', context: { organizationId: 'public:nestlume', locale: 'pt-BR' } }),
    });
    ensure(response.status === 401, 'UNAUTH_HTTP_' + response.status);
    const body = await response.json();
    ensure(body?.error === 'AUTH_MISSING_BEARER', 'UNAUTH_INCORRECT_GATE');
    return 'request rejected before AI provider execution';
  });
  await check('nestai.unauthorized-admin-rejected', async () => {
    const response = await request(NESTAI + '/v1/admin/overview');
    ensure(response.status === 401, 'ADMIN_HTTP_' + response.status);
    return 'administrative endpoint rejects missing authentication';
  });
  await check('nestai.allowed-browser-origins', async () => {
    for (const origin of allowedOrigins) {
      const response = await request(NESTAI + '/v1/run', {
        method: 'OPTIONS',
        headers: { origin, 'access-control-request-method': 'POST', 'access-control-request-headers': 'authorization,content-type,x-firebase-appcheck,x-millionsnest-app' },
      });
      ensure(response.status === 204, 'CORS_PREFLIGHT_DENIED_' + origin);
      ensure(response.headers.get('access-control-allow-origin') === origin, 'CORS_ORIGIN_MISMATCH_' + origin);
      ensure(response.headers.get('vary')?.includes('Origin'), 'CORS_VARY_MISSING_' + origin);
    }
    return allowedOrigins.length + ' allowed origins verified';
  });
  await check('nestai.disallowed-browser-origin', async () => {
    const response = await request(NESTAI + '/v1/run', {
      method: 'OPTIONS',
      headers: { origin: 'https://unauthorized.example.invalid', 'access-control-request-method': 'POST' },
    });
    ensure(response.status === 403 && !response.headers.get('access-control-allow-origin'), 'CORS_UNTRUSTED_ORIGIN_ALLOWED');
    return 'untrusted browser origin blocked';
  });
  await check('nestai.mission-control-shell', async () => {
    for (const path of ['/', '/providers']) {
      const response = await request(NESTAI + path);
      ensure(response.status === 200, 'CONSOLE_HTTP_' + response.status + '_' + path);
      const html = await response.text();
      ensure(html.includes('NestAI') && html.includes('MillionsNest Intelligence Platform'), 'CONSOLE_SHELL_MISSING_' + path);
    }
    return 'console routes respond with the NestAI shell (not an authenticated UI E2E test)';
  });
  return {
    generatedAt: now.toISOString(),
    source: 'real public production endpoints',
    phase: 'infrastructure-and-unauthenticated-security',
    paidInferenceCalls: 0,
    customerDataWrites: 0,
    liveAuthenticatedEndToEndCertified: false,
    checks,
    passed: checks.every(x => x.status === 'PASS'),
  };
}

export function renderReport(report) {
  const lines = [
    '# NestAI live production readiness — non-invasive',
    '',
    'Generated: ' + report.generatedAt,
    '',
    'This verifies public infrastructure and negative authentication/CORS only. It does NOT prove authenticated inference or complete app E2E.',
    '',
    '| Probe | Outcome | Details |',
    '| --- | --- | --- |',
    ...report.checks.map(c => '| ' + c.id + ' | ' + c.status + ' | ' + (c.details ?? c.reason ?? '').replaceAll('|', '/') + ' |'),
    '',
    'Result: ' + (report.passed ? 'PASS' : 'FAIL'),
    'Customer data writes: 0; paid AI requests: 0.',
  ];
  return lines.join('\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const report = await certifyLive();
  await writeFile('nestai-live-readiness.json', JSON.stringify(report, null, 2) + '\n');
  console.log(renderReport(report));
  if (!report.passed) process.exitCode = 1;
}
