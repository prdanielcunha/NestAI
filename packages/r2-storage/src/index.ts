import type { D1DatabaseLike } from "../../usage-ledger/src/index.js";

export type R2Priority = "background" | "interactive" | "critical";
export type R2QuotaHealth = "HEALTHY" | "WATCH" | "CONSERVE" | "CRITICAL" | "EXHAUSTED";
export type R2OperationClass = "A" | "B";

export const R2_FREE_TIER = {
  storageBytes: 10_000_000_000,
  classAOps: 1_000_000,
  classBOps: 10_000_000,
} as const;

export const R2_SAFETY = {
  warnFraction: 0.50,
  conserveFraction: 0.60,
  blockFraction: 0.70,
  hardLockFraction: 0.80,
} as const;

export type R2UsageSnapshot = {
  month: string;
  storageBytes: number;
  classAOps: number;
  classBOps: number;
  storageFraction: number;
  classAFraction: number;
  classBFraction: number;
  highestFraction: number;
  health: R2QuotaHealth;
};

export type R2StoredObject = {
  key: string;
  size: number;
};

export interface R2BucketLike {
  put(key: string, value: string | ArrayBuffer | ArrayBufferView | Blob | ReadableStream, options?: unknown): Promise<R2StoredObject | null>;
  get(key: string, options?: unknown): Promise<unknown>;
  head(key: string): Promise<R2StoredObject | null>;
  delete(key: string | string[]): Promise<void>;
  list(options?: unknown): Promise<unknown>;
}

function utcMonth(now = new Date()): string {
  return now.toISOString().slice(0, 7);
}

function usageHealth(fraction: number): R2QuotaHealth {
  if (fraction >= R2_SAFETY.hardLockFraction) return "EXHAUSTED";
  if (fraction >= R2_SAFETY.blockFraction) return "CRITICAL";
  if (fraction >= R2_SAFETY.conserveFraction) return "CONSERVE";
  if (fraction >= R2_SAFETY.warnFraction) return "WATCH";
  return "HEALTHY";
}

export async function getR2Usage(db: D1DatabaseLike, now = new Date()): Promise<R2UsageSnapshot> {
  const month = utcMonth(now);
  const row = await db.prepare(
    "SELECT storage_bytes,class_a_ops,class_b_ops FROM r2_usage_monthly WHERE month=?1"
  ).bind(month).first<{ storage_bytes: number; class_a_ops: number; class_b_ops: number }>();
  const storageBytes = Number(row?.storage_bytes ?? 0);
  const classAOps = Number(row?.class_a_ops ?? 0);
  const classBOps = Number(row?.class_b_ops ?? 0);
  const storageFraction = storageBytes / R2_FREE_TIER.storageBytes;
  const classAFraction = classAOps / R2_FREE_TIER.classAOps;
  const classBFraction = classBOps / R2_FREE_TIER.classBOps;
  const highestFraction = Math.max(storageFraction, classAFraction, classBFraction);
  return {
    month,
    storageBytes,
    classAOps,
    classBOps,
    storageFraction,
    classAFraction,
    classBFraction,
    highestFraction,
    health: usageHealth(highestFraction),
  };
}

function allowedFraction(priority: R2Priority): number {
  if (priority === "background") return R2_SAFETY.conserveFraction;
  if (priority === "interactive") return R2_SAFETY.blockFraction;
  return R2_SAFETY.hardLockFraction;
}

export function assertR2Capacity(
  snapshot: R2UsageSnapshot,
  reservation: { storageBytes?: number; classAOps?: number; classBOps?: number },
  priority: R2Priority,
): void {
  const storage = (snapshot.storageBytes + Math.max(0, reservation.storageBytes ?? 0)) / R2_FREE_TIER.storageBytes;
  const classA = (snapshot.classAOps + Math.max(0, reservation.classAOps ?? 0)) / R2_FREE_TIER.classAOps;
  const classB = (snapshot.classBOps + Math.max(0, reservation.classBOps ?? 0)) / R2_FREE_TIER.classBOps;
  const projected = Math.max(storage, classA, classB);
  const hard = R2_SAFETY.hardLockFraction;
  if (projected >= hard) throw new Error("R2_HARD_LOCK");
  if (projected >= allowedFraction(priority)) {
    if (priority === "background") throw new Error("R2_CONSERVE_BLOCK");
    if (priority === "interactive") throw new Error("R2_PREBILL_BLOCK");
    throw new Error("R2_HARD_LOCK");
  }
}

async function reserve(
  db: D1DatabaseLike,
  change: { storageBytes?: number; classAOps?: number; classBOps?: number },
  priority: R2Priority,
  now = new Date(),
): Promise<R2UsageSnapshot> {
  const snapshot = await getR2Usage(db, now);
  assertR2Capacity(snapshot, change, priority);
  await db.prepare(
    `INSERT INTO r2_usage_monthly(month,storage_bytes,class_a_ops,class_b_ops,updated_at)
     VALUES (?1,?2,?3,?4,?5)
     ON CONFLICT(month) DO UPDATE SET
       storage_bytes = MAX(0, storage_bytes + excluded.storage_bytes),
       class_a_ops = MAX(0, class_a_ops + excluded.class_a_ops),
       class_b_ops = MAX(0, class_b_ops + excluded.class_b_ops),
       updated_at = excluded.updated_at`
  ).bind(
    snapshot.month,
    change.storageBytes ?? 0,
    change.classAOps ?? 0,
    change.classBOps ?? 0,
    now.toISOString(),
  ).run();
  return getR2Usage(db, now);
}

