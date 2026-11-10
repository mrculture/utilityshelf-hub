const {test,expect}=require('@playwright/test');
const fs=require('node:fs'),{execFileSync}=require('node:child_process');
test.beforeEach(async({page,context})=>{
 await context.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
 await page.goto('/utilities/image-dimension-checker/?test-mode=1');
});
async function photo(page,name,w=1000,h=1000){
 const data=await page.evaluate(([w,h])=>{const c=document.createElement('canvas');c.width=w;c.height=h;return c.toDataURL().split(',')[1];},[w,h]);
 return {name,mimeType:'image/png',buffer:Buffer.from(data,'base64')};
}
const broken={name:'broken.png',mimeType:'image/png',buffer:Buffer.from([137,80,78,71,13,10,26,10,0,0,0,0])};
const rows=page=>page.locator('#output tbody tr');
async function chooseReplacement(page,index,file){
 const chooser=page.waitForEvent('filechooser');await rows(page).nth(index).getByRole('button',{name:/^Replace photo/}).click();await (await chooser).setFiles(file);
}
async function download(page,id){const pending=page.waitForEvent('download');await page.locator(id).click();return (await pending).path();}
async function report(page){return fs.readFileSync(await download(page,'#downloadReport'),'utf8');}
function unzip(file){return JSON.parse(execFileSync(process.platform==='win32'?'python':'python3',['-c','import zipfile,json,base64,sys\nwith zipfile.ZipFile(sys.argv[1]) as z:\n assert z.testzip() is None\n print(json.dumps({n:base64.b64encode(z.read(n)).decode() for n in z.namelist()}))',file],{encoding:'utf8'}));}

test('repair a mixed batch, refresh reports, and export only the remaining photos with unchanged bytes',async({page})=>{
 const remote=[];page.on('request',r=>{if(new URL(r.url()).hostname!=='127.0.0.1')remote.push(r.url());});
 const good=await photo(page,'good.png'),short=await photo(page,'short.png',600,400),replacement=await photo(page,'replacement.png',1200,900);
 await page.locator('#files').setInputFiles([good,short,broken]);await expect(page.locator('#status')).toHaveText('1 of 3 meet your limits.');
 expect(await report(page)).toContain('Status: Check incomplete');
 await rows(page).nth(2).getByRole('button',{name:/^Remove photo/}).click();
 await expect(page.locator('#status')).toHaveText('1 of 2 meet your limits.');expect(await report(page)).toContain('Status: Needs attention');
 await chooseReplacement(page,1,replacement);await expect(page.locator('#status')).toHaveText('2 of 2 meet your limits.');
 await expect(rows(page).locator('td:first-child')).toHaveText(['good.png','replacement.png']);
 const text=await report(page);expect(text).toContain('Status: Passed');expect(text).toContain('Selected: 2. Passed: 2.');expect(text).not.toContain('short.png');expect(text).not.toContain('broken.png');
 await page.locator('#prepareResize').click();await expect(page.locator('#downloadResized')).toBeEnabled();
 const zip=unzip(await download(page,'#downloadResized'));expect(Object.keys(zip)).toEqual(['01-good.png','02-replacement.png','resize-report.txt']);
 expect(Buffer.from(zip['01-good.png'],'base64').equals(good.buffer)).toBe(true);expect(Buffer.from(zip['02-replacement.png'],'base64').equals(replacement.buffer)).toBe(true);
 expect(remote).toEqual([]);
});

test('removing and replacing invalidate prepared ZIPs; removing the last photo clears every export',async({page})=>{
 const file=await photo(page,'same.png');await page.locator('#files').setInputFiles([file,file]);await expect(rows(page)).toHaveCount(2);
 await page.locator('#prepareResize').click();await expect(page.locator('#downloadResized')).toBeEnabled();
 await rows(page).nth(1).getByRole('button',{name:/^Remove photo/}).click();await expect(rows(page)).toHaveCount(1);
 await expect(page.locator('#downloadResized')).toBeDisabled();await expect(page.locator('#resizeResults')).toBeEmpty();
 await page.locator('#prepareResize').click();await expect(page.locator('#downloadResized')).toBeEnabled();
 await chooseReplacement(page,0,broken);await expect(page.locator('#reportStatus')).toHaveText('Report status: Check incomplete.');
 await expect(page.locator('#downloadResized')).toBeDisabled();await expect(page.locator('#prepareResize')).toBeDisabled();
 await rows(page).getByRole('button',{name:/^Remove photo/}).click();await expect(rows(page)).toHaveCount(0);
 for(const id of ['downloadReport','prepareResize','downloadResized'])await expect(page.locator('#'+id)).toBeDisabled();
 await expect(page.locator('#status')).toContainText('No photos remain');await expect(page.locator('#files')).toBeFocused();
 await page.locator('#files').setInputFiles(file);await expect(page.locator('#status')).toHaveText('1 of 1 meet your limits.');
});

