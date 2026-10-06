import { describe, expect, it } from "vitest";
import { filterTenantDocuments } from "../../packages/rag/src/index.js";

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
