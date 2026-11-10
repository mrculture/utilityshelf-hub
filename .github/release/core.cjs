// A release is serialized by GitHub Actions. No repository edits or AI calls here.
const fs = require('node:fs');
const path = require('node:path');
const {execFileSync, spawn} = require('node:child_process');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
class ReleaseError extends Error {
  constructor(message, transient=false) { super(message); this.transient=transient; }
}
function transientLog(text) {
  if (/authentication|unauthorized|forbidden|permission|invalid config|syntax error/i.test(text)) return false;
  return /ETIMEDOUT|ECONNRESET|ENOTFOUND|EAI_AGAIN|fetch failed|timed out|timeout|\b429\b|\b50[0234]\b|\b52[0-7]\b/i.test(text);
}
function scrub(text) {
  for (const name of ['CLOUDFLARE_API_TOKEN','GH_TOKEN','GITHUB_TOKEN']) {
    if (process.env[name]) text=String(text).split(process.env[name]).join('[REDACTED]');
  }
  return text;
}
async function transaction(adapter, {sleep=wait, log=console.log}={}) {
  const before=await adapter.current();
  if (!before?.id) throw new ReleaseError('No previous production deployment. Refusing an unprotected release.');
  await adapter.health(null); // Do not publish over a pre-existing outage.
  await adapter.save({phase:'baseline', before});
  for (let attempt=1; attempt<=3; attempt++) {
    const latest=await adapter.current();
    if (latest.id!==before.id) throw new ReleaseError('Production changed outside this run. Stopping.');
    let failure;
    try { await adapter.deploy(before, attempt); } catch (error) { failure=error; }
    const after=await adapter.current(); // Reconcile a timeout before retrying a write.
    if (adapter.owns(after)) {
      await adapter.save({phase:'deployed', before, after, attempt});
      try {
        if (after.status && after.status!=='success') throw new ReleaseError('Deployment is not successful.');
        await adapter.health(adapter.sha);
        const confirmed=await adapter.current();
        if (confirmed.id!==after.id) throw new ReleaseError('Production changed during verification.');
        await adapter.save({phase:'verified', before, after, attempt});
        log('Release verified.');
        return;
      } catch (healthError) {
        const current=await adapter.current();
        if (current.id!==after.id) throw new ReleaseError('Verification failed, but another deployment is now active. No rollback performed.');
        await adapter.save({phase:'recovering', before, after, reason:healthError.message});
        let restored=false;
        for (let recovery=1; recovery<=3; recovery++) {
          const active=await adapter.current();
          if (adapter.isRestored(active,before)) { restored=true; break; }
          if (active.id!==after.id) throw new ReleaseError('Production changed before recovery. No rollback performed.');
          let rollbackError;
          try { await adapter.rollback(before); } catch (error) { rollbackError=error; }
          if (adapter.isRestored(await adapter.current(),before)) {restored=true; break;}
          if (!rollbackError?.transient || recovery===3) throw rollbackError || new ReleaseError('Could not verify rollback.');
          await sleep(recovery*10000);
        }
        if (!restored) throw new ReleaseError('Recovery could not be confirmed.');
        await adapter.health(null);
        await adapter.save({phase:'recovered', before, rejected:after, reason:healthError.message});
        throw new ReleaseError('New release failed verification. Previous release restored and checked.');
      }
    }
    if (after.id!==before.id) throw new ReleaseError('An unrelated deployment became active. No retry or rollback performed.');
    if (!failure) throw new ReleaseError('Upload returned success, but the expected release is not active.');
    if (!failure.transient || attempt===3) throw failure;
    log(`Temporary deployment error. Retry ${attempt} of 2 after ${attempt*15} seconds.`);
    await sleep(attempt*15000);
  }
}
function packageSite(root, target, sha, output) {
  if (!/^[a-f0-9]{40}$/.test(sha)) throw new Error('Expected a full commit SHA');
  const tracked=execFileSync('git',['ls-files','-z'],{cwd:root,encoding:'utf8'}).split('\0').filter(Boolean);
  const publicExtensions=new Set(['.html','.css','.js','.png','.jpg','.jpeg','.webp','.svg','.ico','.woff','.woff2','.txt','.xml','.json']);
  const prefix=target.source ? target.source.replace(/\/$/,'')+'/' : '';
  const directory=path.join(output,target.name); fs.mkdirSync(directory,{recursive:true});
  let count=0;
  for (const file of tracked) {
    if (!file.startsWith(prefix)) continue;
    const relative=file.slice(prefix.length);
    if (relative.split('/').some(part=>part.startsWith('.')) || relative.endsWith('.md')) continue;
    if (!prefix && relative.startsWith('tools/')) continue;
    const publicSample = !prefix && (/^guides\/samples\/supplier-inventory-(original|corrected)\.csv$/.test(relative) || relative === 'guides/samples/product-photo-practice-v1.zip');
    if (!publicSample && !publicExtensions.has(path.extname(relative)) && !['_headers','_redirects'].includes(relative)) continue;
    const source=path.join(root,file);
    if (fs.lstatSync(source).isSymbolicLink()) throw new Error('Symlink in public assets: '+file);
    const destination=path.join(directory,relative);
    fs.mkdirSync(path.dirname(destination),{recursive:true}); fs.copyFileSync(source,destination); count++;
  }
  if (!fs.existsSync(path.join(directory,'index.html'))) throw new Error('Missing packaged index.html');
  fs.writeFileSync(path.join(directory,'release.json'),JSON.stringify({commit:sha,target:target.name})+'\n');
  fs.appendFileSync(path.join(directory,'_headers'),'\n/release.json\n  Cache-Control: no-store\n');
  return {directory,count};
}
async function command(args, {cwd, timeout=240000}={}) {
  return new Promise((resolve,reject)=>{
    const child=spawn(process.execPath,args,{cwd,env:{...process.env,CI:'true',WRANGLER_SEND_METRICS:'false'},stdio:['ignore','pipe','pipe']});
    let output='',timedOut=false;
    child.stdout.on('data',d=>{output+=d});child.stderr.on('data',d=>{output+=d});
    const timer=setTimeout(()=>{timedOut=true;child.kill('SIGTERM')},timeout);
    child.on('error',error=>{clearTimeout(timer);reject(error)});
    child.on('close',code=>{
      clearTimeout(timer);
      const text=scrub(output);console.log(text);
      if (timedOut || code!==0) reject(new ReleaseError(timedOut?'Deployment command timed out':text.slice(-4000),timedOut || transientLog(text)));
      else resolve(text);
    });
  });
}
module.exports={ReleaseError,transaction,transientLog,scrub,packageSite,command,wait};
