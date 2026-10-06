import type { Sensitivity } from "../../contracts/src/index.js";

const order: Sensitivity[] = [
  "P0_PUBLIC",
  "P1_INTERNAL",
  "P2_PERSONAL",
  "P3_SENSITIVE",
  "P4_RESTRICTED",
];

type Detector = {
  id: string;
  level: Sensitivity;
  pattern: RegExp;
  replacement: string;
};

const detectors: Detector[] = [
  {
    id: "private_key",
    level: "P4_RESTRICTED",
    pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/gi,
    replacement: "[REDACTED_PRIVATE_KEY]",
  },
  {
    id: "named_secret",
    level: "P4_RESTRICTED",
    pattern: /(?:password|senha|private[_ -]?key|api[_ -]?key|secret[_ -]?key|access[_ -]?token|refresh[_ -]?token)\s*[:=]\s*["']?[^\s"',;}{]{6,}/gi,
    replacement: "[REDACTED_SECRET]",
  },
  {
    id: "jwt",
    level: "P4_RESTRICTED",
    pattern: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g,
    replacement: "[REDACTED_JWT]",
  },
  {
    id: "provider_key",
    level: "P4_RESTRICTED",
    pattern: /\b(?:gsk_[A-Za-z0-9_-]{20,}|AIza[A-Za-z0-9_-]{20,}|sk-[A-Za-z0-9_-]{20,})\b/g,
    replacement: "[REDACTED_PROVIDER_KEY]",
  },
  {
    id: "cpf",
    level: "P3_SENSITIVE",
    pattern: /\b(?:\d{3}\.\d{3}\.\d{3}-\d{2}|\d{11})\b/g,
    replacement: "[REDACTED_DOCUMENT]",
  },
  {
    id: "financial",
    level: "P3_SENSITIVE",
    pattern: /\b(?:cart[aã]o|credit card|cvv|bank account|conta banc[aá]ria|pix key|chave pix)\b/gi,
    replacement: "[REDACTED_FINANCIAL]",
  },
  {
    id: "email",
    level: "P2_PERSONAL",
    pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
    replacement: "[REDACTED_EMAIL]",
  },
  {
    id: "phone",
    level: "P2_PERSONAL",
    pattern: /(?:\+?55\s*)?(?:\(?\d{2}\)?\s*)?9?\d{4}[-\s]?\d{4}/g,
    replacement: "[REDACTED_PHONE]",
  },
];

const injectionPatterns: Array<{ id: string; pattern: RegExp }> = [
  { id: "ignore_policy", pattern: /\b(?:ignore|disregard|forget)\b[\s\S]{0,80}\b(?:previous|prior|system|developer|instructions?|rules?|policy)\b/i },
  { id: "reveal_prompt", pattern: /\b(?:reveal|show|print|repeat|expose)\b[\s\S]{0,80}\b(?:system prompt|developer message|hidden instructions?|policy)\b/i },
  { id: "role_override", pattern: /\b(?:you are now|act as|switch role|enter developer mode|jailbreak)\b/i },
  { id: "tool_override", pattern: /\b(?:call|invoke|execute|run)\b[\s\S]{0,60}\b(?:tool|function)\b[\s\S]{0,60}\b(?:without|bypass|ignore)\b/i },
];

function higher(a: Sensitivity, b: Sensitivity): Sensitivity {
  return order.indexOf(a) >= order.indexOf(b) ? a : b;
}

function flatten(value: unknown): string {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return "";
  }
}

export type PrivacyDecision = {
  sensitivity: Sensitivity;
  detected: Sensitivity[];
  detectorIds?: string[];
  externalAllowed: boolean;
  reason?: string;
};

export type InjectionDecision = {
  detected: boolean;
  detectorIds: string[];
};

export function classifyPrivacy(input: unknown, taskFloor: Sensitivity): PrivacyDecision {
  const text = flatten(input);
  let sensitivity = taskFloor;
  const detected: Sensitivity[] = [];
  const detectorIds: string[] = [];

  for (const detector of detectors) {
    detector.pattern.lastIndex = 0;
    if (detector.pattern.test(text)) {
      detected.push(detector.level);
      detectorIds.push(detector.id);
      sensitivity = higher(sensitivity, detector.level);
    }
  }

  if (sensitivity === "P4_RESTRICTED") {
    return {
      sensitivity,
      detected,
      detectorIds,
      externalAllowed: false,
      reason: "restricted_data_never_leaves_trusted_boundary",
    };
  }

  return { sensitivity, detected, detectorIds, externalAllowed: true };
}

export function detectPromptInjection(input: unknown): InjectionDecision {
  const text = flatten(input);
  const detectorIds = injectionPatterns
    .filter((detector) => detector.pattern.test(text))
    .map((detector) => detector.id);
  return { detected: detectorIds.length > 0, detectorIds };
}

export function redactSensitiveText(input: string, maxLevel: Sensitivity = "P1_INTERNAL"): string {
  let output = input;
  const maxRank = order.indexOf(maxLevel);
  for (const detector of detectors) {
    if (order.indexOf(detector.level) <= maxRank) continue;
    detector.pattern.lastIndex = 0;
    output = output.replace(detector.pattern, detector.replacement);
  }
  return output;
}

export type GuardrailAction =
  | "ALLOW"
  | "DENY"
  | "ALLOW_WITH_REDACTION"
  | "ALLOW_WITH_APPROVAL"
  | "DEGRADE_TO_LOCAL"
  | "QUEUE";

export function guardrailDecision(
  input: unknown,
  taskFloor: Sensitivity,
): {
  action: GuardrailAction;
  privacy: PrivacyDecision;
  injection: InjectionDecision;
} {
  const privacy = classifyPrivacy(input, taskFloor);
  const injection = detectPromptInjection(input);
  if (!privacy.externalAllowed) return { action: "DENY", privacy, injection };
  return { action: "ALLOW", privacy, injection };
}
