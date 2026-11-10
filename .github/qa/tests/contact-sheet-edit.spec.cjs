const {test,expect}=require('@playwright/test');
const fs=require('node:fs');
test.beforeEach(async({context,page})=>{
 await context.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
 await page.goto('/utilities/image-contact-sheet/?test-mode=1');
 await page.locator('#demo').click();
 await expect(page.locator('#names li')).toHaveCount(3);
});
const labels=page=>page.locator('#names li > span');
const action=(page,index,name)=>page.locator('#names li').nth(index).getByRole('button',{name:new RegExp('^'+name+':')});
async function replacement(page,index,file){
 const chooser=page.waitForEvent('filechooser');
 await action(page,index,'Replace photo').click();await (await chooser).setFiles(file);
}
async function png(page,name='better.png'){
 return {name,mimeType:'image/png',buffer:Buffer.from(await page.locator('#sheet').evaluate(c=>c.toDataURL().split(',')[1]),'base64')};
}
test('remove, reorder and undo synchronize PNG and names; latest removal and empty sheet recover',async({page})=>{
 const original=await page.locator('#sheet').evaluate(c=>c.toDataURL());
 await action(page,1,'Remove photo').press('Enter');
 await expect(labels(page)).toHaveText(['front.png','detail.png']);
 await expect(page.locator('#undoRemoval')).toBeFocused();
 await action(page,1,'Move earlier').click();await page.locator('#undoRemoval').click();
 await expect(labels(page)).toHaveText(['detail.png','side.png','front.png']);
 await expect(page.locator('#orderedNames')).toHaveValue('detail.png\nside.png\nfront.png');
 await expect(page.locator('#undoRemoval')).toBeDisabled();
 expect(await page.locator('#sheet').evaluate(c=>c.toDataURL())).not.toBe(original);
 const current=await page.locator('#sheet').evaluate(c=>c.toDataURL().split(',')[1]);
 const wait=page.waitForEvent('download');await page.locator('#download').click();
 expect(fs.readFileSync(await (await wait).path())).toEqual(Buffer.from(current,'base64'));
 await action(page,2,'Remove photo').click();await action(page,0,'Remove photo').click();
 await page.locator('#undoRemoval').click();await expect(labels(page)).toHaveText(['detail.png','side.png']);
 await action(page,1,'Remove photo').click();await action(page,0,'Remove photo').click();
 await expect(page.locator('#sheet')).toBeHidden();await expect(page.locator('#filenameOrder')).toBeHidden();
 await expect(page.locator('#download')).toBeDisabled();await expect(page.locator('#orderedNames')).toHaveValue('');
 await page.locator('#undoRemoval').click();await expect(labels(page)).toHaveText(['detail.png']);await expect(page.locator('#sheet')).toBeVisible();
 await action(page,0,'Remove photo').click();await page.locator('#demo').click();
 await expect(labels(page)).toHaveText(['front.png','side.png','detail.png']);await expect(page.locator('#undoRemoval')).toBeDisabled();
});
test('replace keeps slot; cancelled, unreadable and oversized replacements leave old photo intact',async({page})=>{
 const original=await page.locator('#sheet').evaluate(c=>c.toDataURL());
 const chooser=page.waitForEvent('filechooser');await action(page,1,'Replace photo').click();await(await chooser).setFiles([]);
 await expect(labels(page)).toHaveText(['front.png','side.png','detail.png']);
 for(const file of [{name:'bad.jpg',mimeType:'image/jpeg',buffer:Buffer.from('bad')},{name:'huge.png',mimeType:'image/png',buffer:Buffer.alloc(32000001)}]){
  await replacement(page,1,file);await expect(page.locator('#editStatus')).toContainText('Replacement failed');
  await expect(labels(page)).toHaveText(['front.png','side.png','detail.png']);
  expect(await page.locator('#sheet').evaluate(c=>c.toDataURL())).toBe(original);
 }
 await replacement(page,1,await png(page));
 await expect(labels(page)).toHaveText(['front.png','better.png','detail.png']);
 await expect(page.locator('#orderedNames')).toHaveValue('front.png\nbetter.png\ndetail.png');
 await expect(page.locator('#editStatus')).toContainText('at position 2');
 expect(await page.locator('#sheet').evaluate(c=>c.toDataURL())).not.toBe(original);
 const wait=page.waitForEvent('download');await page.locator('#downloadNames').click();
 expect(fs.readFileSync(await(await wait).path(),'utf8')).toBe('front.png\r\nbetter.png\r\ndetail.png\r\n');
});
test('late replacement follows moved target but cannot resurrect removed photo or overwrite new batch',async({page})=>{
 const file=await png(page);
 await page.evaluate(()=>{const real=createImageBitmap;window.createImageBitmap=async(...args)=>{if(args[0].name==='better.png')await new Promise(r=>window.finishReplacement=r);return real(...args);};});
 await replacement(page,1,file);await expect(page.locator('#editStatus')).toContainText('Reading replacement');
 await action(page,1,'Move later').click();await page.evaluate(()=>window.finishReplacement());
 await expect(labels(page)).toHaveText(['front.png','detail.png','better.png']);
 await replacement(page,0,file);await expect(page.locator('#editStatus')).toContainText('Reading replacement');
 await action(page,0,'Remove photo').click();await page.evaluate(()=>window.finishReplacement());await page.locator('#undoRemoval').click();
 await expect(labels(page)).toHaveText(['front.png','detail.png','better.png']);
 await replacement(page,0,file);await expect(page.locator('#editStatus')).toContainText('Reading replacement');
 await page.locator('#demo').click();await expect(labels(page)).toHaveText(['front.png','side.png','detail.png']);
 await page.evaluate(()=>window.finishReplacement());await expect(labels(page)).toHaveText(['front.png','side.png','detail.png']);await expect(page.locator('#editStatus')).toBeEmpty();
});
test('replacement and undo enforce combined budget after intervening edits',async({page})=>{
 await page.evaluate(()=>Object.defineProperty(File.prototype,'size',{get(){return this.name.startsWith('large')?30000000:this.name==='small.png'?5000000:100;},configurable:true}));
 const image=await png(page);
 await page.locator('#files').setInputFiles(['large1.png','large2.png','large3.png','small.png'].map(name=>({...image,name})));
 await expect(labels(page)).toHaveText(['large1.png','large2.png','large3.png','small.png']);
 await replacement(page,3,{...image,name:'large4.png'});await expect(page.locator('#editStatus')).toContainText('100 MB');
 await expect(labels(page)).toHaveText(['large1.png','large2.png','large3.png','small.png']);
 await action(page,0,'Remove photo').click();await replacement(page,2,{...image,name:'large4.png'});
 await expect(labels(page)).toHaveText(['large2.png','large3.png','large4.png']);
 await page.locator('#undoRemoval').click();await expect(page.locator('#editStatus')).toContainText('Cannot undo');
 await expect(labels(page)).toHaveText(['large2.png','large3.png','large4.png']);
 await replacement(page,2,{...image,name:'small.png'});await expect(labels(page)).toHaveText(['large2.png','large3.png','small.png']);
 await page.locator('#undoRemoval').click();await expect(labels(page)).toHaveText(['large1.png','large2.png','large3.png','small.png']);
});
