const {test,expect}=require('@playwright/test');
const fs=require('node:fs'),crypto=require('node:crypto'),{execFileSync}=require('node:child_process');
const base={tool:'utilityshelf-filename-cleaner',version:1,mode:'numbered',prefix:'SKU Café',start:37,digits:4,style:'_'};
const file=value=>({name:'settings.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(value))});
async function load(page,value){const wait=page.waitForEvent('filechooser');await page.locator('#loadSettings').click();await(await wait).setFiles(file(value));}
async function download(page,id){const wait=page.waitForEvent('download');await page.locator(id).click();return await wait;}
async function values(page){return page.evaluate(()=>Object.fromEntries(['mode','prefix','start','digits','style'].map(id=>[id,document.getElementById(id).value])));}
async function photo(page,name){
 const data=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=12;c.height=8;c.getContext('2d').fillRect(0,0,12,8);return c.toDataURL().split(',')[1];});
 return {name,mimeType:'image/png',buffer:Buffer.from(data,'base64')};
}
async function batch(page){
 const photos=[await photo(page,'Front.PNG'),await photo(page,'Detail.png')];
 await page.locator('#names').fill(photos.map(p=>p.name).join('\n'));await page.locator('#mode').selectOption('numbered');await page.locator('#prefix').fill('OLD');
 await page.locator('#photoFiles').setInputFiles(photos);return photos;
}
test.beforeEach(async({page,context})=>{
 await context.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
 await page.goto('/tools/filename-cleaner/?test-mode=1');
});
test('settings round trip across visits with exact fields and no files, edits or privacy preferences',async({page})=>{
 const remote=[];page.on('request',r=>{if(new URL(r.url()).hostname!=='127.0.0.1')remote.push(r.url());});
 await page.locator('#mode').selectOption('numbered');await page.locator('#prefix').fill(base.prefix);await page.locator('#start').fill('37');await page.locator('#digits').selectOption('4');await page.locator('#style').selectOption('_');
 const saved=await download(page,'#saveSettings');expect(saved.suggestedFilename()).toBe('filename-cleaner-settings.json');
 const path=await saved.path();expect(JSON.parse(fs.readFileSync(path,'utf8'))).toEqual(base);
 await page.reload();const wait=page.waitForEvent('filechooser');await page.locator('#loadSettings').click();await(await wait).setFiles(path);
 await expect(page.locator('#settingsStatus')).toContainText('Settings loaded.');
 expect(await values(page)).toEqual({mode:'numbered',prefix:base.prefix,start:'37',digits:'4',style:'_'});
 await expect(page.locator('#names')).toHaveValue('');await expect(page.locator('#downloadZip')).toBeDisabled();await expect(page.locator('#usage')).not.toBeChecked();expect(remote).toEqual([]);
 for(const [i,style] of ['-','_',' '].entries()){
  await load(page,{...base,mode:'clean',style,prefix:'',digits:i+2,start:1});
  await expect(page.locator('#numbering')).toBeHidden();
  const json=JSON.parse(fs.readFileSync(await(await download(page,'#saveSettings')).path(),'utf8'));
  expect(json).toEqual({...base,mode:'clean',style,prefix:'',digits:i+2,start:1});
 }
});
test('loading regenerates current names, retains photos and order, and exports correct unchanged ZIP bytes',async({page})=>{
 const photos=await batch(page);
 await page.locator('#name-1').fill('manual.PNG');
 await load(page,base);await expect(page.locator('#settingsStatus')).toContainText('Settings loaded.');
 await expect(page.locator('#names')).toHaveValue('Front.PNG\nDetail.png');
 await expect(page.locator('#result')).toHaveValue('sku_café_0037.PNG\nsku_café_0038.png');
 await expect(page.locator('#downloadZip')).toBeEnabled();
 const path=await(await download(page,'#downloadZip')).path();
 const z=JSON.parse(execFileSync(process.platform==='win32'?'python':'python3',['-c','import zipfile,json,hashlib,sys\nwith zipfile.ZipFile(sys.argv[1]) as z:\n assert z.testzip() is None\n print(json.dumps({"names":z.namelist(),"hashes":[hashlib.sha256(z.read(n)).hexdigest() for n in z.namelist()[:-1]],"mapping":z.read("filename-mapping.txt").decode("utf-8-sig")}))',path],{encoding:'utf8'}));
 expect(z.names).toEqual(['sku_café_0037.PNG','sku_café_0038.png','filename-mapping.txt']);
 expect(z.hashes).toEqual(photos.map(p=>crypto.createHash('sha256').update(p.buffer).digest('hex')));
 expect(z.mapping).toContain('Original: Front.PNG\r\nNew: sku_café_0037.PNG');
 await load(page,{...base,mode:'clean',style:' '});await expect(page.locator('#result')).toHaveValue('front.PNG\ndetail.png');await expect(page.locator('#numbering')).toBeHidden();
 await load(page,{...base,prefix:'',start:1,digits:2,style:'-'});await expect(page.locator('#result')).toHaveValue('photo-01.PNG\nphoto-02.png');
});
test('invalid schemas, ranges, encoding and files preserve settings, manual names, photos and privacy',async({page})=>{
 await batch(page);await page.locator('#name-1').fill('manual.PNG');const before=await values(page);
 const invalid=[null,[],{}, {...base,tool:'other'}, {...base,version:2}, {...base,mode:'other'}, {...base,style:'/'}, {...base,prefix:7}, {...base,prefix:'x'.repeat(201)}, {...base,prefix:'folder/name'}, {...base,prefix:'x\u0000y'}, {...base,prefix:'!!!'}, {...base,start:'37'}, {...base,start:0}, {...base,start:1.5}, {...base,start:1000000}, {...base,start:999999}, {...base,digits:'4'}, {...base,digits:5}, {...base,photos:['private.png']}, {...base,usage:true}];
 for(const value of invalid){
  await load(page,value);await expect(page.locator('#settingsStatus')).toContainText('Settings not loaded.');
  expect(await values(page)).toEqual(before);await expect(page.locator('#name-1')).toHaveValue('manual.PNG');await expect(page.locator('#downloadZip')).toBeEnabled();await expect(page.locator('#usage')).not.toBeChecked();
 }
 for(const buffer of [Buffer.from('{bad'),Buffer.alloc(8193,32),Buffer.alloc(0),Buffer.from([255,254,0,0])]){
  await page.locator('#settingsFile').setInputFiles({name:'bad.json',mimeType:'application/json',buffer});await expect(page.locator('#settingsStatus')).toContainText('Settings not loaded.');expect(await values(page)).toEqual(before);
 }
 await load(page,{...base,start:999998});await expect(page.locator('#result')).toHaveValue('sku_café_999998.PNG\nsku_café_999999.png');
});
test('invalid current settings cannot be saved and saving cancels an older pending load',async({page})=>{
 let downloads=0;page.on('download',()=>downloads++);
 await page.locator('#mode').selectOption('numbered');
 for(const [id,value] of [['start',''],['start','0'],['start','1.5'],['start','1000000']]){
  await page.locator('#'+id).fill(value);await page.locator('#saveSettings').click();await expect(page.locator('#settingsStatus')).toContainText('Settings not saved.');
 }
 await page.locator('#start').fill('1');await page.locator('#prefix').fill('../path');await page.locator('#saveSettings').click();await expect(page.locator('#settingsStatus')).toContainText('Settings not saved.');expect(downloads).toBe(0);
 await page.locator('#prefix').fill('CURRENT');
 await page.evaluate(()=>{const real=File.prototype.arrayBuffer;File.prototype.arrayBuffer=function(){return new Promise(r=>window.finish=()=>real.call(this).then(r));};});
 await load(page,base);await expect(page.locator('#settingsStatus')).toContainText('Reading');
 const saved=await download(page,'#saveSettings');expect(JSON.parse(fs.readFileSync(await saved.path(),'utf8')).prefix).toBe('CURRENT');
 await page.evaluate(()=>window.finish());await expect(page.locator('#prefix')).toHaveValue('CURRENT');
});
test('newer settings, manual edits, read errors and chooser cancellation never overwrite current work',async({page})=>{
 await page.evaluate(()=>{const real=File.prototype.arrayBuffer;window.reads=[];File.prototype.arrayBuffer=function(){return new Promise((resolve,reject)=>window.reads.push({resolve:()=>real.call(this).then(resolve,reject),reject}));};});
 await load(page,base);await expect.poll(()=>page.evaluate(()=>window.reads.length)).toBe(1);
 await page.locator('#names').fill('user-photo.png');await page.evaluate(()=>window.reads[0].resolve());await expect(page.locator('#mode')).toHaveValue('clean');
 await load(page,base);await load(page,{...base,prefix:'NEWER'});await expect.poll(()=>page.evaluate(()=>window.reads.length)).toBe(3);
 await page.evaluate(()=>window.reads[2].resolve());await expect(page.locator('#prefix')).toHaveValue('NEWER');await page.evaluate(()=>window.reads[1].resolve());await expect(page.locator('#prefix')).toHaveValue('NEWER');
 const before=await values(page);await load(page,base);await page.evaluate(()=>window.reads[3].reject(Error('Unreadable')));await expect(page.locator('#settingsStatus')).toContainText('could not be read');expect(await values(page)).toEqual(before);
 const wait=page.waitForEvent('filechooser');await page.locator('#loadSettings').click();await(await wait).setFiles([]);expect(await values(page)).toEqual(before);
});
test('filename-list and settings loads cannot overwrite a newer action in the other loader',async({page})=>{
 await page.evaluate(()=>{const real=File.prototype.arrayBuffer;window.reads=[];File.prototype.arrayBuffer=function(){return new Promise(resolve=>window.reads.push(()=>real.call(this).then(resolve)));};});
 await load(page,base);
 const wait=page.waitForEvent('filechooser');await page.locator('#loadFilenameList').click();await(await wait).setFiles({name:'names.txt',mimeType:'text/plain',buffer:Buffer.from('new.png')});
 await expect.poll(()=>page.evaluate(()=>window.reads.length)).toBe(2);await page.evaluate(()=>window.reads[1]());await expect(page.locator('#names')).toHaveValue('new.png');
 await page.evaluate(()=>window.reads[0]());await expect(page.locator('#mode')).toHaveValue('clean');
 await page.locator('#filenameListFile').setInputFiles({name:'names2.txt',mimeType:'text/plain',buffer:Buffer.from('old.png')});
 await load(page,base);await expect.poll(()=>page.evaluate(()=>window.reads.length)).toBe(4);
 await page.evaluate(()=>window.reads[3]());await expect(page.locator('#prefix')).toHaveValue(base.prefix);await page.evaluate(()=>window.reads[2]());await expect(page.locator('#names')).toHaveValue('new.png');
});
test('loading valid settings cancels an in-flight ZIP rather than exporting old names',async({page})=>{
 await batch(page);let downloads=0;page.on('download',()=>downloads++);
 await page.evaluate(()=>{const real=File.prototype.arrayBuffer;File.prototype.arrayBuffer=function(){if(this.name.endsWith('.json'))return real.call(this);return new Promise(r=>window.finishPhoto=()=>real.call(this).then(r));};});
 await page.locator('#downloadZip').click();await expect(page.locator('#zipStatus')).toContainText('Preparing');
 await load(page,base);await expect(page.locator('#settingsStatus')).toContainText('Settings loaded.');await page.evaluate(()=>window.finishPhoto());
 await expect(page.locator('#zipStatus')).toContainText('Ready to download');await expect(page.locator('#result')).toHaveValue('sku_café_0037.PNG\nsku_café_0038.png');expect(downloads).toBe(0);
});
