import type { Sensitivity } from "../../contracts/src/index.js";

export type RagDocument = {
  id: string;
  organizationId: string;
  appId: string;
  sensitivity: Sensitivity;
  text: string;
  source: string;
};

export type RagQuery = {
  organizationId: string;
  appId: string;
  maxSensitivity: Sensitivity;
  query: string;
  limit?: number;
};

const rank: Sensitivity[] = ["P0_PUBLIC","P1_INTERNAL","P2_PERSONAL","P3_SENSITIVE","P4_RESTRICTED"];

export function filterTenantDocuments(documents: RagDocument[], query: RagQuery): RagDocument[] {
  return documents
    .filter((doc) => doc.organizationId === query.organizationId)
    .filter((doc) => doc.appId === query.appId)
    .filter((doc) => rank.indexOf(doc.sensitivity) <= rank.indexOf(query.maxSensitivity))
    .slice(0, query.limit ?? 8);
}

export function buildGroundedContext(documents: RagDocument[]): string {
  return documents.map((doc, index) => `[source:${index + 1} id=${doc.id} origin=${doc.source}]\n${doc.text}`).join("\n\n");
}
