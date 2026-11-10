const fs=require('node:fs');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
const {ReleaseError,transaction,packageSite,command,wait,scrub}=require('./core.cjs');
const config=require('./targets.json');
const root=path.resolve(__dirname,'../..');
const sha=process.env.GITHUB_SHA;
const tag=`utilityshelf-${process.env.GITHUB_RUN_ID}-${process.env.GITHUB_RUN_ATTEMPT}`;
const report=path.join(root,'.github/release/report');fs.mkdirSync(report,{recursive:true});
const account='f5c84f030ee282992b5da87ff0a2bcc5';
const apiBase=`https://api.cloudflare.com/client/v4/accounts/${account}`;
const wrangler=path.join(__dirname,'node_modules/wrangler/bin/wrangler.js');
const sameVersions=(a,b)=>JSON.stringify([...a].sort((x,y)=>x.version_id.localeCompare(y.version_id)))===JSON.stringify([...b].sort((x,y)=>x.version_id.localeCompare(y.version_id)));
async function api(route,method='GET',body) {
  // A write is never blindly retried. transaction() inspects the current release first.
  for(let attempt=1;attempt<=3;attempt++) {
    try {
      const response=await fetch(apiBase+route,{method,redirect:'error',signal:AbortSignal.timeout(30000),headers:{Authorization:`Bearer ${process.env.CLOUDFLARE_API_TOKEN}`,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});
      if (!response.ok) throw new ReleaseError(`Cloudflare ${method} ${route}: HTTP ${response.status}`,response.status===429 || response.status>=500);
      const json=await response.json();
      if(!json.success) throw new ReleaseError('Cloudflare rejected '+route+': '+JSON.stringify(json.errors));
      return json.result;
    } catch(error) {
      const failure=error instanceof ReleaseError?error:new ReleaseError(error.message,true);
      if(method!=='GET' || !failure.transient || attempt===3) throw failure;
      await wait(attempt*5000);
    }
  }
}
async function smoke(target,expected) {
  const args=[path.join(__dirname,'smoke.cjs'),JSON.stringify(target),expected || ''];
  // Three observations allow CDN propagation, without repeating the deployment.
  let failure;
  for(let attempt=1;attempt<=3;attempt++) {
    try {await command(args,{cwd:root,timeout:45000});return;} catch(error){failure=error;}
    if(attempt<3) await wait(attempt*10000);
  }
  throw failure;
}
async function adapterFor(target,directory) {
  const pages=target.kind==='pages';
  const route=pages?`/pages/projects/${target.name}`:`/workers/scripts/${target.name}`;
  if(pages) {
    const project=await api(route);
    if(project.source?.config?.production_deployments_enabled!==false) throw new ReleaseError(`Disable direct Git production deployments for ${target.name} before activating this workflow.`);
    if(project.production_branch!=='main') throw new ReleaseError('Unexpected production branch');
  }
  const adapter={
    sha,
    async current() {
      if(pages) {
        const project=await api(route);const deployment=project.canonical_deployment;
        return deployment?{id:deployment.id,status:deployment.latest_stage?.status,metadata:deployment.deployment_trigger?.metadata}:null;
      }
      const deployments=(await api(route+'/deployments')).deployments;
      return deployments[0];
    },
    owns(value) {return pages?value?.metadata?.commit_hash===sha && value?.metadata?.commit_message===tag:value?.annotations?.['workers/message']===tag;},
    isRestored(value,before) {return pages?value?.id===before.id:sameVersions(value?.versions||[],before.versions);},
    health(expected){return smoke(target,expected);},
    async save(state){fs.writeFileSync(path.join(report,target.name+'.json'),JSON.stringify({...state,target:target.name,commit:sha},null,2));},
    async deploy(before) {
      const current=await this.current();
      if(current.id!==before.id) throw new ReleaseError('Production changed before upload.');
      if(pages) {
        let deployCwd = directory;
        if (target.pagesConfig) {
          const settings = JSON.parse(fs.readFileSync(path.join(root,target.pagesConfig),'utf8'));
          if (settings.name !== target.name) throw new ReleaseError('Pages configuration target mismatch');
          deployCwd = path.join(report,'config',target.name);
          fs.mkdirSync(deployCwd,{recursive:true});
          const file = path.join(deployCwd,'wrangler.jsonc');
          fs.writeFileSync(file,JSON.stringify({...settings,pages_build_output_dir:directory}));
        }
        let failure;
        try {await command([wrangler,'pages','deploy',directory,'--project-name',target.name,'--branch','main','--commit-hash',sha,'--commit-message',tag,'--commit-dirty=false'],{cwd:deployCwd});} catch(error){failure=error;}
        // Detect an accepted-but-pending deployment before considering a retry.
        for(let poll=0;poll<12;poll++) {
          const matches=(await api(route+'/deployments?env=production&per_page=25')).filter(d=>d.deployment_trigger?.metadata?.commit_message===tag);
          if(!matches.length) {if(failure) throw failure;throw new ReleaseError('No matching Pages deployment found');}
          if(matches.some(d=>!['success','failure','canceled'].includes(d.latest_stage?.status))) {
            if(poll===11) throw new ReleaseError('Pages deployment is still pending. Refusing a duplicate retry.');
            await wait(10000);continue;
          }
          if(matches.some(d=>d.latest_stage?.status==='success')) return;
          throw failure || new ReleaseError('Pages reported a failed deployment. Inspect the deployment logs.');
        }
      } else {
        const workerConfig=path.join(report,'worker-config.json');
        fs.writeFileSync(workerConfig,JSON.stringify({name:target.name,account_id:account,compatibility_date:'2026-06-05',assets:{directory,not_found_handling:'none'}}));
        const output=await command([wrangler,'versions','upload','--config',workerConfig,'--message',tag,'--tag',sha.slice(0,12),'--keep-vars'],{cwd:root});
        const version=output.match(/Worker Version ID:\s*([a-f0-9-]{36})/i)?.[1];
        if(!version) throw new ReleaseError('Uploaded version identifier could not be read. Production was not changed.');
        if((await this.current()).id!==before.id) throw new ReleaseError('Production changed during upload. Uploaded version left inactive.');
        await api(route+'/deployments','POST',{strategy:'percentage',versions:[{version_id:version,percentage:100}],annotations:{'workers/message':tag}});
      }
    },
    async rollback(before) {
      if(pages) await api(route+`/deployments/${before.id}/rollback`,'POST',{});
      else await api(route+'/deployments','POST',{strategy:'percentage',versions:before.versions,annotations:{'workers/message':`Recovery for ${tag}`}});
    }
  };
  return adapter;
}
async function main() {
  if(process.env.GITHUB_REF!=='refs/heads/main' || !/^[a-f0-9]{40}$/.test(sha||'')) throw new Error('Production releases must use a main-branch commit.');
  if(!process.env.CLOUDFLARE_API_TOKEN) throw new Error('CLOUDFLARE_API_TOKEN is not configured.');
  if(process.env.GIT_DEPLOYMENTS_DISABLED!=='true') throw new Error('Direct Cloudflare Git deployment cutover has not been confirmed.');
  if(execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim()!==sha) throw new Error('Checkout differs from tested commit.');
  const remote=execFileSync('git',['ls-remote','origin','refs/heads/main'],{cwd:root,encoding:'utf8'}).split(/\s/)[0];
  if(remote!==sha) {console.log('A newer main commit exists. Skipping this stale release.');return;}
  // Authentication check is required before any Wrangler upload.
  await command([wrangler,'whoami'],{cwd:root,timeout:30000});
  for(const target of config.targets) {
    const {directory,count}=packageSite(root,target,sha,path.join(report,'assets'));
    console.log(`Releasing ${target.name}, ${count} public files, commit ${sha}`);
    await transaction(await adapterFor(target,directory));
  }
}
main().catch(error=>{
  const message=scrub(error.stack||error.message);
  fs.writeFileSync(path.join(report,'failure.txt'),message+'\n');
  if(process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,'## Release stopped\n\n'+scrub(error.message)+'\n\nSee the release-report artifact.\n');
  console.error(message);process.exitCode=1;
});
