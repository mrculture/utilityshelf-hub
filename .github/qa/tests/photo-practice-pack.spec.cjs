const {test,expect}=require('@playwright/test');
const fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process');
const pack=path.resolve(__dirname,'../../../guides/samples/product-photo-practice-v1.zip');
function unzip(file){
 return JSON.parse(execFileSync(process.platform==='win32'?'python':'python3',['-c','import zipfile,json,base64,sys\nwith zipfile.ZipFile(sys.argv[1]) as z:\n assert z.testzip() is None\n assert all(not n.startswith("/") and ".." not in n.split("/") for n in z.namelist())\n print(json.dumps({n:base64.b64encode(z.read(n)).decode() for n in z.namelist()}))',file],{encoding:'utf8',maxBuffer:16000000}));
}
async function download(page,locator){const pending=page.waitForEvent('download');await locator.click();return await pending;}
const buffer=b64=>Buffer.from(b64,'base64');
const upload=(name,b64)=>({name:name.split('/').pop(),mimeType: name.endsWith('.png')?'image/png':name.endsWith('.webp')?'image/webp':name.endsWith('.json')?'application/json':'image/jpeg',buffer:buffer(b64)});
test.beforeEach(async({context})=>{await context.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());});

for(const url of ['/?test-mode=1#product-photos','/guides/prepare-product-photos-for-ebay?test-mode=1#practice-pack'])test('practice pack download matches the tested archive: '+url,async({page})=>{
 await page.goto(url);
 const file=await download(page,page.getByRole('link',{name:'Download practice photo pack (.zip)',exact:true}));
 expect(file.suggestedFilename()).toBe('product-photo-practice-v1.zip');expect(fs.readFileSync(await file.path()).equals(fs.readFileSync(pack))).toBe(true);
 if(url.startsWith('/?')){await page.getByRole('link',{name:'Practice instructions and expected results',exact:true}).click();await expect(page).toHaveURL(/prepare-product-photos-for-ebay\?test-mode=1#practice-pack$/);}
 await expect(page.locator('#practice-pack')).toContainText('3 of 6');
 await expect(page.getByRole('link',{name:'Image Dimension Checker in practice mode',exact:true})).toHaveAttribute('href',/test-mode=1/);
});

test('real practice ZIP repairs from 3/6 to 5/5 and finishes with correct contact sheet, SKU mapping and unchanged renamed bytes',async({page})=>{
 test.setTimeout(90000);
 const remote=[];page.on('request',r=>{if(new URL(r.url()).hostname!=='127.0.0.1')remote.push(r.url());});
 const entries=unzip(pack);expect(Object.keys(entries)).toHaveLength(9);
 expect(Object.keys(entries)).toEqual(['photos/01-pass-front.jpg','photos/02-pass-detail.png','photos/03-fail-too-small.jpg','photos/04-fail-file-size.png','photos/05-fail-unreadable.jpg','photos/06-pass-packaging.webp','replacements/03-replacement.jpg','practice-settings.json','START-HERE.txt']);
 expect(buffer(entries['START-HERE.txt']).toString()).toContain('3 of 6');
 expect(buffer(entries['photos/04-fail-file-size.png']).length).toBeGreaterThan(1000000);
 await page.goto('/utilities/image-dimension-checker/?test-mode=1');
 const chooser=page.waitForEvent('filechooser');await page.locator('#loadSettings').click();await (await chooser).setFiles(upload('practice-settings.json',entries['practice-settings.json']));
 await expect(page.locator('#settingsStatus')).toContainText('800 × 800 px minimum, 1 MB maximum; long edge 1200 px');
 await page.locator('#files').setInputFiles(Object.entries(entries).filter(([n])=>n.startsWith('photos/')).map(([n,b])=>upload(n,b)));
 await expect(page.locator('#status')).toHaveText('3 of 6 meet your limits.');await expect(page.locator('#reportStatus')).toHaveText('Report status: Check incomplete.');
 const rows=page.locator('#output tbody tr');
 await expect(rows.nth(2)).toContainText('Width short by 200 px; Height short by 350 px');await expect(rows.nth(3)).toContainText('Over the file size limit');await expect(rows.nth(4)).toContainText('Choose a JPEG, PNG or WebP image');
 const initial=fs.readFileSync(await (await download(page,page.locator('#downloadReport'))).path(),'utf8');expect(initial).toContain('Selected: 6. Passed: 3.');expect(initial).toContain('Unreadable: 1.');
 await rows.nth(4).getByRole('button',{name:/^Remove photo/}).click();await expect(page.locator('#status')).toHaveText('3 of 5 meet your limits.');
 const replace=page.waitForEvent('filechooser');await rows.nth(2).getByRole('button',{name:/^Replace photo/}).click();await (await replace).setFiles(upload('03-replacement.jpg',entries['replacements/03-replacement.jpg']));
 await expect(page.locator('#status')).toHaveText('4 of 5 meet your limits.');await page.locator('#prepareResize').click();await expect(page.locator('#downloadResized')).toBeEnabled({timeout:30000});
 await expect(page.locator('#resizeStatus')).toContainText('5 of 5 copies meet all selected limits');
 const copies=unzip(await (await download(page,page.locator('#downloadResized'))).path());expect(Object.keys(copies)).toHaveLength(6);
 const images=Object.entries(copies).filter(([n])=>n!=='resize-report.txt').map(([n,b])=>upload(n,b));
 expect(images.map(f=>f.name)).toEqual(['01-01-pass-front-resized.jpg','02-02-pass-detail.png','03-03-replacement-resized.jpg','04-04-fail-file-size-resized.jpg','05-06-pass-packaging-resized.jpg']);
 for(const item of images)expect(item.buffer.length).toBeLessThanOrEqual(1000000);
 await page.locator('#files').setInputFiles(images);await expect(page.locator('#status')).toHaveText('5 of 5 meet your limits.');
 const finalReport=fs.readFileSync(await (await download(page,page.locator('#downloadReport'))).path(),'utf8');expect(finalReport).toContain('Status: Passed');expect(finalReport).toContain('Selected: 5. Passed: 5.');expect(finalReport).not.toContain('05-fail-unreadable');expect(finalReport).not.toContain('03-fail-too-small');
 const dimensions=await rows.locator('td:nth-child(2)').allTextContents();for(const text of dimensions){const [w,h]=text.split(' × ').map(Number);expect(Math.min(w,h)).toBeGreaterThanOrEqual(800);expect(Math.max(w,h)).toBeLessThanOrEqual(1200);}
 await page.getByRole('link',{name:'make a contact sheet',exact:true}).click();await page.locator('#files').setInputFiles(images);await expect(page.locator('#names li')).toHaveCount(5);
 await page.locator('#names li').first().getByRole('button',{name:/Move later/}).click();
 await page.locator('#names li').nth(2).getByRole('button',{name:/^Remove photo/}).click();
 await expect(page.locator('#names li')).toHaveCount(4);await page.locator('#undoRemoval').click();await expect(page.locator('#names li')).toHaveCount(5);
 const replacementImage={...images[4],name:'better-packaging.jpg'};
 const replaceSheet=page.waitForEvent('filechooser');await page.locator('#names li').nth(3).getByRole('button',{name:/^Replace photo/}).click();await(await replaceSheet).setFiles(replacementImage);
 await expect(page.locator('#editStatus')).toContainText('at position 4');
 images[3]=replacementImage;
 const order=[images[1],images[0],...images.slice(2)];await expect(page.locator('#orderedNames')).toHaveValue(order.map(f=>f.name).join('\n'));
 const listDownload=await download(page,page.locator('#downloadNames'));expect(listDownload.suggestedFilename()).toBe('ordered-filenames.txt');const listPath=await listDownload.path();expect(fs.readFileSync(listPath,'utf8')).toBe(order.map(f=>f.name).join('\r\n')+'\r\n');
 const preview=await page.locator('#sheet').evaluate(c=>c.toDataURL().split(',')[1]);
 const sheet=fs.readFileSync(await (await download(page,page.locator('#download'))).path());expect(sheet.equals(Buffer.from(preview,'base64'))).toBe(true);expect(sheet.subarray(0,8)).toEqual(Buffer.from([137,80,78,71,13,10,26,10]));expect([sheet.readUInt32BE(16),sheet.readUInt32BE(20)]).toEqual([900,464]);
 await page.goto('/tools/filename-cleaner/?test-mode=1');const listChooser=page.waitForEvent('filechooser');await page.locator('#loadFilenameList').click();await (await listChooser).setFiles(listPath);await expect(page.locator('#names')).toHaveValue(order.map(f=>f.name).join('\n'));await page.locator('#mode').selectOption('numbered');await page.locator('#prefix').fill('PRACTICE-1042');
 const expected=order.map((f,i)=>'practice-1042-'+String(i+1).padStart(3,'0')+path.extname(f.name));await expect(page.locator('#result')).toHaveValue(expected.join('\n'));
 await page.locator('#photoFiles').setInputFiles([...images].reverse());await expect(page.locator('#zipStatus')).toContainText('5 photos matched by original filename');
 const renamed=unzip(await (await download(page,page.locator('#downloadZip'))).path());expect(Object.keys(renamed)).toEqual([...expected,'filename-mapping.txt']);
 const mapping=buffer(renamed['filename-mapping.txt']).toString();for(const [i,name] of expected.entries()){expect(buffer(renamed[name]).equals(order[i].buffer)).toBe(true);expect(mapping).toContain('Original: '+order[i].name+'\r\nNew: '+name);}
 expect(remote).toEqual([]);
});
