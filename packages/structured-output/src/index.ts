import { z } from "zod";

export type JsonSchema = Record<string, unknown>;

export type StructuredContract<T = unknown> = {
  id: string;
  schema: z.ZodType<T>;
  jsonSchema: JsonSchema;
};

const connectClassifySchema = z.object({
  intent: z.string().min(1),
  urgency: z.enum(["low","normal","high","critical"]),
  requiresHuman: z.boolean(),
  confidence: z.number().min(0).max(1),
});

const nestLocalRequestSchema = z.object({
  intent: z.string().min(1),
  service: z.string().nullable(),
  dimensions: z.object({
    width: z.number().positive().nullable(),
    height: z.number().positive().nullable(),
  }).nullable(),
  preferredDate: z.string().nullable(),
  preferredPeriod: z.enum(["morning","afternoon","evening"]).nullable(),
  missingFields: z.array(z.string()),
});

const musicStructureSchema = z.object({
  sections: z.array(z.object({
    name: z.string().min(1),
    repeats: z.number().int().min(1).max(32).nullable(),
  })).min(1),
  uncertain: z.array(z.string()),
});

const musicScaleLiveSchema = z.object({
  summary: z.string().min(1).max(5000),
  confidence: z.number().min(0).max(1),
  suggestions: z.array(z.object({
    kind: z.string().min(1),
    label: z.string().min(1),
    reason: z.string().min(1),
    value: z.string().optional(),
  })).max(12),
  warnings: z.array(z.string()).max(12),
});

const musicScaleLiveJsonSchema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["summary","confidence","suggestions","warnings"],
  properties: {
    summary: { type: "string", minLength: 1, maxLength: 5000 },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    suggestions: {
      type: "array",
      maxItems: 12,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["kind","label","reason"],
        properties: {
          kind: { type: "string", minLength: 1 },
          label: { type: "string", minLength: 1 },
          reason: { type: "string", minLength: 1 },
          value: { type: "string" },
        },
      },
    },
    warnings: { type: "array", maxItems: 12, items: { type: "string" } },
  },
};

const affiliateProductSchema = z.object({
  facts: z.array(z.string()),
  opportunities: z.array(z.string()),
  unknowns: z.array(z.string()),
});

const nestlumeStudySchema = z.object({
  answer: z.string().min(1).max(8000),
  claims: z.array(z.object({
    text: z.string().min(1).max(1500),
    evidenceIds: z.array(z.string().min(1)).min(1).max(4),
    certainty: z.enum(["high","medium","low"]),
  })).min(1).max(12),
  limitations: z.array(z.string().max(1000)).max(8),
});

const receiptSchema = z.object({
  merchant: z.string().nullable(),
  amount: z.number().nonnegative().nullable(),
  currency: z.string().length(3).default("BRL"),
  date: z.string().nullable(),
  documentNumber: z.string().nullable(),
  confidence: z.number().min(0).max(1),
  missingFields: z.array(z.string()),
});

const journeyFormSchema = z.object({
  candidates: z.array(z.object({
    field: z.string().min(1),
    value: z.string().nullable(),
    confidence: z.number().min(0).max(1),
  })),
  unreadableFields: z.array(z.string()),
  needsHumanReview: z.literal(true),
});

const affiliatePinSchema = z.object({
  title: z.string().min(1).max(100),
  description: z.string().min(1).max(500),
  tags: z.array(z.string()).max(12),
});

