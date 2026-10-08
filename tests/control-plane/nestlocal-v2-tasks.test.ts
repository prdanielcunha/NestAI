import { describe, expect, it } from "vitest";
import { getTask } from "../../packages/task-registry/src/index.js";
import { buildTaskPrompt } from "../../packages/prompt-registry/src/index.js";
import { getStructuredContract } from "../../packages/structured-output/src/index.js";
import { releaseGate } from "../../packages/evals/src/index.js";

const ids=["nestlocal.pulse.explain","nestlocal.setup.assist","nestlocal.return.suggest"];
describe("NestLocal 2.0 registry safety",()=>{
  it("uses canonical FREE_ONLY eligible routing rather than app-owned provider IDs",()=>{
    for(const id of ids){
      const task=getTask(id);
      expect(task.app).toBe("nestlocal");
      expect(task.capability).toBe("ai:run");
      expect(task.defaultSensitivity).toMatch(/^P[12]_/);
      expect(task.allowedProviders).toEqual(["groq","cloudflare"]);
      expect(task.allowedProviders).not.toContain("openai");
      expect(task.cache.mode).toBe("disabled");
      expect(task.rag).not.toBe(true);
      expect(task.maxOutputTokens).toBeLessThanOrEqual(500);
    }
  });
  it("has PT/EN/ES versioned prompts forbidding automatic actions",()=>{
    for(const id of ids){
      for(const locale of ["pt-BR","en","es"] as const){
        const result=buildTaskPrompt({taskId:id,locale,input:{authority:{mode:"suggestion_only"}}});
        expect(result.promptVersion).toBe(1);
        expect(result.messages[0]?.content).toContain("Never reveal secrets");
        expect(result.messages[0]?.content.length).toBeGreaterThan(100);
      }
    }
  });
  it("validates structured output and rejects invented shapes",()=>{
    const pulse=getStructuredContract("nestlocal.pulse.explain");
    const setup=getStructuredContract("nestlocal.setup.assist");
    const ret=getStructuredContract("nestlocal.return.suggest");
    expect(pulse?.schema.safeParse({summary:"Review",reason:"Observed quote age",sourceIds:["quote_1"],nextStep:"Review quote",uncertainty:null}).success).toBe(true);
    expect(pulse?.schema.safeParse({summary:"Review",reason:"Reason",sourceIds:[],nextStep:"review",uncertainty:null}).success).toBe(false);
    expect(setup?.schema.safeParse({summary:"Configure",suggestions:[],warnings:[]}).success).toBe(true);
    expect(ret?.schema.safeParse({draft:"Could we schedule a return visit?",consentRequired:true,warnings:[]}).success).toBe(true);
    expect(ret?.schema.safeParse({draft:"",consentRequired:false,warnings:[]}).success).toBe(false);
  });
  it("blocks release if golden eval cases are missing or a safety assertion fails",()=>{
    expect(releaseGate([]).pass).toBe(false);
    const cases=ids.map((id,i)=>({caseId:id,passed:true,score:1-i*.02}));
    expect(releaseGate(cases).pass).toBe(true);
    expect(releaseGate([...cases,{caseId:"autonomous-send",passed:false,score:0}]).pass).toBe(false);
  });
});
