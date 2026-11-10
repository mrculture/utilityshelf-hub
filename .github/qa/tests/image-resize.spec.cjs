const {test,expect}=require('@playwright/test');
const fs=require('node:fs'),crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
test.beforeEach(async({page,context})=>{
 await context.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
 await page.goto('/utilities/image-dimension-checker/?test-mode=1');
 await page.locator('#width').fill('100');await page.locator('#height').fill('100');await page.locator('#size').fill('1');
});
async function photo(page,name,w,h,{bytes=0,jpeg=false,transparent=false,orientation=false}={}){
 const data=await page.evaluate(({w,h,jpeg,transparent})=>{const c=document.createElement('canvas');c.width=w;c.height=h;const x=c.getContext('2d');if(!transparent){x.fillStyle='blue';x.fillRect(0,0,w,h);}x.fillStyle='red';x.fillRect(0,0,w/2,h);return c.toDataURL(jpeg?'image/jpeg':'image/png').split(',')[1];},{w,h,jpeg,transparent});
 let buffer=Buffer.from(data,'base64');
 if(orientation){const exif=Buffer.from('ffe1002245786966000049492a0008000000010012010300010000000600000000000000','hex');buffer=Buffer.concat([buffer.subarray(0,2),exif,buffer.subarray(2)]);}
 if(bytes)buffer=Buffer.concat([buffer,Buffer.alloc(Math.max(0,bytes-buffer.length))]);
 return {name,mimeType:jpeg?'image/jpeg':'image/png',buffer};
}
async function ready(page){await page.locator('#prepareResize').click();await expect(page.locator('#downloadResized')).toBeEnabled({timeout:15000});}
async function archive(page){
 const pending=page.waitForEvent('download');await page.locator('#downloadResized').click();const d=await pending;expect(d.suggestedFilename()).toBe('checked-photo-copies.zip');
 const script='import zipfile,json,base64,sys\nwith zipfile.ZipFile(sys.argv[1]) as z:\n assert z.testzip() is None\n print(json.dumps({n:base64.b64encode(z.read(n)).decode() for n in z.namelist()}))';
 return JSON.parse(execFileSync(process.platform==='win32'?'python':'python3',['-c',script,await d.path()],{encoding:'utf8',maxBuffer:2000000}));
}
async function decode(page,base64){return page.evaluate(async base64=>{const bytes=Uint8Array.from(atob(base64),c=>c.charCodeAt(0));const image=await createImageBitmap(new Blob([bytes]));const c=document.createElement('canvas');c.width=image.width;c.height=image.height;const x=c.getContext('2d');x.drawImage(image,0,0);const result={width:image.width,height:image.height,top:Array.from(x.getImageData(Math.floor(image.width/2),2,1,1).data),bottom:Array.from(x.getImageData(Math.floor(image.width/2),image.height-3,1,1).data),right:Array.from(x.getImageData(image.width-3,Math.floor(image.height/2),1,1).data)};image.close();return result;},base64);}

test('dimension limit resizes only oversized photos, preserves other bytes and includes a verified report',async({page})=>{
 const large=await photo(page,'large.png',800,600),small=await photo(page,'small.png',100,100);
 await page.locator('#files').setInputFiles([large,small]);await page.locator('#maxEdge').fill('400');await ready(page);
 await expect(page.locator('#resizeStatus')).toContainText('1 modified; 1 kept original bytes');
 const files=await archive(page);expect(Object.keys(files)).toEqual(['01-large-resized.jpg','02-small.png','resize-report.txt']);
 const image=await decode(page,files['01-large-resized.jpg']);expect([image.width,image.height]).toEqual([400,300]);
 expect(Buffer.from(files['02-small.png'],'base64').equals(small.buffer)).toBe(true);
 const report=Buffer.from(files['resize-report.txt'],'base64').toString();expect(report).toContain('Status: Passed');expect(report).toContain('After: 400 x 300 px');expect(report).toContain('1 modified; 1 kept original bytes');
});

