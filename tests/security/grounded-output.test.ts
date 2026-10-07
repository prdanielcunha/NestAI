import { describe, expect, it } from "vitest";
import { assertGroundedEvidenceInput, validateStructuredText, verifyGroundedEvidence } from "../../packages/structured-output/src/index.js";

const input = {
  question: "O que este texto ensina?",
  evidence: [{ id:"verse-1", kind:"scripture", text:"Texto bíblico fornecido para avaliação." }],
};

describe("NestLume grounded-answer contract", () => {
  it("requires nonempty unique evidence before provider execution", () => {
    expect(() => assertGroundedEvidenceInput("nestlume.study.grounded", input)).not.toThrow();
    expect(() => assertGroundedEvidenceInput("nestlume.study.grounded", { evidence: [] })).toThrow("EVIDENCE_REQUIRED");
    expect(() => assertGroundedEvidenceInput("nestlume.study.grounded", {
      evidence: [{id:"x",text:"a"},{id:"x",text:"b"}],
    })).toThrow("EVIDENCE_INVALID");
  });

  it("accepts only claims citing supplied evidence IDs", () => {
    const result = validateStructuredText("nestlume.study.grounded", JSON.stringify({
      answer:"Resumo da evidência.", claims:[{
        text:"Afirmação resumida do texto.",
        evidenceIds:["verse-1"],certainty:"high",
      }],limitations:[],
    }));
    expect(() => verifyGroundedEvidence("nestlume.study.grounded", input, result)).not.toThrow();
    expect(() => verifyGroundedEvidence("nestlume.study.grounded", input, {
      answer:"Alegação",
      claims:[{text:"Outra",evidenceIds:["external-fabricated"],certainty:"high"}],
      limitations:[],
    })).toThrow("EVIDENCE_REF_INVALID");
  });

  it("rejects outputs missing claim citations", () => {
    expect(() => validateStructuredText("nestlume.study.grounded", JSON.stringify({
      answer:"Texto sem evidência.",claims:[],limitations:[],
    }))).toThrow("OUTPUT_SCHEMA_VALIDATION_FAILED");
  });
});
