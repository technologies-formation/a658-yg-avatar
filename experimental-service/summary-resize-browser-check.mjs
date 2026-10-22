// Régression de mise en page : données fictives, aucun serveur ni appel moteur.
import assert from 'node:assert/strict'
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { renderPrivatePage } from './private-page.mjs'
import { references } from './reference-test-fixtures.mjs'

if (!process.env.AVATAR_PLAYWRIGHT_MODULE) throw Error('Module Playwright explicite requis')
const { chromium } = await import(pathToFileURL(resolve(process.env.AVATAR_PLAYWRIGHT_MODULE)).href)
const output = resolve(process.env.AVATAR_VISUAL_OUTPUT || 'visual-check')
mkdirSync(output, { recursive: true })
const browser = await chromium.launch({ headless: true })
const measurements = []
try {
  for (const [name, html] of [['private', renderPrivatePage(references())],
    ['public', readFileSync(new URL('../index.html', import.meta.url), 'utf8')]]) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
    try {
      const errors = [], requests = []
      const origin = 'https://avatar-layout.invalid'
      await context.route('**/*', route => {
        if (route.request().url() === origin + '/' && route.request().method() === 'GET') return route.fulfill({ contentType: 'text/html', body: html })
        requests.push(route.request().url()); return route.abort()
      })
      const page = await context.newPage()
      page.on('pageerror', error => errors.push(error.message))
      await page.goto(origin)
      assert.equal(await page.locator('#details').getAttribute('open'), null)
      if (name === 'private') {
        const submit = async value => { await page.locator('#input').fill(value); await page.locator('#form button[type=submit]').click() }
        await page.getByRole('button', { name: 'Groupe de test A', exact: true }).click()
        await submit('Service fictif'); await submit('')
        await page.getByRole('button', { name: 'Construire un parcours', exact: true }).click()
        await submit('Collaborateur fictif'); await submit('Organiser les tâches de test')
        await submit(''); await submit('3 jours'); await submit('Présentiel')
        assert.equal(await page.getByRole('button', { name: 'Confirmer le profil et simuler', exact: true }).count(), 1)
      } else {
        await page.locator('.choices button').first().click()
        await page.getByRole('button', { name: 'Construire un parcours', exact: true }).click()
        await page.locator('#input').fill('Saisie en cours conservée')
      }
      const before = await page.locator('.facts').textContent()
      await page.setViewportSize({ width: 1280, height: 900 })
      // Capture également produite avant l'assertion sur l'ancienne version.
      await page.screenshot({ path: join(output, name + '-resize-desktop.png'), fullPage: true })
      await page.waitForFunction(() => document.getElementById('details').open, null, { timeout: 5000 })
      assert.equal(await page.locator('#sum-profile').isVisible(), true)
      assert.equal(await page.locator('.facts').textContent(), before)
      if (name === 'public') assert.equal(await page.locator('#input').inputValue(), 'Saisie en cours conservée')
      if (name === 'private') assert.equal(await page.locator('#sum-role').innerText(), 'Collaborateur fictif')
      // Le volet reste repliable sur mobile et ne se referme pas à chaque saisie.
      await page.setViewportSize({ width: 750, height: 900 })
      await page.waitForFunction(() => !document.getElementById('details').open)
      await page.locator('#details > summary').click()
      assert.equal(await page.locator('#sum-profile').isVisible(), true)
      await page.screenshot({ path: join(output, name + '-resize-mobile-open.png'), fullPage: true })
      await page.locator('#details > summary').click()
      await page.setViewportSize({ width: 751, height: 900 })
      await page.waitForFunction(() => document.getElementById('details').open)
      assert.equal(await page.locator('#sum-profile').isVisible(), true)
      await page.setViewportSize({ width: 390, height: 844 })
      await page.waitForFunction(() => !document.getElementById('details').open)
      await page.screenshot({ path: join(output, name + '-resize-mobile-closed.png'), fullPage: true })
      await page.setViewportSize({ width: 1280, height: 900 })
      await page.waitForFunction(() => document.getElementById('details').open)
      if (name === 'private') {
        await page.reload()
        assert.equal(await page.locator('#sum-role').innerText(), 'Collaborateur fictif')
        assert.equal(await page.locator('.pathway-result').count(), 0)
      }
      assert.equal(await page.locator('#sum-profile').isVisible(), true)
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
      assert.deepEqual(requests, []); assert.deepEqual(errors, [])
      measurements.push({ name, desktopSummaryVisible: true, mobileToggleWorks: true, breakpoint: [750, 751], noExtraRequests: true })
    } finally { await context.close() }
  }
  const result = { chromium: await browser.version(), measurements }
  writeFileSync(join(output, 'summary-resize-check.json'), JSON.stringify(result, null, 2))
  console.log(JSON.stringify(result))
} finally { await browser.close() }
