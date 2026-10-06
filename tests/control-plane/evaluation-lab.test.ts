import { describe, expect, it } from "vitest";
import { aggregateEval, promote, promotionGate, runEvalSuite, type EvalCaseResult } from "../../packages/evaluation-lab/src/index.js";

describe("Evaluation Lab",()=>{
  it("runs only sanitized golden cases and produces promotion evidence",async()=>{
    const suite=await runEvalSuite({
      cases:[{
        id:"c1",
        taskId:"connect.reply.suggest",
        locale:"pt-BR",
        sensitivity:"P2_PERSONAL",
        input:{message:"teste"},
        forbiddenSubstrings:["enviei sua mensagem"],
        maxLatencyMs:5000,
        sanitized:true,
      }],
      execute:async()=>({
        output:"Sugestão revisável",
        latencyMs:900,
        fallbackUsed:false,
        schemaValid:true,
        privacyPassed:true,
        safetyPassed:true,
        groundedness:1,
        factuality:1,
        tone:1,
        instruction:1,
        locale:1,
      }),
    });
    expect(suite.gate.pass).toBe(true);
  });

  it("fails promotion on privacy regression even when quality is high",()=>{
    const results:EvalCaseResult[]=[{
      caseId:"c1",
      latencyMs:200,
      fallbackUsed:false,
      passed:false,
      scores:{
        factuality:1,groundedness:1,nonInvention:1,schema:1,instruction:1,
        privacy:0,safety:1,tone:1,locale:1,latency:1,fallback:1,
      },
    }];
    const gate=promotionGate(aggregateEval(results));
    expect(gate.pass).toBe(false);
    expect(gate.reasons).toContain("PRIVACY_BELOW_THRESHOLD");
  });

  it("enforces candidate to benchmark to regression to shadow to canary to production",()=>{
    expect(promote("candidate",true)).toBe("benchmark");
    expect(promote("benchmark",true)).toBe("regression");
    expect(promote("regression",true)).toBe("shadow");
    expect(promote("shadow",true)).toBe("canary");
    expect(promote("canary",true)).toBe("production");
    expect(()=>promote("candidate",false)).toThrow("EVAL_PROMOTION_GATE_FAILED");
  });
});
