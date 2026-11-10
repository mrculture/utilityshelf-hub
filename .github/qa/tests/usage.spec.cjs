const {test,expect}=require('@playwright/test');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'../../..');
const origin='https://utilityshelf.site';
const collector='https://filename-cleaner.utilityshelf.site/usage';
async function open(page,tool,options={}) {
 const events=[];
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
   return route.fulfill({status:204,headers:{'Access-Control-Allow-Origin':origin}});
  }
  if(url.origin!==origin)return route.abort();
  const file=path.join(root,url.pathname.endsWith('/')?url.pathname+'index.html':url.pathname);
  return route.fulfill({body:fs.readFileSync(file),contentType:file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html'});
 });
 await page.goto(origin+'/utilities/'+tool+'/'+(options.release?'?release-check=1':''));
 return events;
}
async function customPhotos(page,count=2){
 const png=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=c.height=40;return c.toDataURL().split(',')[1];});
 await page.locator('#files').setInputFiles(Array.from({length:count},(_,i)=>({name:'PRIVATE-SKU-'+i+'.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')})));
}
async function download(page){const pending=page.waitForEvent('download');await page.locator('#download').click();await pending;}

test('contact events follow successful reorder and export, deduplicate, separate sample/custom and omit filenames',async({page})=>{
 const events=await open(page,'image-contact-sheet');
 await page.locator('#demo').click();
 await expect(page.locator('#names li')).toHaveCount(3,{timeout:15000});
 expect(events).toEqual([]);
 await page.getByRole('button',{name:'Move later: photo 1, front.png',exact:true}).click();
 await page.getByRole('button',{name:'Move earlier: photo 2, front.png',exact:true}).click();
 await download(page);await download(page);
 await customPhotos(page);
 await expect(page.locator('#names li')).toHaveCount(2);
 await page.locator('#names li').first().getByRole('button',{name:/Move later/}).click();
 await download(page);
 await expect.poll(()=>events.length).toBe(4);
 expect(events).toEqual(['sample','custom'].flatMap(source=>['reorder','sheet_download'].map(event=>({tool:'image-contact-sheet',event,mode:'sheet',source}))));
 expect(JSON.stringify(events)).not.toMatch(/PRIVATE|SKU|png/);
});

test('image completion and eBay use require readable photos and valid limits, with stable categories',async({page})=>{
 const events=await open(page,'image-dimension-checker');
 await page.locator('#preset').selectOption('ebay');
 await page.waitForTimeout(600);expect(events).toEqual([]);
 await page.locator('#files').setInputFiles({name:'PRIVATE.png',mimeType:'image/png',buffer:Buffer.from('invalid')});
 await expect(page.locator('#status')).toContainText('0 of 1');
 await page.waitForTimeout(600);expect(events).toEqual([]);
 await page.locator('#width').fill('0');await customPhotos(page);
 await expect(page.locator('#status')).toContainText('Enter valid limits');
 await page.waitForTimeout(600);expect(events).toEqual([]);
 await page.locator('#preset').selectOption('ebay');
 await expect.poll(()=>events.length).toBe(2);
 await page.locator('#preset').selectOption('ebay');
 await page.locator('#height').fill('40');
 await expect.poll(()=>events.length).toBe(3);
 await page.locator('#demo').click();
 await expect.poll(()=>events.length,{timeout:15000}).toBe(4);
 await page.locator('#preset').selectOption('ebay');
 await expect.poll(()=>events.length).toBe(6);
 expect(events).toEqual([
  {tool:'image-dimension-checker',event:'check_complete',mode:'ebay',source:'custom'},
  {tool:'image-dimension-checker',event:'ebay_preset',mode:'ebay',source:'custom'},
  {tool:'image-dimension-checker',event:'check_complete',mode:'custom',source:'custom'},
  {tool:'image-dimension-checker',event:'check_complete',mode:'custom',source:'sample'},
  {tool:'image-dimension-checker',event:'check_complete',mode:'ebay',source:'sample'},
  {tool:'image-dimension-checker',event:'ebay_preset',mode:'ebay',source:'sample'}
 ]);
});

for(const setting of ['optout','dnt','gpc','automated','release'])test('image usage suppressed for '+setting,async({page})=>{
 const events=await open(page,'image-dimension-checker',{[setting]:true});
 if(setting==='optout')await page.locator('#usage').uncheck();
 if(['dnt','gpc'].includes(setting))await expect(page.locator('#usage')).toBeDisabled();
 await customPhotos(page);
 await expect(page.locator('#status')).toContainText('0 of 2');
 await page.locator('#preset').selectOption('ebay');
 await page.waitForTimeout(700);
 expect(events).toEqual([]);
});

test('failed and stale PNG exports do not count, and unavailable tracking does not break reordering',async({page})=>{
 const events=await open(page,'image-contact-sheet');
 await customPhotos(page);await expect(page.locator('#download')).toBeEnabled();
 await page.evaluate(()=>{document.getElementById('sheet').toBlob=cb=>cb(null);});
 await page.locator('#download').click();
 await expect(page.locator('#status')).toContainText('PNG export failed');expect(events).toEqual([]);
 await page.evaluate(()=>{document.getElementById('sheet').toBlob=cb=>window.exportCallback=cb;});
 await page.locator('#download').click();
 await page.locator('#columns').selectOption('2');
 await page.evaluate(()=>window.exportCallback(new Blob(['stale'])));
 expect(events).toEqual([]);
 await open(page,'image-contact-sheet',{offline:true});await customPhotos(page);
 await expect(page.locator('#names li')).toHaveCount(2);
 await page.locator('#names li').first().getByRole('button',{name:/Move later/}).click();
 await expect(page.locator('#names li > span')).toHaveText(['PRIVATE-SKU-1.png','PRIVATE-SKU-0.png']);
 await download(page);
});
