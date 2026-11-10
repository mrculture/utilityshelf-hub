const {test,expect}=require('@playwright/test');
const fs=require('node:fs');
const payload=text=>({name:'ordered-filenames.txt',mimeType:'text/plain',buffer:Buffer.from(text)});
async function load(page,text){const pending=page.waitForEvent('filechooser');await page.locator('#loadFilenameList').click();await (await pending).setFiles(payload(text));}
async function photo(page,name){const b=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=c.height=20;return c.toDataURL().split(',')[1];});return {name,mimeType:'image/png',buffer:Buffer.from(b,'base64')};}
test.beforeEach(async({context})=>{await context.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());});

test('text download follows reordering, excludes skipped files, and blocks stale or multiline lists',async({page})=>{
 await page.goto('/utilities/image-contact-sheet/?test-mode=1');
 await expect(page.locator('#downloadNames')).toBeDisabled();
 const a=await photo(page,'Café Front.PNG'),b=await photo(page,'detail.png');
 await page.locator('#files').setInputFiles([a,{name:'broken.jpg',mimeType:'image/jpeg',buffer:Buffer.from('invalid')},b]);
 await expect(page.locator('#names li')).toHaveCount(2);await page.locator('#names li').last().getByRole('button',{name:/Move earlier/}).click();
 const pending=page.waitForEvent('download');await page.locator('#downloadNames').click();const d=await pending;
 expect(fs.readFileSync(await d.path(),'utf8')).toBe('detail.png\r\nCafé Front.PNG\r\n');
 await page.locator('#files').setInputFiles({...a,name:'two\nlines.png'});await expect(page.locator('#namesCopyStatus')).toContainText('line break');await expect(page.locator('#downloadNames')).toBeDisabled();
 await page.locator('#files').setInputFiles(Array(31).fill(a));await expect(page.locator('#downloadNames')).toBeDisabled();await expect(page.locator('#orderedNames')).toHaveValue('');
});

test('imports BOM, line endings, blanks, Unicode and duplicate names without sorting or trimming',async({page})=>{
 await page.goto('/tools/filename-cleaner/?test-mode=1');await page.locator('#mode').selectOption('numbered');await page.locator('#prefix').fill('SAVE');await page.locator('#start').fill('7');
 await load(page,'\uFEFFCafé Front.PNG\r\n\r\n  spaced.jpg \rCafé Front.PNG\nthird.webp\n');
 await expect(page.locator('#names')).toHaveValue('Café Front.PNG\n  spaced.jpg \nCafé Front.PNG\nthird.webp');
 await expect(page.locator('#result')).toHaveValue('save-007.PNG\nsave-008.jpg\nsave-009.PNG\nsave-010.webp');await expect(page.locator('#filenameListStatus')).toContainText('Loaded 4 filenames');
 await load(page,Array.from({length:1000},(_,i)=>'photo-'+i+'.png').join('\n'));await expect(page.locator('#filenameListStatus')).toContainText('Loaded 1000 filenames');await expect(page.locator('.original')).toHaveCount(1000);
});

test('invalid files preserve existing names, edits and photo matches',async({page})=>{
 await page.goto('/tools/filename-cleaner/?test-mode=1');const p=await photo(page,'old.png');await page.locator('#names').fill('old.png');await page.locator('#name-1').fill('reviewed.png');await page.locator('#photoFiles').setInputFiles(p);await expect(page.locator('#downloadZip')).toBeEnabled();
 const invalid=[Buffer.alloc(0),Buffer.from(' \r\n'),Buffer.from('folder/file.png'),Buffer.from('C:\\photos\\file.png'),Buffer.from('bad\0name.png'),Buffer.from([0xff,0xfe,65,0]),Buffer.alloc(131073,65),Buffer.from(Array(1001).fill('a.png').join('\n'))];
 for(const buffer of invalid){await page.locator('#filenameListFile').setInputFiles({name:'bad.txt',mimeType:'text/plain',buffer});await expect(page.locator('#filenameListStatus')).toContainText('List not loaded.');await expect(page.locator('#names')).toHaveValue('old.png');await expect(page.locator('#name-1')).toHaveValue('reviewed.png');await expect(page.locator('#downloadZip')).toBeEnabled();}
});

test('manual edits, a newer load and read failures cannot be overwritten by stale imports',async({page})=>{
 await page.goto('/tools/filename-cleaner/?test-mode=1');
 await page.evaluate(()=>{const read=File.prototype.arrayBuffer;window.reads=[];File.prototype.arrayBuffer=function(){return new Promise((resolve,reject)=>window.reads.push({resolve:()=>read.call(this).then(resolve,reject),reject}));};});
 await load(page,'late.png');await expect.poll(()=>page.evaluate(()=>window.reads.length)).toBe(1);await page.locator('#names').fill('manual.png');await page.evaluate(()=>window.reads[0].resolve());await expect(page.locator('#names')).toHaveValue('manual.png');
 await load(page,'first.png');await load(page,'newest.png');await expect.poll(()=>page.evaluate(()=>window.reads.length)).toBe(3);await page.evaluate(()=>window.reads[2].resolve());await expect(page.locator('#names')).toHaveValue('newest.png');await page.evaluate(()=>window.reads[1].resolve());await expect(page.locator('#names')).toHaveValue('newest.png');
 await load(page,'failure.png');await page.evaluate(()=>window.reads[3].reject(Error('Read failure')));await expect(page.locator('#filenameListStatus')).toContainText('could not be read');await expect(page.locator('#names')).toHaveValue('newest.png');
 const chooser=page.waitForEvent('filechooser');await page.locator('#loadFilenameList').click();await (await chooser).setFiles([]);await expect(page.locator('#names')).toHaveValue('newest.png');
});

test('loading a new order cancels a ZIP that is still reading photos',async({page})=>{
 await page.goto('/tools/filename-cleaner/?test-mode=1');const p=await photo(page,'one.png'),q=await photo(page,'two.png');await page.locator('#names').fill('one.png\ntwo.png');await page.locator('#photoFiles').setInputFiles([p,q]);
 await page.evaluate(()=>{const read=File.prototype.arrayBuffer;window.photos=[];File.prototype.arrayBuffer=function(){if(this.name.endsWith('.txt'))return read.call(this);return new Promise(resolve=>window.photos.push(()=>read.call(this).then(resolve)));};});
 let downloads=0;page.on('download',()=>downloads++);await page.locator('#downloadZip').click();await expect.poll(()=>page.evaluate(()=>window.photos.length)).toBe(1);
 await load(page,'two.png\none.png');await expect(page.locator('#names')).toHaveValue('two.png\none.png');await page.evaluate(()=>window.photos[0]());await expect(page.locator('#zipStatus')).toContainText('2 photos matched');expect(downloads).toBe(0);
});
