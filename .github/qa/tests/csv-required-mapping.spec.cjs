const {test,expect}=require('@playwright/test');
const fs=require('node:fs');
const original='SKU,Product,Price,Cost\n0012,"Mug, blue",0,8\n,   ,0.00,4\nA103,Frame,,9';
const reordered='Cost,Price,Product,SKU\n8,0,"Mug, blue",0012\n4,0.00,   ,\n9,,Frame,A103';
const saved={format:'utilityshelf-column-mapping',version:2,sourceHeaders:['SKU','Product','Price','Cost'],destinationHeaders:['SKU','Title','Price'],columns:[0,1,2],required:[true,false,true]};
async function load(page,value){await page.locator('#mappingFile').setInputFiles({name:'mapping.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(value))});}
async function download(page,id){const wait=page.waitForEvent('download');await page.locator(id).click();return fs.readFileSync(await(await wait).path(),'utf8');}
async function choices(page,flags){for(const [i,flag]of flags.entries())await expect(page.locator('#required-'+i)).toBeChecked({checked:flag});}
async function setup(page){await page.locator('#source').fill(original);await page.locator('#target').fill('SKU,Title,Price');await page.locator('#prepare').click();await page.locator('#source-1').selectOption('1');await page.locator('#required-0').check();await page.locator('#required-2').check();}
test.beforeEach(async({page,context})=>{await context.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());await page.goto('/utilities/csv-column-mapper/?test-mode=1');});

for(const [kind,csv,columns]of [['matching',original,['0','1','2']],['reordered',reordered,['3','2','1']]])test(kind+' headers restore saved required choices on the correct destination and reproduce CSV and report',async({page})=>{
 await setup(page);await page.locator('#generate').click();const before=await download(page,'#download');const beforeReport=await download(page,'#downloadReport');
 const file=await download(page,'#saveMapping');expect(JSON.parse(file)).toEqual(saved);expect(file).not.toMatch(/0012|Mug, blue|Frame|0\.00/);
 await page.locator('#source').fill(csv);await page.locator('#target').fill('Wrong');await load(page,JSON.parse(file));
 await choices(page,[true,false,true]);for(const [i,column]of columns.entries())await expect(page.locator('#source-'+i)).toHaveValue(column);
 await expect(page.locator('#result')).toBeHidden();await expect(page.locator('#downloadReport')).toBeDisabled();await expect(page.locator('#message')).toContainText('Required-field choices restored');
 await page.locator('#generate').click();expect(await download(page,'#download')).toBe(before);
 const report=await download(page,'#downloadReport');expect(report).toContain('2 missing values across 2 data rows');
 const findings=text=>text.split('\r\n').filter(line=>/^Data row \d/.test(line));expect(findings(report)).toEqual(findings(beforeReport));
 expect(report).toContain('Selected required destination columns: 1. "SKU", 3. "Price"');expect(findings(report).join('\n')).not.toContain('whitespace-only value');
});

test('all-off flags and required empty destinations round trip and a new setup resets choices',async({page})=>{
 await setup(page);await page.locator('#source-2').selectOption('empty');const withEmpty=JSON.parse(await download(page,'#saveMapping'));expect(withEmpty.columns).toEqual([0,1,null]);
 await load(page,withEmpty);await choices(page,[true,false,true]);await page.locator('#generate').click();expect(await download(page,'#downloadReport')).toContain('4 missing values across 3 data rows');
 await page.locator('#required-0').uncheck();await page.locator('#required-2').uncheck();const allOff=JSON.parse(await download(page,'#saveMapping'));expect(allOff.required).toEqual([false,false,false]);
 await page.locator('#required-1').check();await load(page,allOff);await choices(page,[false,false,false]);await page.locator('#generate').click();await expect(page.locator('#requiredSummary')).toContainText('Not checked');
 await load(page,saved);await page.locator('#prepare').click();await choices(page,[false,false,false]);
});

test('legacy mappings remain readable and saving them upgrades with the current choices',async({page})=>{
 await setup(page);const legacy={...saved,version:1};delete legacy.required;await load(page,legacy);
 await choices(page,[false,false,false]);await expect(page.locator('#message')).toContainText('Older mapping');await page.locator('#required-1').check();
 expect(JSON.parse(await download(page,'#saveMapping'))).toEqual({...saved,required:[false,true,false]});
});

test('invalid required-field arrays, unknown versions and changed headers reject without stale results',async({page})=>{
 const missing={...saved};delete missing.required;
 for(const bad of [missing,...[null,{},[],[true,false],[true,false,true,false],[1,false,true],['true',false,true],[true,null,true]].map(required=>({...saved,required})),{...saved,version:3},{...saved,version:1},{...saved,extra:true}]){
  await setup(page);await page.locator('#generate').click();await load(page,bad);
  await expect(page.locator('#message')).toContainText('Choose a valid');await expect(page.locator('#result')).toBeHidden();await expect(page.locator('#mapping')).toBeHidden();await expect(page.locator('#downloadReport')).toBeDisabled();await expect(page.locator('#requiredSummary')).toBeEmpty();
 }
 await page.locator('#source').fill('SKU,Description,Price,Cost\n1,Mug,0,4');await load(page,saved);await expect(page.locator('#message')).toContainText('Source headers changed');await expect(page.locator('#mapping')).toBeHidden();
});

test('superseded mapping reads cannot restore old required choices',async({page})=>{
 await setup(page);await page.evaluate(()=>{File.prototype.text=function(){return new Promise(resolve=>window.finishMapping=resolve);};});await load(page,saved);
 await page.locator('#target').fill('Product');await page.locator('#prepare').click();await page.locator('#required-0').check();
 await page.evaluate(value=>window.finishMapping(JSON.stringify(value)),saved);await expect(page.locator('#target')).toHaveValue('Product');await choices(page,[true]);await page.locator('#generate').click();await expect(page.locator('#requiredSummary')).toContainText('1 missing values across 1 data rows');
});
