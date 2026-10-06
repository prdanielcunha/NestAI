import { describe, expect, it } from "vitest";
import { filterTenantDocuments, queryKnowledge, upsertKnowledge } from "../../packages/rag/src/index.js";

describe("RAG tenant firewall", () => {
  const docs = [
    { id: "a", organizationId: "org-1", appId: "nestlume", sensitivity: "P1_INTERNAL" as const, text: "allowed", source: "doc-a" },
    { id: "b", organizationId: "org-2", appId: "nestlume", sensitivity: "P1_INTERNAL" as const, text: "other tenant", source: "doc-b" },
    { id: "c", organizationId: "org-1", appId: "nestfinance", sensitivity: "P1_INTERNAL" as const, text: "other app", source: "doc-c" },
    { id: "d", organizationId: "org-1", appId: "nestlume", sensitivity: "P3_SENSITIVE" as const, text: "too sensitive", source: "doc-d" },
  ];

  it("never crosses tenant app or sensitivity boundaries", () => {
    const result = filterTenantDocuments(docs, {
      organizationId: "org-1",
      appId: "nestlume",
      maxSensitivity: "P1_INTERNAL",
      query: "anything",
    });
    expect(result.map((item) => item.id)).toEqual(["a"]);
  });
});


describe("Vectorize RAG defense in depth", () => {
  it("re-checks tenant/app/locale after Vectorize returns matches", async () => {
    const vectorize = {
      upsert: async () => ({}),
      query: async () => ({
        matches: [
          { id: "good:0", score: 0.95, metadata: { sourceId: "good", appId: "nestlume", organizationHash: await import("../../packages/rag/src/index.js").then((m) => m.ragOrganizationHash("org-1")), sensitivity: "P1_INTERNAL", locale: "pt-BR", text: "ok" } },
          { id: "bad:0", score: 0.99, metadata: { sourceId: "bad", appId: "nestlume", organizationHash: "foreign", sensitivity: "P1_INTERNAL", locale: "pt-BR", text: "leak" } },
        ],
      }),
    };
    const result = await queryKnowledge({
      vectorize,
      appId: "nestlume",
      organizationId: "org-1",
      maxSensitivity: "P1_INTERNAL",
      locale: "pt-BR",
      queryVector: [0.1, 0.2],
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.text).toBe("ok");
  });

  it("refuses P4 ingestion before embedding", async () => {
    let embedded = false;
    await expect(upsertKnowledge({
      vectorize: { upsert: async () => ({}), query: async () => ({ matches: [] }) },
      sourceId: "restricted",
      appId: "nestlume",
      organizationId: "org-1",
      sensitivity: "P4_RESTRICTED",
      locale: "pt-BR",
      text: "restricted",
      embed: async () => { embedded = true; return [[0.1]]; },
    })).rejects.toThrow("RAG_RESTRICTED_DATA_DENIED");
    expect(embedded).toBe(false);
  });
});
