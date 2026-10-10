import {describe,it,expect} from "vitest";
import {getTask} from "../../packages/task-registry/src/index.js";
import {getStructuredContract,validateStructuredText} from "../../packages/structured-output/src/index.js";
import {ecosystemApps} from "../../packages/app-registry/src/index.js";
import {prompts} from "../../packages/prompt-registry/src/index.js";

describe("affiliate screenshot OCR zero-cost contract",()=>{
  it("is allowlisted for NestAffiliate with Cloudflare vision only",()=>{
    const task=getTask("affiliate.screenshot.extract");
    expect(task.modality).toBe("vision");
    expect(task.allowedProviders).toEqual(["cloudflare"]);
    expect(task.cache.mode).toBe("disabled");
    expect(ecosystemApps.find(x=>x.appId==="nestaffiliate")?.allowedTasks).toContain(task.id);
    expect(prompts[task.id]).toBeTruthy();
    expect(getStructuredContract(task.id)).not.toBeNull();
  });
  it("rejects invented output structure and permits null fields",()=>{
    const good={
      marketplace:"MELI",title:"Jogo de panelas",productUrl:null,price:159.9,
      seller:null,rating:4.7,reviewCount:null,
      visibleFacts:["10 peças"],warnings:["Preço visto em captura, sem atualização"],
    };
    expect(validateStructuredText("affiliate.screenshot.extract",JSON.stringify(good))).toEqual(good);
    expect(()=>validateStructuredText("affiliate.screenshot.extract",JSON.stringify({...good,rating:99}))).toThrow();
  });
});