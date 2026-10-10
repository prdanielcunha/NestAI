import {describe,it,expect} from 'vitest';
import {getTask} from '../../packages/task-registry/src/index';
import {getStructuredContract} from '../../packages/structured-output/src/index';
describe('affiliate product-specific AI latency budget',()=>{
 it('bounds every free provider attempt to 18s and avoids runaway token output',()=>{
  const task=getTask('affiliate.pin.strategy');
  expect(task.timeoutMs).toBeLessThanOrEqual(18_000);
  expect(task.maxOutputTokens).toBeGreaterThanOrEqual(1300);
  expect(task.maxOutputTokens).toBeLessThanOrEqual(1700);
  expect(task.allowedProviders).toEqual(['groq','cloudflare']);
  expect(getStructuredContract(task.id)).not.toBeNull();
 });
});
