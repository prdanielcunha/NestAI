import type { Sensitivity } from "../../contracts/src/index.js";
import type { D1DatabaseLike } from "../../usage-ledger/src/index.js";

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

export type EvidenceRef = {
  sourceId: string;
  chunkId: string;
  title?: string;
  locator?: string;
  score: number;
};

export interface VectorizeLike {
  upsert(vectors: Array<{ id: string; values: number[]; metadata?: Record<string, unknown> }>): Promise<unknown>;
  query(
    vector: number[],
    options: { topK: number; returnMetadata: "all" | "indexed" | "none" | boolean; filter?: Record<string, unknown> },
  ): Promise<{ matches?: Array<{ id: string; score: number; metadata?: Record<string, unknown> }> }>;
}

const rank: Sensitivity[] = ["P0_PUBLIC","P1_INTERNAL","P2_PERSONAL","P3_SENSITIVE","P4_RESTRICTED"];

function sensitivityRank(value: Sensitivity): number { return rank.indexOf(value); }

export function filterTenantDocuments(documents: RagDocument[], query: RagQuery): RagDocument[] {
  return documents
    .filter((doc) => doc.organizationId === query.organizationId)
    .filter((doc) => doc.appId === query.appId)
    .filter((doc) => sensitivityRank(doc.sensitivity) <= sensitivityRank(query.maxSensitivity))
    .slice(0, query.limit ?? 8);
}

export function buildGroundedContext(documents: RagDocument[]): string {
  return documents.map((doc, index) => "[source:" + (index + 1) + " id=" + doc.id + " origin=" + doc.source + "]\n" + doc.text).join("\n\n");
}

export async function ragOrganizationHash(organizationId: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(organizationId));
  return Array.from(new Uint8Array(bytes)).map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 24);
}

export async function ragScopedSourceId(organizationId: string, appId: string, sourceId: string): Promise<string> {
  const input = JSON.stringify([organizationId, appId, sourceId]);
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  const digest = Array.from(new Uint8Array(bytes)).map((b) => b.toString(16).padStart(2, "0")).join("");
  return "src-" + digest.slice(0, 48);
}

export function chunkText(text: string, options: { maxChars?: number; overlapChars?: number } = {}): string[] {
  const maxChars = Math.max(300, options.maxChars ?? 1600);
  const overlap = Math.min(Math.floor(maxChars / 3), Math.max(0, options.overlapChars ?? 200));
  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (!normalized) return [];
  const result: string[] = [];
  let start = 0;
  while (start < normalized.length) {
    let end = Math.min(normalized.length, start + maxChars);
    if (end < normalized.length) {
      const lineBoundary = normalized.lastIndexOf("\n", end);
      const sentenceBoundary = normalized.lastIndexOf(". ", end);
      const best = Math.max(lineBoundary, sentenceBoundary);
      if (best > start + Math.floor(maxChars * 0.55)) end = best + 1;
    }
    const chunk = normalized.slice(start, end).trim();
    if (chunk) result.push(chunk);
    if (end >= normalized.length) break;
    start = Math.max(start + 1, end - overlap);
  }
  return result;
}

export async function upsertKnowledge(args: {
  vectorize: VectorizeLike; sourceId: string; appId: string; organizationId: string;
  sensitivity: Sensitivity; locale: "pt-BR" | "en" | "es"; title?: string; locatorPrefix?: string;
  text: string; embed: (texts: string[]) => Promise<number[][]>;
}): Promise<{ chunks: number }> {
  if (args.sensitivity === "P4_RESTRICTED") throw new Error("RAG_RESTRICTED_DATA_DENIED");
  const chunks = chunkText(args.text);
  if (chunks.length === 0) throw new Error("RAG_SOURCE_EMPTY");
  if (chunks.length > 500) throw new Error("RAG_SOURCE_TOO_LARGE");
  const orgHash = await ragOrganizationHash(args.organizationId);
  const scopedId = await ragScopedSourceId(args.organizationId, args.appId, args.sourceId);
  const embeddings = await args.embed(chunks);
  if (embeddings.length !== chunks.length) throw new Error("RAG_EMBEDDING_COUNT_MISMATCH");
  await args.vectorize.upsert(chunks.map((text, index) => ({
    id: scopedId + ":" + index,
    values: embeddings[index]!,
    metadata: {
      sourceId: args.sourceId, appId: args.appId, organizationHash: orgHash, sensitivity: args.sensitivity, locale: args.locale,
      ...(args.title ? { title: args.title } : {}),
      ...(args.locatorPrefix ? { locator: args.locatorPrefix + "#chunk-" + index } : {}),
      text,
    },
  })));
  return { chunks: chunks.length };
}

