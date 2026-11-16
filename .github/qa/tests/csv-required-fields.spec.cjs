const {test,expect}=require('@playwright/test');
const fs=require('node:fs'),path=require('node:path');
const sample=fs.readFileSync(path.resolve(__dirname,'../../../guides/samples/supplier-required-fields.csv'),'utf8');
async function download(page,id){const pending=page.waitForEvent('download');await page.locator(id).click();return fs.readFileSync(await(await pending).path(),'utf8');}
async function setup(page,csv,header,choices){
 await page.locator('#source').fill(csv);await page.locator('#target').fill(header);await page.locator('#prepare').click();
 for(const [i,value] of choices.entries())await page.locator('#source-'+i).selectOption(value);
}
async function requireFields(page,indices){for(const i of indices)await page.locator('#required-'+i).check();await page.locator('#generate').click();}
test.beforeEach(async({page,context})=>{await context.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());await page.goto('/utilities/csv-column-mapper/?test-mode=1');});

test('practice file reports precise missing rows and preserves the complete export byte for byte',async({page})=>{
 await page.locator('#file').setInputFiles({name:'practice.csv',mimeType:'text/csv',buffer:Buffer.from(sample)});
 await expect(page.locator('#source')).toHaveValue(sample);
 await page.locator('#target').fill('SKU,Title,Price');await page.locator('#prepare').click();await page.locator('#source-1').selectOption('1');await page.locator('#generate').click();
 const baseline=await download(page,'#download');await expect(page.locator('#requiredSummary')).toContainText('Not checked');
 await requireFields(page,[0,1,2]);await expect(page.locator('#requiredSummary')).toContainText('3 missing values across 3 data rows');
 expect(await download(page,'#download')).toBe(baseline);
 expect(baseline).toBe('SKU,Title,Price\r\n0012,"Mug, blue",0\r\n,Notebook,6.50\r\nA103,   ,15.00\r\nA104,Frame,\r\n');
 const report=await download(page,'#downloadReport');
 for(const [row,column,name,reason] of [[2,1,'SKU','blank cell'],[3,2,'Title','whitespace-only value'],[4,3,'Price','blank cell']])expect(report).toContain(`Data row ${row} (CSV record ${row+1}), destination column ${column} "${name}": ${reason}. Source line ${row+1}; mapped CSV line ${row+1}.`);
 expect(report).not.toMatch(/Data row 1 |Mug, blue|Notebook|A103|0012/);
 await expect(page.locator('#requiredFindings li')).toHaveCount(3);
});

test('zero prices are present while whitespace is missing and remains unchanged',async({page})=>{
 await setup(page,'SKU,Price\nA,0\nB,0.00\nC, 0 \nD, \nE,\t\nF,\u00a0\nG,','SKU,Price',['0','1']);
 await page.locator('#generate').click();const before=await download(page,'#download');await requireFields(page,[1]);
 await expect(page.locator('#requiredSummary')).toContainText('4 missing values across 4 data rows');
 expect(await download(page,'#download')).toBe(before);expect(await download(page,'#downloadReport')).not.toMatch(/Data row [123] /);
 await setup(page,'SKU,Price,Optional\nA,0,\nB,0.00,\nC, 0 ,','SKU,Price,Optional',['0','1','2']);await requireFields(page,[0,1]);
 await expect(page.locator('#requiredSummary')).toContainText('Passed');await expect(page.locator('#requiredFindings li')).toHaveCount(0);
});

test('source and output line locations account for omitted and retained multiline fields',async({page})=>{
 await setup(page,'SKU,Note,Price\nA,"first\nsecond",0\nB,short,\nC,"last\nline",','SKU,Price',['0','2']);await requireFields(page,[1]);
 let report=await download(page,'#downloadReport');expect(report).toContain('Data row 2 (CSV record 3), destination column 2 "Price": blank cell. Source line 4; mapped CSV line 3.');expect(report).toContain('Source line 5; mapped CSV line 4.');
 await setup(page,'SKU,Note,Price\nA,"first\nsecond",0\nB,short,','Note,Price',['1','2']);await requireFields(page,[1]);report=await download(page,'#downloadReport');expect(report).toContain('Source line 4; mapped CSV line 4.');
});

test('inserted blanks and reused source values count per field and cap detail without skipping rows',async({page})=>{
 await setup(page,'SKU,Price\nA,','Price,Again,Empty',['1','1','empty']);await requireFields(page,[0,1,2]);
 await expect(page.locator('#requiredSummary')).toContainText('3 missing values across 1 data rows');expect(await download(page,'#downloadReport')).toContain('empty value inserted by mapping');
 await setup(page,'SKU,Price\n'+Array.from({length:105},(_,i)=>`A${i},`).join('\n'),'SKU,Price',['0','1']);await requireFields(page,[1]);
 await expect(page.locator('#requiredSummary')).toContainText('105 missing values across 105 data rows');await expect(page.locator('#requiredFindings li')).toHaveCount(100);
 const report=await download(page,'#downloadReport');expect(report).toContain('Showing first 100 of 105 findings. All data rows were checked.');expect(report.match(/Data row \d+ /g)).toHaveLength(100);expect(report).toContain('Data row 100 (CSV record 101)');
});

test('changing required choices invalidates results and loading a legacy mapping resets selections',async({page})=>{
 await setup(page,'SKU,Price\nA,0','SKU,Price',['0','1']);await requireFields(page,[1]);await expect(page.locator('#requiredSummary')).toContainText('Passed');
 const mapping=await download(page,'#saveMapping');const legacy=JSON.parse(mapping);expect(legacy.version).toBe(2);expect(legacy.required).toEqual([false,true]);legacy.version=1;delete legacy.required;
 await page.locator('#required-1').uncheck();await expect(page.locator('#result')).toBeHidden();await expect(page.locator('#downloadReport')).toBeDisabled();await expect(page.locator('#requiredSummary')).toBeEmpty();
 await requireFields(page,[1]);await page.locator('#mappingFile').setInputFiles({name:'mapping.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(legacy))});
 await expect(page.locator('#message')).toContainText('Mapping loaded');await expect(page.locator('#required-1')).not.toBeChecked();await page.locator('#generate').click();await expect(page.locator('#requiredSummary')).toContainText('Not checked');
 await requireFields(page,[1]);await page.locator('#source').fill('SKU,Price\nA');await page.locator('#prepare').click();await expect(page.locator('#result')).toBeHidden();await expect(page.locator('#requiredSummary')).toBeEmpty();
 await setup(page,'SKU,Price','SKU,Price',['0','1']);await requireFields(page,[1]);await expect(page.locator('#requiredSummary')).toContainText('Not checked — no data rows');expect(await download(page,'#downloadReport')).not.toContain('Required fields: Passed');
});
