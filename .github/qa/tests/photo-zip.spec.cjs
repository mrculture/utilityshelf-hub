const {test,expect}=require('@playwright/test');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'../../../tools/filename-cleaner');
const origin='https://filename-cleaner.utilityshelf.site';
async function open(page,{testMode=true,missingWriter=false}={}){
 const events=[];
 await page.addInitScript(()=>Object.defineProperty(navigator,'webdriver',{value:false}));
 await page.route('**/*',route=>{
  const url=new URL(route.request().url());
  if(url.origin!==origin)return route.abort();
  if(url.pathname==='/usage'){events.push(JSON.parse(route.request().postData()));return route.fulfill({status:204});}
  const file=url.pathname==='/'?'index.html':url.pathname.slice(1);
  if(!['index.html','app.js','zip.js'].includes(file)||(missingWriter&&file==='zip.js'))return route.fulfill({status:404});
  return route.fulfill({body:fs.readFileSync(path.join(root,file)),contentType:file.endsWith('.js')?'text/javascript':'text/html'});
 });
 await page.goto(origin+(testMode?'/?test-mode=1':''));return events;
}
async function photo(page,name,color='#167644'){
 const base64=await page.evaluate(color=>{const c=document.createElement('canvas');c.width=32;c.height=24;const ctx=c.getContext('2d');ctx.fillStyle=color;ctx.fillRect(0,0,32,24);return c.toDataURL().split(',')[1];},color);
 return {name,mimeType:'image/png',buffer:Buffer.from(base64,'base64')};
}
async function prepare(page,files){
 await page.locator('#names').fill(files.map(f=>f.name).join('\n'));
 await page.locator('#mode').selectOption('numbered');await page.locator('#prefix').fill('PROD1');
 await page.locator('#photoFiles').setInputFiles([...files].reverse());
}
async function download(page){const pending=page.waitForEvent('download');await page.locator('#downloadZip').click();const d=await pending;expect(d.suggestedFilename()).toBe('renamed-photos.zip');return d.path();}
function inspect(file){
 const script='import zipfile,hashlib,json,sys\nwith zipfile.ZipFile(sys.argv[1]) as z:\n assert z.testzip() is None\n print(json.dumps({"names":z.namelist(),"hashes":{i.filename:hashlib.sha256(z.read(i)).hexdigest() for i in z.infolist()},"utf8":all(i.flag_bits & 2048 for i in z.infolist()),"mapping":z.read("filename-mapping.txt").decode("utf-8-sig")}))';
 return JSON.parse(execFileSync(process.platform==='win32'?'python':'python3',['-c',script,file],{encoding:'utf8'}));
}

test('ZIP matches exact originals irrespective of selection order and preserves bytes, Unicode, edits and mapping',async({page})=>{
 await open(page);const photos=[await photo(page,'First.PNG'),await photo(page,'Second.png','#884412')];await prepare(page,photos);
 await page.locator('#name-1').fill('café-001.PNG');
 const archive=inspect(await download(page));
 expect(archive.names).toEqual(['café-001.PNG','prod1-002.png','filename-mapping.txt']);expect(archive.utf8).toBe(true);
 for(const [i,name] of archive.names.slice(0,2).entries())expect(archive.hashes[name]).toBe(crypto.createHash('sha256').update(photos[i].buffer).digest('hex'));
 expect(archive.mapping).toContain('Original: First.PNG\r\nNew: café-001.PNG');expect(archive.mapping).toContain('Original: Second.png\r\nNew: prod1-002.png');
 const pending=page.waitForEvent('download');await page.locator('#downloadMapping').click();expect(fs.readFileSync(await(await pending).path(),'utf8').replace(/^\uFEFF/,'')).toBe(archive.mapping);
 await page.locator('#clearPhotos').click();await expect(page.locator('#downloadZip')).toBeDisabled();
});

test('missing, extra, repeated and case-ambiguous original files cannot be mismatched',async({page})=>{
 await open(page);const a=await photo(page,'a.png'),b=await photo(page,'b.png');await prepare(page,[a,b]);
 for(const files of [[a],[a,b,await photo(page,'extra.png')],[a,a],[a,{...b,name:'B.png'}]]){
  await page.locator('#photoFiles').setInputFiles(files);await expect(page.locator('#downloadZip')).toBeDisabled();
 }
 await prepare(page,[a,{...a,name:'A.png'}]);await expect(page.locator('#zipStatus')).toContainText('Ambiguous');
 await prepare(page,[a,a]);await expect(page.locator('#downloadZip')).toBeDisabled();
 await prepare(page,[a,b]);await expect(page.locator('#downloadZip')).toBeEnabled();
 for(const name of ['../escape.png','CON.png','prod1-002.png','different.jpg']){await page.locator('#name-1').fill(name);await expect(page.locator('#downloadZip')).toBeDisabled();}
});