test('cancelled selection leaves results and prepared download unchanged',async({page})=>{
 await page.locator('#demo').click();await expect(rows(page)).toHaveCount(2,{timeout:15000});await page.locator('#height').fill('600');
 await page.locator('#prepareResize').click();await expect(page.locator('#downloadResized')).toBeEnabled();
 const chooser=page.waitForEvent('filechooser');await rows(page).first().getByRole('button',{name:/^Replace photo/}).click();await (await chooser).setFiles([]);
 await page.locator('#replacementFile').dispatchEvent('cancel');
 await expect(page.locator('#status')).toHaveText('2 of 2 meet your limits.');await expect(page.locator('#downloadResized')).toBeEnabled();
 expect(await report(page)).toContain('"front.png"');
});

test('replacement enforces total and per-file limits without a false pass',async({page})=>{
 const a=await photo(page,'a.png'),b=await photo(page,'b.png'),c=await photo(page,'c.png'),d=await photo(page,'d.png');
 await page.evaluate(()=>Object.defineProperty(File.prototype,'size',{get(){return this.name==='too-large.png'?32000001:this.name==='over-total.png'?25000001:25000000;}}));
 await page.locator('#size').fill('32');await page.locator('#files').setInputFiles([a,b,c,d]);await expect(rows(page)).toHaveCount(4);
 await chooseReplacement(page,0,{...a,name:'over-total.png'});await expect(page.locator('#batchStatus')).toContainText('previous photo and results are unchanged');
 await expect(rows(page).locator('td:first-child')).toHaveText(['a.png','b.png','c.png','d.png']);expect(await report(page)).toContain('Selected: 4. Passed: 4.');
 await rows(page).nth(3).getByRole('button',{name:/^Remove photo/}).click();await chooseReplacement(page,0,{...a,name:'too-large.png'});
 await expect(page.locator('#reportStatus')).toHaveText('Report status: Check incomplete.');expect(await report(page)).toContain('Exceeds the 32 MB reading limit');await expect(page.locator('#prepareResize')).toBeDisabled();
});

test('pending replacement blocks stale reports and cannot overwrite a newly selected batch',async({page})=>{
 const old=await photo(page,'old.png'),replacement=await photo(page,'replacement.png'),fresh=await photo(page,'fresh.png');
 await page.locator('#files').setInputFiles(old);await expect(rows(page)).toHaveCount(1);
 await page.locator('#prepareResize').click();await expect(page.locator('#downloadResized')).toBeEnabled();
 await page.evaluate(()=>{const decode=window.createImageBitmap;window.pending=[];window.createImageBitmap=(...args)=>new Promise((resolve,reject)=>window.pending.push(()=>decode(...args).then(resolve,reject)));});
 await chooseReplacement(page,0,replacement);await expect.poll(()=>page.evaluate(()=>window.pending.length)).toBe(1);
 for(const id of ['downloadReport','prepareResize','downloadResized'])await expect(page.locator('#'+id)).toBeDisabled();
 await page.locator('#files').setInputFiles(fresh);await expect.poll(()=>page.evaluate(()=>window.pending.length)).toBe(2);
 await page.evaluate(()=>window.pending[1]());await expect(rows(page).locator('td:first-child')).toHaveText(['fresh.png']);
 await page.evaluate(()=>window.pending[0]());const text=await report(page);expect(text).toContain('"fresh.png"');expect(text).not.toContain('replacement.png');
});

test('removal during resize prevents a stale ZIP from becoming available',async({page})=>{
 await page.locator('#demo').click();await expect(rows(page)).toHaveCount(2,{timeout:15000});await page.locator('#width').fill('400');await page.locator('#height').fill('300');await page.locator('#maxEdge').fill('500');
 await page.evaluate(()=>{const encode=HTMLCanvasElement.prototype.toBlob;window.encodes=[];HTMLCanvasElement.prototype.toBlob=function(...args){window.encodes.push(()=>encode.apply(this,args));};});
 await page.locator('#prepareResize').click();await expect.poll(()=>page.evaluate(()=>window.encodes.length)).toBe(1);
 await rows(page).first().getByRole('button',{name:/^Remove photo/}).click();await page.evaluate(()=>window.encodes[0]());
 await expect(page.locator('#downloadResized')).toBeDisabled();await expect(page.locator('#resizeResults')).toBeEmpty();
 const text=await report(page);expect(text).toContain('Selected: 1.');expect(text).toContain('"detail.png"');expect(text).not.toContain('front.png');
});
