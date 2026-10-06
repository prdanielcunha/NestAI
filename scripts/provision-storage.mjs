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

let kvItems=listArray(json(["kv","namespace","list","--json"]));
let kv=kvItems.find((x)=>x.title==="nestai-cache" || x.name==="nestai-cache");
if(!kv){
  wrangler(["kv","namespace","create","nestai-cache"]);
  kvItems=listArray(json(["kv","namespace","list","--json"]));
  kv=kvItems.find((x)=>x.title==="nestai-cache" || x.name==="nestai-cache");
}
const kvId=kv?.id ?? kv?.namespace_id;
if(!kvId) throw new Error("NESTAI_KV_ID_NOT_FOUND");
config.kv_namespaces=[{binding:"CACHE",id:kvId}];

let queues=listArray(json(["queues","list","--json"]));
for(const name of ["nestai-jobs","nestai-jobs-dlq"]){
  if(!queues.some((x)=>x.name===name || x.queue_name===name)){
    wrangler(["queues","create",name]);
    queues=listArray(json(["queues","list","--json"]));
  }
}
config.queues={
  producers:[{binding:"JOBS",queue:"nestai-jobs"}],
  consumers:[{
    queue:"nestai-jobs",
    max_batch_size:10,
    max_batch_timeout:5,
    max_retries:3,
    dead_letter_queue:"nestai-jobs-dlq"
  }]
};

let indexes=listArray(json(["vectorize","list","--json"]));
if(!indexes.some((x)=>x.name==="nestai-knowledge")){
  wrangler(["vectorize","create","nestai-knowledge","--dimensions=768","--metric=cosine"]);
  indexes=listArray(json(["vectorize","list","--json"]));
}
if(!indexes.some((x)=>x.name==="nestai-knowledge")) throw new Error("NESTAI_VECTORIZE_NOT_FOUND");
config.vectorize=[{binding:"VECTORIZE",index_name:"nestai-knowledge"}];

let buckets=listArray(json(["r2","bucket","list","--json"]));
if(!buckets.some((x)=>x.name==="nestai-knowledge")){
  wrangler(["r2","bucket","create","nestai-knowledge"]);
  buckets=listArray(json(["r2","bucket","list","--json"]));
}
if(!buckets.some((x)=>x.name==="nestai-knowledge")) throw new Error("NESTAI_R2_BUCKET_NOT_FOUND");
config.r2_buckets=[{binding:"KNOWLEDGE_BUCKET",bucket_name:"nestai-knowledge"}];

config.vars={
  ...config.vars,
  AI_CACHE_ENABLED:"true",
  AI_JOBS_ENABLED:"true",
  AI_VECTORIZE_ENABLED:"true",
  AI_R2_WRITES_ENABLED:"false"
};

writeFileSync(configPath,JSON.stringify(config,null,2)+"\n");
console.log(JSON.stringify({
  kv:"ready",
  queues:"ready",
  vectorize:"ready",
  r2:"provisioned_write_locked",
}));
