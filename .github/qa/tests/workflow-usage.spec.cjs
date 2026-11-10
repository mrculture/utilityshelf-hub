const {test,expect}=require('@playwright/test');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'../../..');
const hub='https://utilityshelf.site';
const collector='https://filename-cleaner.utilityshelf.site/usage';
async function open(page,mode='home',options={}) {
 const events=[],requests=[];
 await page.addInitScript(o=>{
  Object.defineProperty(navigator,'webdriver',{value:!!o.automated});
  Object.defineProperty(navigator,'doNotTrack',{value:o.dnt?'1':null});
  Object.defineProperty(navigator,'globalPrivacyControl',{value:!!o.gpc});
 },options);
 await page.route('**/*',route=>{
  const req=route.request(),url=new URL(req.url());requests.push(url.href);
  if(url.href===collector){
   events.push(JSON.parse(req.postData()));
   return options.offline?route.abort():route.fulfill({status:204,headers:{'Access-Control-Allow-Origin':hub}});
  }
  if(url.origin!==hub && url.origin!=='http://preview.example')return route.abort();
  const file=path.join(root,url.pathname);
  const resolved=[file,file+'.html',path.join(file,'index.html')].find(p=>fs.existsSync(p)&&fs.statSync(p).isFile());
  return resolved?route.fulfill({body:fs.readFileSync(resolved),contentType:resolved.endsWith('.js')?'text/javascript':resolved.endsWith('.css')?'text/css':'text/html'}):route.fulfill({status:404});
 });
 const query=options.testMode?'?test-mode=1':options.release?'?release-check=1':'';
 await page.goto((options.preview?'http://preview.example':hub)+(mode==='home'?'/':'/guides/prepare-product-photos-for-ebay')+query);
 return {events,requests};
}
const payload=(event,mode)=>({tool:'product-photo-workflow',event,mode,source:'custom'});
// Let actual click handlers run, but keep this test document for dedup checks.
async function keepPage(page){await page.evaluate(()=>document.addEventListener('click',e=>{if(e.target.closest('a'))e.preventDefault();}));}

test('homepage entry needs workflow exposure; clicks have fixed labels and deduplicate',async({page})=>{
 const {events}=await open(page);
 await page.waitForTimeout(200);expect(events).toEqual([]);
 await page.locator('[data-workflow-entry]').scrollIntoViewIfNeeded();
 await expect.poll(()=>events.length).toBe(1);
 await keepPage(page);
 for(const action of ['check_resize','arrange','name_download','walkthrough']){
  await page.locator(`[data-photo-step="${action}"]`).click();
  await page.locator(`[data-photo-step="${action}"]`).click();
 }
 await expect.poll(()=>events.length).toBe(5);
 expect(events).toEqual(['entry','check_resize','arrange','name_download','walkthrough'].map(a=>payload(a,'home')));
 expect(JSON.stringify(events)).not.toMatch(/https|filename|\.jpg|identifier/);
});

test('guide records a separate entry and all three step links, including keyboard activation',async({page})=>{
 const {events}=await open(page,'guide');
 await expect.poll(()=>events).toEqual([payload('entry','guide')]);
 await keepPage(page);
 for(const action of ['check_resize','arrange','name_download']){
  const link=page.locator(`[data-photo-step="${action}"]`);
  await link.focus();await link.press('Enter');
 }
 await expect.poll(()=>events.length).toBe(4);
 expect(events).toEqual(['entry','check_resize','arrange','name_download'].map(a=>payload(a,'guide')));
});

for(const mode of ['home','guide'])for(const setting of ['testMode','dnt','gpc','automated','release','preview'])test(`${mode} workflow excludes ${setting}`,async({page})=>{
 const {events,requests}=await open(page,mode,{[setting]:true});
 await page.locator('[data-workflow-entry]').scrollIntoViewIfNeeded();
 await keepPage(page);
 for(const link of await page.locator('[data-photo-step]').all())await link.click();
 await page.waitForTimeout(150);
 expect(events).toEqual([]);
 if(['testMode','release','automated'].includes(setting))expect(requests.filter(u=>u.includes('cloudflareinsights'))).toEqual([]);
 if(['testMode','dnt','gpc'].includes(setting))await expect(page.locator('#usage')).toBeDisabled();
 if(setting==='testMode'){
  await expect(page.locator('#testModeNotice')).toBeVisible();
  for(const link of await page.locator('[data-photo-step]').all())await expect(link).toHaveAttribute('href',/test-mode=1/);
 }
});

test('opt-out stops further workflow actions; unrelated links are not step events',async({page})=>{
 const {events}=await open(page);
 await page.locator('#usage').uncheck();
 // Scrolling to the choice may count exposure; no step clicks should count.
 await keepPage(page);
 for(const link of await page.locator('[data-photo-step]').all())await link.click();
 expect(events.filter(e=>e.event!=='entry')).toEqual([]);
 await page.locator('#usage').check();
 await page.locator('[data-workflow-entry]').scrollIntoViewIfNeeded();
 await expect.poll(()=>events.filter(e=>e.event==='entry').length).toBe(1);
 await page.locator('#product-photos a[href="/privacy"]').click();
 await page.locator('#supplier-csv a').first().click();
 expect(events).toEqual([payload('entry','home')]);
});

test('a step link establishes entry even without IntersectionObserver; failed collection does not stop navigation',async({page})=>{
 await page.addInitScript(()=>{delete window.IntersectionObserver;});
 const {events}=await open(page,'home',{offline:true});
 await page.locator('[data-photo-step="check_resize"]').click();
 await expect(page).toHaveURL(hub+'/utilities/image-dimension-checker/');
 await expect.poll(()=>events.length).toBe(2);
 expect(events).toEqual([payload('entry','home'),payload('check_resize','home')]);
});
