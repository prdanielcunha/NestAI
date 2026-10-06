export type AppManifest = {
  appId: string;
  displayName: string;
  allowedTasks: string[];
  defaultLocale: "pt-BR" | "en" | "es";
  enabled: boolean;
};

export function validateManifest(manifest: AppManifest): void {
  if (!/^[a-z][a-z0-9-]{1,31}$/.test(manifest.appId)) throw new Error("APP_MANIFEST_INVALID_ID");
  if (manifest.allowedTasks.length === 0) throw new Error("APP_MANIFEST_NO_TASKS");
  if (new Set(manifest.allowedTasks).size !== manifest.allowedTasks.length) throw new Error("APP_MANIFEST_DUPLICATE_TASK");
}

export const ecosystemApps: AppManifest[] = [
  { appId: "connect", displayName: "MillionsNest Connect", allowedTasks: ["connect.reply.suggest"], defaultLocale: "pt-BR", enabled: true },
  { appId: "nestfinance", displayName: "NestFinance", allowedTasks: ["finance.receipt.extract"], defaultLocale: "pt-BR", enabled: true },
  { appId: "nestlume", displayName: "NestLume", allowedTasks: ["nestlume.study.answer"], defaultLocale: "pt-BR", enabled: true },
  { appId: "nestaffiliate", displayName: "NestAffiliate", allowedTasks: ["affiliate.pin.copy"], defaultLocale: "pt-BR", enabled: true },
];
