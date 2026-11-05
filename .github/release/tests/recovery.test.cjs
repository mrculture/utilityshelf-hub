const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');const os=require('node:os');const path=require('node:path');
const {execFileSync}=require('node:child_process');
const {transaction,ReleaseError,transientLog,packageSite,scrub}=require('../core.cjs');
function fixture() {
 let active={id:'old'};
 const state={uploads:0,rollbacks:0,healthCalls:0,saved:[]};
 const adapter={sha:'a'.repeat(40),current:async()=>active,
  owns:value=>value?.owned===true,isRestored:(value,before)=>value.id===before.id,
  health:async()=>{state.healthCalls++},save:async value=>{state.saved.push(value)},
  deploy:async()=>{state.uploads++;active={id:'new',owned:true}},
  rollback:async()=>{state.rollbacks++;active={id:'old'}}};
 return {state,adapter,set:value=>{active=value},get:()=>active};
}
const options={sleep:async()=>{},log:()=>{}};
test('success verifies the activated release without rollback',async()=>{
 const f=fixture();await transaction(f.adapter,options);assert.equal(f.state.uploads,1);assert.equal(f.state.rollbacks,0);assert.equal(f.state.saved.at(-1).phase,'verified');
});
test('temporary failures stop after one attempt plus two retries',async()=>{
 const f=fixture();f.adapter.deploy=async()=>{f.state.uploads++;throw new ReleaseError('503',true)};
 await assert.rejects(transaction(f.adapter,options),/503/);assert.equal(f.state.uploads,3);assert.equal(f.get().id,'old');
});
test('authentication failure is not retried',async()=>{
 const f=fixture();f.adapter.deploy=async()=>{f.state.uploads++;throw new ReleaseError('403')};
 await assert.rejects(transaction(f.adapter,options),/403/);assert.equal(f.state.uploads,1);
});
test('a timeout after successful activation is reconciled without another deployment',async()=>{
 const f=fixture();f.adapter.deploy=async()=>{f.state.uploads++;f.set({id:'new',owned:true});throw new ReleaseError('timeout',true)};
 await transaction(f.adapter,options);assert.equal(f.state.uploads,1);assert.equal(f.state.saved.at(-1).phase,'verified');
});
test('failed new release restores baseline and remains a failed run',async()=>{
 const f=fixture();f.adapter.health=async expected=>{if(expected)throw Error('Wrong marker')};
 await assert.rejects(transaction(f.adapter,options),/Previous release restored/);assert.equal(f.get().id,'old');assert.equal(f.state.rollbacks,1);assert.equal(f.state.saved.at(-1).phase,'recovered');
});
test('another deployment during verification must never be rolled back',async()=>{
 const f=fixture();f.adapter.health=async expected=>{if(expected){f.set({id:'someone-else'});throw Error('Unhealthy')}};
 await assert.rejects(transaction(f.adapter,options),/another deployment/);assert.equal(f.state.rollbacks,0);
});
test('unrelated activation after an upload error stops without retry',async()=>{
 const f=fixture();f.adapter.deploy=async()=>{f.state.uploads++;f.set({id:'someone-else'});throw new ReleaseError('503',true)};
 await assert.rejects(transaction(f.adapter,options),/unrelated deployment/);assert.equal(f.state.uploads,1);assert.equal(f.state.rollbacks,0);
});
test('existing outage prevents any upload',async()=>{
 const f=fixture();f.adapter.health=async()=>{throw Error('Existing outage')};
 await assert.rejects(transaction(f.adapter,options),/Existing outage/);assert.equal(f.state.uploads,0);
});
test('missing baseline prevents any upload',async()=>{
 const f=fixture();f.set(null);await assert.rejects(transaction(f.adapter,options),/No previous/);assert.equal(f.state.uploads,0);
});
test('recovery reconciles a successful rollback with a lost response',async()=>{
 const f=fixture();f.adapter.health=async expected=>{if(expected)throw Error('Unhealthy')};
 f.adapter.rollback=async()=>{f.state.rollbacks++;f.set({id:'old'});throw new ReleaseError('timeout',true)};
 await assert.rejects(transaction(f.adapter,options),/Previous release restored/);assert.equal(f.state.rollbacks,1);
});
test('recovery retries are bounded',async()=>{
 const f=fixture();f.adapter.health=async expected=>{if(expected)throw Error('Unhealthy')};
 f.adapter.rollback=async()=>{f.state.rollbacks++;throw new ReleaseError('503',true)};
 await assert.rejects(transaction(f.adapter,options),/503/);assert.equal(f.state.rollbacks,3);
});
test('a failed recovery health check is not reported as restored and healthy',async()=>{
 const f=fixture();let healthCalls=0;f.adapter.health=async()=>{if(++healthCalls>1)throw Error('Still unhealthy')};
 await assert.rejects(transaction(f.adapter,options),/Still unhealthy/);assert.notEqual(f.state.saved.at(-1).phase,'recovered');
});
test('only transient deployment failures qualify for retries',()=>{
 for(const text of ['HTTP 503','ECONNRESET','timeout','HTTP 429'])assert.equal(transientLog(text),true);
 for(const text of ['HTTP 403','authentication error','syntax error','invalid config','permission denied 503'])assert.equal(transientLog(text),false);
});
test('credential text is redacted from errors',()=>{
 const old=process.env.CLOUDFLARE_API_TOKEN;process.env.CLOUDFLARE_API_TOKEN='test-token-only';
 try{assert.equal(scrub('Failed test-token-only'), 'Failed [REDACTED]')}finally{if(old===undefined)delete process.env.CLOUDFLARE_API_TOKEN;else process.env.CLOUDFLARE_API_TOKEN=old}
});
test('public packages exclude CI, credentials, untracked data and sibling tools',()=>{
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'utilityshelf-package-test-'));
 try {
  execFileSync('git',['init'],{cwd:temp,stdio:'ignore'});
  for(const file of ['index.html','styles.css','.env','.github/qa/package.json','README.md','tools/other/index.html','_headers','guides/guide.html']) {
   fs.mkdirSync(path.dirname(path.join(temp,file)),{recursive:true});fs.writeFileSync(path.join(temp,file),'fixture');
  }
  execFileSync('git',['add','.'],{cwd:temp});fs.writeFileSync(path.join(temp,'untracked.html'),'must not publish');
  const sha='a'.repeat(40),{directory}=packageSite(temp,{name:'hub',source:''},sha,path.join(temp,'out'));
  for(const file of ['index.html','styles.css','guides/guide.html','_headers','release.json'])assert.ok(fs.existsSync(path.join(directory,file)),file);
  for(const file of ['.env','.github/qa/package.json','README.md','tools/other/index.html','untracked.html'])assert.equal(fs.existsSync(path.join(directory,file)),false,file);
  assert.equal(JSON.parse(fs.readFileSync(path.join(directory,'release.json'))).commit,sha);
 } finally {
  const resolved=path.resolve(temp),parent=path.resolve(os.tmpdir())+path.sep;
  if(!resolved.startsWith(parent) || !path.basename(resolved).startsWith('utilityshelf-package-test-'))throw Error('Unsafe fixture cleanup path');
  fs.rmSync(resolved,{recursive:true,force:true});
 }
});
