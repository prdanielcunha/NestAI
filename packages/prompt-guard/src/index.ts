import { detectPromptInjection } from "../../privacy-firewall/src/index.js";

export type PromptGuardVerdict = "benign" | "malicious" | "uncertain";
export type PromptGuardAction = "ALLOW" | "QUARANTINE" | "REVIEW";

export type PromptGuardSegmentResult = {
  index: number;
  verdict: PromptGuardVerdict;
  source: "deterministic" | "model" | "model_error";
  code?: string;
};

export type PromptGuardDecision = {
  verdict: PromptGuardVerdict;
  action: PromptGuardAction;
  segments: PromptGuardSegmentResult[];
  detectorIds: string[];
};

export function segmentPromptGuardText(
  text: string,
  options: { maxChars?: number; overlapChars?: number } = {},
): string[] {
  const maxChars = Math.max(200, Math.min(1400, options.maxChars ?? 1000));
  const overlap = Math.max(0, Math.min(Math.floor(maxChars / 4), options.overlapChars ?? 100));
  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (!normalized) return [""];
  const output: string[] = [];
  let start = 0;
  while (start < normalized.length) {
    const end = Math.min(normalized.length, start + maxChars);
    output.push(normalized.slice(start, end));
    if (end >= normalized.length) break;
    start = Math.max(start + 1, end - overlap);
  }
  return output;
}

export async function scanPromptInjection(args: {
  text: string;
  classify: (segment: string, index: number) => Promise<"LABEL_0" | "LABEL_1">;
  untrustedExternalContent?: boolean;
}): Promise<PromptGuardDecision> {
  const deterministic = detectPromptInjection(args.text);
  if (deterministic.detected) {
    return {
      verdict: "malicious",
      action: "QUARANTINE",
      detectorIds: deterministic.detectorIds,
      segments: [{
        index: 0,
        verdict: "malicious",
        source: "deterministic",
        code: "PROMPT_GUARD_DETERMINISTIC_MATCH",
      }],
    };
  }

  const segments = segmentPromptGuardText(args.text);
  const results: PromptGuardSegmentResult[] = [];
  let sawUncertain = false;

  for (let index = 0; index < segments.length; index += 1) {
    try {
      const label = await args.classify(segments[index]!, index);
      const verdict: PromptGuardVerdict = label === "LABEL_1" ? "malicious" : "benign";
      results.push({ index, verdict, source: "model" });
      if (verdict === "malicious") {
        return {
          verdict: "malicious",
          action: "QUARANTINE",
          detectorIds: [],
          segments: results,
        };
      }
    } catch {
      sawUncertain = true;
      results.push({
        index,
        verdict: "uncertain",
        source: "model_error",
        code: "PROMPT_GUARD_CLASSIFIER_UNAVAILABLE",
      });
    }
  }

  if (sawUncertain) {
    return {
      verdict: "uncertain",
      action: args.untrustedExternalContent ? "QUARANTINE" : "REVIEW",
      detectorIds: [],
      segments: results,
    };
  }

  return {
    verdict: "benign",
    action: "ALLOW",
    detectorIds: [],
    segments: results,
  };
}
