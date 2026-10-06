import type { D1DatabaseLike } from "../../usage-ledger/src/index.js";

export type JobStatus = "queued" | "running" | "succeeded" | "failed" | "dead_lettered";

export type JobEnvelope<T = unknown> = {
  id: string;
  organizationId: string;
  appId: string;
  task: string;
  payload: T;
  locale: "pt-BR" | "en" | "es";
  createdAt: string;
  attempt: number;
};

export type JobRecord = {
  jobId: string;
  appId: string;
  taskId: string;
  status: JobStatus;
  attempt: number;
  createdAt: string;
  updatedAt: string;
  metadata: Record<string, unknown>;
};

export interface QueueLike<T = unknown> {
  send(message: T, options?: { delaySeconds?: number }): Promise<void>;
}

export async function jobOrganizationHash(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 24);
}

export function createJob<T>(
  input: Omit<JobEnvelope<T>, "id" | "createdAt" | "attempt">,
): JobEnvelope<T> {
  return {
    ...input,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    attempt: 0,
  };
}

export function nextAttempt<T>(job: JobEnvelope<T>): JobEnvelope<T> {
  if (job.attempt >= 4) throw new Error("JOB_MAX_ATTEMPTS");
  return { ...job, attempt: job.attempt + 1 };
}

export async function persistQueuedJob(
  db: D1DatabaseLike,
  job: JobEnvelope,
): Promise<void> {
  const orgHash = await jobOrganizationHash(job.organizationId);
  const metadata = {
    locale: job.locale,
    payloadStored: false,
  };
  await db.prepare(
    "INSERT INTO cp_jobs(job_id,app_id,organization_id_hash,task_id,status,attempt,metadata_json,created_at,updated_at) " +
    "VALUES (?1,?2,?3,?4,'queued',?5,?6,?7,?7)"
  ).bind(
    job.id,
    job.appId,
    orgHash,
    job.task,
    job.attempt,
    JSON.stringify(metadata),
    job.createdAt,
  ).run();
}

export async function updateJobStatus(
  db: D1DatabaseLike,
  jobId: string,
  status: JobStatus,
  attempt: number,
  metadata: Record<string, unknown> = {},
  now = new Date(),
): Promise<void> {
  await db.prepare(
    "UPDATE cp_jobs SET status=?1,attempt=?2,metadata_json=?3,updated_at=?4 WHERE job_id=?5"
  ).bind(status, attempt, JSON.stringify(metadata), now.toISOString(), jobId).run();
}

export async function getJob(
  db: D1DatabaseLike,
  jobId: string,
): Promise<JobRecord | null> {
  const row = await db.prepare(
    "SELECT job_id,app_id,task_id,status,attempt,metadata_json,created_at,updated_at FROM cp_jobs WHERE job_id=?1"
  ).bind(jobId).first<{
    job_id: string;
    app_id: string;
    task_id: string;
    status: JobStatus;
    attempt: number;
    metadata_json: string;
    created_at: string;
    updated_at: string;
  }>();
  if (!row) return null;
  return {
    jobId: row.job_id,
    appId: row.app_id,
    taskId: row.task_id,
    status: row.status,
    attempt: row.attempt,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    metadata: JSON.parse(row.metadata_json) as Record<string, unknown>,
  };
}

export async function enqueueJob<T>(
  queue: QueueLike<JobEnvelope<T>>,
  db: D1DatabaseLike,
  job: JobEnvelope<T>,
): Promise<void> {
  await persistQueuedJob(db, job);
  try {
    await queue.send(job);
  } catch (error) {
    await updateJobStatus(db, job.id, "failed", job.attempt, {
      reason: "QUEUE_SEND_FAILED",
    });
    throw error;
  }
}

export function retryDelaySeconds(attempt: number): number {
  return Math.min(300, 2 ** Math.max(0, attempt) * 5);
}


export interface JobResultStore {
  get(key:string):Promise<string|null>;
  put(key:string,value:string,options?:{expirationTtl?:number}):Promise<void>;
  delete(key:string):Promise<void>;
}

async function jobResultKey(jobId:string,organizationId:string,appId:string):Promise<string>{
  const scope=await jobOrganizationHash(organizationId+"|"+appId);
  return "job-result:v1:"+scope+":"+jobId;
}

export async function putJobResult(
  store:JobResultStore,
  args:{jobId:string;organizationId:string;appId:string;result:unknown;ttlSeconds?:number},
):Promise<void>{
  const key=await jobResultKey(args.jobId,args.organizationId,args.appId);
  await store.put(key,JSON.stringify(args.result),{expirationTtl:Math.max(60,args.ttlSeconds??3600)});
}

export async function getJobResult<T>(
  store:JobResultStore,
  args:{jobId:string;organizationId:string;appId:string},
):Promise<T|null>{
  const key=await jobResultKey(args.jobId,args.organizationId,args.appId);
  const raw=await store.get(key);
  return raw?JSON.parse(raw) as T:null;
}


export async function getJobForScope(
  db:D1DatabaseLike,
  args:{jobId:string;organizationId:string;appId:string},
):Promise<JobRecord|null>{
  const orgHash=await jobOrganizationHash(args.organizationId);
  const row=await db.prepare(
    "SELECT job_id,app_id,task_id,status,attempt,metadata_json,created_at,updated_at FROM cp_jobs " +
    "WHERE job_id=?1 AND app_id=?2 AND organization_id_hash=?3"
  ).bind(args.jobId,args.appId,orgHash).first<{
    job_id:string;app_id:string;task_id:string;status:JobStatus;attempt:number;
    metadata_json:string;created_at:string;updated_at:string;
  }>();
  if(!row) return null;
  return {
    jobId:row.job_id,
    appId:row.app_id,
    taskId:row.task_id,
    status:row.status,
    attempt:row.attempt,
    createdAt:row.created_at,
    updatedAt:row.updated_at,
    metadata:JSON.parse(row.metadata_json) as Record<string,unknown>,
  };
}
