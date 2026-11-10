const {test,expect}=require('@playwright/test');
const csv=['CSV Import Checker','CSV Column Mapper','CSV Formula Checker'];
const photos=['Filename Cleaner','Image Dimension Checker','Image Contact Sheet'];
const names=page=>page.locator('.tool-card:visible h3').allTextContents();
test.beforeEach(async({context,page})=>{
 await context.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
 await page.goto('/');
});
test('finder starts before the catalog and workflows with every tool available',async({page})=>{
 await expect(page.getByRole('search',{name:'Find a UtilityShelf tool'})).toBeVisible();
 await expect(page.locator('.tool-card:visible')).toHaveCount(17);
 await expect(page.locator('#tool-count')).toHaveText('Showing 17 of 17 tools.');
 const positions=await page.locator('#tool-finder, .tool-card, #product-photos, #supplier-csv').evaluateAll(nodes=>nodes.map(n=>({id:n.id,top:n.getBoundingClientRect().top})));
 expect(positions[0].id).toBe('tool-finder');expect(positions.at(-2).id).toBe('product-photos');expect(positions.at(-1).id).toBe('supplier-csv');
 expect(new Set(await page.locator('.tool-card .button').evaluateAll(nodes=>nodes.map(n=>n.href))).size).toBe(17);
 await expect(page.locator('#tool-count')).toHaveAttribute('role','status');
});
test('CSV searches find all three check and mapping tools across both sections',async({page})=>{
 for(const query of ['CSV','  cSv  ','CSV tools']){
  await page.getByRole('searchbox',{name:'Search tools'}).fill(query);expect(await names(page)).toEqual(csv);
  await expect(page.locator('#tool-count')).toHaveText('Showing 3 of 17 tools.');
 }
 const expected=['https://csv-import-checker.utilityshelf.site/','/utilities/csv-column-mapper/','/utilities/csv-formula-checker/'];
 for(const [i,title] of csv.entries())await expect(page.locator('.tool-card').filter({has:page.getByRole('heading',{name:title,exact:true})}).locator('.button')).toHaveAttribute('href',expected[i]);
 await page.getByRole('link',{name:'Map CSV columns',exact:true}).click();
 await expect(page).toHaveURL(/\/utilities\/csv-column-mapper\/$/);await expect(page.locator('h1')).toHaveText('CSV Column Mapper');
});
test('photo and image queries find the three listing tools without unrelated cross-link matches',async({page})=>{
 for(const query of ['photo','photos','image','eBay photos']){
  await page.locator('#tool-query').fill(query);expect(await names(page)).toEqual(photos);
 }
 await page.locator('#tool-category').selectOption('photos');expect(await names(page)).toEqual(photos);
 await page.getByRole('link',{name:'Make a contact sheet',exact:true}).click();
 await expect(page).toHaveURL(/\/utilities\/image-contact-sheet\/$/);await expect(page.locator('h1')).toHaveText('Image Contact Sheet');
});
test('each category covers its intended tools and combinations narrow the results',async({page})=>{
 const categories={data:[...csv,'List Difference','JSON Lines Import Checker'],photos:[...photos,'File Checksum'],text:['CleanText Shelf','Metadata Checker','List Difference','Heading Outline Checker','Batch Slug Generator'],links:['LinkClean Shelf','UTM Link Builder','Batch Slug Generator'],email:['TempMail Checker'],windows:['System Care Script Builder']};
 for(const [category,expected] of Object.entries(categories)){
  await page.locator('#tool-category').selectOption(category);expect((await names(page)).sort()).toEqual([...expected].sort());
 }
 await page.locator('#tool-category').selectOption('data');await page.locator('#tool-query').fill('formula csv');expect(await names(page)).toEqual(['CSV Formula Checker']);
 await expect(page.locator('#tools > .section-heading')).toBeHidden();await expect(page.locator('#companions')).toBeVisible();
 await page.locator('#tool-query').fill('saved mapping');expect(await names(page)).toEqual(['CSV Column Mapper']);
});
test('no matches and clear filters restore all tools and keyboard focus',async({page})=>{
 await page.locator('#tool-query').fill('csv');await page.locator('#tool-category').selectOption('photos');
 await expect(page.locator('.tool-card:visible')).toHaveCount(0);await expect(page.locator('#tool-empty')).toBeVisible();
 await expect(page.locator('#tool-count')).toHaveText('Showing 0 of 17 tools.');await expect(page.locator('#companions')).toBeHidden();
 await page.getByRole('button',{name:'Clear filters',exact:true}).click();await expect(page.locator('#tool-query')).toBeFocused();
 await expect(page.locator('#tool-query')).toHaveValue('');await expect(page.locator('#tool-category')).toHaveValue('all');
 await expect(page.locator('.tool-card:visible')).toHaveCount(17);await expect(page.locator('#tool-empty')).toBeHidden();
 await page.locator('#tool-query').fill('<script>not-a-tool</script>');await expect(page.locator('#tool-empty')).toBeVisible();
 await page.locator('#tool-query').fill('');await expect(page.locator('.tool-card:visible')).toHaveCount(17);
});
test('search and category controls work by keyboard without submitting or sending the query',async({page})=>{
 const requests=[];page.on('request',request=>requests.push(request.url()));
 await page.locator('#tool-query').focus();await page.keyboard.type('CSV');await page.keyboard.press('Enter');
 await expect(page).toHaveURL('http://127.0.0.1:4179/');expect(await names(page)).toEqual(csv);
 await page.keyboard.press('Tab');await expect(page.locator('#tool-category')).toBeFocused();
 await page.keyboard.press('ArrowDown');await page.keyboard.press('Enter');await expect(page.locator('#tool-category')).toHaveValue('data');
 await page.keyboard.press('Tab');await expect(page.getByRole('button',{name:'Clear filters',exact:true})).toBeFocused();
 await page.keyboard.press('Enter');await expect(page.locator('.tool-card:visible')).toHaveCount(17);
 expect(requests).toEqual([]);
});
test('companion navigation clears a filter that would hide its destination and workflows remain reachable',async({page})=>{
 await page.locator('#tool-category').selectOption('email');await expect(page.locator('#companions')).toBeHidden();
 await page.getByRole('link',{name:'Companion tools',exact:true}).click();await expect(page.locator('#companions')).toBeVisible();await expect(page.locator('#tool-category')).toHaveValue('all');
 await page.locator('#tool-query').fill('csv');await page.locator('.finder-workflows').getByRole('link',{name:'Prepare product photos',exact:true}).click();
 await expect(page).toHaveURL(/#product-photos$/);await expect(page.locator('#product-photos')).toBeVisible();
 await expect(page.locator('#supplier-csv')).toBeVisible();
});
test('all static tool links and workflows remain available without JavaScript',async({browser})=>{
 const context=await browser.newContext({javaScriptEnabled:false});
 await context.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
 const page=await context.newPage();await page.goto('http://127.0.0.1:4179/');
 await expect(page.locator('#tool-finder')).toBeHidden();await expect(page.locator('.tool-card:visible')).toHaveCount(17);
 await expect(page.getByText('Browse all available tools below.',{exact:true})).toBeVisible();await expect(page.locator('#supplier-csv')).toBeVisible();await context.close();
});
test('a failed finder script leaves a usable static catalog',async({page})=>{
 await page.route('**/tool-finder.js*',route=>route.abort());await page.reload();
 await expect(page.locator('#tool-finder')).toBeHidden();await expect(page.locator('#tool-fallback')).toBeVisible();
 await expect(page.locator('.tool-card:visible')).toHaveCount(17);
 await page.getByRole('link',{name:'Map CSV columns',exact:true}).click();await expect(page.locator('h1')).toHaveText('CSV Column Mapper');
});
