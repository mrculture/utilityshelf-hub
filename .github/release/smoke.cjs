const {chromium}=require('../qa/node_modules/playwright');
const target=JSON.parse(process.argv[2]);const expected=process.argv[3];
(async()=>{
 const browser=await chromium.launch();
 try {
  const context=await browser.newContext();
  await context.route('**/*',route=>new URL(route.request().url()).origin===target.origin?route.continue():route.abort());
  await context.addInitScript(()=>localStorage.setItem('systemCareTourSeen','true'));
  const page=await context.newPage();const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('response',response=>{if(new URL(response.url()).origin===target.origin && response.status()>=400) errors.push(response.url()+' '+response.status());});
  const response=await page.goto(target.origin+'/?release-check='+Date.now(),{waitUntil:'networkidle',timeout:20000});
  if(response.status()!==200 || !(await page.title()).includes(target.title)) throw Error('Homepage did not load correctly');
  if(expected) {
   const marker=await page.evaluate(async()=>{const r=await fetch('/release.json?verify='+Date.now(),{cache:'no-store'});if(!r.ok)throw Error('Missing release marker');return r.json();});
   if(marker.commit!==expected || marker.target!==target.name) throw Error('Live release marker does not match tested commit');
  }
  if(target.test==='safe') {
   if(await page.locator('#live-safe').isChecked() || await page.locator('input[value="recycleBin"]').isChecked()) throw Error('Unsafe default options');
   await page.locator('#generate-script').click();
   if(!(await page.locator('#script-code').innerText()).includes('Dry run: enabled')) throw Error('Default script is not a preview');
  } else if(target.test==='csv') {
   await page.locator('#sample').click();
   if(!(await page.locator('#summary').innerText()).includes('2 issues found')) throw Error('CSV sample result changed');
  } else if(target.test==='filename') {
   await page.locator('#sample').click();
   if(await page.locator('#rows input').count()!==5) throw Error('Five-photo example did not produce five rows');
   if(expected) {
    await page.locator('#mode').selectOption('numbered');
    await page.locator('#prefix').fill('SKU-1042');
    if(!(await page.locator('#result').inputValue()).startsWith('sku-1042-001.JPG\nsku-1042-002.jpg')) throw Error('Numbered filename result changed');
    const collector=await context.request.get(target.origin+'/usage');
    if(collector.status()!==200 || await collector.text()!=='Usage collector ready') throw Error('Usage collector binding unavailable');
   }
  } else {
   if(await page.locator('a[href="https://system-care-script-builder.utilityshelf.site/"]').count()<1) throw Error('System Care homepage link missing');
  }
  if(errors.length) throw Error(errors.join('\n'));
  console.log(`${target.name}: live browser checks passed${expected?' for '+expected:''}`);
 } finally {await browser.close();}
})().catch(error=>{console.error(error.message);process.exitCode=1});
