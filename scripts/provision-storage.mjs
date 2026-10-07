import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

function wrangler(args) {
  return execFileSync("pnpm", ["wrangler", ...args], {
    encoding:"utf8",
    env:process.env,
    stdio:["ignore","pipe","pipe"],
  });
}
function json(args) {
  const raw=wrangler(args);
  const start=Math.min(...["[","{"].map((c)=>{const i=raw.indexOf(c);return i<0?Number.MAX_SAFE_INTEGER:i;}));
  if(!Number.isFinite(start) || start===Number.MAX_SAFE_INTEGER) throw new Error("WRANGLER_JSON_NOT_FOUND:"+args.join(" "));
  return JSON.parse(raw.slice(start));
}
function listArray(value) {
  if(Array.isArray(value)) return value;
  for(const key of ["result","namespaces","queues","indexes","buckets"]) if(Array.isArray(value?.[key])) return value[key];
  return [];
}

const configPath="wrangler.jsonc";
const config=JSON.parse(readFileSync(configPath,"utf8"));

let kvItems=listArray(json(["kv","namespace","list"]));
let kv=kvItems.find((x)=>x.title==="nestai-cache" || x.name==="nestai-cache");
if(!kv){
  wrangler(["kv","namespace","create","nestai-cache"]);
  kvItems=listArray(json(["kv","namespace","list"]));
  kv=kvItems.find((x)=>x.title==="nestai-cache" || x.name==="nestai-cache");
}
const kvId=kv?.id ?? kv?.namespace_id;
if(!kvId) throw new Error("NESTAI_KV_ID_NOT_FOUND");
config.kv_namespaces=[{binding:"CACHE",id:kvId}];

function createIfMissing(args, label) {
  try {
    wrangler(args);
    console.log(label+"_CREATED=true");
  } catch (error) {
    const stderr=String(error?.stderr??"");
    const stdout=String(error?.stdout??"");
    if (/already exists|already been taken|already taken|is already taken|duplicate/i.test(stderr+"\n"+stdout)) {
      console.log(label+"_REUSED=true");
      return;
    }
    throw error;
  }
}

for(const name of ["nestai-jobs","nestai-jobs-dlq"]){
  createIfMissing(["queues","create",name],"QUEUE_"+name.toUpperCase().replaceAll("-","_"));
}
config.queues={
  producers:[{binding:"JOBS",queue:"nestai-jobs"},{binding:"JOBS_DLQ",queue:"nestai-jobs-dlq"}],
  consumers:[{
    queue:"nestai-jobs",
    max_batch_size:10,
    max_batch_timeout:5,
    max_retries:3,
    dead_letter_queue:"nestai-jobs-dlq"
  }]
};

// Retry provisioning after Cloudflare API token permission upgrades.
// RAG remains fail-closed until index discovery confirms the resource.
let vectorizeReady=false;
try {
  let indexes=listArray(json(["vectorize","list","--json"]));
  if(!indexes.some((x)=>x.name==="nestai-knowledge")){
    wrangler(["vectorize","create","nestai-knowledge","--dimensions=768","--metric=cosine","--json"]);
    indexes=listArray(json(["vectorize","list","--json"]));
  }
  if(indexes.some((x)=>x.name==="nestai-knowledge")){
    config.vectorize=[{binding:"VECTORIZE",index_name:"nestai-knowledge"}];
    vectorizeReady=true;
  }
} catch (error) {
  const detail=String(error?.stderr??error?.message??error);
  console.warn("NESTAI_VECTORIZE_BLOCKED="+detail.split("\n")[0]);
  delete config.vectorize;
}

let r2Ready=false;
try {
  createIfMissing(["r2","bucket","create","nestai-knowledge"],"R2_NESTAI_KNOWLEDGE");
  config.r2_buckets=[{binding:"KNOWLEDGE_BUCKET",bucket_name:"nestai-knowledge"}];
  r2Ready=true;
} catch (error) {
  const detail=String(error?.stderr??error?.message??error);
  const diagnostic = detail.replace(/\/accounts\/[a-f0-9]{32}/gi, "/accounts/***").replace(/Bearer\s+\S+/gi, "Bearer ***").slice(0, 1200);
  console.warn("NESTAI_R2_DIAGNOSTIC=" + diagnostic);
  console.warn("NESTAI_R2_BLOCKED=true");
  delete config.r2_buckets;
}

config.vars={
  ...config.vars,
  AI_CACHE_ENABLED:"true",
  AI_JOBS_ENABLED:"true",
  AI_VECTORIZE_ENABLED:vectorizeReady?"true":"false",
  AI_R2_WRITES_ENABLED:"false"
};

writeFileSync(configPath,JSON.stringify(config,null,2)+"\n");
console.log(JSON.stringify({
  kv:"ready",
  queues:"ready",
  vectorize:vectorizeReady?"ready":"blocked_permission",
  r2:r2Ready?"provisioned_write_locked":"blocked_permission",
}));