export async function queryKnowledge(args: {
  vectorize: VectorizeLike; appId: string; organizationId: string; maxSensitivity: Sensitivity;
  locale: "pt-BR" | "en" | "es"; queryVector: number[]; topK?: number;
}): Promise<Array<{ text: string; evidence: EvidenceRef; sensitivity: Sensitivity }>> {
  const orgHash = await ragOrganizationHash(args.organizationId);
  const response = await args.vectorize.query(args.queryVector, {
    topK: Math.min(20, Math.max(1, args.topK ?? 8)),
    returnMetadata: "all",
    filter: { appId: { $eq: args.appId }, organizationHash: { $eq: orgHash }, locale: { $eq: args.locale } },
  });
  const output: Array<{ text: string; evidence: EvidenceRef; sensitivity: Sensitivity }> = [];
  for (const match of response.matches ?? []) {
    const metadata = match.metadata ?? {};
    const sensitivity = metadata.sensitivity as Sensitivity;
    if (!sensitivity || sensitivityRank(sensitivity) > sensitivityRank(args.maxSensitivity)) continue;
    if (metadata.appId !== args.appId || metadata.organizationHash !== orgHash || metadata.locale !== args.locale) continue;
    if (typeof metadata.text !== "string" || typeof metadata.sourceId !== "string") continue;
    output.push({
      text: metadata.text, sensitivity,
      evidence: { sourceId: metadata.sourceId, chunkId: match.id,
        ...(typeof metadata.title === "string" ? { title: metadata.title } : {}),
        ...(typeof metadata.locator === "string" ? { locator: metadata.locator } : {}),
        score: match.score },
    });
  }
  return output;
}

export async function persistKnowledgeSource(
  db: D1DatabaseLike,
  args: { sourceId: string; appId: string; organizationId: string; sensitivity: Sensitivity; locale: "pt-BR" | "en" | "es"; status: string; chunks: number; metadata?: Record<string, unknown> },
  now = new Date(),
): Promise<void> {
  const orgHash = await ragOrganizationHash(args.organizationId);
  const scopedId = await ragScopedSourceId(args.organizationId, args.appId, args.sourceId);
  await db.prepare(
    "INSERT INTO cp_knowledge_sources(source_id,app_id,organization_id_hash,sensitivity,locale,status,metadata_json,updated_at) " +
    "VALUES (?1,?2,?3,?4,?5,?6,?7,?8) " +
    "ON CONFLICT(source_id) DO UPDATE SET status=excluded.status,metadata_json=excluded.metadata_json,updated_at=excluded.updated_at"
  ).bind(scopedId,args.appId,orgHash,args.sensitivity,args.locale,args.status,JSON.stringify({ originalSourceId: args.sourceId, chunks: args.chunks, ...(args.metadata ?? {}) }),now.toISOString()).run();
  await db.prepare(
    "INSERT INTO cp_knowledge_indexes(index_id,source_id,version,status,chunks,metadata_json,updated_at) " +
    "VALUES (?1,?2,1,?3,?4,?5,?6) " +
    "ON CONFLICT(index_id) DO UPDATE SET version=version+1,status=excluded.status,chunks=excluded.chunks,metadata_json=excluded.metadata_json,updated_at=excluded.updated_at"
  ).bind(scopedId + ":index",scopedId,args.status,args.chunks,JSON.stringify({ vectorDimensions: 768 }),now.toISOString()).run();
}
