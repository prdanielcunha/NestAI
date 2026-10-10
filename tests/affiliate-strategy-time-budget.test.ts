import {describe,expect,it} from "vitest";
import {getTask} from "../packages/task-registry/src/index.js";
import {getStructuredContract} from "../packages/structured-output/src/index.js";
import {buildTaskPrompt} from "../packages/prompt-registry/src/index.js";
import {readFileSync} from "node:fs";

describe("affiliate.pin.strategy production timeout hotfix",()=>{
  it("retains the official task, grounded prompt and output contract",()=>{
    const task=getTask("affiliate.pin.strategy");
    expect(task.app).toBe("nestaffiliate");
    expect(task.defaultSensitivity).toBe("P0_PUBLIC");
    expect(task.timeoutMs).toBe(14000);
    expect(task.allowedProviders).toEqual(["groq","cloudflare"]);
    expect(getStructuredContract(task.id)).not.toBeNull();
    expect(buildTaskPrompt({taskId:task.id,locale:"pt-BR",input:{product:{title:"Cadeira rosa"}}}).messages[0]?.content).toContain("titles");
  });
  it("isolates the bounded fallback to this one task",()=>{
    const worker=readFileSync("apps/api/src/index.ts","utf8");
    expect(worker).toContain('maxRetriesPerCandidate: task.id === "affiliate.pin.strategy" ? 0 : 1');
    expect(worker).toContain('other.provider === candidate.provider');
  });
});
