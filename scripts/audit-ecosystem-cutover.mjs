#!/usr/bin/env node
// Source-level certification only. Never labels production end-to-end calls as verified.
import { writeFile, appendFile } from 'node:fs/promises';
import { Buffer } from 'node:buffer';
import { pathToFileURL } from 'node:url';

export const consumers = Object.freeze([
  { repo: 'millionsnest', appId: 'millionsnest', packagePath: 'package.json', runtimePath: 'src/server/services/MusicScaleLiveAiGatewayService.ts' },
  { repo: 'millionsnest-connect', appId: 'connect', packagePath: 'package.json', runtimePath: 'src/core/client/connectNestAiClient.ts' },
  { repo: 'nestlocal', appId: 'nestlocal', packagePath: 'package.json', runtimePath: 'src/nestai.mjs' },
  { repo: 'musicscale', appId: 'musicscale', packagePath: 'package.json', runtimePath: 'services/server/nestAiProxy.ts' },
  { repo: 'nestfinance_millionsnest', appId: 'nestfinance', packagePath: 'package.json', runtimePath: 'server/vercel-handlers/finance/nestAiProxy.ts' },
  { repo: 'nestjourney', appId: 'nestjourney', packagePath: 'package.json', runtimePath: 'src/nestAi.ts' },
  { repo: 'NestAffiliate', appId: 'nestaffiliate', packagePath: 'apps/web/package.json', runtimePath: 'apps/web/src/services/nestAiClient.ts' },
  { repo: 'nestlume', appId: 'nestlume', packagePath: 'package.json', runtimePath: 'src/lib/nestai-client.ts' },
]);

export function taskOwners(source) {
  const tasks = new Map();
  const re = /\bid:\s*"([a-z][a-z0-9.-]+)"\s*,\s*version:\s*\d+\s*,\s*app:\s*"([a-z][a-z0-9-]+)"/g;
  for (const [, taskId, appId] of source.matchAll(re)) {
    if (tasks.has(taskId)) throw new Error('DUPLICATE_CANONICAL_TASK: ' + taskId);
    tasks.set(taskId, appId);
  }
  if (!tasks.size) throw new Error('CANONICAL_TASKS_NOT_FOUND');
  return tasks;
}

