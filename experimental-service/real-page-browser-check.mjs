// Le mode réel est exercé avec un transport moteur fictif : aucun appel distant.
import assert from 'node:assert/strict'
import { join } from 'node:path'
import { createPilotRealServer } from './pilot-real-server.mjs'
import { references, referenceResponse } from './reference-test-fixtures.mjs'
import { data } from './result-test-fixtures.mjs'

export async function checkRealPageBrowser(browser, { tls, user, password, origin, dir, output }) {
  let posts = 0
  const service = createPilotRealServer({ enabled: true, publicOrigin: origin, tls, users: [user], maxAttempts: 100, windowMs: 60000,
    stateFile: join(dir, 'browser-real-quotas.json'), reportFile: join(dir, 'browser-real-report.json'), singleInstance: true,
    fetchImpl: async (_url, init) => {
      if (init.method === 'GET') return referenceResponse(references())
      posts++; return Response.json(data())
    },
  })
  let context
  try {
    await new Promise(resolve => service.server.listen(Number(new URL(origin).port), '127.0.0.1', resolve))
    context = await browser.newContext({ viewport: { width: 1280, height: 900 }, ignoreHTTPSErrors: true,
      httpCredentials: { username: user.username, password, origin } })
    const errors = [], external = [], measurements = []
    await context.route('**/*', route => {
      if (new URL(route.request().url()).origin === origin) return route.continue()
      external.push(route.request().url()); return route.abort()
    })
    const page = await context.newPage()
    page.on('pageerror', error => errors.push(error.message))
    const submit = async value => { await page.locator('#input').fill(value); await page.locator('#form button[type=submit]').click() }
    const capture = async name => {
      measurements.push(await page.evaluate(() => ({ width: innerWidth, horizontalOverflow: document.documentElement.scrollWidth > innerWidth })))
      await page.screenshot({ path: join(output, name + '.png'), fullPage: true })
    }
    assert.equal((await page.goto(origin + '/private/')).status(), 200)
    assert.match(await page.title(), /parcours réel privé/)
    await page.getByRole('button', { name: 'Groupe de test A', exact: true }).click()
    await submit(''); await submit('')
    await page.getByRole('button', { name: 'Construire un parcours', exact: true }).click()
    await submit('Fonction fictive'); await submit('Objectif fictif'); await submit(''); await submit(''); await submit('')
    assert.equal(posts, 0)
    await capture('real-offline-desktop-confirmation')
    await page.getByRole('button', { name: 'Confirmer le profil et générer', exact: true }).click()
    await page.locator('.pathway-result').waitFor()
    assert.equal(posts, 1); assert.equal(service.status().total, 1)
    assert.match(await page.locator('.msg.simulation').innerText(), /Parcours réel reçu.*1\/1/)
    assert.match(await page.locator('.pathway-result').innerText(), /Consommation renvoyée par le moteur/)
    assert.doesNotMatch(await page.locator('.pathway-result').innerText(), /elles ne répondent pas à ton profil/)
    await page.locator('.pathway-result').evaluate(element => element.scrollIntoView({ block: 'start' }))
    await capture('real-offline-desktop-result')
    await page.setViewportSize({ width: 390, height: 844 })
    await page.locator('#details').evaluate(element => { element.open = false })
    await capture('real-offline-mobile-result')
    await page.reload()
    assert.equal(await page.locator('#sum-role').innerText(), 'Fonction fictive')
    assert.equal(await page.locator('.pathway-result').count(), 0); assert.equal(posts, 1)
    await page.getByRole('button', { name: 'Confirmer le profil et générer', exact: true }).click()
    await page.locator('.msg.simulation').waitFor()
    assert.match(await page.locator('.msg.simulation').innerText(), /Tentative réelle déjà utilisée/)
    assert.equal(posts, 1); assert.equal(service.status().total, 1)
    await capture('real-offline-mobile-quota')
    assert.deepEqual(errors, []); assert.deepEqual(external, [])
    for (const measurement of measurements) assert.equal(measurement.horizontalOverflow, false)
    return { transport: 'injected-only', posts, total: service.status().total, restoredDraft: true, quotaRefused: true,
      browserErrors: errors, externalRequests: external, measurements }
  } finally {
    if (context) await context.close()
    service.stop()
    await new Promise(resolve => { service.server.closeAllConnections(); service.server.close(resolve) })
  }
}
