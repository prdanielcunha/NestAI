import { describe, expect, it } from "vitest";
import { getTask } from "../packages/task-registry/src/index.js";
import { buildTaskPrompt } from "../packages/prompt-registry/src/index.js";
import { getStructuredContract, validateStructuredText } from "../packages/structured-output/src/index.js";

const validStrategy = {
  productType: "Cadeira de escritório",
  buyerIntent: "Encontrar um assento para organizar o espaço de trabalho em casa",
  audience: "Pessoas montando um home office",
  positioning: "Mostrar como integrar a cadeira ao ambiente de trabalho",
  factsUsed: ["Cadeira de escritório rosa"],
  unknowns: ["Dimensões não confirmadas"],
  angles: ["Ideias para home office", "Organização da mesa", "Inspiração para trabalhar em casa"],
  titles: [
    "Cadeira de escritório rosa para compor o home office",
    "Home office com cadeira rosa: ideias para organizar",
    "Como escolher uma cadeira para o seu espaço de trabalho",
  ],
  descriptions: [
    "Buscando inspiração para montar um home office? Veja a cadeira de escritório rosa e confira as fotos e as medidas informadas no anúncio antes de comprar. Conteúdo com link de afiliado.",
    "Uma cadeira de escritório pode compor um cantinho de trabalho organizado. Avalie o formato, compare as imagens e confirme os detalhes do produto no anúncio. Conteúdo com link de afiliado.",
  ],
  keywords: ["cadeira de escritório", "home office", "espaço de trabalho", "cadeira rosa", "decoração escritório"],
  recommendedBoard: "Ideias para Home Office",
  headline: "Inspiração para seu home office",
  cta: "Ver detalhes",
};

describe("affiliate.pin.strategy integration contract", () => {
  it("registers a public, free-tier-compatible NestAffiliate AI task", () => {
    const task = getTask("affiliate.pin.strategy");
    expect(task.app).toBe("nestaffiliate");
    expect(task.defaultSensitivity).toBe("P0_PUBLIC");
    expect(task.allowedProviders).toEqual(expect.arrayContaining(["cloudflare", "groq"]));
    expect(task.priority).toBe("interactive");
  });
  it("provides grounded prompts in PT/EN/ES and a strict output contract", () => {
    const contract = getStructuredContract("affiliate.pin.strategy");
    expect(contract).not.toBeNull();
    for (const locale of ["pt-BR", "en", "es"] as const) {
      const prompt = buildTaskPrompt({
        taskId: "affiliate.pin.strategy", locale,
        input: { product: { title: "Cadeira de escritório rosa", observableAttributes: [] } },
      });
      expect(prompt.messages[0]!.content).toContain("productType");
      expect(prompt.messages[0]!.content).toContain("descriptions");
    }
  });
  it("accepts complete, reviewable copy without writing commercial facts", () => {
    expect(validateStructuredText("affiliate.pin.strategy", JSON.stringify(validStrategy))).toMatchObject(validStrategy);
  });
  it("rejects incomplete options and invalid text sizes", () => {
    expect(() => validateStructuredText("affiliate.pin.strategy",
      JSON.stringify({ ...validStrategy, titles: validStrategy.titles.slice(0, 2) }))).toThrow("OUTPUT_SCHEMA_VALIDATION_FAILED");
    expect(() => validateStructuredText("affiliate.pin.strategy",
      JSON.stringify({ ...validStrategy, descriptions: ["short", validStrategy.descriptions[1]] }))).toThrow("OUTPUT_SCHEMA_VALIDATION_FAILED");
  });
});