test('file-size-only reduction keeps dimensions when encoding fits and rechecks exact bytes',async({page})=>{
 await page.locator('#files').setInputFiles(await photo(page,'heavy.png',800,600,{bytes:300001}));await page.locator('#size').fill('0.1');await ready(page);
 const files=await archive(page),bytes=Buffer.from(files['01-heavy-resized.jpg'],'base64');expect(bytes.length).toBeLessThanOrEqual(100000);
 const image=await decode(page,files['01-heavy-resized.jpg']);expect([image.width,image.height]).toEqual([800,600]);
});

test('orientation is baked into output, JPEG has no source EXIF, and transparent areas become white',async({page})=>{
 const rotated=await photo(page,'rotate.jpg',400,200,{jpeg:true,orientation:true}),transparent=await photo(page,'clear.png',400,200,{transparent:true});
 await page.locator('#files').setInputFiles([rotated,transparent]);await expect(page.locator('#output')).toContainText('200 × 400');await page.locator('#maxEdge').fill('200');await ready(page);
 const files=await archive(page),rot=await decode(page,files['01-rotate-resized.jpg']),white=await decode(page,files['02-clear-resized.jpg']);
 expect([rot.width,rot.height]).toEqual([100,200]);expect(rot.top[0]).toBeGreaterThan(220);expect(rot.top[2]).toBeLessThan(30);expect(rot.bottom[2]).toBeGreaterThan(220);
 expect(white.right.slice(0,3).every(n=>n>245)).toBe(true);expect(Buffer.from(files['01-rotate-resized.jpg'],'base64').includes(Buffer.from('Exif'))).toBe(false);
});

test('minimum conflicts, undersized originals and impossible byte targets never offer a partial ZIP',async({page})=>{
 await page.locator('#files').setInputFiles(await photo(page,'wide.png',400,200));await page.locator('#maxEdge').fill('100');await page.locator('#prepareResize').click();await expect(page.locator('#resizeStatus')).toContainText('conflicts');await expect(page.locator('#downloadResized')).toBeDisabled();
 await page.locator('#maxEdge').fill('');await page.locator('#width').fill('401');await page.locator('#prepareResize').click();await expect(page.locator('#resizeStatus')).toContainText('does not enlarge');
 await page.locator('#width').fill('100');await page.locator('#size').fill('0.001');
 await page.locator('#files').setInputFiles(await photo(page,'heavy.png',400,200,{bytes:2000}));
 await page.evaluate(()=>{HTMLCanvasElement.prototype.toBlob=function(callback){callback(new Blob([new Uint8Array(2000)],{type:'image/jpeg'}));};});
 await page.locator('#prepareResize').click();await expect(page.locator('#resizeStatus')).toContainText('Could not meet the file-size limit');await expect(page.locator('#downloadResized')).toBeDisabled();await expect(page.locator('#resizeResults')).toBeEmpty();
});

test('all unchanged copies retain bytes and duplicate or hostile source names get distinct safe output names',async({page})=>{
 const a=await photo(page,'../a.png',200,200);await page.locator('#files').setInputFiles([a,a]);await ready(page);const files=await archive(page);
 expect(Object.keys(files)).toEqual(['01--a.png','02--a.png','resize-report.txt']);
 for(const name of Object.keys(files).slice(0,2))expect(Buffer.from(files[name],'base64').equals(a.buffer)).toBe(true);
 await expect(page.locator('#resizeStatus')).toContainText('0 modified; 2 kept original bytes');
});

test('changing photos, presets or limits clears downloads and cancels pending encoding',async({page})=>{
 const a=await photo(page,'a.png',400,400);await page.locator('#files').setInputFiles(a);await ready(page);await page.locator('#maxEdge').fill('200');await expect(page.locator('#downloadResized')).toBeDisabled();
 await page.evaluate(()=>{const encode=HTMLCanvasElement.prototype.toBlob;window.finishEncode=null;HTMLCanvasElement.prototype.toBlob=function(...args){window.finishEncode=()=>encode.apply(this,args);};});
 await page.locator('#prepareResize').click();await expect.poll(()=>page.evaluate(()=>typeof window.finishEncode)).toBe('function');await page.locator('#size').fill('0.5');await page.evaluate(()=>window.finishEncode());await expect(page.locator('#downloadResized')).toBeDisabled();await expect(page.locator('#resizeResults')).toBeEmpty();
 await page.locator('#preset').selectOption('ebay');await expect(page.locator('#downloadResized')).toBeDisabled();await page.locator('#files').setInputFiles([]);await expect(page.locator('#prepareResize')).toBeDisabled();
});

