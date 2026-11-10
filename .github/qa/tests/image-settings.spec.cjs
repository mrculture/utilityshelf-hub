const {test,expect}=require('@playwright/test');
const fs=require('node:fs');
const base={tool:'utilityshelf-image-dimension-checker',version:1,preset:'custom',minimumWidth:800,minimumHeight:600,maximumSizeMB:2.5,maximumLongEdge:2400};
const file=value=>({name:'settings.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(value))});
test.beforeEach(async({page,context})=>{
 await context.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
 await page.goto('/utilities/image-dimension-checker/?test-mode=1');
});
async function load(page,value){const pending=page.waitForEvent('filechooser');await page.locator('#loadSettings').click();await (await pending).setFiles(file(value));}
async function download(page,id){const pending=page.waitForEvent('download');await page.locator(id).click();return await pending;}
async function values(page){return page.evaluate(()=>Object.fromEntries(['preset','width','height','size','maxEdge'].map(id=>[id,document.getElementById(id).value])));}
async function demo(page){await page.locator('#demo').click();await expect(page.locator('#output tbody tr')).toHaveCount(2,{timeout:15000});}

test('custom settings round trip across visits without photos or filenames, including fractional MB',async({page})=>{
 const remote=[];page.on('request',r=>{if(new URL(r.url()).hostname!=='127.0.0.1')remote.push(r.url());});
 await page.locator('#width').fill('1200');await page.locator('#height').fill('900');await page.locator('#size').fill('2.5');await page.locator('#maxEdge').fill('2400');
 const saved=await download(page,'#saveSettings');expect(saved.suggestedFilename()).toBe('image-dimension-settings.json');
 const path=await saved.path(),json=JSON.parse(fs.readFileSync(path,'utf8'));expect(json).toEqual({...base,minimumWidth:1200,minimumHeight:900});
 await page.reload();const pending=page.waitForEvent('filechooser');await page.locator('#loadSettings').click();await (await pending).setFiles(path);
 await expect(page.locator('#settingsStatus')).toContainText('Settings loaded: 1200 × 900');
 expect(await values(page)).toEqual({preset:'custom',width:'1200',height:'900',size:'2.5',maxEdge:'2400'});
 await expect(page.locator('#output tbody tr')).toHaveCount(0);await expect(page.locator('#downloadReport')).toBeDisabled();expect(remote).toEqual([]);
});

test('eBay preset and blank maximum long edge restore exactly and can be saved without photos',async({page})=>{
 await page.locator('#preset').selectOption('ebay');const saved=await download(page,'#saveSettings');const json=JSON.parse(fs.readFileSync(await saved.path(),'utf8'));
 expect(json).toEqual({...base,preset:'ebay',minimumWidth:1600,minimumHeight:1600,maximumSizeMB:12,maximumLongEdge:null});
 await page.locator('#width').fill('400');await page.locator('#maxEdge').fill('500');await load(page,json);
 await expect(page.locator('#settingsStatus')).toContainText('long edge not set');await expect(page.locator('#ebayHelp')).toBeVisible();
 expect(await values(page)).toEqual({preset:'ebay',width:'1600',height:'1600',size:'12',maxEdge:''});
});

test('loading settings rechecks the existing batch, updates its report, and clears a prepared resize ZIP',async({page})=>{
 await demo(page);await page.locator('#height').fill('600');await page.locator('#prepareResize').click();await expect(page.locator('#downloadResized')).toBeEnabled();
 await load(page,{...base,minimumWidth:1100,minimumHeight:800});await expect(page.locator('#status')).toHaveText('0 of 2 meet your limits.');
 await expect(page.locator('#downloadResized')).toBeDisabled();await expect(page.locator('#resizeResults')).toBeEmpty();
 const report=fs.readFileSync(await (await download(page,'#downloadReport')).path(),'utf8');expect(report).toContain('Minimum width: 1100 px; minimum height: 800 px.');expect(report).toContain('Selected: 2. Passed: 0.');
 await load(page,base);await expect(page.locator('#status')).toHaveText('2 of 2 meet your limits.');await page.locator('#prepareResize').click();await expect(page.locator('#downloadResized')).toBeEnabled();
});

test('invalid JSON, schemas, ranges and contradictory settings preserve all current results',async({page})=>{
 await demo(page);await page.locator('#height').fill('600');await page.locator('#prepareResize').click();await expect(page.locator('#downloadResized')).toBeEnabled();const before=await values(page);
 const invalid=[null,[],{}, {...base,tool:'another-tool'}, {...base,version:2}, {...base,minimumWidth:'800'}, {...base,minimumHeight:0}, {...base,minimumWidth:100001}, {...base,minimumWidth:1.5}, {...base,maximumSizeMB:.0001}, {...base,maximumSizeMB:33}, {...base,maximumLongEdge:15}, {...base,maximumLongEdge:8001}, {...base,maximumLongEdge:500}, {...base,preset:'ebay'}, {...base,preset:'unknown'}, {...base,photos:['private.jpg']}];
 for(const value of invalid){await load(page,value);await expect(page.locator('#settingsStatus')).toContainText('Settings not loaded.');expect(await values(page)).toEqual(before);await expect(page.locator('#downloadResized')).toBeEnabled();}
 for(const buffer of [Buffer.from('{bad json'),Buffer.alloc(8193,32),Buffer.alloc(0)]){
  await page.locator('#settingsFile').setInputFiles({name:'invalid.json',mimeType:'application/json',buffer});await expect(page.locator('#settingsStatus')).toContainText('Settings not loaded.');expect(await values(page)).toEqual(before);
 }
 await expect(page.locator('#status')).toHaveText('2 of 2 meet your limits.');await expect(page.locator('#downloadResized')).toBeEnabled();
});

test('invalid or conflicting current limits cannot be saved',async({page})=>{
 let downloads=0;page.on('download',()=>downloads++);
 await page.locator('#width').fill('');await page.locator('#saveSettings').click();await expect(page.locator('#settingsStatus')).toContainText('Settings not saved.');
 await page.locator('#width').fill('800');await page.locator('#maxEdge').fill('500');await page.locator('#saveSettings').click();await expect(page.locator('#settingsStatus')).toContainText('cannot be smaller');
 await page.locator('#maxEdge').fill('800.5');await page.locator('#saveSettings').click();await expect(page.locator('#settingsStatus')).toContainText('Settings not saved.');expect(downloads).toBe(0);
});

test('pending loads cannot overwrite manual changes or a newer load; read failures and cancellation are non-destructive',async({page})=>{
 await page.evaluate(()=>{const read=File.prototype.text;window.reads=[];File.prototype.text=function(){return new Promise((resolve,reject)=>window.reads.push({resolve:()=>read.call(this).then(resolve,reject),reject}));};});
 await load(page,base);await expect.poll(()=>page.evaluate(()=>window.reads.length)).toBe(1);
 await page.locator('#width').fill('999');await page.evaluate(()=>window.reads[0].resolve());await expect(page.locator('#width')).toHaveValue('999');
 await load(page,base);await load(page,{...base,minimumWidth:1200});await expect.poll(()=>page.evaluate(()=>window.reads.length)).toBe(3);
 await page.evaluate(()=>window.reads[2].resolve());await expect(page.locator('#width')).toHaveValue('1200');await page.evaluate(()=>window.reads[1].resolve());await expect(page.locator('#width')).toHaveValue('1200');
 const before=await values(page);await load(page,base);await page.evaluate(()=>window.reads[3].reject(Error('Unreadable')));await expect(page.locator('#settingsStatus')).toContainText('could not be read');expect(await values(page)).toEqual(before);
 const pending=page.waitForEvent('filechooser');await page.locator('#loadSettings').click();await (await pending).setFiles([]);await page.locator('#settingsFile').dispatchEvent('cancel');expect(await values(page)).toEqual(before);
});

test('loading settings during resizing cancels its old output',async({page})=>{
 await demo(page);await page.locator('#width').fill('400');await page.locator('#height').fill('300');await page.locator('#maxEdge').fill('500');
 await page.evaluate(()=>{const encode=HTMLCanvasElement.prototype.toBlob;window.encodes=[];HTMLCanvasElement.prototype.toBlob=function(...args){window.encodes.push(()=>encode.apply(this,args));};});
 await page.locator('#prepareResize').click();await expect.poll(()=>page.evaluate(()=>window.encodes.length)).toBe(1);
 await load(page,base);await expect(page.locator('#settingsStatus')).toContainText('Settings loaded:');await page.evaluate(()=>window.encodes[0]());
 await expect(page.locator('#downloadResized')).toBeDisabled();await expect(page.locator('#resizeResults')).toBeEmpty();await expect(page.locator('#status')).toHaveText('2 of 2 meet your limits.');
});
