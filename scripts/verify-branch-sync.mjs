const repo=process.env.GITHUB_REPOSITORY;
if(!repo) throw new Error("GITHUB_REPOSITORY required");
const headers={Accept:"application/vnd.github+json","User-Agent":"NestAI-branch-sync"};
if(process.env.GITHUB_TOKEN) headers.Authorization=`Bearer ${process.env.GITHUB_TOKEN}`;
const get=async branch=>{const r=await fetch(`https://api.github.com/repos/${repo}/git/ref/heads/${branch}`,{headers});if(!r.ok) throw new Error(`${branch}: ${r.status}`);return (await r.json()).object.sha};
const [main,production]=await Promise.all([get("main"),get("production")]);
console.log({MAIN_SHA:main,PRODUCTION_SHA:production});
if(main!==production){console.error("❌ main != production");process.exit(1)}
console.log("✅ main == production");
