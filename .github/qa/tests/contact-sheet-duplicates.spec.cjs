const {test,expect}=require('@playwright/test');
const fs=require('node:fs'),crypto=require('node:crypto'),{execFileSync}=require('node:child_process');
const labels=page=>page.locator('#names li > span');
const action=(page,index,name)=>page.locator('#names li').nth(index).getByRole('button',{name:new RegExp('^'+name+':')});
async function photo(page,name,color){const b=await page.evaluate(color=>{const c=document.createElement('canvas');c.width=40;c.height=30;const ctx=c.getContext('2d');ctx.fillStyle=color;ctx.fillRect(0,0,40,30);return c.toDataURL().split(',')[1];},color);return {name,mimeType:'image/png',buffer:Buffer.from(b,'base64')};}
async function download(page,id){const wait=page.waitForEvent('download');await page.locator(id).click();return(await wait).path();}
async function replace(page,index,file){const wait=page.waitForEvent('filechooser');await action(page,index,'Replace photo').click();await(await wait).setFiles(file);}
test.beforeEach(async({page,context})=>{await context.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());await page.goto('/utilities/image-contact-sheet/?test-mode=1');});

test('renamed identical files are grouped; removal, undo and reorder keep PNG, list and final ZIP consistent',async({page})=>{
 const front=await photo(page,'front.png','#227744'),copy={...front,name:'renamed-copy.png'},detail=await photo(page,'detail.png','#996633');
 await page.locator('#files').setInputFiles([front,copy,detail]);await expect(page.locator('#duplicateStatus')).toContainText('1 exact duplicate groups across 2 photos');await expect(page.locator('#duplicateGroups')).toContainText('photo 1 (front.png); photo 2 (renamed-copy.png)');
 const original=await page.locator('#sheet').evaluate(c=>c.toDataURL());
 await action(page,1,'Remove photo').click();await expect(page.locator('#duplicateStatus')).toContainText('No exact duplicates');await expect(labels(page)).toHaveText(['front.png','detail.png']);
 await page.locator('#undoRemoval').click();await expect(page.locator('#duplicateStatus')).toContainText('1 exact duplicate groups');expect(await page.locator('#sheet').evaluate(c=>c.toDataURL())).toBe(original);await expect(labels(page)).toHaveText(['front.png','renamed-copy.png','detail.png']);
 await action(page,2,'Move earlier').click();await expect(page.locator('#duplicateGroups')).toContainText('photo 1 (front.png); photo 3 (renamed-copy.png)');await action(page,2,'Remove photo').click();await action(page,1,'Move earlier').click();await expect(labels(page)).toHaveText(['detail.png','front.png']);await expect(page.locator('#duplicateStatus')).toContainText('No exact duplicates');
 const png=await download(page,'#download');expect(fs.readFileSync(png)).toEqual(Buffer.from(await page.locator('#sheet').evaluate(c=>c.toDataURL().split(',')[1]),'base64'));
 const list=await download(page,'#downloadNames');expect(fs.readFileSync(list,'utf8')).toBe('detail.png\r\nfront.png\r\n');
 await page.goto('/tools/filename-cleaner/?test-mode=1');await page.locator('#filenameListFile').setInputFiles(list);await page.locator('#mode').selectOption('numbered');await page.locator('#prefix').fill('DUPTEST');await page.locator('#photoFiles').setInputFiles([front,detail]);
 await expect(page.locator('#result')).toHaveValue('duptest-001.png\nduptest-002.png');
 const zip=await download(page,'#downloadZip');const script='import zipfile,hashlib,json,sys\nwith zipfile.ZipFile(sys.argv[1]) as z:\n assert z.testzip() is None\n print(json.dumps({"names":z.namelist(),"hashes":[hashlib.sha256(z.read(n)).hexdigest() for n in z.namelist() if n.endswith(".png")],"mapping":z.read("filename-mapping.txt").decode("utf-8-sig")}))';
 const archive=JSON.parse(execFileSync(process.platform==='win32'?'python':'python3',['-c',script,zip],{encoding:'utf8'}));expect(archive.names).toEqual(['duptest-001.png','duptest-002.png','filename-mapping.txt']);expect(archive.hashes).toEqual([detail,front].map(p=>crypto.createHash('sha256').update(p.buffer).digest('hex')));expect(archive.mapping).toContain('Original: detail.png\r\nNew: duptest-001.png');expect(archive.mapping).not.toContain('renamed-copy');
});

