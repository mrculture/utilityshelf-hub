const {test,expect}=require('@playwright/test');
const fs=require('node:fs');
async function downloadBytes(page,id){const wait=page.waitForEvent('download');await page.locator(id).click();return fs.readFileSync(await(await wait).path());}
async function download(page,id){return (await downloadBytes(page,id)).toString('utf8');}
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

test('all findings are available across pages and filters without changing full CSV or report',async({page})=>{
 const csv='SKU,Price,Stock\n'+Array.from({length:105},(_,i)=>i===104?'0012,,2.5':'0012,-1,0').join('\n');
 await setup(page,csv,'SKU,Price,Stock');
 await page.locator('#generate').click();
 const original=await downloadBytes(page,'#download');
 await page.locator('#required-1').check();
 await page.locator('#unique-0').check();
 await page.locator('#numeric-1').selectOption('price');
 await page.locator('#numeric-2').selectOption('stock');
 await page.locator('#generate').click();
 const report=await download(page,'#downloadReport');
 expect(report.split('Combined problem rows')[1]).toContain('Showing first 100 of 211 issues in this report');
 await page.locator('#showProblems').click();
 const status=page.locator('#problemPageStatus');
 const rows=page.locator('#problemDetails tr');
 await expect(page.locator('#problemSummary')).toContainText('211 issues across 105 data rows');
 await expect(status).toHaveText('Showing issues 1–50 of 211. Page 1 of 5.');
 await expect(rows).toHaveCount(50);
 await page.getByRole('button',{name:'Next page',exact:true}).click();
 await expect(status).toContainText('51–100 of 211');
 await page.getByRole('button',{name:'Next page',exact:true}).click();
 await expect(status).toContainText('101–150 of 211');
 await expect(rows.first()).toContainText('Data row 51 (CSV record 52)');
 await page.getByLabel('Page number',{exact:true}).fill('5');
 await page.getByRole('button',{name:'Go to page',exact:true}).click();
 await expect(status).toHaveText('Showing issues 201–211 of 211. Page 5 of 5.');
 await expect(rows).toHaveCount(11);
 await expect(rows.last()).toContainText('Data row 105 (CSV record 106)');
 await expect(rows.last()).toContainText('invalid stock format');
 await expect(page.getByRole('button',{name:'Next page',exact:true})).toBeDisabled();
 await page.getByRole('button',{name:'Previous page',exact:true}).click();
 await expect(status).toContainText('151–200 of 211');

 const filter=page.getByLabel('Issue type',{exact:true});
 for (const [type, count, reason] of [['missing',1,'blank cell'],['duplicate',105,'duplicate group'],['price',104,'invalid price format'],['stock',1,'invalid stock format']]) {
   await filter.selectOption(type);
   await expect(status).toHaveText('Showing issues 1–'+Math.min(50,count)+' of '+count+'. Page 1 of '+Math.ceil(count/50)+'.');
   expect((await rows.allTextContents()).every(text=>text.includes(reason))).toBe(true);
 }
 expect(await downloadBytes(page,'#download')).toEqual(original);
 expect(await download(page,'#downloadReport')).toBe(report);
 await page.locator('#numeric-2').selectOption('none');
 await page.locator('#generate').click();
 await page.locator('#showProblems').click();
 await expect(filter).toHaveValue('all');
 await expect(status).toContainText('Page 1 of 5');
 await filter.selectOption('stock');
 await expect(status).toHaveText('No issues match this filter.');
 await expect(rows).toHaveCount(0);
 await expect(page.locator('#problemPagination')).toBeHidden();
 expect(await downloadBytes(page,'#download')).toEqual(original);
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
