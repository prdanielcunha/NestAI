import {describe,expect,it} from 'vitest';
import {budgetWindowsForRequest} from '../../packages/provider-budgets/src/index.js';
const input={
 organizationId:'org-test-abc',appId:'nestlocal',taskId:'nestlocal.quote.compose',
 providerId:'groq',environment:'production',idempotencyKey:'req-123',
 estimateMicroUsd:250,
};
describe('NestAI provider money budgets (still OFF in production)',()=>{
 it('always requires global+environment+provider+task+app+tenant USD windows',async()=>{
  const v=await budgetWindowsForRequest(input);
  expect(v.map(x=>x.type)).toEqual(
    ['global','environment','provider','task','app','organization']);
  expect(v[0]!.key).toBe('nestai:budget:global:all');
  expect(v[5]!.key).not.toContain('org-test-abc');
 });
 it('adds separately bounded users and trial scopes without leaking ids',async()=>{
  const v=await budgetWindowsForRequest({...input,userId:'user-private-abc',trial:true});
  expect(v).toHaveLength(8);
  expect(v.map(x=>x.type)).toContain('user');
  expect(v.map(x=>x.type)).toContain('trial');
  expect(v.map(x=>x.key).join(' ')).not.toContain('user-private-abc');
 });
 it('fails closed for invalid actor, org and task inputs',async()=>{
  await expect(budgetWindowsForRequest({...input,organizationId:'org/other'}))
    .rejects.toThrow('AI_BUDGET_INVALID_ORG');
  await expect(budgetWindowsForRequest({...input,providerId:'provider bad'}))
    .rejects.toThrow('AI_BUDGET_INVALID_PROVIDER');
  await expect(budgetWindowsForRequest({...input,idempotencyKey:''}))
    .rejects.toThrow('AI_BUDGET_INVALID_IDEMPOTENCY_KEY');
 });
});
