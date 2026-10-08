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

const nestLocalPulseExplainSchema = z.object({
  summary: z.string().min(1).max(700),
  reason: z.string().min(1).max(700),
  sourceIds: z.array(z.string().min(1).max(128)).min(1).max(5),
  nextStep: z.string().min(1).max(400),
  uncertainty: z.string().max(400).nullable(),
});
const nestLocalSetupAssistSchema = z.object({
  summary: z.string().min(1).max(500),
  suggestions: z.array(z.object({
    field: z.string().min(1).max(60),
    value: z.string().max(160),
    reason: z.string().max(260),
  })).max(5),
  warnings: z.array(z.string().max(260)).max(5),
});
const nestLocalReturnSuggestSchema = z.object({
  draft: z.string().min(1).max(1200),
  consentRequired: z.boolean(),
  warnings: z.array(z.string().max(300)).max(5),
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

const musicImportEnrichmentSchema = z.object({
  sections: z.array(z.object({
    name: z.string().min(1),
    type: z.enum(["intro","verse","chorus","bridge","outro","unknown"]),
  })),
  sectionAnnotations: z.array(z.object({
    section: z.string().min(1),
    type: z.enum(["solo","riff","instrumental","interlude","intro","outro","technical","vocal","unknown"]),
    instrument: z.enum(["guitar","acoustic_guitar","bass","keys","piano","synth","drums","sax","violin","strings","other","unknown"]),
    confidence: z.enum(["high","medium","low"]),
  })),
  language: z.enum(["pt","en","es","unknown"]),
  suggestedBpm: z.number().positive().nullable(),
  suggestedRhythm: z.string().nullable(),
  capitalizedTitle: z.string().nullable(),
  capitalizedArtist: z.string().nullable(),
  originalKey: z.string().nullable(),
  warnings: z.array(z.string()),
});

const songSuggestionSchema = z.array(z.object({
  id: z.string().optional(),
  title: z.string().min(1),
  artist: z.string(),
  reason: z.string().min(1),
  recommendedKey: z.string(),
})).min(1).max(3);

const setlistAnalysisSchema = z.object({
  healthScore: z.number().int().min(0).max(100),
  metrics: z.object({
    fluidez: z.number().int().min(0).max(100),
    energia: z.number().int().min(0).max(100),
    tonalidade: z.number().int().min(0).max(100),
    repeticao: z.number().int().min(0).max(100),
    equilibrio: z.number().int().min(0).max(100),
  }),
  feedback: z.string().min(1),
  suggestions: z.array(z.object({
    type: z.string().min(1),
    text: z.string().min(1),
  })),
  learningInsight: z.string(),
});

const releaseNoteSchema = z.object({
  version: z.string().min(1),
  title: z.object({ pt: z.string().min(1), en: z.string().min(1), es: z.string().min(1) }),
  description: z.object({ pt: z.string().min(1), en: z.string().min(1), es: z.string().min(1) }),
  highlights: z.object({
    pt: z.array(z.string()).min(1).max(6),
    en: z.array(z.string()).min(1).max(6),
    es: z.array(z.string()).min(1).max(6),
  }),
  category: z.enum(["Novidades","Performance","Experiência","Inteligência","Estabilidade","Offline","Performance Mode","IA","Refinamentos"]),
  isMajor: z.boolean(),
});

const musicImportEnrichmentJsonSchema: JsonSchema = {
  type: "object", additionalProperties: false,
  required: ["sections","sectionAnnotations","language","suggestedBpm","suggestedRhythm","capitalizedTitle","capitalizedArtist","originalKey","warnings"],
  properties: {
    sections: { type: "array", items: { type: "object", additionalProperties: false, required: ["name","type"], properties: { name: {type:"string"}, type: {enum:["intro","verse","chorus","bridge","outro","unknown"]} } } },
    sectionAnnotations: { type: "array", items: { type: "object", additionalProperties: false, required: ["section","type","instrument","confidence"], properties: {
      section:{type:"string"}, type:{enum:["solo","riff","instrumental","interlude","intro","outro","technical","vocal","unknown"]},
      instrument:{enum:["guitar","acoustic_guitar","bass","keys","piano","synth","drums","sax","violin","strings","other","unknown"]},
      confidence:{enum:["high","medium","low"]}
    } } },
    language: { enum: ["pt","en","es","unknown"] },
    suggestedBpm: { type: ["number","null"] },
    suggestedRhythm: { type: ["string","null"] },
    capitalizedTitle: { type: ["string","null"] },
    capitalizedArtist: { type: ["string","null"] },
    originalKey: { type: ["string","null"] },
    warnings: { type: "array", items: { type: "string" } },
  },
};

const songSuggestionJsonSchema: JsonSchema = {
  type: "array", minItems: 1, maxItems: 3,
  items: { type: "object", additionalProperties: false, required: ["title","artist","reason","recommendedKey"], properties: {
    id:{type:"string"}, title:{type:"string"}, artist:{type:"string"}, reason:{type:"string"}, recommendedKey:{type:"string"}
  } }
};

const setlistAnalysisJsonSchema: JsonSchema = {
  type: "object", additionalProperties: false, required: ["healthScore","metrics","feedback","suggestions","learningInsight"],
  properties: {
    healthScore:{type:"integer",minimum:0,maximum:100},
    metrics:{type:"object",additionalProperties:false,required:["fluidez","energia","tonalidade","repeticao","equilibrio"],properties:{
      fluidez:{type:"integer",minimum:0,maximum:100},energia:{type:"integer",minimum:0,maximum:100},tonalidade:{type:"integer",minimum:0,maximum:100},repeticao:{type:"integer",minimum:0,maximum:100},equilibrio:{type:"integer",minimum:0,maximum:100}
    }},
    feedback:{type:"string"},
    suggestions:{type:"array",items:{type:"object",additionalProperties:false,required:["type","text"],properties:{type:{type:"string"},text:{type:"string"}}}},
    learningInsight:{type:"string"},
  },
};

const releaseNoteJsonSchema: JsonSchema = {
  type:"object", additionalProperties:false, required:["version","title","description","highlights","category","isMajor"],
  properties:{
    version:{type:"string"},
    title:{type:"object",additionalProperties:false,required:["pt","en","es"],properties:{pt:{type:"string"},en:{type:"string"},es:{type:"string"}}},
    description:{type:"object",additionalProperties:false,required:["pt","en","es"],properties:{pt:{type:"string"},en:{type:"string"},es:{type:"string"}}},
    highlights:{type:"object",additionalProperties:false,required:["pt","en","es"],properties:{pt:{type:"array",items:{type:"string"}},en:{type:"array",items:{type:"string"}},es:{type:"array",items:{type:"string"}}}},
    category:{enum:["Novidades","Performance","Experiência","Inteligência","Estabilidade","Offline","Performance Mode","IA","Refinamentos"]},
    isMajor:{type:"boolean"}
  }
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

const financeCountFieldsSchema = z.object({
  fields: z.array(z.object({
    key: z.enum(["tithe","offering","other_income","pix"]),
    status: z.enum(["recognized","uncertain","unreadable","blank"]),
    observation: z.string().max(64),
  })).length(4),
});

const financeDenominationFieldsSchema = z.object({
  fields: z.array(z.object({
    cellKey: z.enum(["tithe:10000","tithe:5000","tithe:2000","tithe:1000","tithe:500","tithe:200","tithe:100","tithe:50","tithe:25","tithe:10","tithe:5","offering:10000","offering:5000","offering:2000","offering:1000","offering:500","offering:200","offering:100","offering:50","offering:25","offering:10","offering:5","other:10000","other:5000","other:2000","other:1000","other:500","other:200","other:100","other:50","other:25","other:10","other:5"] as [string, ...string[]]),
    status: z.enum(["recognized","uncertain","unreadable","blank"]),
    observation: z.string().max(16),
  })).length(33),
});

const financeDocumentFieldsSchema = z.object({
  fields: z.array(z.object({
    key: z.enum(["document_type","transaction_kind","counterparty_name","issuer_tax_id","recipient_tax_id","payer_tax_id","payee_tax_id","document_number","total_amount","currency","occurred_at","due_date","settlement_state","payment_method","description","category_id","document_multiplicity"] as [string, ...string[]]),
    status: z.enum(["recognized","uncertain","absent"]),
    observation: z.string().max(240),
  })).length(17),
});

const financeCountFieldsJsonSchema: JsonSchema = {
  type:"object", additionalProperties:false, required:["fields"],
  properties:{fields:{type:"array",minItems:4,maxItems:4,items:{
    type:"object",additionalProperties:false,required:["key","status","observation"],
    properties:{
      key:{enum:["tithe","offering","other_income","pix"]},
      status:{enum:["recognized","uncertain","unreadable","blank"]},
      observation:{type:"string",maxLength:64}
    }
  }}}
};

const financeDenominationFieldsJsonSchema: JsonSchema = {
  type:"object", additionalProperties:false, required:["fields"],
  properties:{fields:{type:"array",minItems:33,maxItems:33,items:{
    type:"object",additionalProperties:false,required:["cellKey","status","observation"],
    properties:{
      cellKey:{enum:["tithe:10000","tithe:5000","tithe:2000","tithe:1000","tithe:500","tithe:200","tithe:100","tithe:50","tithe:25","tithe:10","tithe:5","offering:10000","offering:5000","offering:2000","offering:1000","offering:500","offering:200","offering:100","offering:50","offering:25","offering:10","offering:5","other:10000","other:5000","other:2000","other:1000","other:500","other:200","other:100","other:50","other:25","other:10","other:5"]},
      status:{enum:["recognized","uncertain","unreadable","blank"]},
      observation:{type:"string",maxLength:16}
    }
  }}}
};

const financeDocumentFieldsJsonSchema: JsonSchema = {
  type:"object", additionalProperties:false, required:["fields"],
  properties:{fields:{type:"array",minItems:17,maxItems:17,items:{
    type:"object",additionalProperties:false,required:["key","status","observation"],
    properties:{
      key:{enum:["document_type","transaction_kind","counterparty_name","issuer_tax_id","recipient_tax_id","payer_tax_id","payee_tax_id","document_number","total_amount","currency","occurred_at","due_date","settlement_state","payment_method","description","category_id","document_multiplicity"]},
      status:{enum:["recognized","uncertain","absent"]},
      observation:{type:"string",maxLength:240}
    }
  }}}
};

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
  "nestlocal.pulse.explain": {
    id: "nestlocal.pulse.explain.v1", schema: nestLocalPulseExplainSchema,
    jsonSchema: { type: "object", additionalProperties: false,
      required: ["summary","reason","sourceIds","nextStep","uncertainty"],
      properties: {
        summary: { type: "string", minLength: 1, maxLength: 700 },
        reason: { type: "string", minLength: 1, maxLength: 700 },
        sourceIds: { type: "array", minItems: 1, maxItems: 5, items: { type: "string", minLength: 1, maxLength: 128 } },
        nextStep: { type: "string", minLength: 1, maxLength: 400 },
        uncertainty: { type: ["string","null"], maxLength: 400 },
      },
    },
  },
  "nestlocal.setup.assist": {
    id: "nestlocal.setup.assist.v1", schema: nestLocalSetupAssistSchema,
    jsonSchema: { type: "object", additionalProperties: false,
      required: ["summary","suggestions","warnings"],
      properties: {
        summary: { type: "string", minLength: 1, maxLength: 500 },
        suggestions: { type: "array", maxItems: 5, items: { type: "object", additionalProperties: false,
          required: ["field","value","reason"],
          properties: {field:{type:"string",minLength:1,maxLength:60},value:{type:"string",maxLength:160},reason:{type:"string",maxLength:260}},
        }},
        warnings: { type: "array", maxItems: 5, items: { type: "string", maxLength: 260 } },
      },
    },
  },
  "nestlocal.return.suggest": {
    id: "nestlocal.return.suggest.v1", schema: nestLocalReturnSuggestSchema,
    jsonSchema: { type: "object", additionalProperties: false,
      required: ["draft","consentRequired","warnings"],
      properties: {
        draft: { type: "string", minLength: 1, maxLength: 1200 },
        consentRequired: { type: "boolean" },
        warnings: { type: "array", maxItems: 5, items: { type: "string", maxLength: 300 } },
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
  "musicscale.song.import.enrich": { id: "musicscale.song.import.enrich.v1", schema: musicImportEnrichmentSchema, jsonSchema: musicImportEnrichmentJsonSchema },
  "musicscale.song.suggest": { id: "musicscale.song.suggest.v1", schema: songSuggestionSchema, jsonSchema: songSuggestionJsonSchema },
  "musicscale.setlist.analyze": { id: "musicscale.setlist.analyze.v1", schema: setlistAnalysisSchema, jsonSchema: setlistAnalysisJsonSchema },
  "musicscale.release-note.generate": { id: "musicscale.release-note.generate.v1", schema: releaseNoteSchema, jsonSchema: releaseNoteJsonSchema },
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
  "finance.count.regions.extract": { id:"finance.count.regions.extract.v1", schema:financeCountFieldsSchema, jsonSchema:financeCountFieldsJsonSchema },
  "finance.count.freeform.extract": { id:"finance.count.freeform.extract.v1", schema:financeCountFieldsSchema, jsonSchema:financeCountFieldsJsonSchema },
  "finance.count.denominations.extract": { id:"finance.count.denominations.extract.v1", schema:financeDenominationFieldsSchema, jsonSchema:financeDenominationFieldsJsonSchema },
  "finance.document.transaction.extract": { id:"finance.document.transaction.extract.v1", schema:financeDocumentFieldsSchema, jsonSchema:financeDocumentFieldsJsonSchema },
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
