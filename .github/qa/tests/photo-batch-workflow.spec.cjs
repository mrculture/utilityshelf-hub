const {test,expect}=require('@playwright/test');
const fs=require('node:fs'),crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const hash=buffer=>crypto.createHash('sha256').update(buffer).digest('hex');
const tools={check:'/utilities/image-dimension-checker/',sheet:'/utilities/image-contact-sheet/',names:'/tools/filename-cleaner/'};
test.beforeEach(async({context})=>{
 // Exercise the real browser handlers and files, never production telemetry.
 await context.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
});
async function open(page,tool){await page.goto(tools[tool]+'?test-mode=1');}
async function photos(page,count){
 const data=await page.evaluate(count=>Array.from({length:count},(_,i)=>{
  const c=document.createElement('canvas');c.width=1200;c.height=900;
  const ctx=c.getContext('2d');ctx.fillStyle=`hsl(${i*47%360},60%,45%)`;ctx.fillRect(0,0,c.width,c.height);
  ctx.fillStyle='white';ctx.font='100px sans-serif';ctx.fillText('Product view '+(i+1),80,450);
  return c.toDataURL('image/png').split(',')[1];
 }),count);
 return data.map((b,i)=>({name:`product-${String(i+1).padStart(2,'0')}.png`,mimeType:'image/png',buffer:Buffer.from(b,'base64')}));
}
async function download(page,id){const pending=page.waitForEvent('download');await page.locator(id).click();return (await pending).path();}
function unzip(file){
 const script='import zipfile,json,base64,sys\nwith zipfile.ZipFile(sys.argv[1]) as z:\n assert z.testzip() is None\n print(json.dumps({n:base64.b64encode(z.read(n)).decode() for n in z.namelist()}))';
 return JSON.parse(execFileSync(process.platform==='win32'?'python':'python3',['-c',script,file],{encoding:'utf8',maxBuffer:12000000}));
}
async function limits(page){await page.locator('#width').fill('400');await page.locator('#height').fill('300');await page.locator('#size').fill('8');}

for(const count of [24,25,30])test(`${count} photos complete check, resize, recheck, arrange, map and renamed ZIP without loss`,async({page},testInfo)=>{
 test.setTimeout(90000);
 const remote=[];page.on('request',r=>{if(new URL(r.url()).hostname!=='127.0.0.1')remote.push(r.url());});
 await open(page,'check');await limits(page);const originals=await photos(page,count);
 await page.locator('#files').setInputFiles(originals);
 await expect(page.locator('#status')).toContainText(`${count} of ${count} meet your limits`);
 await expect(page.locator('#output tbody tr')).toHaveCount(count);
 const beforeReport=fs.readFileSync(await download(page,'#downloadReport'),'utf8');
 expect(beforeReport).toContain(`Selected: ${count}. Passed: ${count}.`);
 await page.locator('#maxEdge').fill('600');await page.locator('#prepareResize').click();
 await expect(page.locator('#downloadResized')).toBeEnabled({timeout:30000});
 await expect(page.locator('#resizeStatus')).toContainText(`${count} modified; 0 kept original bytes`);
 const checkedZip=unzip(await download(page,'#downloadResized'));
 expect(Object.keys(checkedZip)).toHaveLength(count+1);
 const checked=Object.entries(checkedZip).filter(([name])=>name!=='resize-report.txt').map(([name,b])=>({name,mimeType:'image/jpeg',buffer:Buffer.from(b,'base64')}));
 expect(Buffer.from(checkedZip['resize-report.txt'],'base64').toString()).toContain('Status: Passed');
 await page.locator('#files').setInputFiles(checked);
 await expect(page.locator('#status')).toContainText(`${count} of ${count} meet your limits`);
 const report=fs.readFileSync(await download(page,'#downloadReport'),'utf8');
 expect(report).toContain(`Selected: ${count}. Passed: ${count}.`);
 expect(report.match(/Dimensions: 600 x 450 px/g)).toHaveLength(count);

 await open(page,'sheet');await page.locator('#files').setInputFiles(checked);
 await expect(page.locator('#names li')).toHaveCount(count,{timeout:15000});
 const ordered=checked.map(f=>f.name);[ordered[0],ordered[1]]=[ordered[1],ordered[0]];
 await page.locator('#names li').first().getByRole('button',{name:/Move later/}).click();
 await expect(page.locator('#names li > span')).toHaveText(ordered);
 await page.locator('#columns').selectOption('3');
 const canvas=await page.locator('#sheet').evaluate(c=>({width:c.width,height:c.height,png:c.toDataURL().split(',')[1]}));
 expect([canvas.width,canvas.height]).toEqual([900,Math.ceil(count/3)*232]);
 expect(fs.readFileSync(await download(page,'#download')).equals(Buffer.from(canvas.png,'base64'))).toBe(true);
 await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{window.batchCopiedNames=text;}}}));
 await page.locator('#copyNames').click();const copied=await page.evaluate(()=>window.batchCopiedNames);
 expect(copied).toBe(ordered.join('\n'));

 await open(page,'names');await page.locator('#names').fill(copied);
 await page.locator('#mode').selectOption('numbered');await page.locator('#prefix').fill('BATCH-'+count);
 const expected=ordered.map((_,i)=>`batch-${count}-${String(i+1).padStart(3,'0')}.jpg`);
 await expect(page.locator('#result')).toHaveValue(expected.join('\n'));
 await page.locator('#photoFiles').setInputFiles([...checked].reverse());
 await expect(page.locator('#zipStatus')).toContainText(`${count} photos matched by original filename`);
 const mapping=fs.readFileSync(await download(page,'#downloadMapping'),'utf8').replace(/^\uFEFF/,'');
 const renamed=unzip(await download(page,'#downloadZip'));
 expect(Object.keys(renamed)).toEqual([...expected,'filename-mapping.txt']);
 expect(Buffer.from(renamed['filename-mapping.txt'],'base64').toString().replace(/^\uFEFF/,'')).toBe(mapping);
 for(const [i,name] of expected.entries()){
  expect(hash(Buffer.from(renamed[name],'base64'))).toBe(hash(checked.find(f=>f.name===ordered[i]).buffer));
  expect(mapping).toContain(`Original: ${ordered[i]}\r\nNew: ${name}`);
 }
 expect(remote).toEqual([]);
 await testInfo.attach('batch-verification',{body:JSON.stringify({count,checked:checked.length,renamed:expected.length,sheet:[canvas.width,canvas.height],allRenamedHashesMatch:true,externalRequests:remote}),contentType:'application/json'});
});

