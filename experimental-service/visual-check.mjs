// Test navigateur facultatif en CI : simulation seule, toute destination distante est bloquée.
import assert from 'node:assert/strict'
import { writeFileSync, mkdirSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createLocalDemo } from './local-demo.mjs'
import { validateProfileReferences, normalizePathwayProfile } from './profile-references.mjs'
if (!process.env.AVATAR_PLAYWRIGHT_MODULE || !process.env.AVATAR_CATALOGUE_MODULE) throw Error('Modules de test explicites requis')
const playwright = await import(pathToFileURL(resolve(process.env.AVATAR_PLAYWRIGHT_MODULE)).href)
const { chromium } = playwright.default ?? playwright
const { buildProfileReferences } = await import(pathToFileURL(resolve(process.env.AVATAR_CATALOGUE_MODULE)).href)
const output = resolve(process.env.AVATAR_VISUAL_OUTPUT || 'visual-check')
mkdirSync(output, { recursive: true })
const references = validateProfileReferences(buildProfileReferences())
const { server, origin, guard } = createLocalDemo({ port: 8799, stateFile: '', profileReferences: references })
await new Promise(resolve => server.listen(8799, '127.0.0.1', resolve))
let browser
try {
 browser = await chromium.launch({ headless: true })
 const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
 const errors = [], requests = [], external = [], measurements = []
 page.on('pageerror', error => errors.push(error.message))
 page.on('request', request => {
  if (!request.url().startsWith(origin)) external.push(request.url())
  if (request.url().endsWith('/local/validate')) requests.push(request.postDataJSON())
 })
 const submit = async value => { await page.locator('#input').fill(value); await page.locator('#form button[type=submit]').click() }
 const complete = async () => {
  await page.getByRole('button', { name: references.pathway.fields.personnelCategory.options[0].label, exact: true }).click()
  await submit('Service de test libre'); await submit('')
  await page.getByRole('button', { name: 'Construire un parcours', exact: true }).click()
  await submit('Collaborateur administratif'); await submit('Organiser et suivre des projets')
  await submit(''); await submit(''); await submit('')
  await page.locator('.simulation').waitFor()
  assert.match(await page.locator('.simulation').innerText(), /Requete validee/)
 }
 await page.route('**/*', route => route.request().url().startsWith(origin + '/') ? route.continue() : route.abort())
 await page.goto(origin)
 await page.screenshot({ path: join(output, 'avatar-desktop-start.png'), fullPage: true })
 await complete()
 normalizePathwayProfile(requests[0].profile, references)
 assert.equal(requests.length, 1)
 await page.getByRole('button', { name: 'Modifier : Entité ou service', exact: true }).click()
 await submit('Autre service libre')
 assert.equal(requests.length, 1)
 assert.equal(await page.locator('.simulation').count(), 0)
 await page.getByRole('button', { name: 'Actualiser la simulation', exact: true }).click()
 await page.locator('.simulation').waitFor()
 assert.equal(requests[1].profile.entity, 'Autre service libre')
 assert.equal(guard.status().total, 2)
 measurements.push(await page.evaluate(() => ({ width: innerWidth, horizontalOverflow: document.documentElement.scrollWidth > innerWidth, entry: document.querySelector('#form').getBoundingClientRect().toJSON() })))
 await page.screenshot({ path: join(output, 'avatar-desktop-completed.png'), fullPage: true })
 await page.setViewportSize({ width: 390, height: 844 })
 await page.reload()
 await page.screenshot({ path: join(output, 'avatar-mobile-start.png'), fullPage: true })
 await complete()
 await page.locator('#details > summary').click()
 measurements.push(await page.evaluate(() => ({ width: innerWidth, horizontalOverflow: document.documentElement.scrollWidth > innerWidth, entry: document.querySelector('#form').getBoundingClientRect().toJSON() })))
 await page.screenshot({ path: join(output, 'avatar-mobile-completed.png'), fullPage: true })
 assert.equal(errors.length, 0, JSON.stringify(errors))
 assert.equal(external.length, 0, JSON.stringify(external))
 for (const measurement of measurements) assert.equal(measurement.horizontalOverflow, false)
 const result = { chromium: await browser.version(), revision: references.revision, browserErrors: errors, externalRequests: external,
  simulationRequests: requests.length, quota: guard.status().total, measurements }
 writeFileSync(join(output, 'avatar-visual-check.json'), JSON.stringify(result, null, 2))
 console.log(JSON.stringify(result))
} finally { if (browser) await browser.close(); await new Promise(resolve => server.close(resolve)) }