async function trackedObjectSize(db: D1DatabaseLike, key: string, now = new Date()): Promise<number> {
  const row = await db.prepare("SELECT size_bytes,expires_at FROM r2_objects WHERE object_key=?1")
    .bind(key).first<{ size_bytes: number; expires_at: string | null }>();
  if (!row) return 0;
  if (row.expires_at && Date.parse(row.expires_at) <= now.getTime()) return 0;
  return Number(row.size_bytes ?? 0);
}

export async function putR2Object(
  bucket: R2BucketLike,
  db: D1DatabaseLike,
  args: {
    key: string;
    value: string | ArrayBuffer | ArrayBufferView | Blob | ReadableStream;
    sizeBytes: number;
    category: "knowledge" | "temporary" | "job" | "artifact" | "eval";
    priority?: R2Priority;
    expiresAt?: string;
    options?: unknown;
  },
  now = new Date(),
): Promise<R2StoredObject> {
  if (!Number.isFinite(args.sizeBytes) || args.sizeBytes < 0) throw new Error("R2_INVALID_SIZE");
  const previousSize = await trackedObjectSize(db, args.key, now);
  const delta = Math.max(0, Math.floor(args.sizeBytes) - previousSize);
  await reserve(db, { storageBytes: delta, classAOps: 1 }, args.priority ?? "background", now);
  const stored = await bucket.put(args.key, args.value, args.options);
  if (!stored) throw new Error("R2_PUT_FAILED");
  await db.prepare(
    `INSERT INTO r2_objects(object_key,size_bytes,category,expires_at,updated_at)
     VALUES (?1,?2,?3,?4,?5)
     ON CONFLICT(object_key) DO UPDATE SET
       size_bytes=excluded.size_bytes,
       category=excluded.category,
       expires_at=excluded.expires_at,
       updated_at=excluded.updated_at`
  ).bind(args.key, Math.floor(args.sizeBytes), args.category, args.expiresAt ?? null, now.toISOString()).run();
  if (previousSize > args.sizeBytes) {
    await db.prepare(
      "UPDATE r2_usage_monthly SET storage_bytes=MAX(0,storage_bytes-?1),updated_at=?2 WHERE month=?3"
    ).bind(previousSize - args.sizeBytes, now.toISOString(), utcMonth(now)).run();
  }
  return stored;
}

export async function getR2Object(
  bucket: R2BucketLike,
  db: D1DatabaseLike,
  key: string,
  priority: R2Priority = "interactive",
  options?: unknown,
  now = new Date(),
): Promise<unknown> {
  await reserve(db, { classBOps: 1 }, priority, now);
  return bucket.get(key, options);
}

export async function headR2Object(
  bucket: R2BucketLike,
  db: D1DatabaseLike,
  key: string,
  priority: R2Priority = "background",
  now = new Date(),
): Promise<R2StoredObject | null> {
  await reserve(db, { classBOps: 1 }, priority, now);
  return bucket.head(key);
}

export async function listR2Objects(
  bucket: R2BucketLike,
  db: D1DatabaseLike,
  options?: unknown,
  priority: R2Priority = "background",
  now = new Date(),
): Promise<unknown> {
  await reserve(db, { classAOps: 1 }, priority, now);
  return bucket.list(options);
}

export async function deleteR2Object(
  bucket: R2BucketLike,
  db: D1DatabaseLike,
  key: string,
  priority: R2Priority = "background",
  now = new Date(),
): Promise<void> {
  const previousSize = await trackedObjectSize(db, key, now);
  await reserve(db, { classAOps: 1 }, priority, now);
  await bucket.delete(key);
  await db.prepare("DELETE FROM r2_objects WHERE object_key=?1").bind(key).run();
  if (previousSize > 0) {
    await db.prepare(
      "UPDATE r2_usage_monthly SET storage_bytes=MAX(0,storage_bytes-?1),updated_at=?2 WHERE month=?3"
    ).bind(previousSize, now.toISOString(), utcMonth(now)).run();
  }
}

export function r2Utf8Size(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}


export async function reconcileR2Inventory(
  bucket: R2BucketLike,
  db: D1DatabaseLike,
  now = new Date(),
): Promise<{ objects: number; storageBytes: number; listCalls: number; health: R2QuotaHealth }> {
  let cursor: string | undefined;
  let storageBytes = 0;
  let objects = 0;
  let listCalls = 0;

  do {
    // Reconciliation is safety-critical: it may run in conserve mode to correct
    // lifecycle deletions, but it still hard-locks before 80% of Class A quota.
    await reserve(db, { classAOps: 1 }, "critical", now);
    const response = await bucket.list({ limit: 1000, ...(cursor ? { cursor } : {}) }) as {
      objects?: Array<{ key?: string; size?: number }>;
      truncated?: boolean;
      cursor?: string;
    };
    listCalls += 1;
    for (const object of response.objects ?? []) {
      storageBytes += Math.max(0, Number(object.size ?? 0));
      objects += 1;
    }
    cursor = response.truncated && response.cursor ? response.cursor : undefined;
  } while (cursor);

  const month = utcMonth(now);
  await db.prepare(
    `INSERT INTO r2_usage_monthly(month,storage_bytes,class_a_ops,class_b_ops,updated_at)
     VALUES (?1,?2,0,0,?3)
     ON CONFLICT(month) DO UPDATE SET storage_bytes=excluded.storage_bytes,updated_at=excluded.updated_at`
  ).bind(month, storageBytes, now.toISOString()).run();

  const snapshot = await getR2Usage(db, now);
  return { objects, storageBytes, listCalls, health: snapshot.health };
}
