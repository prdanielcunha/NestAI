import { describe, expect, it } from "vitest";
import { buildTaskPrompt } from "../../packages/prompt-registry/src/index.js";

function system(taskId: string): string {
  return buildTaskPrompt({ taskId, locale: "pt-BR", input: { smoke: true } }).messages[0]?.content ?? "";
}

describe("NestFinance canonical prompt safety", () => {
  it("forbids deriving free-form category totals", () => {
    const prompt = system("finance.count.freeform.extract");
    expect(prompt).toContain("Não some linhas");
    expect(prompt).toContain("não derive totais");
    expect(prompt).toContain("não classifique número sem rótulo");
    expect(prompt).toContain("Zero só quando explicitamente escrito");
  });

  it("keeps financial document extraction non-authoritative and evidence-bound", () => {
    const prompt = system("finance.document.transaction.extract");
    expect(prompt).toContain("nunca cria, publica ou aprova transação");
    expect(prompt).toContain("Não invente CNPJ");
    expect(prompt).toContain("category_id só pode usar ID presente em context.categories");
    expect(prompt).toContain("Preserve papéis de issuer/recipient/payer/payee");
  });

  it("keeps denomination extraction arithmetic-free", () => {
    const prompt = system("finance.count.denominations.extract");
    expect(prompt).toContain("não multiplique pela denominação");
    expect(prompt).toContain("não calcule subtotal");
    expect(prompt).toContain("não reconcilie");
  });
});
