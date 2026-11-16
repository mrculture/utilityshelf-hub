const {test,expect}=require('@playwright/test');
const fs=require('node:fs');
const sample='SKU,Price,Stock\nA101,0,0\nA102,-1,2\nA103,12.50,2.5\nA104,£5,3\nA105,,\nA106,"   ","   "';
const saved={format:'utilityshelf-column-mapping',version:4,sourceHeaders:['SKU','Price','Stock'],destinationHeaders:['SKU','Price','Stock'],columns:[0,1,2],required:[false,true,true],unique:[true,false,false],ignoreCase:true,trimWhitespace:false,numericRules:['none','price','stock']};
async function download(page,id){const wait=page.waitForEvent('download');await page.locator(id).click();return fs.readFileSync(await(await wait).path(),'utf8');}
async function setup(page,csv=sample,header='SKU,Price,Stock',choices=['0','1','2']){await page.locator('#source').fill(csv);await page.locator('#target').fill(header);await page.locator('#prepare').click();for(const [i,v] of choices.entries())await page.locator('#source-'+i).selectOption(v);}
async function rules(page){await page.locator('#numeric-1').selectOption('price');await page.locator('#numeric-2').selectOption('stock');}
async function load(page,value){await page.locator('#mappingFile').setInputFiles({name:'mapping.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(value))});}
test.beforeEach(async({page,context})=>{await context.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());await page.goto('/utilities/csv-column-mapper/?test-mode=1');});

test('guide sample checks zeros, negatives, decimal stock, symbols and blanks without changing CSV bytes',async({page})=>{
 await page.goto('/guides/prepare-supplier-csv-for-import?test-mode=1');const examples=await page.locator('pre code').allTextContents();expect(examples.map(x=>x.trim())).toContain(sample);
 await page.goto('/utilities/csv-column-mapper/?test-mode=1');await setup(page);await page.locator('#generate').click();const before=await download(page,'#download');await rules(page);await page.locator('#generate').click();
 await expect(page.locator('#numericSummary')).toContainText('3 invalid values across 3 data rows');await expect(page.locator('#numericSummary')).toContainText('8 nonblank field values checked; 4 blank or whitespace-only values skipped');
 const findings=await page.locator('#numericFindings li').allTextContents();expect(findings).toHaveLength(3);
 for(const [i,row,col,rule]of [[0,2,2,'price'],[1,3,3,'stock'],[2,4,2,'price']]){expect(findings[i]).toContain(`Data row ${row} (CSV record ${row+1}), destination column ${col}`);expect(findings[i]).toContain('invalid '+rule+' format');expect(findings[i]).toContain(`Source line ${row+1}; mapped CSV line ${row+1}.`);}
 const report=await download(page,'#downloadReport');for(const finding of findings)expect(report).toContain(finding);expect(report).not.toMatch(/A102|£5|12\.50|2\.5/);expect(await download(page,'#download')).toBe(before);
 await page.locator('#required-1').check();await page.locator('#required-2').check();await page.locator('#generate').click();await expect(page.locator('#requiredSummary')).toContainText('4 missing values across 2 data rows');expect(await download(page,'#download')).toBe(before);
});

test('strict number syntax accepts textual zero and large digits but rejects signs, decimal stock and ambiguous formats',async({page})=>{
 const values=['0','0.00','00',' 0 ','12.50','2.0','-1','-0','+1','£5','$5','€5','1,000','1,50','1e3','NaN','Infinity','.5','5.','1 000','\t','', '9007199254740993'];
 const encode=x=>'"'+x.replaceAll('"','""')+'"';
 await setup(page,'SKU,Price,Stock\n'+values.map((v,i)=>['00'+i,encode(v),encode(v)].join(',')).join('\n'));await page.locator('#generate').click();const baseline=await download(page,'#download');await rules(page);await page.locator('#generate').click();
 const findings=await page.locator('#numericFindings li').allTextContents();
 const pricePass=new Set([0,1,2,3,4,5,22]),stockPass=new Set([0,2,3,22]),blank=new Set([20,21]);
 for(let i=0;i<values.length;i++){for(const [column,pass]of [[2,pricePass],[3,stockPass]])expect(findings.some(line=>line.startsWith(`Data row ${i+1} (CSV record ${i+2}), destination column ${column} `))).toBe(!pass.has(i)&&!blank.has(i));}
 expect(await download(page,'#download')).toBe(baseline);expect(baseline).toContain('0022,9007199254740993,9007199254740993');
});

for(const [kind,csv]of [['matching',sample],['reordered','Stock,SKU,Price\n0,A101,0\n2,A102,-1\n2.5,A103,12.50\n3,A104,£5\n,A105,\n"   ",A106,"   "']])test(kind+' headers restore numeric rules with existing checks and unchanged output',async({page})=>{
 await setup(page);await rules(page);await page.locator('#required-1').check();await page.locator('#required-2').check();await page.locator('#unique-0').check();await page.locator('#ignoreCase').check();await page.locator('#generate').click();const baseline=await download(page,'#download');
 const file=await download(page,'#saveMapping');expect(JSON.parse(file)).toEqual(saved);expect(file).not.toMatch(/A101|£5/);await page.locator('#source').fill(csv);await load(page,JSON.parse(file));
 for(const [i,value]of saved.numericRules.entries())await expect(page.locator('#numeric-'+i)).toHaveValue(value);await expect(page.locator('#unique-0')).toBeChecked();await expect(page.locator('#required-1')).toBeChecked();await expect(page.locator('#ignoreCase')).toBeChecked();await expect(page.locator('#message')).toContainText('Numeric rules restored');await expect(page.locator('#result')).toBeHidden();
 await page.locator('#generate').click();await expect(page.locator('#numericSummary')).toContainText('3 invalid values across 3 data rows');expect(await download(page,'#download')).toBe(baseline);
});

test('no rules, empty input rows and empty mappings never claim a numeric pass; locations and detail caps are correct',async({page})=>{
 await setup(page);await page.locator('#generate').click();await expect(page.locator('#numericSummary')).toContainText('Not checked — no rules selected');
 await setup(page,'SKU,Price,Stock');await rules(page);await page.locator('#generate').click();await expect(page.locator('#numericSummary')).toContainText('Not checked — no data rows');
 await setup(page,sample,'Price',['empty']);await page.locator('#numeric-0').selectOption('price');await page.locator('#generate').click();await expect(page.locator('#numericSummary')).toContainText('Not checked — no nonblank values');
 await setup(page,'Note,Price\n"two\nlines",0\nx,-1','Price',['1']);await page.locator('#numeric-0').selectOption('price');await page.locator('#generate').click();expect(await download(page,'#downloadReport')).toContain('Source line 4; mapped CSV line 3.');
 await setup(page,'Price\n'+Array(105).fill('-1').join('\n'),'Price',['0']);await page.locator('#numeric-0').selectOption('price');await page.locator('#generate').click();await expect(page.locator('#numericFindings li')).toHaveCount(100);await expect(page.locator('#numericSummary')).toContainText('105 invalid values across 105 data rows');expect(await download(page,'#downloadReport')).toContain('Showing first 100 of 105 numeric findings');
 await setup(page,'Price,Stock\n0.00,0\n12.50,10','Price,Stock',['0','1']);await page.locator('#numeric-0').selectOption('price');await page.locator('#numeric-1').selectOption('stock');await page.locator('#generate').click();await expect(page.locator('#numericSummary')).toContainText('Passed');
});

test('older mappings default numeric rules off and invalid settings reject without stale reports',async({page})=>{
 await setup(page);for(const version of [1,2,3]){const old={...saved,version};delete old.numericRules;if(version<3){delete old.unique;delete old.ignoreCase;delete old.trimWhitespace;}if(version<2)delete old.required;await load(page,saved);await load(page,old);await expect(page.locator('#numeric-1')).toHaveValue('none');await expect(page.locator('#message')).toContainText('Older mapping: numeric rules start off');await expect(page.locator('#required-1')).toBeChecked({checked:version>=2});await expect(page.locator('#unique-0')).toBeChecked({checked:version>=3});}
 const missing={...saved};delete missing.numericRules;
 for(const bad of [missing,...[null,{},[],['none'],['none','price','stock','none'],['none','currency','stock'],['none',true,'stock']].map(numericRules=>({...saved,numericRules})),{...saved,version:5}]){await setup(page);await rules(page);await page.locator('#generate').click();await load(page,bad);await expect(page.locator('#message')).toContainText('Choose a valid');await expect(page.locator('#result')).toBeHidden();await expect(page.locator('#numericSummary')).toBeEmpty();await expect(page.locator('#downloadReport')).toBeDisabled();}
});

test('changed rules invalidate exports and pending mapping reads cannot replace new rules',async({page})=>{
 await setup(page);await rules(page);await page.locator('#generate').click();await page.locator('#numeric-1').selectOption('none');await expect(page.locator('#result')).toBeHidden();await expect(page.locator('#downloadReport')).toBeDisabled();await expect(page.locator('#numericSummary')).toBeEmpty();
 await page.evaluate(()=>{File.prototype.text=function(){return new Promise(resolve=>window.finishMapping=resolve);};});await load(page,saved);await page.locator('#target').fill('Price');await page.locator('#prepare').click();await page.locator('#numeric-0').selectOption('stock');await page.evaluate(value=>window.finishMapping(JSON.stringify(value)),saved);await expect(page.locator('#target')).toHaveValue('Price');await expect(page.locator('#numeric-0')).toHaveValue('stock');
 await page.locator('#prepare').click();await expect(page.locator('#numeric-0')).toHaveValue('none');
});
