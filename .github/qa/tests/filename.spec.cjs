const {test,expect}=require('@playwright/test');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'../../../tools/filename-cleaner');
const origin='https://filename-cleaner.utilityshelf.site';

async function openTool(page,{tracking=false,clipboardFails=false,dnt=false,testMode=false}={}) {
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
 await page.goto(origin+(testMode?'/?test-mode=1':''));
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

test('mapping download preserves original order, Unicode and manual edits; invalid lists block export',async({page})=>{
 await openTool(page);
 const button=page.locator('#downloadMapping');
 await expect(button).toBeDisabled();
 await page.locator('#names').fill('Café, "front".JPG\n=1+1.png\nRear.jpg');
 await page.locator('#mode').selectOption('numbered');
 await page.locator('#prefix').fill('PROD1');
 await page.locator('#name-2').fill('prod1-detail.png');
 const pending=page.waitForEvent('download');
 await button.click();
 const download=await pending;
 expect(download.suggestedFilename()).toBe('filename-mapping.txt');
 expect(fs.readFileSync(await download.path(),'utf8')).toBe('\uFEFFUtilityShelf filename mapping\r\nMatch each original file to its new name. This list does not rename files.\r\n\r\n1.\r\nOriginal: Café, "front".JPG\r\nNew: prod1-001.JPG\r\n\r\n2.\r\nOriginal: =1+1.png\r\nNew: prod1-detail.png\r\n\r\n3.\r\nOriginal: Rear.jpg\r\nNew: prod1-003.jpg\r\n');
 await expect(page.locator('#mappingStatus')).toContainText('3 pairs');
 await page.locator('#name-3').fill('prod1-001.JPG');
 await expect(button).toBeDisabled();
 await expect(page.locator('#mappingStatus')).toBeEmpty();
 await page.locator('#names').fill('Single.JPG');
 await page.locator('#start').fill('0');
 await expect(button).toBeDisabled();
 await page.locator('#start').fill('1');
 await page.locator('#mode').selectOption('clean');
 const secondPending=page.waitForEvent('download');
 await button.click();
 const second=await secondPending;
 const text=fs.readFileSync(await second.path(),'utf8');
 expect(text).toContain('1.\r\nOriginal: Single.JPG\r\nNew: single.JPG\r\n');
 expect(text).not.toContain('Rear.jpg');
 await page.locator('#names').fill('');
 await expect(button).toBeDisabled();
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

test('mapping downloads track started exports only, once per mode/source and respect opt-out',async({page})=>{
 const events=await openTool(page,{tracking:true});
 await page.locator('#sample').click();
 await expect(page.locator('#downloadMapping')).toBeDisabled();
 expect(events).toEqual([]);
 await page.locator('#mode').selectOption('numbered');
 for(let i=0;i<2;i++){
  const pending=page.waitForEvent('download');await page.locator('#downloadMapping').click();await pending;
 }
 await expect.poll(()=>events.filter(e=>e.event==='mapping_download').length).toBe(1);
 await page.locator('#names').fill('PRIVATE.jpg');
 await page.locator('#usage').uncheck();
 const pending=page.waitForEvent('download');await page.locator('#downloadMapping').click();await pending;
 expect(events.filter(e=>e.event==='mapping_download')).toEqual([{event:'mapping_download',mode:'numbered',source:'sample'}]);
 await page.locator('#usage').check();
 await page.evaluate(()=>URL.createObjectURL=()=>{throw Error('Failed export');});
 await page.locator('#downloadMapping').click();
 await expect(page.locator('#mappingStatus')).toContainText('could not start');
 expect(events.filter(e=>e.event==='mapping_download').length).toBe(1);
});


test('owner test mode suppresses filename events and beacon while downloads still work',async({page})=>{
 const requests=[];page.on('request',r=>requests.push(r.url()));
 const events=await openTool(page,{tracking:true,testMode:true});
 await expect(page.locator('#testModeNotice')).toBeVisible();
 await expect(page.locator('#usage')).toBeDisabled();
 await page.locator('#names').fill('Owner photo.jpg');
 await page.locator('#mode').selectOption('numbered');
 await page.locator('#copy').click();
 const pending=page.waitForEvent('download');await page.locator('#downloadMapping').click();await pending;
 await page.waitForTimeout(1700);
 expect(events).toEqual([]);
 expect(requests.filter(url=>url.includes('cloudflareinsights'))).toEqual([]);
 await expect(page.getByRole('link',{name:'check your product photos’ dimensions and file sizes'})).toHaveAttribute('href',/test-mode=1/);
 await expect(page.getByRole('link',{name:'Arrange photos and copy their original filenames'})).toHaveAttribute('href',/test-mode=1/);
});
