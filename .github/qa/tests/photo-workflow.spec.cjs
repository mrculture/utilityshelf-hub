const {test,expect}=require('@playwright/test');

test('photo walkthrough keeps test mode across homepage, guide and photo tool links without tracking',async({page,context})=>{
 const remote=[];
 await context.route('**/*',route=>{const url=new URL(route.request().url());if(url.hostname==='127.0.0.1')return route.continue();remote.push(url.href);return route.abort();});
 await page.goto('/?test-mode=1#product-photos');
 for(const link of await page.locator('#product-photos a[data-photo-step]').all())expect(await link.getAttribute('href')).toContain('test-mode=1');
 await page.getByRole('link',{name:'Follow the six-photo walkthrough',exact:true}).click();
 await expect(page).toHaveURL(/prepare-product-photos-for-ebay\?test-mode=1$/);
 await page.getByRole('link',{name:'Check photo dimensions',exact:true}).click();
 await expect(page.locator('#testModeNotice')).toBeVisible();
 await page.getByRole('link',{name:'make a contact sheet',exact:true}).click();
 await expect(page.locator('#testModeNotice')).toBeVisible();
 await page.locator('#demo').click();
 await expect(page.locator('#copyNames')).toBeEnabled({timeout:15000});
 await expect(page.getByRole('link',{name:'Open Filename Cleaner',exact:true})).toHaveAttribute('href','https://filename-cleaner.utilityshelf.site/?test-mode=1#five-photo-example');
 await page.getByRole('link',{name:'product-photo preparation guide',exact:true}).click();
 await expect(page.locator('#testModeNotice')).toBeVisible();
 await page.getByRole('link',{name:'Back to the product-photo workflow',exact:true}).click();
 await expect(page).toHaveURL(/\?test-mode=1#product-photos$/);
 expect(remote).toEqual([]);
});

for(const path of ['/','/guides/prepare-product-photos-for-ebay'])test('normal visitor page retains one analytics beacon: '+path,async({page,context})=>{
 await context.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
 await page.addInitScript(()=>Object.defineProperty(navigator,'webdriver',{get:()=>false}));
 await page.goto(path);
 await expect(page.locator('script[src="https://static.cloudflareinsights.com/beacon.min.js"]')).toHaveCount(1);
 await expect(page.locator('#testModeNotice')).toHaveCount(0);
});
