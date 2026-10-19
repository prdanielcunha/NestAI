import {describe,it,expect} from 'vitest';
import {getTask} from '../../packages/task-registry/src/index.js';
import {ecosystemApps} from '../../packages/app-registry/src/index.js';
import {routeCandidates} from '../../packages/router/src/index.js';
describe('NestLocal audio ownership and free-only privacy boundary',()=>{
 it('has its own audio task, no cache and no cross-app alias',()=>{
  const task=getTask('nestlocal.audio.transcribe');
  expect(task.app).toBe('nestlocal');expect(task.modality).toBe('audio');
  expect(task.cache.mode).toBe('disabled');
  expect(ecosystemApps.find(app=>app.appId==='nestlocal')?.allowedTasks).toContain(task.id);
  expect(getTask('connect.audio.transcribe').app).toBe('connect');
 });
 it('routes personal audio only within the approved free providers',()=>{
  const task=getTask('nestlocal.audio.transcribe');
  const candidates=routeCandidates({sensitivity:'P2_PERSONAL',billingMode:'FREE_ONLY',modality:'audio',allowedProviders:task.allowedProviders,blockedProviders:task.blockedProviders});
  expect(candidates.length).toBeGreaterThan(0);
  for(const candidate of candidates)expect(candidate.provider).toBe('groq');
  expect(routeCandidates({sensitivity:'P4_RESTRICTED',billingMode:'FREE_ONLY',modality:'audio',allowedProviders:task.allowedProviders,blockedProviders:task.blockedProviders})).toEqual([]);
 });
});
