const {test,expect}=require('@playwright/test');
const labels=page=>page.locator('#names li > span');
async function loadOrder(page,text){
 const wait=page.waitForEvent('filechooser');await page.locator('#loadOrder').click();
 await(await wait).setFiles({name:'ordered-filenames.txt',mimeType:'text/plain',buffer:Buffer.isBuffer(text)?text:Buffer.from(text)});
}
test.beforeEach(async({page,context})=>{
 await context.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
 await page.goto('/utilities/image-contact-sheet/?test-mode=1');await page.locator('#demo').click();
 await expect(labels(page)).toHaveText(['front.png','side.png','detail.png'],{timeout:15000});
});
test('invalid, missing, extra, duplicate and case-different names preserve the current sheet and undo',async({page})=>{
 const original=await page.locator('#sheet').evaluate(c=>c.toDataURL());
 for(const [value,message] of [
  ['front.png\nside.png\nmissing.png','Missing photo: missing.png'],
  ['front.png\nside.png','Extra photo: detail.png'],
  ['front.png\nfront.png\ndetail.png','Duplicate or ambiguous names'],
  ['FRONT.png\nside.png\ndetail.png','Missing photo: FRONT.png'],
  ['../front.png','without folder paths'],['','non-empty'],
  ['x\n'.repeat(31),'between 1 and 30'],[Buffer.from([255,254]),'UTF-8'],
  ['x'.repeat(131073),'128 KiB'],['front.png\u0000','control characters']]){
  await loadOrder(page,value);await expect(page.locator('#orderStatus')).toContainText('Order not loaded');
  await expect(page.locator('main')).toContainText(message);await expect(labels(page)).toHaveText(['front.png','side.png','detail.png']);
  expect(await page.locator('#sheet').evaluate(c=>c.toDataURL())).toBe(original);
 }
 await page.locator('#names li').nth(1).getByRole('button',{name:/^Remove photo/}).click();
 await loadOrder(page,'missing.png');await expect(page.locator('#orderStatus')).toContainText('Order not loaded');await expect(page.locator('#undoRemoval')).toBeEnabled();
 await loadOrder(page,'\uFEFFdetail.png\r\n\r\nfront.png\r\n');await expect(labels(page)).toHaveText(['detail.png','front.png']);await expect(page.locator('#undoRemoval')).toBeDisabled();
});
test('duplicate selected photos and skipped files block importing without partial reordering',async({page})=>{
 const buffer=Buffer.from(await page.locator('#sheet').evaluate(c=>c.toDataURL().split(',')[1]),'base64');
 for(const names of [['front.png','front.png','detail.png'],['front.png','FRONT.png','detail.png'],['front.png','side.png','detail.png','bad.jpg']]){
  await page.locator('#files').setInputFiles(names.map(name=>({name,mimeType:'image/png',buffer:name==='bad.jpg'?Buffer.from('bad'):buffer})));
  await expect(labels(page)).toHaveCount(3);const before=await page.locator('#sheet').evaluate(c=>c.toDataURL());
  await loadOrder(page,'detail.png\nside.png\nfront.png');await expect(page.locator('#orderStatus')).toContainText('Order not loaded');
  await expect(page.locator('#orderIssues')).toContainText(names.includes('bad.jpg')?'Unreadable or skipped photos: bad.jpg':'Duplicate or ambiguous selected photos');
  expect(await page.locator('#sheet').evaluate(c=>c.toDataURL())).toBe(before);
 }
});
test('late reads cannot replace a newer reorder, batch or load; cancellation and read failure preserve sheet',async({page})=>{
 await page.evaluate(()=>{const real=File.prototype.arrayBuffer;File.prototype.arrayBuffer=async function(){if(this.name==='ordered-filenames.txt')await new Promise(r=>window.finishOrder=r);return real.call(this);};});
 await loadOrder(page,'detail.png\nside.png\nfront.png');await expect(page.locator('#orderStatus')).toContainText('Reading');
 await page.locator('#names li').first().getByRole('button',{name:/Move later/}).click();await page.evaluate(()=>window.finishOrder());await expect(labels(page)).toHaveText(['side.png','front.png','detail.png']);
 await loadOrder(page,'detail.png\nside.png\nfront.png');await page.locator('#demo').click();await expect(labels(page)).toHaveText(['front.png','side.png','detail.png'],{timeout:15000});await page.evaluate(()=>window.finishOrder());await expect(labels(page)).toHaveText(['front.png','side.png','detail.png']);
 await loadOrder(page,'detail.png\nside.png\nfront.png');await page.evaluate(()=>window.oldOrder=window.finishOrder);
 await loadOrder(page,'side.png\ndetail.png\nfront.png');await page.evaluate(()=>window.finishOrder());await expect(labels(page)).toHaveText(['side.png','detail.png','front.png']);await page.evaluate(()=>window.oldOrder());await expect(labels(page)).toHaveText(['side.png','detail.png','front.png']);
 const chooser=page.waitForEvent('filechooser');await page.locator('#loadOrder').click();await(await chooser).setFiles([]);await expect(labels(page)).toHaveText(['side.png','detail.png','front.png']);
 await page.evaluate(()=>File.prototype.arrayBuffer=async function(){throw new Error('Read failed');});await loadOrder(page,'front.png');await expect(page.locator('#orderStatus')).toContainText('Read failed');await expect(labels(page)).toHaveText(['side.png','detail.png','front.png']);
});
