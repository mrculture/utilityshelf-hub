const {test,expect}=require('@playwright/test');
const fs=require('node:fs');
test.beforeEach(async({page,context})=>{
 await context.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
 await page.goto('/utilities/image-dimension-checker/?test-mode=1');
});
async function photo(page,name,width,height,bytes){
 const data=await page.evaluate(([w,h])=>{const c=document.createElement('canvas');c.width=w;c.height=h;return c.toDataURL().split(',')[1];},[width,height]);
 let buffer=Buffer.from(data,'base64');if(bytes)buffer=Buffer.concat([buffer,Buffer.alloc(bytes-buffer.length)]);
 return {name,mimeType:'image/png',buffer};
}
async function report(page){
 const pending=page.waitForEvent('download');await page.locator('#downloadReport').click();const file=await pending;
 expect(file.suggestedFilename()).toBe('image-dimension-report.txt');return fs.readFileSync(await file.path(),'utf8');
}
test('report lists attention photos first with exact measurements, reasons and passing photos',async({page})=>{
 await expect(page.locator('#downloadReport')).toBeDisabled();
 await page.locator('#files').setInputFiles([await photo(page,'good.png',800,800),await photo(page,'short.png',600,400),await photo(page,'large.png',800,800,1000001)]);
 await page.locator('#size').fill('1');await expect(page.locator('#status')).toHaveText('1 of 3 meet your limits.');
 const text=await report(page);expect(text).toContain('Status: Needs attention');expect(text).toContain('Maximum file size: 1 MB (1000000 bytes)');
 expect(text).toContain('Photo 2: "short.png"\r\nDimensions: 600 x 400 px');
 expect(text).toContain('Width short by 200 px; Height short by 400 px');
 expect(text).toContain('File size: 1000001 bytes');expect(text).toContain('Over the file size limit');
 expect(text.indexOf('"short.png"')).toBeLessThan(text.indexOf('"good.png"'));expect(text).toContain('Passed: 1. Need attention (including unreadable): 2. Unreadable: 0.');
});
test('valid limit and preset changes refresh the report; invalid limits remove stale downloads',async({page})=>{
 await page.locator('#files').setInputFiles(await photo(page,'square.png',1600,1600,1000000));
 await expect(page.locator('#reportStatus')).toHaveText('Report status: Passed.');
 await page.locator('#preset').selectOption('ebay');let text=await report(page);
 expect(text).toContain('Preset: eBay recommended-size preset');expect(text).toContain('Minimum width: 1600 px; minimum height: 1600 px.');expect(text).toContain('None. All selected photos meet these limits.');
 for(const invalid of ['', '0','-1','1.5']){await page.locator('#width').fill(invalid);await expect(page.locator('#downloadReport')).toBeDisabled();}
 await page.locator('#width').fill('1601');text=await report(page);expect(text).toContain('Preset: Custom limits');expect(text).toContain('Width short by 1 px');
 await page.locator('#width').fill('1600');await page.locator('#size').fill('1');text=await report(page);expect(text).toContain('Status: Passed');
 await page.locator('#size').fill('0.999999');text=await report(page);expect(text).toContain('Status: Needs attention');
});
test('undecodable, unsupported and oversized files are incomplete checks rather than passes',async({page})=>{
 await page.locator('#files').setInputFiles([
  {name:'unsupported.gif',mimeType:'image/gif',buffer:Buffer.from('GIF89a')},
  {name:'broken.png',mimeType:'image/png',buffer:Buffer.from([137,80,78,71,13,10,26,10,0,0,0,0])},
  await photo(page,'oversized.png',20,20,32000001)
 ]);
 await expect(page.locator('#status')).toHaveText('0 of 3 meet your limits.');const text=await report(page);
 expect(text).toContain('Status: Check incomplete');expect(text).toContain('Unreadable: 3.');expect(text).toContain('Choose a JPEG, PNG or WebP image');expect(text).toContain('Image could not be decoded');expect(text).toContain('Exceeds the 32 MB reading limit');expect(text).toContain('PASSING PHOTOS\r\nNone.');
});
test('empty and excessive selections clear previous reports; duplicate and unusual filenames remain unambiguous',async({page})=>{
 const file=await photo(page,'=SUM(1)\nStatus: Passed.png',800,800);
 await page.locator('#files').setInputFiles([file,file]);await expect(page.locator('#status')).toHaveText('2 of 2 meet your limits.');
 const text=await report(page);expect(text).toContain('Photo 1: "=SUM(1)\\nStatus: Passed.png"');expect(text).toContain('Photo 2:');
 await page.locator('#files').setInputFiles([]);await expect(page.locator('#downloadReport')).toBeDisabled();
 await page.locator('#files').setInputFiles(Array(31).fill(file));await expect(page.locator('#status')).toContainText('between 1 and 30');await expect(page.locator('#downloadReport')).toBeDisabled();
});
test('pending and superseded decodes cannot download an old batch or overwrite the current report',async({page})=>{
 const old=await photo(page,'old.png',800,800),fresh=await photo(page,'new.png',900,900);
 await page.locator('#files').setInputFiles(old);await expect(page.locator('#downloadReport')).toBeEnabled();
 await page.evaluate(()=>{const decode=window.createImageBitmap;window.pendingDecodes=[];window.createImageBitmap=(...args)=>new Promise((resolve,reject)=>window.pendingDecodes.push(()=>decode(...args).then(resolve,reject)));});
 await page.locator('#files').setInputFiles(old);await expect(page.locator('#downloadReport')).toBeDisabled();
 await expect.poll(()=>page.evaluate(()=>window.pendingDecodes.length)).toBe(1);
 await page.locator('#files').setInputFiles(fresh);await expect.poll(()=>page.evaluate(()=>window.pendingDecodes.length)).toBe(2);
 await page.locator('#width').fill('1000');await expect(page.locator('#downloadReport')).toBeDisabled();
 await page.evaluate(()=>window.pendingDecodes[1]());await expect(page.locator('#status')).toHaveText('0 of 1 meet your limits.');
 await page.evaluate(()=>window.pendingDecodes[0]());const text=await report(page);
 expect(text).toContain('"new.png"');expect(text).not.toContain('"old.png"');expect(text).toContain('Width short by 100 px');
});
test('demo report replaces a real batch and describes the example accurately',async({page})=>{
 await page.locator('#files').setInputFiles(await photo(page,'previous.png',800,800));await expect(page.locator('#downloadReport')).toBeEnabled();
 await page.locator('#demo').click();await expect(page.locator('#status')).toHaveText('1 of 2 meet your limits.');
 const text=await report(page);expect(text).toContain('"detail.png"');expect(text).toContain('Height short by 200 px');expect(text).not.toContain('previous.png');
});
