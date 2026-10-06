import type { Sensitivity } from "../../contracts/src/index.js";

const order: Sensitivity[] = [
  "P0_PUBLIC",
  "P1_INTERNAL",
  "P2_PERSONAL",
  "P3_SENSITIVE",
  "P4_RESTRICTED",
];

const detectors: Array<{ level: Sensitivity; pattern: RegExp }> = [
  { level: "P4_RESTRICTED", pattern: /(?:password|senha|private[_ -]?key|api[_ -]?key|secret[_ -]?key)\s*[:=]/i },
  { level: "P3_SENSITIVE", pattern: /\b(?:\d{3}\.\d{3}\.\d{3}-\d{2}|\d{11})\b/ },
  { level: "P3_SENSITIVE", pattern: /\b(?:cart[aã]o|credit card|cvv|bank account|conta banc[aá]ria)\b/i },
  { level: "P2_PERSONAL", pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i },
  { level: "P2_PERSONAL", pattern: /(?:\+?55\s*)?(?:\(?\d{2}\)?\s*)?9?\d{4}[-\s]?\d{4}/ },
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
  externalAllowed: boolean;
  reason?: string;
};

export function classifyPrivacy(input: unknown, taskFloor: Sensitivity): PrivacyDecision {
  const text = flatten(input);
  let sensitivity = taskFloor;
  const detected: Sensitivity[] = [];

  for (const detector of detectors) {
    if (detector.pattern.test(text)) {
      detected.push(detector.level);
      sensitivity = higher(sensitivity, detector.level);
    }
  }

  if (sensitivity === "P4_RESTRICTED") {
    return {
      sensitivity,
      detected,
      externalAllowed: false,
      reason: "restricted_data_never_leaves_trusted_boundary",
    };
  }

  return { sensitivity, detected, externalAllowed: true };
}
