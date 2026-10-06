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
    const acceptedPrefixes = new Set([
      manifest.appId,
      manifest.appId.replace(/^millionsnest-/, ""),
      manifest.appId.replace(/^nest/, "nest"),
    ]);
    if (!acceptedPrefixes.has(prefix) && !(manifest.appId === "connect" && prefix === "connect")) {
      throw new Error("APP_MANIFEST_TASK_NAMESPACE_MISMATCH");
    }
  }
}
