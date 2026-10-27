// Helpers navigateur pour la navigation responsive ; aucune requête métier.
export async function openNavigation(page){
 if(await page.locator('#sidebar').evaluate(e=>e.inert)){
  await page.locator('#menu-toggle').click();
  await page.waitForFunction(()=>!document.getElementById('sidebar').inert);
 }
}
export async function clickNavigation(page,selector){await openNavigation(page);await page.locator(selector).click();}
export async function checkMobileNavigation(page){
 const assert=(await import('node:assert/strict')).default
 if((await page.viewportSize()).width>760){
  assert.equal(await page.locator('#menu-toggle').isVisible(),false)
  assert.equal(await page.locator('#sidebar').evaluate(e=>e.inert),false)
  assert.ok((await page.locator('#workspace').boundingBox()).x>=280);return
 }
 assert.equal(await page.locator('#sidebar').evaluate(e=>e.inert),true)
 await openNavigation(page)
 assert.equal(await page.locator('#menu-toggle').getAttribute('aria-expanded'),'true')
 assert.equal(await page.locator('#workspace').evaluate(e=>e.inert),true)
 await page.locator('#close-menu').focus();await page.keyboard.press('Shift+Tab')
 assert.equal(await page.evaluate(()=>document.getElementById('sidebar').contains(document.activeElement)),true)
 await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>document.activeElement.id),'close-menu')
 await page.screenshot({path:'visual-check/sidebar-mobile-menu.png',fullPage:true,animations:'disabled'})
 await page.keyboard.press('Escape')
 assert.equal(await page.locator('#menu-toggle').getAttribute('aria-expanded'),'false')
 assert.equal(await page.evaluate(()=>document.activeElement.id),'menu-toggle')
 await openNavigation(page)
 await page.locator('#sidebar-backdrop').click({position:{x:page.viewportSize().width-8,y:350}})
 assert.equal(await page.locator('#workspace').evaluate(e=>e.inert),false)
 await page.emulateMedia({reducedMotion:'reduce'});await openNavigation(page)
 assert.equal(await page.locator('#sidebar').evaluate(e=>getComputedStyle(e).transitionDuration),'0s')
 await page.locator('#close-menu').click();await page.emulateMedia({reducedMotion:'no-preference'})
 await clickNavigation(page,'#tab-discussion')
 assert.equal(await page.locator('#menu-toggle').getAttribute('aria-expanded'),'false')
 await page.screenshot({path:'visual-check/sidebar-mobile-discussion.png',fullPage:true,animations:'disabled'})
}