test('31 photos reject the whole batch in each tool, clear stale exports, and recover with 30',async({page})=>{
 test.setTimeout(90000);let downloads=0;page.on('download',()=>downloads++);
 await open(page,'check');await limits(page);const all=await photos(page,31),valid=all.slice(0,30);
 await page.locator('#files').setInputFiles(valid);await expect(page.locator('#downloadReport')).toBeEnabled();
 await page.locator('#prepareResize').click();await expect(page.locator('#downloadResized')).toBeEnabled({timeout:30000});
 await page.locator('#files').setInputFiles(all);
 await expect(page.locator('#status')).toContainText('You selected 31 photos');await expect(page.locator('#status')).toContainText('No photos were processed');
 await expect(page.locator('#output tbody tr')).toHaveCount(0);
 for(const id of ['downloadReport','prepareResize','downloadResized'])await expect(page.locator('#'+id)).toBeDisabled();
 await page.locator('#files').setInputFiles(valid);await expect(page.locator('#status')).toContainText('30 of 30');
 await open(page,'sheet');await page.locator('#files').setInputFiles(valid);await expect(page.locator('#names li')).toHaveCount(30);
 await page.locator('#files').setInputFiles(all);await expect(page.locator('#status')).toContainText('You selected 31 photos');await expect(page.locator('#status')).toContainText('No photos were processed');
 await expect(page.locator('#names li')).toHaveCount(0);await expect(page.locator('#orderedNames')).toHaveValue('');await expect(page.locator('#sheet')).toBeHidden();
 for(const id of ['download','copyNames'])await expect(page.locator('#'+id)).toBeDisabled();
 await page.locator('#files').setInputFiles(valid);await expect(page.locator('#names li')).toHaveCount(30);await expect(page.locator('#download')).toBeEnabled();
 await open(page,'names');await page.locator('#names').fill(valid.map(f=>f.name).join('\n'));await page.locator('#photoFiles').setInputFiles(valid);await expect(page.locator('#downloadZip')).toBeEnabled();
 await page.locator('#names').fill(all.map(f=>f.name).join('\n'));await page.locator('#photoFiles').setInputFiles(all);
 await expect(page.locator('#zipStatus')).toContainText('Batch too large: 31 photos');await expect(page.locator('#zipStatus')).toContainText('No ZIP was created');await expect(page.locator('#downloadZip')).toBeDisabled();
 await page.locator('#names').fill(valid.map(f=>f.name).join('\n'));await page.locator('#photoFiles').setInputFiles(valid);await expect(page.locator('#downloadZip')).toBeEnabled();
 expect(downloads).toBe(0);
});

for(const tool of ['check','sheet'])test(`${tool} accepts exactly 100 MB and rejects larger combined batches before reading`,async({page})=>{
 await open(page,tool);if(tool==='check'){await limits(page);await page.locator('#size').fill('32');}
 const files=await photos(page,4);
 await page.evaluate(()=>{window.extraByte=0;Object.defineProperty(File.prototype,'size',{get(){return 25000000+(this.name.includes('01')?window.extraByte:0);}});});
 await page.locator('#files').setInputFiles(files);await expect(page.locator(tool==='check'?'#output tbody tr':'#names li')).toHaveCount(4);
 await page.evaluate(()=>{window.extraByte=1;File.prototype.slice=()=>{throw Error('Must reject before reading');};});
 await page.locator('#files').setInputFiles(files);await expect(page.locator('#status')).toContainText('100 MB');await expect(page.locator('#status')).toContainText('No photos were processed');
 await expect(page.locator(tool==='check'?'#downloadReport':'#download')).toBeDisabled();await expect(page.locator(tool==='check'?'#output tbody tr':'#names li')).toHaveCount(0);
});
