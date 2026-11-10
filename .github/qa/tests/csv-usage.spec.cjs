const {test,expect}=require('@playwright/test');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'../../..');
const hub='https://utilityshelf.site', csvOrigin='https://csv-import-checker.utilityshelf.site';
const collector='https://filename-cleaner.utilityshelf.site/usage';
const tools=['csv-import-checker','csv-column-mapper','csv-formula-checker'];
const corrected='SKU,Product,Price,Cost\r\nA101,"Mug, blue",12.00,8.00\r\nA102,Notebook,6.50,4.00\r\nA103,"Frame, small",15.00,9.50\r\n';
async function open(page,tool,options={}) {
 const events=[],requests=[];
 page.on('request',r=>requests.push(r.url()));
 await page.addInitScript(o=>{
  Object.defineProperty(navigator,'webdriver',{value:!!o.automated});
  Object.defineProperty(navigator,'doNotTrack',{value:o.dnt?'1':null});
  Object.defineProperty(navigator,'globalPrivacyControl',{value:!!o.gpc});
 },options);
 await page.route('**/*',async route=>{
  const req=route.request(),url=new URL(req.url());
  if(url.href===collector){
   if(options.offline)return route.abort();
   events.push(JSON.parse(req.postData()));
   return route.fulfill({status:204,headers:{'Access-Control-Allow-Origin':tool==='csv-import-checker'?csvOrigin:hub}});
  }
  if(![hub,csvOrigin].includes(url.origin))return route.abort();
  const base=url.origin===csvOrigin?'tools/csv-import-checker':'';
  const file=path.join(root,base,url.pathname.endsWith('/')?url.pathname+'index.html':url.pathname);
  return route.fulfill({body:fs.readFileSync(file),contentType:file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html'});
 });
 const url=tool==='csv-import-checker'?csvOrigin+'/':hub+'/utilities/'+tool+'/';
 await page.goto(url+(options.testMode?'?test-mode=1':options.release?'?release-check=1':''));
 return {events,requests};
}
async function download(page) {
 const pending=page.waitForEvent('download');await page.locator('#download').click();return pending;
}
async function runCustom(page,tool) {
 await page.locator('#source').fill(corrected);
 if(tool==='csv-import-checker') {
  await page.locator('#check').click();await expect(page.locator('#download')).toBeEnabled();await download(page);
 } else if(tool==='csv-column-mapper') {
  await page.locator('#target').fill('SKU,Title,Price');await page.locator('#prepare').click();
  await page.locator('#source-1').selectOption('1');await page.locator('#generate').click();await download(page);
 } else { await page.locator('#scan').click();await expect(page.locator('#summary')).toContainText('0 fields to review'); }
}

test('corrected download requires the latest passing check and preserves exact CSV contents',async({page})=>{
 const {events}=await open(page,'csv-import-checker');
 await expect(page.locator('#download')).toBeDisabled();
 await page.locator('#sample').click();await page.locator('#check').click();
 await expect(page.locator('#summary')).toContainText('2 issues');await expect(page.locator('#download')).toBeDisabled();
 await page.locator('#source').fill(corrected);await expect(page.locator('#download')).toBeDisabled();await page.locator('#check').click();
 const saved=await download(page);expect(saved.suggestedFilename()).toBe('corrected.csv');
 // Textareas normalise CRLF; the export preserves the exact checked textarea text.
 expect(fs.readFileSync(await saved.path(),'utf8')).toBe(corrected.replaceAll('\r\n','\n'));
 await download(page);await page.locator('#check').click();
 await expect.poll(()=>events.length).toBe(3);
 expect(events).toEqual([
  {tool:'csv-import-checker',event:'check_complete',mode:'issues',source:'sample'},
  {tool:'csv-import-checker',event:'check_complete',mode:'passed',source:'custom'},
  {tool:'csv-import-checker',event:'corrected_download',mode:'passed',source:'custom'}
 ]);
 for(const bad of ['', 'A,A\n1,2', 'A,B\n1', 'A,B\n"broken', 'A;B\n1;2']) {
  await page.locator('#source').fill(bad);await expect(page.locator('#download')).toBeDisabled();
  await page.locator('#check').click();await expect(page.locator('#download')).toBeDisabled();
 }
 const guide=fs.readFileSync(path.join(root,'guides/prepare-supplier-csv-for-import.html'),'utf8');
 expect(guide).toContain('A102,Notebook,6.50,4.00');expect(guide).not.toContain('4.20');
});

test('new or failed file reads cannot download a previously checked CSV',async({page})=>{
 await open(page,'csv-import-checker',{testMode:true});await runCustom(page,'csv-import-checker');
 await page.evaluate(()=>{File.prototype.text=function(){return new Promise((resolve,reject)=>{window.pendingRead={resolve,reject};});};});
 await page.locator('#file').setInputFiles({name:'later.csv',mimeType:'text/csv',buffer:Buffer.from('A,B\n1,2')});
 await expect(page.locator('#download')).toBeDisabled();
 await expect(page.locator('#source')).toHaveValue('');await page.locator('#check').click();await expect(page.locator('#download')).toBeDisabled();
 await page.evaluate(()=>window.pendingRead.reject(new Error('read failed')));
 await expect(page.locator('#summary')).toContainText('Could not read');await expect(page.locator('#download')).toBeDisabled();
 await page.locator('#file').setInputFiles({name:'later.csv',mimeType:'text/csv',buffer:Buffer.from('A,B\n1,2')});
 await page.locator('#source').fill('New,Data\n3,4');await page.locator('#check').click();
 await page.evaluate(()=>window.pendingRead.resolve('STALE,FILE\n5,6'));
 const saved=await download(page);expect(fs.readFileSync(await saved.path(),'utf8')).toBe('New,Data\n3,4');
});

test('mapper counts completed mappings and download starts, with fixed labels and sample separation',async({page})=>{
 const {events}=await open(page,'csv-column-mapper');
 await page.locator('#prepare').click();expect(events).toEqual([]);
 await page.locator('#sample').click();await download(page);await download(page);
 await runCustom(page,'csv-column-mapper');
 await expect.poll(()=>events.length).toBe(4);
 expect(events).toEqual(['sample','custom'].flatMap(source=>['build_complete','mapped_download'].map(event=>({tool:'csv-column-mapper',event,mode:'mapped',source}))));
 expect(JSON.stringify(events)).not.toMatch(/A101|Mug|SKU|Price|Cost/);
 await page.locator('#source-1').selectOption('empty');await expect(page.locator('#result')).toBeHidden();
});

test('formula scans count clear and warning outcomes but not empty or incomplete input',async({page})=>{
 const {events}=await open(page,'csv-formula-checker');
 await page.locator('#scan').click();
 await page.locator('#source').fill('A\n"broken');await page.locator('#scan').click();expect(events).toEqual([]);
 await page.locator('#sample').click();await page.locator('#scan').click();
 await runCustom(page,'csv-formula-checker');
 await page.locator('#source').fill('Note\n=PRIVATE');await page.locator('#scan').click();
 await expect.poll(()=>events.length).toBe(3);
 expect(events).toEqual([
  {tool:'csv-formula-checker',event:'scan_complete',mode:'warnings',source:'sample'},
  {tool:'csv-formula-checker',event:'scan_complete',mode:'clear',source:'custom'},
  {tool:'csv-formula-checker',event:'scan_complete',mode:'warnings',source:'custom'}
 ]);
});

for(const tool of tools)for(const setting of ['testMode','optout','dnt','gpc','automated','release','offline'])test(tool+' respects '+setting+' without breaking results',async({page})=>{
 const {events,requests}=await open(page,tool,{[setting]:true});
 if(setting==='optout')await page.locator('#usage').uncheck();
 if(['testMode','dnt','gpc'].includes(setting))await expect(page.locator('#usage')).toBeDisabled();
 await runCustom(page,tool);
 await page.waitForTimeout(150);expect(events).toEqual([]);
 if(['testMode','release','automated'].includes(setting))expect(requests.filter(url=>url.includes('cloudflareinsights'))).toEqual([]);
 if(setting==='testMode') {
  await expect(page.locator('#testModeNotice')).toBeVisible();
  const links=await page.locator('a[href]').evaluateAll(nodes=>nodes.map(n=>n.href).filter(h=>h.includes('csv-import-checker.utilityshelf.site/')||h.includes('/utilities/csv-column-mapper/')||h.includes('/utilities/csv-formula-checker/')));
  expect(links.length).toBeGreaterThan(0);for(const link of links)expect(new URL(link).searchParams.get('test-mode')).toBe('1');
 }
});
