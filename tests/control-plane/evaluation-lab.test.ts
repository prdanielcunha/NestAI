import { describe, expect, it } from "vitest";
import { aggregateEval, promote, promotionGate, runEvalSuite, assertEvalTargetAllowed, evalTargets, type EvalCaseResult } from "../../packages/evaluation-lab/src/index.js";

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


describe("Evaluation Lab candidate boundaries", () => {
  it("registers Qwen, BGE-M3, reranker and NVIDIA as candidate-only targets", () => {
    for (const id of [
      "groq:qwen3.8-27b",
      "cloudflare:bge-m3",
      "cloudflare:bge-reranker-base",
      "nvidia-nim:gpt-oss-20b-eval",
    ]) {
      expect(evalTargets[id]?.stage).toBe("candidate");
      expect(evalTargets[id]?.customerTrafficAllowed).toBe(false);
      expect(evalTargets[id]?.productionTrafficAllowed).toBe(false);
    }
  });

  it("rejects unsanitized or sensitive candidate evaluation payloads", () => {
    expect(() => assertEvalTargetAllowed({
      targetId: "nvidia-nim:gpt-oss-20b-eval",
      sanitized: false,
      sensitivity: "P0_PUBLIC",
    })).toThrow("EVAL_TARGET_REQUIRES_SANITIZED_INPUT");

    expect(() => assertEvalTargetAllowed({
      targetId: "nvidia-nim:gpt-oss-20b-eval",
      sanitized: true,
      sensitivity: "P2_PERSONAL",
    })).toThrow("EVAL_TARGET_SENSITIVITY_DENIED");
  });
});
