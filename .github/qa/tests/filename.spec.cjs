const {test,expect}=require('@playwright/test');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'../../../tools/filename-cleaner');
const origin='https://filename-cleaner.utilityshelf.site';

async function openTool(page,{tracking=false,clipboardFails=false,dnt=false}={}) {
 const events=[];
 await page.addInitScript(({tracking,clipboardFails,dnt})=>{
  Object.defineProperty(navigator,'webdriver',{value:!tracking});
  Object.defineProperty(navigator,'doNotTrack',{value:dnt?'1':null});
  Object.defineProperty(navigator,'clipboard',{value:{writeText:async text=>{if(clipboardFails)throw Error('Denied');window.copiedText=text;}}});
 },{tracking,clipboardFails,dnt});
 await page.route('**/*',async route=>{
  const url=new URL(route.request().url());
  if(url.origin!==origin)return route.abort();
  if(url.pathname==='/usage'){events.push(JSON.parse(route.request().postData()));return route.fulfill({status:204});}
  const file=url.pathname==='/'?'index.html':url.pathname.slice(1);
  if(!['index.html','app.js'].includes(file))return route.fulfill({status:404});
  return route.fulfill({body:fs.readFileSync(path.join(root,file)),contentType:file.endsWith('.js')?'text/javascript':'text/html'});
 });
 await page.goto(origin);
 return events;
}

test('five-photo duplicates stay blocked until corrected; selectable final list matches copy',async({page})=>{
 await openTool(page);
 await page.locator('#sample').click();
 await expect(page.locator('#summary')).toHaveText('2 of 5 names need review.');
 await expect(page.locator('#copy')).toBeDisabled();
 await expect(page.locator('#manual')).toBeHidden();
 await page.locator('#name-2').fill('front-view-detail.jpg');
 await expect(page.locator('#summary')).toHaveText('5 names ready.');
 await page.locator('#copy').click();
 expect(await page.evaluate(()=>window.copiedText)).toBe('front-view.JPG\nfront-view-detail.jpg\nside-left.png\nrear-detail-02.jpeg\nbox-accessories.webp');
 await page.locator('#selectList').click();
 expect(await page.locator('#result').evaluate(e=>e.selectionEnd-e.selectionStart)).toBe((await page.locator('#result').inputValue()).length);
});

test('SKU numbering preserves extensions, order, Unicode and configurable padding',async({page})=>{
 await openTool(page);
 await page.locator('#sample').click();
 await page.locator('#mode').selectOption('numbered');
 await page.locator('#prefix').fill('SKU-1042');
 await expect(page.locator('#result')).toHaveValue('sku-1042-001.JPG\nsku-1042-002.jpg\nsku-1042-003.png\nsku-1042-004.jpeg\nsku-1042-005.webp');
 await page.locator('#names').fill('Side (Left).png\nFront View.JPG');
 await page.locator('#prefix').fill('Café 42');
 await page.locator('#style').selectOption('_');
 await page.locator('#start').fill('99');
 await page.locator('#digits').selectOption('2');
 await expect(page.locator('#result')).toHaveValue('café_42_99.png\ncafé_42_100.JPG');
 await page.locator('#prefix').fill('');
 await expect(page.locator('#result')).toHaveValue('photo_99.png\nphoto_100.JPG');
 await page.locator('#mode').selectOption('clean');
 await expect(page.locator('#result')).toHaveValue('side_left.png\nfront_view.JPG');
});

test('invalid settings, paths, edited duplicates and extension changes block final output',async({page})=>{
 await openTool(page);
 await page.locator('#names').fill('A.JPG\nB.png');
 await page.locator('#mode').selectOption('numbered');
 for(const value of ['','0','1.5','999999']) {
  await page.locator('#start').fill(value);
  await expect(page.locator('#copy')).toBeDisabled();
  await expect(page.locator('#settingsIssue')).not.toBeEmpty();
 }
 await page.locator('#start').fill('1');
 await page.locator('#prefix').fill('../secret');
 await expect(page.locator('#copy')).toBeDisabled();
 await page.locator('#prefix').fill('sku');
 await page.locator('#name-1').fill('sku-001.jpg');
 await expect(page.locator('#issue-1')).toContainText('original extension .JPG');
 await page.locator('#name-1').fill('CON.JPG');
 await expect(page.locator('#issue-1')).toContainText('reserved on Windows');
 await page.locator('#names').fill('folder/file.jpg');
 await expect(page.locator('#copy')).toBeDisabled();
 await expect(page.locator('#issue-1')).toContainText('just the filename');
 await page.locator('#names').fill('a.jpg\nb.jpg');
 await page.locator('#name-2').fill('sku-001.jpg');
 await expect(page.locator('#summary')).toHaveText('2 of 2 names need review.');
});

test('usage has only allowlisted labels, separates sample use and deduplicates actions',async({page})=>{
 const events=await openTool(page,{tracking:true});
 await page.locator('#sample').click();
 await page.locator('#mode').selectOption('numbered');
 await expect.poll(()=>events.length).toBe(1);
 expect(events[0]).toEqual({event:'ready',mode:'numbered',source:'sample'});
 await page.locator('#copy').click();
 await page.locator('#copy').click();
 await expect.poll(()=>events.length).toBe(2);
 await page.locator('#names').fill('PRIVATE-customer.jpg');
 await page.locator('#prefix').fill('SECRET-SKU');
 await expect.poll(()=>events.length).toBe(3);
 await page.locator('#copy').click();
 await expect.poll(()=>events.length).toBe(4);
 expect(events).toEqual([
  {event:'ready',mode:'numbered',source:'sample'}, {event:'copy',mode:'numbered',source:'sample'},
  {event:'ready',mode:'numbered',source:'custom'}, {event:'copy',mode:'numbered',source:'custom'}
 ]);
 expect(JSON.stringify(events)).not.toMatch(/PRIVATE|SECRET|customer|SKU|jpg/);
});

test('opt-out and Do Not Track suppress usage; denied clipboard does not report a copy',async({page})=>{
 let events=await openTool(page,{tracking:true,clipboardFails:true});
 await page.locator('#names').fill('Product.JPG');
 await page.locator('#copy').click();
 await expect(page.locator('#copyStatus')).toContainText('List selected');
 await expect.poll(()=>events.length).toBe(1);
 expect(events[0].event).toBe('ready');
 await page.locator('#usage').uncheck();
 await page.locator('#mode').selectOption('numbered');
 await page.waitForTimeout(1700);
 expect(events.length).toBe(1);
 const next=await page.context().newPage();
 events=await openTool(next,{tracking:true,dnt:true});
 await expect(next.locator('#usage')).not.toBeChecked();
 await expect(next.locator('#usage')).toBeDisabled();
 await next.locator('#names').fill('Product.JPG');
 await next.locator('#copy').click();
 await next.waitForTimeout(1700);
 expect(events).toEqual([]);
});