test('empty, excessive, unsupported and disguised photos are blocked without a ZIP event',async({page})=>{
 const events=await open(page,{testMode:false});let downloads=0;page.on('download',()=>downloads++);
 const a=await photo(page,'a.png');await prepare(page,[{...a,buffer:Buffer.alloc(0)}]);await expect(page.locator('#zipStatus')).toContainText('contain data');
 await prepare(page,Array.from({length:31},(_,i)=>({...a,name:i+'.png'})));await expect(page.locator('#zipStatus')).toContainText('no more than 30');
 await prepare(page,[{...a,name:'not-a-photo.txt'}]);await expect(page.locator('#zipStatus')).toContainText('photos only');
 await prepare(page,[{...a,buffer:Buffer.from('not an image')}]);await page.locator('#downloadZip').click();await expect(page.locator('#zipStatus')).toContainText('does not match');
 expect(downloads).toBe(0);expect(events.filter(e=>e.event==='zip_download')).toEqual([]);
});

test('per-photo and combined byte limits prevent reading oversized selections',async({page})=>{
 await open(page);const a=await photo(page,'a.png');
 await page.evaluate(()=>{window.reportedPhotoSize=32000001;Object.defineProperty(File.prototype,'size',{get:()=>window.reportedPhotoSize});File.prototype.arrayBuffer=()=>{throw Error('Size guards must run before reading');};});
 await prepare(page,[a]);await expect(page.locator('#zipStatus')).toContainText('32 MB');
 await page.evaluate(()=>window.reportedPhotoSize=26000000);
 await prepare(page,Array.from({length:4},(_,i)=>({...a,name:i+'.png'})));await expect(page.locator('#zipStatus')).toContainText('100 MB');await expect(page.locator('#downloadZip')).toBeDisabled();
});

test('changing names or selected files cancels pending ZIPs and read failures never produce a stale download',async({page})=>{
 await open(page);let downloads=0;page.on('download',()=>downloads++);const a=await photo(page,'a.png');await prepare(page,[a]);
 await page.evaluate(()=>{const read=File.prototype.arrayBuffer;window.pendingReads=[];File.prototype.arrayBuffer=function(){return new Promise((resolve,reject)=>window.pendingReads.push({resolve:()=>read.call(this).then(resolve,reject),reject}));};});
 await page.locator('#downloadZip').click();await expect(page.locator('#downloadZip')).toBeDisabled();await page.locator('#prefix').fill('NEW');
 await page.evaluate(()=>window.pendingReads[0].resolve());await expect(page.locator('#zipStatus')).toContainText('Ready to download');expect(downloads).toBe(0);
 await page.locator('#downloadZip').click();await page.locator('#clearPhotos').click();await page.evaluate(()=>window.pendingReads[1].resolve());await expect(page.locator('#downloadZip')).toBeDisabled();expect(downloads).toBe(0);
 await page.locator('#photoFiles').setInputFiles(a);await page.locator('#downloadZip').click();await page.evaluate(()=>window.pendingReads[2].reject(new DOMException('denied','NotReadableError')));await expect(page.locator('#zipStatus')).toContainText('ZIP not created');expect(downloads).toBe(0);
});

test('missing ZIP support leaves list and mapping usable but prevents ZIP creation',async({page})=>{
 await open(page,{missingWriter:true});await prepare(page,[await photo(page,'a.png')]);await expect(page.locator('#zipStatus')).toContainText('could not load');await expect(page.locator('#downloadZip')).toBeDisabled();await expect(page.locator('#downloadMapping')).toBeEnabled();
});

for(const setting of ['visitor','testMode','optout','dnt','gpc'])test('ZIP download tracking is fixed, deduplicated and respects '+setting,async({page})=>{
 if(setting==='dnt'||setting==='gpc')await page.addInitScript(setting=>Object.defineProperty(navigator,setting==='dnt'?'doNotTrack':'globalPrivacyControl',{get:()=>setting==='dnt'?'1':true}),setting);
 const events=await open(page,{testMode:setting==='testMode'});if(setting==='optout')await page.locator('#usage').uncheck();
 await prepare(page,[await photo(page,'PRIVATE-product.png')]);await download(page);await download(page);
 const zipEvents=events.filter(e=>e.event==='zip_download');expect(zipEvents).toEqual(setting==='visitor'?[{event:'zip_download',mode:'numbered',source:'custom'}]:[]);
 expect(JSON.stringify(zipEvents)).not.toMatch(/PRIVATE|prod1|filename|bytes/);
});
