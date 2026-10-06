import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

function wrangler(args) {
  return execFileSync("pnpm", ["wrangler", ...args], {
    encoding: "utf8",
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function listDatabases() {
  const raw = wrangler(["d1", "list", "--json"]);
  return JSON.parse(raw);
}

let databases = listDatabases();
let db = databases.find((item) => item.name === "nestai");

if (!db) {
  console.log("D1 nestai not found; creating it.");
  wrangler(["d1", "create", "nestai"]);
  databases = listDatabases();
  db = databases.find((item) => item.name === "nestai");
}

if (!db?.uuid) throw new Error("D1_PROVISION_FAILED_NO_UUID");

const configPath = "wrangler.jsonc";
const config = JSON.parse(readFileSync(configPath, "utf8"));
config.d1_databases = [{
  binding: "DB",
  database_name: "nestai",
  database_id: db.uuid,
  migrations_dir: "migrations"
}];
writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n");

console.log("D1 nestai resolved and wrangler config updated.");
wrangler(["d1", "migrations", "apply", "nestai", "--remote", "--yes"]);
const info = JSON.parse(wrangler(["d1", "info", "nestai", "--json"]));
console.log(JSON.stringify({ name: info.name ?? "nestai", uuid: db.uuid, migrationApplied: true }));
