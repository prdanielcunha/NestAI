import test from 'node:test';
import assert from 'node:assert/strict';
import { CANARY_TASKS, certifyAuthenticatedApp } from '../scripts/certify-authenticated-app.mjs';

function fakeApi({ failPositive = false } = {}) {
  const requests = [];
  const fetcher = async (_url, init) => {
    const body = JSON.parse(init.body);
    requests.push({ headers: init.headers, body });
    if (!init.headers.authorization) return Response.json({ error: 'AUTH_MISSING_BEARER' }, { status: 401 });
    if (init.headers['x-millionsnest-app'] !== 'connect') return Response.json({ error: 'AUTH_APP_HEADER_MISMATCH' }, { status: 401 });
    if (body.context.organizationId !== 'safe-tenant') return Response.json({ error: 'AUTH_TENANT_MISMATCH' }, { status: 401 });
    if (failPositive) return Response.json({ error: 'ROUTER_NO_ELIGIBLE_MODEL' }, { status: 422 });
    return Response.json({
      task: CANARY_TASKS.connect,
      result: { value: 'synthetic result' },
      meta: { providerClass: 'free', cached: false },
    });
  };
  return { fetcher, requests };
}

test('all canonical applications have one safe canary task', () => {
  assert.equal(Object.keys(CANARY_TASKS).length, 8);
  assert.equal(CANARY_TASKS.nestaffiliate, 'affiliate.pin.copy');
  assert.equal(CANARY_TASKS.nestlume, 'nestlume.study.answer');
});

test('valid canary executes exactly one provider call after three security negatives', async () => {
  const mock = fakeApi();
  const report = await certifyAuthenticatedApp({
    appId: 'connect', organizationId: 'safe-tenant',
    accessToken: 'example-synthetic-token', appCheckToken: 'example-synthetic-appcheck',
    fetcher: mock.fetcher,
  });
  assert.equal(report.passed, true, JSON.stringify(report));
  assert.equal(report.maxFreeModelCalls, 1);
  assert.equal(report.customerDataWrites, 0);
  assert.equal(report.fullAppUiCertified, false);
  assert.equal(mock.requests.length, 4);
  const providerCalls = mock.requests.filter(x => x.headers.authorization &&
    x.headers['x-millionsnest-app'] === 'connect' && x.body.context.organizationId === 'safe-tenant');
  assert.equal(providerCalls.length, 1);
  for (const req of mock.requests) {
    assert.equal(req.body.task, 'connect.message.classify');
    assert.equal(req.body.input.includes('inventado'), true);
    assert.equal(req.headers['x-firebase-appcheck'], 'example-synthetic-appcheck');
  }
  assert.equal(JSON.stringify(report).includes('example-synthetic-token'), false);
  assert.equal(JSON.stringify(report).includes('example-synthetic-appcheck'), false);
  assert.equal(JSON.stringify(report).includes('safe-tenant'), false);
});

test('failed model response cannot become a false-success certification', async () => {
  const report = await certifyAuthenticatedApp({
    appId: 'connect', organizationId: 'safe-tenant',
    accessToken: 'synthetic', appCheckToken: 'synthetic', fetcher: fakeApi({ failPositive: true }).fetcher,
  });
  assert.equal(report.passed, false);
  assert.equal(report.checks.at(-1).status, 422);
  assert.equal(report.checks.at(-1).passed, false);
});

test('canary refuses missing app, tenant and ephemeral credentials before any requests', async () => {
  for (const options of [
    { appId: 'invalid', organizationId: 'safe-tenant', accessToken: 'a', appCheckToken: 'a' },
    { appId: 'connect', organizationId: '', accessToken: 'a', appCheckToken: 'a' },
    { appId: 'connect', organizationId: 'safe-tenant', accessToken: '', appCheckToken: 'a' },
    { appId: 'connect', organizationId: 'safe-tenant', accessToken: 'a', appCheckToken: '' },
  ]) {
    await assert.rejects(() => certifyAuthenticatedApp({ ...options, fetcher: () => { throw Error('must not call'); } }));
  }
});