test('different bytes with the same or case-ambiguous name are conflicts, never content duplicates',async({page})=>{
 const a=await photo(page,'same.png','#227744'),b=await photo(page,'same.png','#996633');
 for(const name of ['same.png','SAME.png']){
  await page.locator('#files').setInputFiles([a,{...b,name}]);await expect(labels(page)).toHaveCount(2);await expect(page.locator('#duplicateStatus')).toContainText('No exact duplicates');await expect(page.locator('#filenameIssues')).toContainText('Ambiguous filenames');await expect(page.locator('#downloadNames')).toBeDisabled();await expect(page.locator('#copyNames')).toBeDisabled();await expect(page.locator('#selectNames')).toBeDisabled();await expect(page.locator('#download')).toBeEnabled();
  await action(page,1,'Remove photo').click();await expect(page.locator('#downloadNames')).toBeEnabled();await page.locator('#undoRemoval').click();await expect(page.locator('#downloadNames')).toBeDisabled();await expect(page.locator('#duplicateGroups li')).toHaveCount(0);
 }
 await replace(page,1,{...b,name:'different-view.png'});await expect(labels(page)).toHaveText(['same.png','different-view.png']);await expect(page.locator('#filenameIssues')).toBeEmpty();await expect(page.locator('#downloadNames')).toBeEnabled();
});

test('replacement and loaded order refresh groups; file bytes are confirmed even if hash candidates collide',async({page})=>{
 const a=await photo(page,'front.png','#227744'),b=await photo(page,'side.png','#996633');
 await page.evaluate(()=>{crypto.subtle.digest=async()=>new ArrayBuffer(32);Object.defineProperty(File.prototype,'size',{get(){return 500;},configurable:true});});
 await page.locator('#files').setInputFiles([a,b]);await expect(page.locator('#duplicateStatus')).toContainText('No exact duplicates');
 await replace(page,1,{...a,name:'copy.png'});await expect(page.locator('#duplicateStatus')).toContainText('1 exact duplicate groups');
 await page.locator('#orderFile').setInputFiles({name:'order.txt',mimeType:'text/plain',buffer:Buffer.from('copy.png\nfront.png')});await expect(labels(page)).toHaveText(['copy.png','front.png']);await expect(page.locator('#duplicateGroups')).toContainText('photo 1 (copy.png); photo 2 (front.png)');
 await replace(page,0,b);await expect(page.locator('#duplicateStatus')).toContainText('No exact duplicates');
});

test('unreadable or uncheckable files report incomplete rather than claiming a complete clean check',async({page})=>{
 const a=await photo(page,'front.png','#227744');await page.locator('#files').setInputFiles([a,{name:'bad.jpg',mimeType:'image/jpeg',buffer:Buffer.from('bad')}]);await expect(labels(page)).toHaveCount(1);await expect(page.locator('#duplicateStatus')).toContainText('Check incomplete');await expect(page.locator('#duplicateStatus')).toContainText('bad.jpg');
 await page.evaluate(()=>{crypto.subtle.digest=async()=>{throw Error('Hash unavailable');};});await page.locator('#files').setInputFiles([a,{...a,name:'copy.png'}]);await expect(labels(page)).toHaveCount(2);await expect(page.locator('#duplicateStatus')).toContainText('Check incomplete');await expect(page.locator('#duplicateStatus')).toContainText('Could not compare: front.png, copy.png');await expect(page.locator('#duplicateGroups li')).toHaveCount(0);
});

test('late comparison cannot restore warnings after removal or a new batch, and read failure is explicit',async({page})=>{
 const a=await photo(page,'front.png','#227744'),b=await photo(page,'other.png','#996633');
 await page.evaluate(()=>{const read=File.prototype.arrayBuffer;let count=0;File.prototype.arrayBuffer=async function(){if(this.name==='copy.png'&&++count===2)await new Promise(resolve=>window.finishCompare=resolve);return read.call(this);};});
 await page.locator('#files').setInputFiles([a,{...a,name:'copy.png'}]);await expect(labels(page)).toHaveCount(2);await expect.poll(()=>page.evaluate(()=>typeof window.finishCompare)).toBe('function');await action(page,1,'Remove photo').click();await expect(page.locator('#duplicateStatus')).toContainText('No exact duplicates');await page.evaluate(()=>window.finishCompare());await expect(page.locator('#duplicateGroups li')).toHaveCount(0);
 await page.evaluate(()=>{const read=File.prototype.arrayBuffer;File.prototype.arrayBuffer=async function(){if(this.name==='late.png')await new Promise(resolve=>window.finishHash=resolve);return read.call(this);};});await page.locator('#files').setInputFiles({...a,name:'late.png'});await expect.poll(()=>page.evaluate(()=>typeof window.finishHash)).toBe('function');await page.locator('#files').setInputFiles(b);await expect(labels(page)).toHaveText(['other.png']);await page.evaluate(()=>window.finishHash());await expect(labels(page)).toHaveText(['other.png']);await expect(page.locator('#duplicateStatus')).toContainText('No exact duplicates');
 await page.evaluate(()=>{const read=File.prototype.arrayBuffer;let count=0;File.prototype.arrayBuffer=async function(){if(this.name==='fail-copy.png'&&++count===2)throw Error('Comparison read failed');return read.call(this);};});await page.locator('#files').setInputFiles([a,{...a,name:'fail-copy.png'}]);await expect(labels(page)).toHaveCount(2);await expect(page.locator('#duplicateStatus')).toContainText('Check incomplete');await expect(page.locator('#duplicateStatus')).toContainText('Could not compare: fail-copy.png');
});
