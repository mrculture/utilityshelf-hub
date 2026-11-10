const {test,expect}=require('@playwright/test');
const fs=require('node:fs');
const checkers=[
 {name:'import',url:'/tools/csv-import-checker/',run:'#check',filename:'csv-import-check-report.txt'},
 {name:'formula',url:'/utilities/csv-formula-checker/',run:'#scan',filename:'csv-formula-check-report.txt'}
];
test.beforeEach(async({context})=>{
 await context.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
});
async function report(page,c){
 const pending=page.waitForEvent('download');await page.locator('#downloadReport').click();
 const download=await pending;expect(download.suggestedFilename()).toBe(c.filename);
 return fs.readFileSync(await download.path(),'utf8');
}
async function check(page,c,text){await page.locator('#source').fill(text);await page.locator(c.run).click();}
for(const c of checkers){
 test(c.name+' reports pass for an uploaded UTF-8 CSV with quoted commas, quotes and multiline fields',async({page})=>{
  await page.goto(c.url+'?test-mode=1');await expect(page.locator('#downloadReport')).toBeDisabled();
  await page.locator('#file').setInputFiles({name:'supplier.csv',mimeType:'text/csv',buffer:Buffer.from('\uFEFFSKU,Product,Cost\r\n001,"Mug, café",2.00\r\n002,"Frame ""blue""\r\nlarge",3.00\r\n')});
  await expect(page.locator('#source')).toHaveValue(/large/);await page.locator(c.run).click();
  const text=await report(page,c);expect(text).toContain('Status: Passed');
  expect(text).toContain(c.name==='import'?'3 columns and 2 data rows':'0 fields to review out of 9 checked');
  expect(text).toContain('Scope:');
  for(const edit of ['SKU,New\n003,Updated','']){
   await page.locator('#source').fill(edit);await expect(page.locator('#downloadReport')).toBeDisabled();
   if(edit){await page.locator(c.run).click();expect(await report(page,c)).toContain('Status: Passed');}
   else {await page.locator(c.run).click();await expect(page.locator('#downloadReport')).toBeDisabled();}
  }
 });
 test(c.name+' reports faulty files, then a corrected pass without stale findings',async({page})=>{
  await page.goto(c.url+'?test-mode=1');
  const bad=c.name==='import'?'SKU,Product,Price,Price\nA101,Mug,12,8\nA102,Notebook,6.50':'SKU,Note,Amount\nA101,=SUM(2),-12.50';
  await page.locator('#file').setInputFiles({name:'faulty.csv',mimeType:'text/csv',buffer:Buffer.from(bad)});
  await expect(page.locator('#source')).toHaveValue(bad);await page.locator(c.run).click();
  const faulty=await report(page,c);expect(faulty).toContain('Status: Issues found');
  if(c.name==='import'){
   expect(faulty).toContain('columns 3 and 4');expect(faulty).toContain('Line 3 has 3 fields');
   await expect(page.locator('#download')).toBeDisabled();
  }else{
   expect(faulty).toContain('Record 2 (line 2), column 2');expect(faulty).toContain('Signed number');
  }
  await check(page,c,'SKU,Product,Price,Cost\nA101,Mug,12,8\nA102,Notebook,6.50,4.00');
  const clean=await report(page,c);expect(clean).toContain('Status: Passed');expect(clean).not.toMatch(/repeats the header|Potential formula prefix|Line 3 has 3 fields/);
 });
 test(c.name+' malformed quoting preserves partial findings and cannot report a complete pass',async({page})=>{
  await page.goto(c.url+'?test-mode=1');
  await check(page,c,c.name==='import'?'A,A\n1,2\n"broken':'A,B\n1,=PRIVATE\n"broken');
  const text=await report(page,c);expect(text).toContain('Status: Check incomplete');expect(text).not.toContain('Status: Passed');
  expect(text).toContain('line 3');expect(text).toContain('Remaining records were not checked');
  expect(text).toContain(c.name==='import'?'repeats the header':'=PRIVATE');
 });
 test(c.name+' loading, failed reads and late old reads invalidate the old report',async({page})=>{
  await page.goto(c.url+'?test-mode=1');await check(page,c,'A,B\n1,2');await report(page,c);
  await page.evaluate(()=>{File.prototype.text=function(){return new Promise((resolve,reject)=>{window.pendingRead={resolve,reject};});};});
  const file={name:'later.csv',mimeType:'text/csv',buffer:Buffer.from('Old,File\n1,2')};
  await page.locator('#file').setInputFiles(file);await expect(page.locator('#downloadReport')).toBeDisabled();
  await page.evaluate(()=>window.pendingRead.reject(new Error('read failed')));
  await expect(page.locator('#summary')).toContainText(c.name==='import'?'Could not read':'read failed');
  await expect(page.locator('#downloadReport')).toBeDisabled();
  await page.locator('#file').setInputFiles(file);await check(page,c,'New,Data,Only\n3,4,5');
  await page.evaluate(()=>window.pendingRead.resolve('Old,File\n=PRIVATE,2'));
  const text=await report(page,c);expect(text).toContain('Status: Passed');
  expect(text).toContain(c.name==='import'?'3 columns and 1 data row':'6 checked');
  await expect(page.locator('#source')).toHaveValue('New,Data,Only\n3,4,5');
 });
 test(c.name+' reports the full count but caps findings and retains a later stopping error',async({page})=>{
  await page.goto(c.url+'?test-mode=1');
  const data=c.name==='import'?'A,B\n'+Array(105).fill('1').join('\n'):'A\n'+Array(105).fill('=1').join('\n');
  await check(page,c,data);let text=await report(page,c);
  expect(text).toContain('Status: Issues found');expect(text).toContain('105');expect(text).toMatch(/first 100/);
  expect((text.match(c.name==='import'?/has 1 fields/g:/Potential formula prefix/g)||[]).length).toBe(100);
  await check(page,c,data+'\n"broken');text=await report(page,c);
  expect(text).toContain('Status: Check incomplete');expect(text).toContain('line 107');expect(text).toContain('Listing 100');
 });
}
test('import separator warnings produce an incomplete report with actionable guidance',async({page})=>{
 const c=checkers[0];await page.goto(c.url+'?test-mode=1');
 for(const separator of [';','\t']){
  await check(page,c,['A','B'].join(separator)+'\n'+['1','2'].join(separator));
  const text=await report(page,c);expect(text).toContain('Status: Check incomplete');expect(text).toContain('comma separator');
 }
});
test('formula report has accurate physical lines, safe previews and delimiter invalidation',async({page})=>{
 const c=checkers[1];await page.goto(c.url+'?test-mode=1');
 await page.locator('#delimiter').selectOption('semicolon');
 await check(page,c,'SKU;Note\n1;"plain\ntext"\n2;"\t@review"\n3;＝SUM(1)');
 let text=await report(page,c);expect(text).toContain('Status: Issues found');expect(text).toContain('Record 3 (line 4), column 2');
 expect(text).toContain('"\\t@review"');expect(text).toContain('Potential formula prefix ＝');expect(text).toContain('Separator: Semicolon');
 await page.locator('#delimiter').selectOption('tab');await expect(page.locator('#downloadReport')).toBeDisabled();
 await check(page,c,'A\tB\n1\t2');text=await report(page,c);expect(text).toContain('Status: Passed');expect(text).toContain('Separator: Tab');
});
test('formula oversized pasted input is explicitly incomplete, not a successful scan',async({page})=>{
 const c=checkers[1];await page.goto(c.url+'?test-mode=1');
 await check(page,c,'x'.repeat(2097153));const text=await report(page,c);
 expect(text).toContain('Status: Check incomplete');expect(text).toContain('No fields were checked');
});
