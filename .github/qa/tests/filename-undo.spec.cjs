const {test,expect}=require('@playwright/test');
const fs=require('node:fs'),crypto=require('node:crypto'),{execFileSync}=require('node:child_process');
const saved={tool:'utilityshelf-filename-cleaner',version:1,mode:'numbered',prefix:'NEW',start:37,digits:4,style:'_'};
const settingsFile=value=>({name:'settings.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(value))});
async function load(page,value=saved){const wait=page.waitForEvent('filechooser');await page.locator('#loadSettings').click();await(await wait).setFiles(settingsFile(value));}
async function download(page,id){const wait=page.waitForEvent('download');await page.locator(id).click();return await(await wait).path();}
async function state(page){return page.evaluate(()=>({settings:Object.fromEntries(['mode','prefix','start','digits','style'].map(id=>[id,document.getElementById(id).value])),names:[...document.querySelectorAll('#rows input')].map(e=>e.value),list:document.getElementById('result').value}));}
test.beforeEach(async({page,context})=>{
 await context.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
 await page.goto('/tools/filename-cleaner/?test-mode=1');await page.locator('#names').fill('Front.PNG\nDetail.png');
 await page.locator('#mode').selectOption('numbered');await page.locator('#prefix').fill('SKU-1042');
});
test('undo loaded settings restores manual names, exact settings, mapping and unchanged ZIP contents',async({page})=>{
 const photos=[];
 for(const [i,name] of ['Front.PNG','Detail.png'].entries()){
  const b64=await page.evaluate(i=>{const c=document.createElement('canvas');c.width=16;c.height=12;const ctx=c.getContext('2d');ctx.fillStyle=i?'red':'blue';ctx.fillRect(0,0,16,12);return c.toDataURL().split(',')[1];},i);
  photos.push({name,mimeType:'image/png',buffer:Buffer.from(b64,'base64')});
 }
 await page.locator('#photoFiles').setInputFiles([...photos].reverse());
 await page.locator('#name-1').fill('sku-1042-hero.PNG');await page.locator('#name-2').fill('sku-1042-detail.png');
 const before=await state(page);await load(page);await expect(page.locator('#settingsStatus')).toContainText('Settings loaded');
 await page.locator('#undoNaming').click();expect(await state(page)).toEqual(before);await expect(page.locator('#downloadZip')).toBeEnabled();await expect(page.locator('#usage')).not.toBeChecked();
 const mapping=fs.readFileSync(await download(page,'#downloadMapping'),'utf8').replace(/^\uFEFF/,'');
 const z=JSON.parse(execFileSync(process.platform==='win32'?'python':'python3',['-c','import zipfile,json,hashlib,sys\nwith zipfile.ZipFile(sys.argv[1]) as z:\n assert z.testzip() is None\n print(json.dumps({"names":z.namelist(),"hashes":[hashlib.sha256(z.read(n)).hexdigest() for n in z.namelist()[:-1]],"mapping":z.read("filename-mapping.txt").decode("utf-8-sig")}))',await download(page,'#downloadZip')],{encoding:'utf8'}));
 expect(z.names).toEqual([...before.names,'filename-mapping.txt']);expect(z.mapping).toBe(mapping);expect(z.hashes).toEqual(photos.map(p=>crypto.createHash('sha256').update(p.buffer).digest('hex')));
 for(const [i,p] of photos.entries())expect(mapping).toContain('Original: '+p.name+'\r\nNew: '+before.names[i]);
});
test('typing groups into one undo and successive controls restore complete earlier naming states',async({page})=>{
 await page.locator('#name-1').fill('hand-edited.PNG');await page.locator('#name-2').fill('detail-edited.png');
 const original=await state(page);await page.locator('#prefix').fill('');await page.locator('#prefix').pressSequentially('LONG-PREFIX');await page.locator('#undoNaming').click();expect(await state(page)).toEqual(original);
 const states=[original];
 for(const [id,value] of [['start','22'],['digits','4'],['style','_'],['mode','clean']]){
  if(id==='start')await page.locator('#'+id).fill(value);else await page.locator('#'+id).selectOption(value);states.push(await state(page));
 }
 for(let i=states.length-2;i>=0;i--){await page.locator('#undoNaming').click();expect(await state(page)).toEqual(states[i]);}
 await expect(page.locator('#numbering')).toBeVisible();
 await page.locator('#name-1').fill('');await page.locator('#name-1').pressSequentially('another.PNG');await page.locator('#undoNaming').click();expect(await state(page)).toEqual(original);
});
test('invalid restored names stay invalid; failed or cancelled settings do not consume history',async({page})=>{
 await page.locator('#name-1').fill('wrong.jpg');const invalid=await state(page);
 await page.locator('#style').selectOption('_');await load(page,{...saved,version:99});await expect(page.locator('#settingsStatus')).toContainText('Settings not loaded');
 const wait=page.waitForEvent('filechooser');await page.locator('#loadSettings').click();await(await wait).setFiles([]);
 await page.locator('#undoNaming').click();expect(await state(page)).toEqual(invalid);await expect(page.locator('#downloadMapping')).toBeDisabled();await expect(page.locator('#downloadZip')).toBeDisabled();await expect(page.locator('#name-1')).toHaveAttribute('aria-invalid','true');
});
test('new original lists, loaded lists, samples and reload clear history; photo changes do not restore old selections',async({page})=>{
 await page.locator('#name-1').fill('hero.PNG');await page.locator('#clearPhotos').click();await page.locator('#undoNaming').click();await expect(page.locator('#downloadZip')).toBeDisabled();
 await page.locator('#names').fill('Other.png');await expect(page.locator('#undoNaming')).toBeDisabled();
 await page.locator('#name-1').fill('manual.png');await page.locator('#filenameListFile').setInputFiles({name:'names.txt',mimeType:'text/plain',buffer:Buffer.from('New.png')});await expect(page.locator('#names')).toHaveValue('New.png');await expect(page.locator('#undoNaming')).toBeDisabled();
 await page.locator('#name-1').fill('manual.png');await page.locator('#sample').click();await expect(page.locator('#undoNaming')).toBeDisabled();
 await page.locator('#name-1').fill('manual.JPG');await page.reload();await expect(page.locator('#undoNaming')).toBeDisabled();
});
test('undo cancels pending settings, filename-list reads and ZIP preparation',async({page})=>{
 await page.locator('#name-1').fill('manual.PNG');const original=await state(page);await page.locator('#style').selectOption('_');
 await page.evaluate(()=>{const real=File.prototype.arrayBuffer;window.pending=[];File.prototype.arrayBuffer=function(){return new Promise(resolve=>window.pending.push(()=>real.call(this).then(resolve)));};});
 await load(page);await expect(page.locator('#settingsStatus')).toContainText('Reading');await page.locator('#undoNaming').click();await page.evaluate(()=>window.pending[0]());expect(await state(page)).toEqual(original);
 await page.locator('#style').selectOption('_');await page.locator('#filenameListFile').setInputFiles({name:'names.txt',mimeType:'text/plain',buffer:Buffer.from('Old.png')});await expect(page.locator('#filenameListStatus')).toContainText('Reading');await page.locator('#undoNaming').click();await page.evaluate(()=>window.pending[1]());expect(await state(page)).toEqual(original);
 const b64=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=2;c.height=2;return c.toDataURL().split(',')[1];});
 await page.locator('#photoFiles').setInputFiles(['Front.PNG','Detail.png'].map(name=>({name,mimeType:'image/png',buffer:Buffer.from(b64,'base64')})));
 await page.locator('#style').selectOption('_');let downloads=0;page.on('download',()=>downloads++);
 await page.locator('#downloadZip').click();await expect(page.locator('#zipStatus')).toContainText('Preparing');await page.locator('#undoNaming').click();await page.evaluate(()=>window.pending[2]());expect(await state(page)).toEqual(original);expect(downloads).toBe(0);await expect(page.locator('#downloadZip')).toBeEnabled();
});
test('history is bounded to twenty changes and cannot be applied twice after exhaustion',async({page})=>{
 for(let n=2;n<=26;n++){await page.locator('#start').fill(String(n));await page.locator('#review').click();}
 for(let n=0;n<20;n++)await page.locator('#undoNaming').click();
 await expect(page.locator('#start')).toHaveValue('6');await expect(page.locator('#undoNaming')).toBeDisabled();await expect(page.locator('#result')).toHaveValue('sku-1042-006.PNG\nsku-1042-007.png');
});
