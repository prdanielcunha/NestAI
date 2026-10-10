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
  { appId: "millionsnest", displayName: "MillionsNest Hub", allowedTasks: ["hub.operational.summary","hub.incident.explain"], defaultLocale: "pt-BR", enabled: true },
  { appId: "connect", displayName: "MillionsNest Connect", allowedTasks: ["connect.message.classify","connect.reply.suggest","connect.audio.transcribe"], defaultLocale: "pt-BR", enabled: true },
  { appId: "nestlocal", displayName: "NestLocal", allowedTasks: ["nestlocal.request.extract","nestlocal.quote.compose","nestlocal.followup.compose"], defaultLocale: "pt-BR", enabled: true },
  { appId: "nestjourney", displayName: "NestJourney", allowedTasks: ["journey.form.extract","journey.followup.summarize"], defaultLocale: "pt-BR", enabled: true },
  { appId: "nestfinance", displayName: "NestFinance", allowedTasks: [
    "finance.receipt.extract",
    "finance.report.explain",
    "finance.count.regions.extract",
    "finance.count.denominations.extract",
    "finance.count.freeform.extract",
    "finance.document.transaction.extract",
  ], defaultLocale: "pt-BR", enabled: true },
  { appId: "musicscale", displayName: "MusicScale", allowedTasks: [
    "musicscale.song.structure",
    "musicscale.team.message.compose",
    "musicscale.live.diagnostic.explain",
    "musicscale.live.song-match.assist",
    "musicscale.live.request.classify",
    "musicscale.live.search.interpret",
    "musicscale.live.metadata.normalize",
    "musicscale.live.post-service.summary",
    "musicscale.live.pre-service-risk.explain",
    "musicscale.chords.repair",
    "musicscale.song.import.enrich",
    "musicscale.song.suggest",
    "musicscale.setlist.analyze",
    "musicscale.release-note.generate",
  ], defaultLocale: "pt-BR", enabled: true },
  { appId: "nestlume", displayName: "NestLume", allowedTasks: ["nestlume.study.answer","nestlume.study.grounded","nestlume.entity.explain","nestlume.embedding.generate"], defaultLocale: "pt-BR", enabled: true },
  { appId: "nestaffiliate", displayName: "NestAffiliate", allowedTasks: ["affiliate.screenshot.extract","affiliate.product.analyze","affiliate.pin.copy","affiliate.creative.generate"], defaultLocale: "pt-BR", enabled: true },
];