export const structuredContracts: Record<string, StructuredContract> = {
  "nestlume.study.grounded": {
    id: "nestlume.study.grounded.v1",
    schema: nestlumeStudySchema,
    jsonSchema: {
      type: "object", additionalProperties: false,
      required: ["answer","claims","limitations"],
      properties: {
        answer: { type: "string", minLength: 1, maxLength: 8000 },
        claims: {
          type: "array", minItems: 1, maxItems: 12,
          items: {
            type: "object", additionalProperties: false,
            required: ["text","evidenceIds","certainty"],
            properties: {
              text: { type: "string", minLength: 1, maxLength: 1500 },
              evidenceIds: { type: "array", minItems: 1, maxItems: 4, items: { type: "string", minLength: 1 } },
              certainty: { enum: ["high","medium","low"] },
            },
          },
        },
        limitations: { type: "array", maxItems: 8, items: { type: "string", maxLength: 1000 } },
      },
    },
  },
  "connect.message.classify": {
    id: "connect.message.classify.v1",
    schema: connectClassifySchema,
    jsonSchema: {
      type: "object", additionalProperties: false,
      required: ["intent","urgency","requiresHuman","confidence"],
      properties: {
        intent: { type: "string", minLength: 1 },
        urgency: { enum: ["low","normal","high","critical"] },
        requiresHuman: { type: "boolean" },
        confidence: { type: "number", minimum: 0, maximum: 1 },
      },
    },
  },
  "nestlocal.request.extract": {
    id: "nestlocal.request.extract.v1",
    schema: nestLocalRequestSchema,
    jsonSchema: {
      type: "object", additionalProperties: false,
      required: ["intent","service","dimensions","preferredDate","preferredPeriod","missingFields"],
      properties: {
        intent: { type: "string", minLength: 1 },
        service: { type: ["string","null"] },
        dimensions: {
          anyOf: [
            { type: "null" },
            {
              type: "object", additionalProperties: false,
              required: ["width","height"],
              properties: {
                width: { type: ["number","null"] },
                height: { type: ["number","null"] },
              },
            },
          ],
        },
        preferredDate: { type: ["string","null"] },
        preferredPeriod: { anyOf: [{type:"null"},{enum:["morning","afternoon","evening"]}] },
        missingFields: { type: "array", items: { type: "string" } },
      },
    },
  },
  "musicscale.song.structure": {
    id: "musicscale.song.structure.v1",
    schema: musicStructureSchema,
    jsonSchema: {
      type: "object", additionalProperties: false,
      required: ["sections","uncertain"],
      properties: {
        sections: {
          type: "array", minItems: 1,
          items: {
            type: "object", additionalProperties: false,
            required: ["name","repeats"],
            properties: {
              name: { type: "string", minLength: 1 },
              repeats: { type: ["integer","null"], minimum: 1, maximum: 32 },
            },
          },
        },
        uncertain: { type: "array", items: { type: "string" } },
      },
    },
  },
  "musicscale.live.diagnostic.explain": { id: "musicscale.live.diagnostic.explain.v1", schema: musicScaleLiveSchema, jsonSchema: musicScaleLiveJsonSchema },
  "musicscale.live.song-match.assist": { id: "musicscale.live.song-match.assist.v1", schema: musicScaleLiveSchema, jsonSchema: musicScaleLiveJsonSchema },
  "musicscale.live.request.classify": { id: "musicscale.live.request.classify.v1", schema: musicScaleLiveSchema, jsonSchema: musicScaleLiveJsonSchema },
  "musicscale.live.search.interpret": { id: "musicscale.live.search.interpret.v1", schema: musicScaleLiveSchema, jsonSchema: musicScaleLiveJsonSchema },
  "musicscale.live.metadata.normalize": { id: "musicscale.live.metadata.normalize.v1", schema: musicScaleLiveSchema, jsonSchema: musicScaleLiveJsonSchema },
  "musicscale.live.post-service.summary": { id: "musicscale.live.post-service.summary.v1", schema: musicScaleLiveSchema, jsonSchema: musicScaleLiveJsonSchema },
  "musicscale.live.pre-service-risk.explain": { id: "musicscale.live.pre-service-risk.explain.v1", schema: musicScaleLiveSchema, jsonSchema: musicScaleLiveJsonSchema },
  "affiliate.product.analyze": {
    id: "affiliate.product.analyze.v1",
    schema: affiliateProductSchema,
    jsonSchema: {
      type: "object", additionalProperties: false,
      required: ["facts","opportunities","unknowns"],
      properties: {
        facts: { type: "array", items: { type: "string" } },
        opportunities: { type: "array", items: { type: "string" } },
        unknowns: { type: "array", items: { type: "string" } },
      },
    },
  },
  "finance.receipt.extract": {
    id: "finance.receipt.v1",
    schema: receiptSchema,
    jsonSchema: {
      type: "object",
      additionalProperties: false,
      required: ["merchant", "amount", "currency", "date", "documentNumber", "confidence", "missingFields"],
      properties: {
        merchant: { type: ["string", "null"] },
        amount: { type: ["number", "null"], minimum: 0 },
        currency: { type: "string", minLength: 3, maxLength: 3 },
        date: { type: ["string", "null"] },
        documentNumber: { type: ["string", "null"] },
        confidence: { type: "number", minimum: 0, maximum: 1 },
        missingFields: { type: "array", items: { type: "string" } },
      },
    },
  },
  "journey.form.extract": {
    id: "journey.form.extract.v1",
    schema: journeyFormSchema,
    jsonSchema: {
      type: "object",
      additionalProperties: false,
      required: ["candidates", "unreadableFields", "needsHumanReview"],
      properties: {
        candidates: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["field", "value", "confidence"],
            properties: {
              field: { type: "string", minLength: 1 },
              value: { type: ["string", "null"] },
              confidence: { type: "number", minimum: 0, maximum: 1 },
            },
          },
        },
        unreadableFields: { type: "array", items: { type: "string" } },
        needsHumanReview: { const: true },
      },
    },
  },
  "affiliate.pin.copy": {
    id: "affiliate.pin.v1",
    schema: affiliatePinSchema,
    jsonSchema: {
      type: "object",
      additionalProperties: false,
      required: ["title", "description", "tags"],
      properties: {
        title: { type: "string", minLength: 1, maxLength: 100 },
        description: { type: "string", minLength: 1, maxLength: 500 },
        tags: { type: "array", maxItems: 12, items: { type: "string" } },
      },
    },
  },
};

