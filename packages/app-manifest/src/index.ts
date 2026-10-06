import { z } from "zod";

export const MillionsNestAppManifest = z.object({
  schemaVersion: z.literal(1),
  appId: z.string().regex(/^[a-z][a-z0-9-]{1,31}$/),
  name: z.string().min(2).max(80),
  ai: z.object({
    enabled: z.boolean(),
    tasks: z.array(z.string().regex(/^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/)).min(1).max(100),
    defaultSensitivity: z.enum(["P0_PUBLIC","P1_INTERNAL","P2_PERSONAL","P3_SENSITIVE","P4_RESTRICTED"]),
  }),
  locales: z.array(z.enum(["pt-BR","en","es"])).min(1).default(["pt-BR","en","es"]),
  owner: z.object({
    repository: z.string().regex(/^prdanielcunha\/[A-Za-z0-9_.-]+$/),
  }),
});

export type MillionsNestAppManifestType = z.infer<typeof MillionsNestAppManifest>;

export function validateAppManifest(input: unknown): MillionsNestAppManifestType {
  return MillionsNestAppManifest.parse(input);
}

export function assertManifestTaskOwnership(manifest: MillionsNestAppManifestType): void {
  for (const task of manifest.ai.tasks) {
    const prefix = task.split(".")[0];
    if (!prefix) throw new Error("APP_MANIFEST_TASK_INVALID");
    const namespaceAliases: Record<string, string[]> = {
      millionsnest: ["hub"],
      connect: ["connect"],
      nestlocal: ["nestlocal"],
      nestjourney: ["journey"],
      nestfinance: ["finance"],
      musicscale: ["musicscale"],
      nestlume: ["nestlume"],
      nestaffiliate: ["affiliate"],
    };
    const acceptedPrefixes = new Set([
      manifest.appId,
      ...(namespaceAliases[manifest.appId] ?? []),
    ]);
    if (!acceptedPrefixes.has(prefix) && !(manifest.appId === "connect" && prefix === "connect")) {
      throw new Error("APP_MANIFEST_TASK_NAMESPACE_MISMATCH");
    }
  }
}


export async function persistAppManifest(
  db: import("../../usage-ledger/src/index.js").D1DatabaseLike,
  manifest: MillionsNestAppManifestType,
  source: { ref?: string; sha?: string },
  now = new Date(),
): Promise<void> {
  const timestamp = now.toISOString();
  await db.prepare(
    "INSERT INTO cp_app_manifests(" +
    "app_id, repository, manifest_version, manifest_json, registration_source, " +
    "source_ref, source_sha, registered_at, updated_at" +
    ") VALUES (?1, ?2, ?3, ?4, 'github_oidc', ?5, ?6, ?7, ?7) " +
    "ON CONFLICT(app_id) DO UPDATE SET " +
    "repository = excluded.repository, " +
    "manifest_version = excluded.manifest_version, " +
    "manifest_json = excluded.manifest_json, " +
    "registration_source = excluded.registration_source, " +
    "source_ref = excluded.source_ref, " +
    "source_sha = excluded.source_sha, " +
    "updated_at = excluded.updated_at"
  ).bind(
    manifest.appId,
    manifest.owner.repository,
    manifest.schemaVersion,
    JSON.stringify(manifest),
    source.ref ?? null,
    source.sha ?? null,
    timestamp,
  ).run();

  await db.prepare(
    "INSERT INTO cp_apps(app_id, display_name, default_locale, enabled, manifest_version, updated_at) " +
    "VALUES (?1, ?2, ?3, ?4, ?5, ?6) " +
    "ON CONFLICT(app_id) DO UPDATE SET " +
    "display_name = excluded.display_name, " +
    "default_locale = excluded.default_locale, " +
    "enabled = excluded.enabled, " +
    "manifest_version = excluded.manifest_version, " +
    "updated_at = excluded.updated_at"
  ).bind(
    manifest.appId,
    manifest.name,
    manifest.locales[0] ?? "pt-BR",
    manifest.ai.enabled ? 1 : 0,
    manifest.schemaVersion,
    timestamp,
  ).run();
}
