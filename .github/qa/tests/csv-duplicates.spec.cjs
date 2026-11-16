const {test,expect}=require('@playwright/test');
const fs=require('node:fs');
const sample='SKU,Product,Price\n0012,Mug,0\n12,Notebook,0.00\nABC,Frame,15\nabc,Stand,6\n" ABC ",Tray,8\n0012,Cup,12';
const reordered='Price,SKU,Product\n0,0012,Mug\n0.00,12,Notebook\n15,ABC,Frame\n6,abc,Stand\n8," ABC ",Tray\n12,0012,Cup';
const saved={format:'utilityshelf-column-mapping',version:3,sourceHeaders:['SKU','Product','Price'],destinationHeaders:['SKU','Title','Price'],columns:[0,1,2],required:[true,false,false],unique:[true,false,false],ignoreCase:true,trimWhitespace:true};
async function download(page,id){const wait=page.waitForEvent('download');await page.locator(id).click();return fs.readFileSync(await(await wait).path(),'utf8');}
async function setup(page,csv=sample,headers='SKU,Title,Price',choices=['0','1','2']){await page.locator('#source').fill(csv);await page.locator('#target').fill(headers);await page.locator('#prepare').click();for(const [i,v]of choices.entries())await page.locator('#source-'+i).selectOption(v);}
async function load(page,value){await page.locator('#mappingFile').setInputFiles({name:'mapping.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(value))});}
test.beforeEach(async({page,context})=>{await context.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());await page.goto('/utilities/csv-column-mapper/?test-mode=1');});

test('all four comparison modes preserve leading-zero SKUs and exact exported bytes',async({page})=>{
 await setup(page);await page.locator('#generate').click();const baseline=await download(page,'#download');await page.locator('#unique-0').check();
 for(const [ignoreCase,trimWhitespace,groups,rows]of [[false,false,1,[1,6]],[true,false,2,[1,3,4,6]],[false,true,2,[1,3,5,6]],[true,true,2,[1,3,4,5,6]]]){
  await page.locator('#ignoreCase').setChecked(ignoreCase);await page.locator('#trimWhitespace').setChecked(trimWhitespace);await page.locator('#generate').click();
  await expect(page.locator('#duplicateSummary')).toContainText(`${groups} duplicate groups; ${rows.length} occurrences across ${rows.length} data rows`);
  const findings=await page.locator('#duplicateFindings li').allTextContents();expect(findings.map(x=>Number(x.match(/^Data row (\d+)/)[1]))).toEqual(rows);
  for(const [i,row]of rows.entries())expect(findings[i]).toContain(`Source line ${row+1}; mapped CSV line ${row+1}.`);
  const report=await download(page,'#downloadReport');for(const finding of findings)expect(report).toContain(finding);expect(report).not.toMatch(/Mug|Notebook|Frame|Stand|Tray|Cup|ABC/);
  expect(await download(page,'#download')).toBe(baseline);
 }
 expect(baseline).toContain('0012,Mug,0\r\n12,Notebook,0.00');expect(baseline).toContain(' ABC ,Tray,8');
});

for(const [kind,csv]of [['matching',sample],['reordered',reordered]])test(kind+' saved mapping restores duplicate selections and comparison options',async({page})=>{
 await setup(page);await page.locator('#required-0').check();await page.locator('#unique-0').check();await page.locator('#ignoreCase').check();await page.locator('#trimWhitespace').check();
 const file=await download(page,'#saveMapping');expect(JSON.parse(file)).toEqual(saved);expect(file).not.toMatch(/0012|ABC|Mug/);
 await page.locator('#source').fill(csv);await load(page,JSON.parse(file));await expect(page.locator('#unique-0')).toBeChecked();await expect(page.locator('#unique-1')).not.toBeChecked();await expect(page.locator('#ignoreCase')).toBeChecked();await expect(page.locator('#trimWhitespace')).toBeChecked();await expect(page.locator('#required-0')).toBeChecked();
 await expect(page.locator('#result')).toBeHidden();await page.locator('#generate').click();await expect(page.locator('#duplicateSummary')).toContainText('2 duplicate groups; 5 occurrences');expect(await download(page,'#download')).toBe('SKU,Title,Price\r\n0012,Mug,0\r\n12,Notebook,0.00\r\nABC,Frame,15\r\nabc,Stand,6\r\n ABC ,Tray,8\r\n0012,Cup,12\r\n');
});

test('blanks are skipped, internal whitespace stays significant and multiline source locations survive omission',async({page})=>{
 await setup(page,'SKU,Note\nX,"first\nsecond"\n,empty\n"   ",spaces\nX,last\nA B,a\nAB,b','SKU,Again,Blank',['0','0','empty']);
 await page.locator('#unique-0').check();await page.locator('#unique-1').check();await page.locator('#unique-2').check();await page.locator('#trimWhitespace').check();await page.locator('#generate').click();
 await expect(page.locator('#duplicateSummary')).toContainText('2 duplicate groups; 4 occurrences across 2 data rows');await expect(page.locator('#duplicateSummary')).toContainText('10 blank or whitespace-only values skipped');
 const report=await download(page,'#downloadReport');expect(report).toContain('Data row 4 (CSV record 5), destination column 1 "SKU": duplicate group starting at data row 1 (2 occurrences, including the first). Source line 6; mapped CSV line 5.');
 await setup(page,'SKU,Price\n,0\n ,0.00','SKU,Price',['0','1']);await page.locator('#unique-0').check();await page.locator('#generate').click();await expect(page.locator('#duplicateSummary')).toContainText('Not checked — no nonblank values');
 await page.locator('#unique-0').uncheck();await page.locator('#unique-1').check();await page.locator('#generate').click();await expect(page.locator('#duplicateSummary')).toContainText('Passed');
 await setup(page,'SKU','SKU',['0']);await page.locator('#unique-0').check();await page.locator('#generate').click();await expect(page.locator('#duplicateSummary')).toContainText('Not checked — no data rows');
});

test('all rows count beyond the detail cap and prototype-like identifiers compare as text',async({page})=>{
 await setup(page,'SKU\n'+Array(105).fill('__proto__').concat('constructor','constructor').join('\n'),'SKU',['0']);await page.locator('#unique-0').check();await page.locator('#generate').click();
 await expect(page.locator('#duplicateSummary')).toContainText('2 duplicate groups; 107 occurrences across 107 data rows');await expect(page.locator('#duplicateFindings li')).toHaveCount(100);
 const report=await download(page,'#downloadReport');expect(report).toContain('Showing first 100 of 107');expect(report).toContain('Data row 1 (CSV record 2)');expect(report).toContain('105 occurrences, including the first');expect(report).not.toContain('__proto__');
});

test('settings changes invalidate results; old mappings and new setups reset duplicate choices',async({page})=>{
 await setup(page);await load(page,saved);await page.locator('#generate').click();
 for(const id of ['#ignoreCase','#trimWhitespace','#unique-0']){await page.locator(id).uncheck();await expect(page.locator('#result')).toBeHidden();await expect(page.locator('#duplicateSummary')).toBeEmpty();await expect(page.locator('#downloadReport')).toBeDisabled();await page.locator('#generate').click();}
 for(const version of [1,2]){const old={...saved,version};delete old.unique;delete old.ignoreCase;delete old.trimWhitespace;if(version===1)delete old.required;await load(page,saved);await load(page,old);await expect(page.locator('#unique-0')).not.toBeChecked();await expect(page.locator('#ignoreCase')).not.toBeChecked();await expect(page.locator('#trimWhitespace')).not.toBeChecked();await expect(page.locator('#required-0')).toBeChecked({checked:version===2});}
 await load(page,saved);await page.locator('#prepare').click();await expect(page.locator('#unique-0')).not.toBeChecked();await expect(page.locator('#ignoreCase')).not.toBeChecked();
});

test('invalid duplicate settings are rejected and pending mapping reads cannot restore stale checks',async({page})=>{
 const missing={...saved};delete missing.unique;
 for(const bad of [missing,...[null,{},[],[true],[true,false,false,false],[1,false,false]].map(unique=>({...saved,unique})),{...saved,ignoreCase:'true'},{...saved,trimWhitespace:0},{...saved,version:4}]){
  await setup(page);await page.locator('#generate').click();await load(page,bad);await expect(page.locator('#message')).toContainText('Choose a valid');await expect(page.locator('#mapping')).toBeHidden();await expect(page.locator('#result')).toBeHidden();await expect(page.locator('#downloadReport')).toBeDisabled();
 }
 await setup(page);await page.evaluate(()=>{File.prototype.text=function(){return new Promise(resolve=>window.finishMapping=resolve);};});await load(page,saved);await page.locator('#target').fill('Product');await page.locator('#prepare').click();await page.evaluate(value=>window.finishMapping(JSON.stringify(value)),saved);await expect(page.locator('#unique-0')).not.toBeChecked();await expect(page.locator('#ignoreCase')).not.toBeChecked();await expect(page.locator('#target')).toHaveValue('Product');
});
