const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const origin='https://filename-cleaner.utilityshelf.site';
const worker=import('data:text/javascript;base64,'+fs.readFileSync(path.resolve(__dirname,'../../../tools/filename-cleaner/_worker.js')).toString('base64')).then(m=>m.default);
const event={event:'copy',mode:'numbered',source:'custom'};
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
