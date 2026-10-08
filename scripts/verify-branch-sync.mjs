/**
 * Our GitHub release process uses squash merges: SHAs differ even when every
 * tracked source file is identical. Compare immutable Git TREE hashes, not
 * commit IDs. Any real file divergence still blocks production certification.
 */
const repo=process.env.GITHUB_REPOSITORY;
if(!repo || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo))throw Error('GITHUB_REPOSITORY required');
const headers={Accept:'application/vnd.github+json','User-Agent':'NestAI-branch-sync'};
if(process.env.GITHUB_TOKEN)headers.Authorization='Bearer '+process.env.GITHUB_TOKEN;
async function getJson(path){
  const response=await fetch('https://api.github.com/repos/'+repo+'/'+path,{headers});
  if(!response.ok)throw Error(path+': HTTP '+response.status);
  return response.json();
}
async function ref(name){
  const result=await getJson('git/ref/heads/'+name);
  if(typeof result.object?.sha!=='string')throw Error('INVALID_BRANCH_SHA: '+name);
  const commit=await getJson('git/commits/'+encodeURIComponent(result.object.sha));
  const treeSha=commit.tree?.sha;
  if(!/^[a-f0-9]{40}$/.test(String(treeSha||'')))throw Error('INVALID_TREE_SHA: '+name);
  return {commitSha:result.object.sha,treeSha};
}
const [main,production]=await Promise.all([ref('main'),ref('production')]);
console.log(JSON.stringify({MAIN_SHA:main.commitSha,PRODUCTION_SHA:production.commitSha,
  MAIN_TREE:main.treeSha,PRODUCTION_TREE:production.treeSha}));
if(main.treeSha!==production.treeSha){
  console.error('❌ main/production source trees differ; release not synchronized');
  process.exit(1);
}
console.log('✅ main and production contain byte-identical tracked source trees');
