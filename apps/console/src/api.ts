import { createNestAiClient } from "@millionsnest/ai";
import { appCheckToken, firebaseIdToken } from "./firebase";

const ORG_SCOPE = "global";
const APP_ID = "nestai";

const client = createNestAiClient({
  appId: APP_ID,
  organizationId: ORG_SCOPE,
  locale: "pt-BR",
  getFirebaseIdToken: firebaseIdToken,
  getAppCheckToken: appCheckToken,
});

export type Health = {
  ok: boolean;
  state: "operational" | "degraded";
  service: string;
  billingMode: string;
  appCheck: string;
  layers: Record<string,string>;
  providers: Record<string,string>;
};

export async function health(): Promise<Health> {
  const response = await fetch("/v1/health", { headers: { accept: "application/json" } });
  if (!response.ok) throw new Error("HEALTH_HTTP_" + response.status);
  return response.json() as Promise<Health>;
}

async function adminFetch<T>(path:string):Promise<T> {
  const [token, appCheck] = await Promise.all([client.getAccessToken(), appCheckToken()]);
  const response = await fetch(path, {
    headers: {
      authorization: "Bearer " + token,
      "x-firebase-appcheck": appCheck,
      "x-millionsnest-app": APP_ID,
      "x-millionsnest-org": ORG_SCOPE,
      accept: "application/json",
    },
  });
  const body = await response.json() as T & {error?:string};
  if (!response.ok) throw new Error(body.error ?? "ADMIN_HTTP_" + response.status);
  return body;
}

export function overview() { return adminFetch<Record<string,unknown>>("/v1/admin/overview"); }
export function apps() { return adminFetch<{apps:Array<Record<string,unknown>>}>("/v1/admin/apps"); }
export function tasks() { return adminFetch<{tasks:Array<Record<string,unknown>>}>("/v1/admin/tasks"); }
export function providers() { return adminFetch<{providers:Array<Record<string,unknown>>}>("/v1/admin/providers"); }
export function policies() { return adminFetch<{policies:Record<string,unknown>}>("/v1/admin/policies"); }
export function audit() { return adminFetch<{events:Array<Record<string,unknown>>}>("/v1/admin/audit"); }

export { client };
