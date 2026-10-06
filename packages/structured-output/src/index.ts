import { z } from "zod";

export type JsonSchema = Record<string, unknown>;

export type StructuredContract<T = unknown> = {
  id: string;
  schema: z.ZodType<T>;
  jsonSchema: JsonSchema;
};

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
