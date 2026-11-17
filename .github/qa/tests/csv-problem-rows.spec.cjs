const {test,expect}=require('@playwright/test');
const fs=require('node:fs');
async function download(page,id){const wait=page.waitForEvent('download');await page.locator(id).click();return fs.readFileSync(await(await wait).path(),'utf8');}
async function setup(page,csv,header){await page.locator('#source').fill(csv);await page.locator('#target').fill(header);await page.locator('#prepare').click();}
test.beforeEach(async({page,context})=>{await context.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());await page.goto('/utilities/csv-column-mapper/?test-mode=1');});

test('combined mixed issues agree with report and preserve CSV, including multiline source offsets',async({page})=>{
 const csv='Note,SKU,Price,Stock\n"two\nlines",0012,0,0\nx,0012,-1,2.5\nx,0013,"   ",3\nx,0014,12.50,4';
 await setup(page,csv,'SKU,Price,Stock');await page.locator('#generate').click();const baseline=await download(page,'#download');
 await page.locator('#required-1').check();await page.locator('#unique-0').check();await page.locator('#numeric-1').selectOption('price');await page.locator('#numeric-2').selectOption('stock');await page.locator('#generate').click();
 await expect(page.locator('#problemSummary')).toContainText('5 issues across 3 data rows');await expect(page.locator('#problemRows')).toBeHidden();await page.getByRole('button',{name:'Show problem rows',exact:true}).click();
 await expect(page.locator('#showProblems')).toHaveAttribute('aria-expanded','true');const rows=await page.locator('#problemDetails tr').allTextContents();expect(rows).toHaveLength(5);
 expect(rows[0]).toContain('Data row 1 (CSV record 2). Source line 2; mapped CSV line 2.');expect(rows[0]).toContain('"0012"');expect(rows[1]).toContain('Data row 2 (CSV record 3). Source line 4; mapped CSV line 3.');expect(rows[2]).toContain('invalid price format');expect(rows[3]).toContain('invalid stock format');expect(rows[4]).toContain('"   "');
 const report=await download(page,'#downloadReport');const combined=report.split('Combined problem rows')[1];
 for(const row of await page.locator('#problemDetails tr').all()){const cells=await row.locator('td').allTextContents();expect(combined).toContain(cells[0]+' '+cells[1]+': '+cells[3]+'.');}
 expect(combined).not.toContain('0012');expect(combined).not.toContain('"   "');expect(await download(page,'#download')).toBe(baseline);
 await page.getByRole('button',{name:'Hide problem rows',exact:true}).click();await expect(page.locator('#problemRows')).toBeHidden();expect(await download(page,'#download')).toBe(baseline);
 await page.locator('#unique-0').uncheck();await expect(page.locator('#result')).toBeHidden();await expect(page.locator('#problemDetails')).toBeEmpty();await expect(page.locator('#downloadReport')).toBeDisabled();await page.locator('#generate').click();await expect(page.locator('#problemSummary')).toContainText('3 issues across 2 data rows');await expect(page.locator('#showProblems')).toHaveAttribute('aria-expanded','false');
});

test('combined cap counts all rows and selects earliest issues across different check passes',async({page})=>{
 await setup(page,'SKU,Price\n'+Array.from({length:105},(_,i)=>'DUP,'+(i===104?'':'-1')).join('\n'),'SKU,Price');await page.locator('#required-1').check();await page.locator('#unique-0').check();await page.locator('#numeric-1').selectOption('price');await page.locator('#generate').click();await page.locator('#showProblems').click();
 await expect(page.locator('#problemSummary')).toContainText('210 issues across 105 data rows');await expect(page.locator('#problemSummary')).toContainText('Showing first 100 of 210');await expect(page.locator('#problemDetails tr')).toHaveCount(100);await expect(page.locator('#problemDetails tr').last()).toContainText('Data row 50 (CSV record 51)');const report=await download(page,'#downloadReport');expect(report.split('Combined problem rows')[1]).toContain('Showing first 100 of 210');
});

test('no rules, no records, clean zeros and inserted blanks have clear states',async({page})=>{
 await setup(page,'SKU,Price\nA,0','SKU,Price');await page.locator('#generate').click();await expect(page.locator('#problemSummary')).toContainText('Not checked — no validation');await expect(page.locator('#showProblems')).toBeDisabled();
 await page.locator('#required-1').check();await page.locator('#numeric-1').selectOption('price');await page.locator('#generate').click();await expect(page.locator('#problemSummary')).toContainText('No issues found by the selected checks');await expect(page.locator('#showProblems')).toBeDisabled();
 await page.locator('#source-1').selectOption('empty');await page.locator('#generate').click();await page.locator('#showProblems').click();await expect(page.locator('#problemDetails')).toContainText('Use empty values');await expect(page.locator('#problemDetails')).toContainText('empty value inserted by mapping');await expect(page.locator('#problemDetails tr td').nth(2)).toHaveText('""');
 await setup(page,'SKU,Price','SKU,Price');await page.locator('#required-1').check();await page.locator('#generate').click();await expect(page.locator('#problemSummary')).toContainText('Not checked — no data rows');await expect(page.locator('#showProblems')).toBeDisabled();
});

test('untrusted cell values render as text, previews truncate and report omits contents',async({page})=>{
 const value='<img src=x onerror=alert(1)>'+ 'x'.repeat(220);
 await setup(page,'Price\n'+value,'Price');await page.locator('#numeric-0').selectOption('price');await page.locator('#generate').click();await page.locator('#showProblems').click();await expect(page.locator('#problemDetails img')).toHaveCount(0);await expect(page.locator('#problemDetails')).toContainText('[preview shortened]');expect(await download(page,'#downloadReport')).not.toContain('<img');expect(await download(page,'#download')).toContain(value);
});
