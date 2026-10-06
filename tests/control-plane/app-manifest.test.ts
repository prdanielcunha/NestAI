import { describe, expect, it } from "vitest";
import { assertManifestTaskOwnership, validateAppManifest } from "../../packages/app-manifest/src/index.js";

describe("millionsnest.app.json",()=>{
  it("validates a canonical app manifest",()=>{
    const manifest=validateAppManifest({
      schemaVersion:1,
      appId:"nestlume",
      name:"NestLume",
      ai:{enabled:true,tasks:["nestlume.study.answer"],defaultSensitivity:"P1_INTERNAL"},
      locales:["pt-BR","en","es"],
      owner:{repository:"prdanielcunha/nestlume"},
    });
    expect(()=>assertManifestTaskOwnership(manifest)).not.toThrow();
  });

  it("rejects a task namespace owned by another app",()=>{
    const manifest=validateAppManifest({
      schemaVersion:1,
      appId:"nestlume",
      name:"NestLume",
      ai:{enabled:true,tasks:["nestfinance.receipt.extract"],defaultSensitivity:"P1_INTERNAL"},
      locales:["pt-BR"],
      owner:{repository:"prdanielcunha/nestlume"},
    });
    expect(()=>assertManifestTaskOwnership(manifest)).toThrow("APP_MANIFEST_TASK_NAMESPACE_MISMATCH");
  });

  it("restricts auto-registration to canonical GitHub owner",()=>{
    expect(()=>validateAppManifest({
      schemaVersion:1,
      appId:"nestlume",
      name:"NestLume",
      ai:{enabled:true,tasks:["nestlume.study.answer"],defaultSensitivity:"P1_INTERNAL"},
      locales:["pt-BR"],
      owner:{repository:"other/nestlume"},
    })).toThrow();
  });
});