test('invalid settings, unreadable images and resource bounds prevent preparation',async({page})=>{
 const a=await photo(page,'a.png',200,200);await page.locator('#files').setInputFiles(a);
 for(const invalid of ['0','15','8001','100.5']){await page.locator('#maxEdge').fill(invalid);await expect(page.locator('#prepareResize')).toBeDisabled();}
 await page.locator('#maxEdge').fill('');await page.locator('#files').setInputFiles({name:'bad.jpg',mimeType:'image/jpeg',buffer:Buffer.from('bad')});await expect(page.locator('#resizeStatus')).toContainText('unreadable');
 await page.evaluate(()=>{Object.defineProperty(File.prototype,'size',{get:()=>26000000});});await page.locator('#files').setInputFiles(Array.from({length:4},(_,i)=>({...a,name:i+'.png'})));await expect(page.locator('#resizeStatus')).toContainText('100 MB');
});

test('null encoder failure cannot leave an old prepared ZIP available',async({page})=>{
 await page.locator('#files').setInputFiles(await photo(page,'a.png',400,400));await ready(page);await page.locator('#maxEdge').fill('200');await page.evaluate(()=>{HTMLCanvasElement.prototype.toBlob=callback=>callback(null);});await page.locator('#prepareResize').click();await expect(page.locator('#resizeStatus')).toContainText('could not create a JPEG');await expect(page.locator('#downloadResized')).toBeDisabled();
});

test('byte limit can require reducing dimensions after quality attempts, without going below minima',async({page})=>{
 await page.locator('#files').setInputFiles(await photo(page,'large.png',800,600,{bytes:300001}));await page.locator('#size').fill('0.1');
 await page.evaluate(()=>{const encode=HTMLCanvasElement.prototype.toBlob;HTMLCanvasElement.prototype.toBlob=function(cb,...args){if(this.width>640)cb(new Blob([new Uint8Array(200000)],{type:'image/jpeg'}));else encode.call(this,cb,...args);};});
 await ready(page);const files=await archive(page);const image=await decode(page,files['01-large-resized.jpg']);expect([image.width,image.height]).toEqual([640,480]);
});

test('a failing second file cannot expose the successfully processed first file',async({page})=>{
 await page.locator('#files').setInputFiles([await photo(page,'good.png',200,200),await photo(page,'small.png',50,50)]);
 await page.locator('#prepareResize').click();await expect(page.locator('#resizeStatus')).toContainText('small.png');await expect(page.locator('#downloadResized')).toBeDisabled();await expect(page.locator('#resizeResults')).toBeEmpty();
});


test('checked previews render under the production Content Security Policy',async({page})=>{
 const policy=fs.readFileSync(require('node:path').resolve(__dirname,'../../../_headers'),'utf8').match(/Content-Security-Policy: (.+)/)[1];
 await page.route('**/utilities/image-dimension-checker/?test-mode=1',async route=>{const response=await route.fetch();await route.fulfill({response,headers:{...response.headers(),'Content-Security-Policy':policy}});});
 await page.reload();await page.locator('#width').fill('100');await page.locator('#height').fill('100');
 await page.locator('#files').setInputFiles(await photo(page,'preview.png',800,600));await page.locator('#maxEdge').fill('400');await ready(page);
 const preview=page.locator('#resizeResults img');await preview.scrollIntoViewIfNeeded();
 await expect.poll(()=>preview.evaluate(img=>img.complete&&img.naturalWidth===400&&img.naturalHeight===300)).toBe(true);
});
