import test from 'node:test';
import assert from 'node:assert/strict';
import { appTasks, taskOwners, checkConsumer, toMarkdown } from '../scripts/audit-ecosystem-cutover.mjs';

const consumer = { repo: 'nestlocal', appId: 'nestlocal' };
const manifest = { appId: 'nestlocal', owner: { repository: 'prdanielcunha/nestlocal' }, ai: { enabled: true, tasks: ['nestlocal.quote.compose'] }, locales: ['pt-BR', 'en', 'es'] };
const packageJson = { dependencies: { '@millionsnest/ai': 'https://github.com/prdanielcunha/NestAI/releases/download/sdk-v0.2.0/millionsnest-ai-0.2.0.tgz' } };
const options = { consumer, manifest, packageJson, runtime: "import {createNestAiClient} from '@millionsnest/ai'", owners: new Map([['nestlocal.quote.compose', 'nestlocal']]), apps: new Map([['nestlocal', ['nestlocal.quote.compose']]]), mainSha: 'abc', productionSha: 'abc' };

test('parses canonical task and app registries', () => {
  assert.equal(taskOwners('{ id: "nestlocal.quote.compose", version: 1, app: "nestlocal", modality: "text" }').get('nestlocal.quote.compose'), 'nestlocal');
  assert.deepEqual(appTasks('{ appId: "nestlocal", displayName: "Local", allowedTasks: ["nestlocal.quote.compose"], defaultLocale: "pt-BR" }').get('nestlocal'), ['nestlocal.quote.compose']);
});

test('passes source proof without implying live E2E', () => {
  const row = checkConsumer(options);
  assert.equal(row.sourceLevel, 'PASS');
  assert.equal(row.liveE2E, 'NOT_CERTIFIED_BY_THIS_AUDIT');
  assert.equal(row.sdkVersion, '0.2.0');
});

test('fails missing SDK or wrong-owner task', () => {
  const row = checkConsumer({ ...options, packageJson: { dependencies: {} }, owners: new Map([['nestlocal.quote.compose', 'other']]) });
  assert.equal(row.sourceLevel, 'FAIL');
  assert.ok(row.errors.some(err => err.includes('wrong-owner')));
  assert.ok(row.errors.some(err => err.includes('SDK')));
});

test('branch divergence is reported but cannot silently trigger promotion', () => {
  const row = checkConsumer({ ...options, mainSha: 'new', productionSha: 'old' });
  assert.equal(row.sourceLevel, 'PASS');
  assert.equal(row.warnings.length, 1);
  const summary = toMarkdown({ generatedAt: '2026-10-07', apps: [row] });
  assert.match(summary, /main = production/);
  assert.match(summary, /NO/);
  assert.match(summary, /do not force branch synchronization/);
});