export function appTasks(source) {
  const map = new Map();
  const pattern = /\{\s*appId:\s*"([a-z][a-z0-9-]+)"\s*,[\s\S]*?allowedTasks:\s*\[([\s\S]*?)\]\s*,\s*defaultLocale:/g;
  for (const [, appId, segment] of source.matchAll(pattern)) {
    if (map.has(appId)) throw new Error('DUPLICATE_CANONICAL_APP: ' + appId);
    map.set(appId, [...segment.matchAll(/"([a-z][a-z0-9.-]+)"/g)].map(x => x[1]));
  }
  if (!map.size) throw new Error('CANONICAL_APPS_NOT_FOUND');
  return map;
}

export function checkConsumer({ consumer, manifest, packageJson, runtime, owners, apps, mainSha, productionSha }) {
  const errors = [];
  const warnings = [];
  if (manifest.appId !== consumer.appId || manifest.ai?.enabled !== true) errors.push('manifest appId/AI enabled mismatch');
  if (manifest.owner?.repository !== 'prdanielcunha/' + consumer.repo) errors.push('manifest repository mismatch');
  const tasks = manifest.ai?.tasks;
  if (!Array.isArray(tasks) || !tasks.length || tasks.some(t => typeof t !== 'string')) errors.push('manifest tasks invalid');
  else {
    if (new Set(tasks).size !== tasks.length) errors.push('duplicate manifest task');
    for (const task of tasks) if (owners.get(task) !== consumer.appId) errors.push('unknown/wrong-owner task: ' + task);
    const canonical = apps.get(consumer.appId);
    if (!canonical) errors.push('app absent from NestAI registry');
    else {
      const missing = canonical.filter(t => !tasks.includes(t));
      const extra = tasks.filter(t => !canonical.includes(t));
      if (missing.length) errors.push('missing app-registry tasks: ' + missing.join(', '));
      if (extra.length) errors.push('undeclared app-registry tasks: ' + extra.join(', '));
    }
  }
  const locales = manifest.locales;
  if (!Array.isArray(locales) || !['pt-BR', 'en', 'es'].every(l => locales.includes(l))) errors.push('locales do not cover PT/EN/ES');
  const sdk = packageJson.dependencies?.['@millionsnest/ai'];
  if (typeof sdk !== 'string' || !/\/releases\/download\/sdk-v\d+\.\d+\.\d+\//.test(sdk)) errors.push('missing immutable SDK release dependency');
  if (!runtime.includes('createNestAiClient') || !runtime.includes('@millionsnest/ai')) errors.push('runtime missing SDK client import');
  if (mainSha !== productionSha) warnings.push('main and production differ; do not fast-forward without QA');
  if (packageJson.dependencies?.['@google/genai'] || packageJson.dependencies?.['@google/generative-ai']) {
    warnings.push('Google AI dependency remains; review for direct provider calls (not proof of usage)');
  }
  return {
    repository: 'prdanielcunha/' + consumer.repo,
    appId: consumer.appId,
    mainSha,
    productionSha,
    manifestTasks: Array.isArray(tasks) ? tasks.length : 0,
    sdkVersion: typeof sdk === 'string' ? sdk.match(/sdk-v([\d.]+)/)?.[1] ?? 'unknown' : null,
    sourceLevel: errors.length ? 'FAIL' : 'PASS',
    liveE2E: 'NOT_CERTIFIED_BY_THIS_AUDIT',
    errors,
    warnings,
  };
}

async function requestGithub(route, token) {
  const response = await fetch('https://api.github.com' + route, {
    headers: {
      accept: 'application/vnd.github+json',
      'x-github-api-version': '2022-11-28',
      'user-agent': 'nestai-ecosystem-cutover-audit',
      ...(token ? { authorization: 'Bearer ' + token } : {}),
    },
    signal: globalThis.AbortSignal.timeout(12000),
  });
  if (!response.ok) throw new Error('GITHUB_HTTP_' + response.status + ' ' + route);
  return response.json();
}

async function readGithubFile(repo, path, ref, token) {
  const data = await requestGithub(`/repos/prdanielcunha/${encodeURIComponent(repo)}/contents/${path.split('/').map(encodeURIComponent).join('/')}?ref=${encodeURIComponent(ref)}`, token);
  if (data.encoding !== 'base64' || typeof data.content !== 'string') throw new Error('INVALID_GITHUB_FILE_RESPONSE: ' + repo + '/' + path);
  return Buffer.from(data.content.replace(/\s/g, ''), 'base64').toString('utf8');
}

async function readHead(repo, branch, token) {
  const data = await requestGithub(`/repos/prdanielcunha/${encodeURIComponent(repo)}/branches/${encodeURIComponent(branch)}`, token);
  return data.commit.sha;
}

export function toMarkdown(report) {
  const lines = [
    '# NestAI — ecosystem source cutover certification',
    '',
    `Generated: ${report.generatedAt}`,
    '',
    '**Scope:** GitHub source/manifests/SDK/task contracts and branch heads. This is NOT a live authenticated AI E2E certification.',
    '',
    '| App | Source | SDK | main = production | Tasks |',
    '| --- | --- | --- | --- | ---: |',
  ];
  for (const row of report.apps) {
    lines.push(`| ${row.appId} | ${row.sourceLevel} | ${row.sdkVersion ?? 'N/A'} | ${row.mainSha && row.productionSha && row.mainSha === row.productionSha ? 'yes' : 'NO'} | ${row.manifestTasks} |`);
  }
  lines.push('', '## Gaps and release gates', '');
  for (const row of report.apps) {
    if (row.errors.length || row.warnings.length) {
      lines.push(`- **${row.appId}:** ${[...row.errors, ...row.warnings].join('; ')}`);
    }
  }
  lines.push('', '- [ ] Confirm authenticated request/response and provider availability for EACH app in production.', '- [ ] Prove cross-tenant and denied-task rejection through real Hub tokens/App Check.', '- [ ] Confirm end-user E2E, privacy, quota exhaustion, billing FREE_ONLY and rollback.', '- [ ] Inventory and remove remaining direct provider calls/keys only after functional cutover.', '- [ ] Promote outstanding changes with QA; do not force branch synchronization.', '');
  return lines.join('\n');
}

export async function runAudit({ token = process.env.GITHUB_TOKEN || '', output = 'ecosystem-cutover-report.json' } = {}) {
  const [taskSource, appSource] = await Promise.all([
    readGithubFile('NestAI', 'packages/task-registry/src/index.ts', 'production', token),
    readGithubFile('NestAI', 'packages/app-registry/src/index.ts', 'production', token),
  ]);
  const owners = taskOwners(taskSource);
  const apps = appTasks(appSource);
  const rows = await Promise.all(consumers.map(async consumer => {
    try {
      const [manifestSource, packageSource, runtime, mainSha, productionSha] = await Promise.all([
        readGithubFile(consumer.repo, 'millionsnest.app.json', 'production', token),
        readGithubFile(consumer.repo, consumer.packagePath, 'production', token),
        readGithubFile(consumer.repo, consumer.runtimePath, 'production', token),
        readHead(consumer.repo, 'main', token),
        readHead(consumer.repo, 'production', token),
      ]);
      return checkConsumer({ consumer, manifest: JSON.parse(manifestSource), packageJson: JSON.parse(packageSource), runtime, owners, apps, mainSha, productionSha });
    } catch (error) {
      return { repository: 'prdanielcunha/' + consumer.repo, appId: consumer.appId, sourceLevel: 'FAIL', liveE2E: 'NOT_CERTIFIED_BY_THIS_AUDIT', mainSha: null, productionSha: null, sdkVersion: null, manifestTasks: 0, errors: [String(error instanceof Error ? error.message : error)], warnings: [] };
    }
  }));
  const report = { generatedAt: new Date().toISOString(), base: 'production', apps: rows, allSourcePassed: rows.every(row => row.sourceLevel === 'PASS'), allBranchesSynchronized: rows.every(row => row.mainSha && row.mainSha === row.productionSha), liveE2ECertified: false };
  await writeFile(output, JSON.stringify(report, null, 2) + '\n', 'utf8');
  const markdown = toMarkdown(report);
  process.stdout.write(markdown + '\n');
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, markdown + '\n', 'utf8');
  if (!report.allSourcePassed) process.exitCode = 1;
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await runAudit().catch(error => { console.error(String(error)); process.exitCode = 1; });
}
