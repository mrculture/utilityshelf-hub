const {test,expect}=require('@playwright/test');
const fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process');
const sample=fs.readFileSync(path.resolve(__dirname,'../../../guides/samples/supplier-inventory-corrected.csv'),'utf8');
async function download(page,id){
 const wait=page.waitForEvent('download');await page.locator(id).click();const file=await wait;
 return {name:file.suggestedFilename(),text:fs.readFileSync(await file.path(),'utf8')};
}
function parse(text){return JSON.parse(execFileSync(process.platform==='win32'?'python':'python3',['-c','import csv,io,json,sys;print(json.dumps(list(csv.reader(io.StringIO(sys.stdin.read())))))'],{input:text,encoding:'utf8'}));}
async function setup(page,csv,header,choices){
 await page.locator('#source').fill(csv);await page.locator('#target').fill(header);await page.locator('#prepare').click();
 for(const [i,value] of choices.entries())await page.locator('#source-'+i).selectOption(value);
 await page.locator('#generate').click();
}
test.beforeEach(async({page,context})=>{
 await context.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
 await page.goto('/utilities/csv-column-mapper/?test-mode=1');
});
test('supplier example describes moved, renamed and omitted columns and keeps exact quoted values',async({page})=>{
 await page.locator('#sample').click();
 await expect(page.locator('#mappingSummary')).toContainText('Input: 2 data rows, 4 columns. Output: 2 data rows, 3 columns.');
 await expect(page.locator('#mappingDetails tr').first()).toContainText('Moved from position 3 to 1');
 await expect(page.locator('#omittedColumns')).toHaveText('4. "Internal note"');
 const report=await download(page,'#downloadReport');expect(report.name).toBe('csv-mapping-report.txt');expect(report.text).toContain('Status: Export prepared');expect(report.text).toContain('Source columns omitted: 1. Destination columns using empty values: 0 (0 inserted blank cells).');
 expect(report.text).toContain('1. "SKU" <- 3. "Stock code" | Renamed; Moved from position 3 to 1');expect(report.text).not.toMatch(/Spring range|For review|Mug, blue|0012/);
 expect(parse((await download(page,'#download')).text)).toEqual([['SKU','Title','Price'],['0012','Mug, blue','7.50'],['0013','Desk frame, 5"','9.25']]);
});
for(const empty of [false,true])test('guide sample export and report agree with '+(empty?'empty-value mappings':'omitted Cost column'),async({page})=>{
 await setup(page,sample,empty?'Title,SKU,Optional':'SKU,Title,Price',empty?['1','0','empty']:['0','1','2']);
 const report=(await download(page,'#downloadReport')).text;
 expect(report).toContain('Input: 3 data rows, 4 columns. Output: 3 data rows, 3 columns.');
 expect(report).toContain(empty?'Source columns omitted: 2. Destination columns using empty values: 1 (3 inserted blank cells).':'Source columns omitted: 1. Destination columns using empty values: 0 (0 inserted blank cells).');
 expect(report).toContain('4. "Cost"');if(empty)expect(report).toContain('3. "Optional" <- Use empty values | Empty values inserted in all 3 data rows');
 const exported=(await download(page,'#download')).text;
 const input=parse(sample);expect(parse(exported)).toEqual(empty?[['Title','SKU','Optional'],...input.slice(1).map(r=>[r[1],r[0],''])]:[['SKU','Title','Price'],...input.slice(1).map(r=>r.slice(0,3))]);
 await page.goto('/tools/csv-import-checker/?test-mode=1');await page.locator('#source').fill(exported);await page.locator('#check').click();await expect(page.locator('#reportStatus')).toContainText('Passed');await expect(page.locator('#summary')).toContainText('3 columns and 3 data rows');
 await page.goto('/utilities/csv-formula-checker/?test-mode=1');await page.locator('#source').fill(exported);await page.locator('#scan').click();await expect(page.locator('#summary')).toContainText('0 fields to review out of 12 checked');
});
test('reports cover all rows, reused sources, empty values and escaped headers without leaking cell contents',async({page})=>{
 const csv='"Title\n<script>",Code\n'+Array.from({length:7},(_,i)=>'PRIVATE-'+i+',00'+i).join('\n');
 await setup(page,csv,'Title,AlsoTitle,Blank',['0','0','empty']);
 const report=(await download(page,'#downloadReport')).text;
 expect(report).toContain('Input: 7 data rows, 2 columns. Output: 7 data rows, 3 columns.');expect(report).toContain('7 inserted blank cells');expect(report).toContain('"Title\\n<script>"');expect(report).toContain('Source reused in multiple destinations');expect(report).not.toContain('PRIVATE');
 await expect(page.locator('#mappingDetails script')).toHaveCount(0);expect(parse((await download(page,'#download')).text)).toHaveLength(8);
 await setup(page,'Code','Code,Optional',['0','empty']);const headerOnly=(await download(page,'#downloadReport')).text;expect(headerOnly).toContain('Output: 0 data rows, 2 columns');expect(headerOnly).toContain('0 inserted blank cells');expect(headerOnly).toContain('Omitted source columns:\r\nNone.');expect(parse((await download(page,'#download')).text)).toEqual([['Code','Optional']]);
});
test('changed inputs, choices and pending or failed file reads invalidate both report and CSV',async({page})=>{
 await page.locator('#sample').click();await page.locator('#source-0').selectOption('empty');await expect(page.locator('#downloadReport')).toBeDisabled();await expect(page.locator('#result')).toBeHidden();await expect(page.locator('#mappingDetails')).toBeEmpty();
 await page.locator('#generate').click();expect((await download(page,'#downloadReport')).text).toContain('2 inserted blank cells');
 await page.locator('#target').fill('Title');await expect(page.locator('#downloadReport')).toBeDisabled();
 await page.locator('#sample').click();await page.locator('#source').fill('A,B\n1');await expect(page.locator('#downloadReport')).toBeDisabled();await page.locator('#prepare').click();await expect(page.locator('#result')).toBeHidden();
 await page.locator('#sample').click();await page.evaluate(()=>{
   const pendingRead=()=>new Promise((resolve,reject)=>{window.pendingRead={resolve,reject};});
   File.prototype.arrayBuffer=pendingRead; // Source CSV
   File.prototype.text=pendingRead; // Saved mapping JSON
 });
 await page.locator('#file').setInputFiles({name:'pending.csv',mimeType:'text/csv',buffer:Buffer.from('A\n1')});await expect(page.locator('#downloadReport')).toBeDisabled();await expect(page.locator('#result')).toBeHidden();await page.evaluate(()=>window.pendingRead.reject(new Error('read failed')));await expect(page.locator('#downloadReport')).toBeDisabled();
 await page.locator('#sample').click();await page.locator('#mappingFile').setInputFiles({name:'pending.json',mimeType:'application/json',buffer:Buffer.from('{}')});await expect(page.locator('#downloadReport')).toBeDisabled();await page.evaluate(()=>window.pendingRead.reject(new Error('read failed')));await expect(page.locator('#result')).toBeHidden();
});
