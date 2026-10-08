#!/usr/bin/env node
// Synthetic, explicitly authenticated single-app canary. No customer content,
// billing configuration or key material is ever logged or written to disk.
import { pathToFileURL } from 'node:url';

export const CANARY_TASKS = Object.freeze({
  millionsnest: 'hub.operational.summary',
  connect: 'connect.message.classify',
  nestlocal: 'nestlocal.request.extract',
  nestjourney: 'journey.followup.summarize',
  nestfinance: 'finance.report.explain',
  musicscale: 'musicscale.song.structure',
  nestaffiliate: 'affiliate.pin.copy',
  nestlume: 'nestlume.study.answer',
});

const BASE = 'https://ai.millionsnest.com/v1/run';
const PUBLIC_FIXTURE = 'Teste sintético de funcionamento. Este texto é inventado e não contém dados pessoais, financeiros ou de clientes.';

export async function certifyAuthenticatedApp({
  appId, organizationId, accessToken, appCheckToken, fetcher = fetch,
} = {}) {
  if (!Object.hasOwn(CANARY_TASKS, appId ?? '')) throw new Error('CANARY_APP_NOT_REGISTERED');
  if (!organizationId || organizationId.length > 160 || organizationId.includes('/')) throw new Error('CANARY_TENANT_REQUIRED');
  if (!accessToken || !appCheckToken) throw new Error('CANARY_EPHEMERAL_CREDENTIALS_REQUIRED');
  const task = CANARY_TASKS[appId];
  const headers = {
    authorization: 'Bearer ' + accessToken,
    'x-firebase-appcheck': appCheckToken,
    'x-millionsnest-app': appId,
    'content-type': 'application/json',
    'cache-control': 'no-store',
  };
  const makeRequest = async ({ tenant = organizationId, headerApp = appId, authenticated = true } = {}) => {
    const reqHeaders = { ...headers, 'x-millionsnest-app': headerApp };
    if (!authenticated) delete reqHeaders.authorization;
    const response = await fetcher(BASE, {
      method: 'POST', headers: reqHeaders, redirect: 'error',
      signal: globalThis.AbortSignal.timeout(20_000),
      body: JSON.stringify({
        task, input: PUBLIC_FIXTURE,
        context: { organizationId: tenant, locale: 'pt-BR' },
      }),
    });
    // Deliberately never return/log provider output or tokens.
    const payload = await response.json().catch(() => null);
    return { status: response.status, error: typeof payload?.error === 'string' ? payload.error : null,
      task: typeof payload?.task === 'string' ? payload.task : null,
      providerClass: payload?.meta?.providerClass,
      cached: payload?.meta?.cached,
      hasResult: payload !== null && Object.hasOwn(payload, 'result'),
    };
  };
  const checks = [];
  const test = async (id, req, passed) => {
    try {
      const result = await makeRequest(req);
      checks.push({ id, passed: passed(result), status: result.status,
        ...(result.error ? { error: result.error.slice(0, 64) } : {}) });
    } catch {
      checks.push({ id, passed: false, status: 0, error: 'CANARY_NETWORK_OR_RESPONSE_ERROR' });
    }
  };
  await test('missing-token-rejected', { authenticated: false },
    r => r.status === 401 && r.error === 'AUTH_MISSING_BEARER');
  await test('wrong-application-rejected', { headerApp: 'not-' + appId },
    r => r.status === 401 && r.error === 'AUTH_APP_HEADER_MISMATCH');
  await test('cross-tenant-rejected', { tenant: 'canary-wrong-org-' + crypto.randomUUID().slice(0, 8) },
    r => r.status === 401 && r.error === 'AUTH_TENANT_MISMATCH');
  // One and only one genuine free-tier inference call.
  await test('free-provider-positive-canary', {},
    r => r.status === 200 && r.task === task && r.hasResult &&
      r.providerClass === 'free' && r.cached === false);
  return {
    appId, task, stage: 'authenticated-backend-boundary-only',
    customerDataWrites: 0, paidModelCalls: 0, maxFreeModelCalls: 1,
    fullAppUiCertified: false,
    checks, passed: checks.length === 4 && checks.every(x => x.passed),
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { NESTAI_CANARY_APP_ID: appId, NESTAI_CANARY_ORG_ID: organizationId,
    NESTAI_CANARY_ACCESS_TOKEN: accessToken,
    NESTAI_CANARY_APP_CHECK_TOKEN: appCheckToken } = process.env;
  try {
    const report = await certifyAuthenticatedApp({ appId, organizationId, accessToken, appCheckToken });
    console.log(JSON.stringify(report));
    if (!report.passed) process.exitCode = 1;
  } catch (error) {
    console.error('CANARY_CONFIGURATION_ERROR: ' + (error instanceof Error ? error.message : 'unknown'));
    process.exitCode = 1;
  }
}
