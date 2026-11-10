const {test,expect}=require('@playwright/test');
const fs=require('node:fs');
const path=require('node:path');
const original='SKU,Product,Price,Cost\nA101,"Mug, blue",12.00,8.00\nA102,Notebook,6.50,4.00';
const saved={format:'utilityshelf-column-mapping',version:1,sourceHeaders:['SKU','Product','Price','Cost'],destinationHeaders:['SKU','Title','Price'],columns:[0,1,2]};
test.beforeEach(async({context,page})=>{
 await context.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
 await page.goto('/utilities/csv-column-mapper/?test-mode=1');
});
async function setup(page){
 await page.locator('#source').fill(original);await page.locator('#target').fill('SKU,Title,Price');
 await page.locator('#prepare').click();await page.locator('#source-1').selectOption('1');
}
async function load(page,value=saved){
 await page.locator('#mappingFile').setInputFiles({name:'mapping.json',mimeType:'application/json',buffer:Buffer.from(typeof value==='string'?value:JSON.stringify(value))});
}
async function download(page,id){
 const pending=page.waitForEvent('download');await page.locator(id).click();const file=await pending;
 return {name:file.suggestedFilename(),text:fs.readFileSync(await file.path(),'utf8')};
}
test('saved mapping excludes rows and round trips into matching headers with fresh row data',async({page})=>{
 await setup(page);const file=await download(page,'#saveMapping');
 expect(file.name).toBe('utilityshelf-column-mapping.json');expect(JSON.parse(file.text)).toEqual(saved);expect(file.text).not.toMatch(/A101|Notebook|12.00/);
 await page.locator('#source').fill('SKU,Product,Price,Cost\n0099,New stock,10.00,5.00');await page.locator('#target').fill('Old target');
 await load(page,file.text);await expect(page.locator('#message')).toContainText('Mapping loaded by exact header name');
 await expect(page.locator('#target')).toHaveValue('SKU,Title,Price');await expect(page.locator('#result')).toBeHidden();
 await page.locator('#generate').click();expect((await download(page,'#download')).text).toBe('SKU,Title,Price\r\n0099,New stock,10.00\r\n');
});
test('reordered source headers follow names, never old column positions',async({page})=>{
 await page.locator('#source').fill('Cost,Price,Product,SKU\n8.00,12.00,"Mug, blue",A101');
 await load(page);await expect(page.locator('#source-0')).toHaveValue('3');await expect(page.locator('#source-1')).toHaveValue('2');await expect(page.locator('#source-2')).toHaveValue('1');
 await page.locator('#generate').click();expect((await download(page,'#download')).text).toBe('SKU,Title,Price\r\nA101,"Mug, blue",12.00\r\n');
});
for(const [kind,csv] of [
 ['renamed','SKU,Description,Price,Cost\n1,Mug,12,8'],['missing','SKU,Product,Price\n1,Mug,12'],
 ['added','SKU,Product,Price,Cost,Extra\n1,Mug,12,8,x'],['case','sku,Product,Price,Cost\n1,Mug,12,8'],
 ['spacing','SKU,Product ,Price,Cost\n1,Mug,12,8'],['duplicate','SKU,Product,Price,Price\n1,Mug,12,8'],['blank','SKU,Product,Price,\n1,Mug,12,8']
])test(kind+' headers reject saved mappings and hide the previous export',async({page})=>{
 await setup(page);await page.locator('#generate').click();await page.locator('#source').fill(csv);await load(page);
 await expect(page.locator('#message')).toContainText(['duplicate','blank'].includes(kind)?'distinct, nonblank':'Source headers changed');
 await expect(page.locator('#mapping')).toBeHidden();await expect(page.locator('#result')).toBeHidden();
});
test('empty choices, Unicode and quoted headers survive mapping save and reload',async({page})=>{
 await page.locator('#source').fill('"Name, café",Code\nMug,0012');await page.locator('#target').fill('Title,SKU,Optional,AlsoTitle');await page.locator('#prepare').click();
 await expect(page.locator('#saveMapping')).toBeDisabled();
 for(const [i,value] of ['0','1','empty','0'].entries())await page.locator('#source-'+i).selectOption(value);
 const file=await download(page,'#saveMapping');await load(page,file.text);await expect(page.locator('#message')).toContainText('Mapping loaded');
 await page.locator('#generate').click();expect((await download(page,'#download')).text).toBe('Title,SKU,Optional,AlsoTitle\r\nMug,0012,,Mug\r\n');
 await page.locator('#source-1').selectOption('');await expect(page.locator('#saveMapping')).toBeDisabled();await expect(page.locator('#result')).toBeHidden();
});
test('invalid, oversized and unsupported mapping files cannot revive an export',async({page})=>{
 for(const bad of ['not JSON','x'.repeat(65537),null,{...saved,version:2},{...saved,columns:[99,1,2]},{...saved,columns:['0',1,2]},
  {...saved,sourceHeaders:['SKU','SKU','Price','Cost']},{...saved,destinationHeaders:['Title','Title','Price']},{...saved,extra:'unexpected'}]){
  await setup(page);await page.locator('#generate').click();await load(page,bad);
  await expect(page.locator('#message')).toContainText('Choose a');await expect(page.locator('#mapping')).toBeHidden();await expect(page.locator('#result')).toBeHidden();
 }
});
test('loading without a CSV or with malformed rows stops before export',async({page})=>{
 await load(page);await expect(page.locator('#message')).toContainText('current source CSV');
 await page.locator('#source').fill('SKU,Product,Price,Cost\n1,Mug,12');await load(page);
 await expect(page.locator('#message')).toContainText('Line 2 has 3 fields');await expect(page.locator('#result')).toBeHidden();
});
test('failed and superseded mapping reads cannot overwrite current input or choices',async({page})=>{
 await setup(page);await page.locator('#generate').click();
 await page.evaluate(()=>{File.prototype.text=function(){return new Promise((resolve,reject)=>{window.pendingRead={resolve,reject};});};});
 await load(page);await expect(page.locator('#result')).toBeHidden();await expect(page.locator('#mapping')).toBeHidden();
 await page.evaluate(()=>window.pendingRead.reject(new Error('Test read failed')));await expect(page.locator('#message')).toContainText('Test read failed');
 await load(page);await page.locator('#target').fill('Product');await page.locator('#prepare').click();
 await page.evaluate(text=>window.pendingRead.resolve(text),JSON.stringify(saved));
 await expect(page.locator('#target')).toHaveValue('Product');await page.locator('#generate').click();
 expect((await download(page,'#download')).text).toBe('Product\r\n"Mug, blue"\r\nNotebook\r\n');
});
test('guide sample downloads match the examples and their stated checker outcomes',async({page})=>{
 await page.goto('/guides/prepare-supplier-csv-for-import');
 const samples=[];
 for(const name of ['original','corrected']){
  const file=await download(page,'a[download][href$="supplier-inventory-'+name+'.csv"]');samples.push(file.text);
  const example=await page.locator('pre code').nth(name==='original'?0:1).textContent();
  expect(file.text.replaceAll('\r\n','\n').trim()).toBe(example.trim());
 }
 await expect(page.locator('article')).toContainText('Download check report (.txt)');
 for(const [i,text] of samples.entries()){
  await page.goto('/tools/csv-import-checker/?test-mode=1');await page.locator('#source').fill(text);await page.locator('#check').click();
  await expect(page.locator('#reportStatus')).toContainText(i?'Passed':'Issues found');
  await expect(page.locator('#summary')).toContainText(i?'4 columns and 3 data rows':'2 issues found');
 }
 await page.goto('/utilities/csv-column-mapper/?test-mode=1');await page.locator('#source').fill(samples[1]);await load(page);await page.locator('#generate').click();
 const mapped=await download(page,'#download');await page.goto('/utilities/csv-formula-checker/?test-mode=1');await page.locator('#source').fill(mapped.text);await page.locator('#scan').click();
 await expect(page.locator('#summary')).toContainText('0 fields to review out of 12 checked');
 await page.locator('#source').fill(mapped.text.replace('Notebook','=SUM(2)'));await page.locator('#scan').click();
 await expect(page.locator('#issues')).toContainText('Record 3 (line 3), column 2');
});
