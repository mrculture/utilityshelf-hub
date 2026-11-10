const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const origin='https://filename-cleaner.utilityshelf.site';
const worker=import('data:text/javascript;base64,'+fs.readFileSync(path.resolve(__dirname,'../../../tools/filename-cleaner/_worker.js')).toString('base64')).then(m=>m.default);
const event={event:'copy',mode:'numbered',source:'custom'};
test('standalone CSV tracker matches the shared tracker',()=>{
 const root=path.resolve(__dirname,'../../..');
 assert.equal(fs.readFileSync(path.join(root,'tools/csv-import-checker/usage.js'),'utf8'),fs.readFileSync(path.join(root,'utilities/usage.js'),'utf8'));
});
function request(body=event,headers={},url=origin+'/usage') {
 return new Request(url,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',...headers},body:typeof body==='string'?body:JSON.stringify(body)});
}
test('collector persists only fixed labels and count, with no network identifiers',async()=>{
 const points=[];const env={USAGE:{writeDataPoint:p=>points.push(p)}};
 const response=await (await worker).fetch(request(),env);
 assert.equal(response.status,204);
 assert.deepEqual(points,[{indexes:['filename-cleaner'],blobs:['copy','numbered','custom'],doubles:[1]}]);
});
test('collector rejects extra fields, arbitrary strings, cross-origin and oversized payloads',async()=>{
 let writes=0;const env={USAGE:{writeDataPoint:()=>writes++}};
 for(const req of [request({...event,filename:'private.jpg'}),request({...event,source:'secret'}),request(null),request('bad json'),request(event,{Origin:'https://other.example'}),request(event,{},'https://preview.pages.dev/usage'),request('x'.repeat(257)),request(event,{'Content-Type':'text/plain'})]) {
  assert.ok((await (await worker).fetch(req,env)).status>=400);
 }
 assert.equal(writes,0);
});
test('health is non-writing, missing binding fails, and privacy signals skip collection',async()=>{
 let writes=0;const env={USAGE:{writeDataPoint:()=>writes++}};
 const w=await worker;
 assert.equal((await w.fetch(new Request(origin+'/usage'),env)).status,200);
 assert.equal((await w.fetch(new Request(origin+'/usage'),{})).status,503);
 assert.equal((await w.fetch(request(),{})).status,503);
 for(const header of ['DNT','Sec-GPC'])assert.equal((await w.fetch(request(event,{[header]:'1'}),env)).status,204);
 assert.equal(writes,0);
});

test('image events allow exact hub CORS and fixed tool/action/mode combinations only',async()=>{
 const points=[],env={USAGE:{writeDataPoint:p=>points.push(p)}};
 const w=await worker,hub='https://utilityshelf.site';
 const image={tool:'image-dimension-checker',event:'ebay_preset',mode:'ebay',source:'custom'};
 const preflight=new Request(origin+'/usage',{method:'OPTIONS',headers:{Origin:hub,'Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'content-type'}});
 const pre=await w.fetch(preflight,env);assert.equal(pre.status,204);assert.equal(pre.headers.get('Access-Control-Allow-Origin'),hub);assert.equal(points.length,0);
 for(const data of [image,{...image,event:'check_complete',mode:'custom'},{tool:'image-contact-sheet',event:'reorder',mode:'sheet',source:'sample'},{tool:'image-contact-sheet',event:'sheet_download',mode:'sheet',source:'custom'},{tool:'image-contact-sheet',event:'names_copy',mode:'sheet',source:'custom'}]){
  const response=await w.fetch(request(data,{Origin:hub}),env);
  assert.equal(response.status,204);assert.equal(response.headers.get('Access-Control-Allow-Origin'),hub);
 }
 assert.equal((await w.fetch(request({...event,event:'mapping_download'}),env)).status,204);
 assert.equal(points.length,6);
 for(const data of [{...image,mode:'custom'},{...image,tool:'__proto__'},{...image,tool:null},{...image,tool:['image-dimension-checker']},{...image,event:['ebay_preset']},{...image,event:'toString'},{...image,filename:'secret.jpg'},{...image,tool:'filename-cleaner',event:'copy',mode:'clean'}])assert.ok((await w.fetch(request(data,{Origin:hub}),env)).status>=400);
 assert.equal((await w.fetch(request(image),env)).status,403);
 const blocked=await w.fetch(new Request(origin+'/usage',{method:'OPTIONS',headers:{Origin:'https://bad.example','Access-Control-Request-Method':'POST'}}),env);
 assert.equal(blocked.status,403);assert.equal(blocked.headers.get('Access-Control-Allow-Origin'),null);
 assert.equal(points.length,6);
});

test('CSV actions require the correct production origin and fixed payload schema',async()=>{
 const points=[],env={USAGE:{writeDataPoint:p=>points.push(p)}},w=await worker;
 const csv='https://csv-import-checker.utilityshelf.site',hub='https://utilityshelf.site';
 const cases=[['csv-import-checker','check_complete','issues',csv],['csv-import-checker','check_complete','passed',csv],['csv-import-checker','corrected_download','passed',csv],['csv-column-mapper','build_complete','mapped',hub],['csv-column-mapper','mapped_download','mapped',hub],['csv-formula-checker','scan_complete','clear',hub],['csv-formula-checker','scan_complete','warnings',hub]];
 for(const [tool,action,mode,from] of cases){
  const payload={tool,event:action,mode,source:'custom'};
  assert.equal((await w.fetch(request(payload,{Origin:from}),env)).status,204);
  assert.equal((await w.fetch(request(payload,{Origin:from===hub?csv:hub}),env)).status,403);
  assert.equal((await w.fetch(request({...payload,csv:'private'},{Origin:from}),env)).status,400);
 }
 assert.equal(points.length,cases.length);
 for(const [tool,from] of [['csv-import-checker',csv],['csv-formula-checker',hub]]){
  for(const mode of ['passed','issues','incomplete']){
   const payload={tool,event:'report_download',mode,source:'custom'};
   assert.equal((await w.fetch(request(payload,{Origin:from}),env)).status,204);
   assert.equal((await w.fetch(request(payload,{Origin:from===hub?csv:hub}),env)).status,403);
   assert.equal((await w.fetch(request({...payload,report:'private'},{Origin:from}),env)).status,400);
  }
  assert.equal((await w.fetch(request({tool,event:'report_download',mode:'unknown',source:'custom'},{Origin:from}),env)).status,400);
 }
 assert.equal(points.length,cases.length+6);
 const pre=await w.fetch(new Request(origin+'/usage',{method:'OPTIONS',headers:{Origin:csv,'Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'content-type'}}),env);
 assert.equal(pre.status,204);assert.equal(pre.headers.get('Access-Control-Allow-Origin'),csv);
 assert.equal(points.length,cases.length+6);
});

test('image report collector accepts preset labels only and rejects report contents or wrong origins',async()=>{
 const points=[],env={USAGE:{writeDataPoint:p=>points.push(p)}},w=await worker;
 for(const mode of ['custom','ebay']){
  const payload={tool:'image-dimension-checker',event:'report_download',mode,source:'custom'};
  assert.equal((await w.fetch(request(payload,{Origin:'https://utilityshelf.site'}),env)).status,204);
  assert.equal((await w.fetch(request(payload),env)).status,403);
  assert.equal((await w.fetch(request({...payload,filename:'photo.jpg'},{Origin:'https://utilityshelf.site'}),env)).status,400);
  assert.equal((await w.fetch(request({...payload,mode:'private size'},{Origin:'https://utilityshelf.site'}),env)).status,400);
 }
 assert.deepEqual(points.map(p=>p.blobs),[['report_download','custom','custom'],['report_download','ebay','custom']]);
});