export function getStructuredContract(taskId: string): StructuredContract | null {
  return structuredContracts[taskId] ?? null;
}

function stripCodeFence(text: string): string {
  const trimmed = text.trim();
  const match = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return match?.[1]?.trim() ?? trimmed;
}

export function validateStructuredText(taskId: string, text: string): unknown {
  const contract = getStructuredContract(taskId);
  if (!contract) return text;
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripCodeFence(text));
  } catch {
    throw new Error("OUTPUT_SCHEMA_INVALID_JSON");
  }
  const result = contract.schema.safeParse(parsed);
  if (!result.success) throw new Error("OUTPUT_SCHEMA_VALIDATION_FAILED");
  return result.data;
}

export function assertGroundedEvidenceInput(taskId: string, input: unknown): void {
  if (taskId !== "nestlume.study.grounded") return;
  const request = input && typeof input === "object" ? input as Record<string, unknown> : {};
  const evidence = request.evidence;
  if (!Array.isArray(evidence) || evidence.length < 1 || evidence.length > 12) throw new Error("EVIDENCE_REQUIRED");
  const valid = evidence.every((item) => item && typeof item === "object"
    && typeof (item as { id?: unknown }).id === "string"
    && typeof (item as { text?: unknown }).text === "string"
    && ((item as { text: string }).text.trim().length > 0)
    && ((item as { text: string }).text.length <= 4000));
  const ids = evidence.map((item) => (item as { id: string }).id);
  if (!valid || new Set(ids).size !== evidence.length) throw new Error("EVIDENCE_INVALID");
}

export function verifyGroundedEvidence(taskId: string, input: unknown, output: unknown): void {
  if (taskId !== "nestlume.study.grounded") return;
  assertGroundedEvidenceInput(taskId, input);
  const request = input && typeof input === "object" ? input as Record<string, unknown> : {};
  const raw = Array.isArray(request.evidence) ? request.evidence : [];
  const evidenceIds = new Set(raw
    .filter((item): item is { id: string; text: string } =>
      typeof item === "object" && item !== null
      && typeof (item as { id?: unknown }).id === "string"
      && typeof (item as { text?: unknown }).text === "string"
      && ((item as { text: string }).text.trim().length > 0))
    .map((item) => item.id));
  if (evidenceIds.size === 0 || evidenceIds.size > 12) throw new Error("EVIDENCE_REQUIRED");
  const claims = (output as { claims?: Array<{ evidenceIds?: string[] }> })?.claims;
  if (!Array.isArray(claims) || claims.length === 0) throw new Error("EVIDENCE_CLAIMS_MISSING");
  for (const claim of claims) {
    if (!Array.isArray(claim.evidenceIds) || claim.evidenceIds.length === 0
      || claim.evidenceIds.some((id) => !evidenceIds.has(id))) {
      throw new Error("EVIDENCE_REF_INVALID");
    }
  }
}
