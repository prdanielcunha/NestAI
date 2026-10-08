import type { EvalTarget } from "./index.js";
import { classifyPrivacy } from "../../privacy-firewall/src/index.js";

export type SanitizedEvalInput = {
  targetId?: string;
  sanitized?: boolean;
  sensitivity?: "P0_PUBLIC" | "P1_INTERNAL" | "P2_PERSONAL" | "P3_SENSITIVE" | "P4_RESTRICTED";
  prompt?: string;
  texts?: string[];
  query?: string;
  contexts?: string[];
};

export function assertFreeSyntheticEvalInput(target: EvalTarget, body: SanitizedEvalInput): void {
  if (body.sanitized !== true) throw new Error("EVAL_TARGET_REQUIRES_SANITIZED_INPUT");
  if (body.sensitivity !== "P0_PUBLIC" && body.sensitivity !== "P1_INTERNAL") {
    throw new Error("EVAL_TARGET_SENSITIVITY_DENIED");
  }
  // Gemini Free Tier data may be used for model improvement; only PUBLIC fixtures.
  if (target.provider === "gemini" && body.sensitivity !== "P0_PUBLIC") {
    throw new Error("EVAL_GEMINI_PUBLIC_ONLY");
  }
  const relevant = target.kind === "text_model"
    ? [body.prompt]
    : target.kind === "embedding_model"
      ? body.texts
      : [body.query, ...(body.contexts ?? [])];
  if (!Array.isArray(relevant) || relevant.length === 0 ||
      relevant.some(value => typeof value !== "string" || !value.trim() || value.length > 1500) ||
      relevant.length > 8) {
    throw new Error("EVAL_FIXTURE_SIZE_INVALID");
  }
  const detected = classifyPrivacy(relevant, body.sensitivity);
  if (detected.sensitivity === "P2_PERSONAL" ||
      detected.sensitivity === "P3_SENSITIVE" ||
      detected.sensitivity === "P4_RESTRICTED") {
    throw new Error("EVAL_FIXTURE_PRIVATE_CONTENT_DENIED");
  }
}
