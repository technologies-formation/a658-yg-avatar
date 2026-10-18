import assert from 'node:assert/strict'
import { join } from 'node:path'
import { createPilotSimulationServer } from './pilot-server.mjs'
import { references } from './reference-test-fixtures.mjs'
import { data } from './result-test-fixtures.mjs'

export async function checkPrivatePageBrowser(browser, { tls, user, password, origin, dir, output }) {
  let current = references()
  const service = createPilotSimulationServer({ enabled: true, publicOrigin: origin, tls, users: [user], maxAttempts: 100, windowMs: 60000,
    stateFile: join(dir, 'page-quotas.json'), maxDailyRequests: 3, maxTotalRequests: 3, singleInstance: true,
    loadProfileReferences: () => current, preview: data(),
  })
  let context
  try {
    await new Promise(resolve => service.server.listen(Number(new URL(origin).port), '127.0.0.1', resolve))
    context = await browser.newContext({ viewport: { width: 1280, height: 900 }, ignoreHTTPSErrors: true,
      httpCredentials: { username: user.username, password, origin } })
    const external = [], errors = [], requests = [], measurements = []
    await context.route('**/*', route => {
      if (new URL(route.request().url()).origin === origin) return route.continue()
      external.push(route.request().url()); return route.abort()
    })
    const page = await context.newPage()
    page.on('pageerror', error => errors.push(error.message))
    page.on('request', request => { if (request.method() === 'POST') requests.push(request.postDataJSON()) })
    const submit = async value => { await page.locator('#input').fill(value); await page.locator('#form button[type=submit]').click() }
    const confirm = async () => {
      await page.getByRole('button', { name: 'Confirmer le profil et simuler', exact: true }).click()
      await page.locator('.msg.simulation').waitFor()
    }
    const capture = async name => {
      measurements.push(await page.evaluate(() => ({ width: innerWidth, horizontalOverflow: document.documentElement.scrollWidth > innerWidth })))
      await page.screenshot({ path: join(output, name + '.png'), fullPage: true })
    }
    assert.equal((await page.goto(origin + '/private/')).status(), 200)
    assert.match(await page.title(), /simulation privée/)
    await capture('private-desktop-start')
    await page.getByRole('button', { name: 'Groupe de test A', exact: true }).click()
    await submit('Service libre'); await submit('')
    assert.equal(await page.getByRole('button', { name: 'Trouver une formation', exact: true }).count(), 0)
    await page.getByRole('button', { name: 'Construire un parcours', exact: true }).click()
    await submit('x'); await submit('y'); await submit(''); await submit(''); await submit('')
    assert.equal(requests.length, 0); assert.equal(service.status().total, 0)
    await confirm()
    assert.equal(requests.length, 1); assert.equal(service.status().total, 1)
    assert.match(await page.locator('.pathway-result').innerText(), /elles ne répondent pas à ton profil/)
    await page.locator('.pathway-result').evaluate(element => element.scrollIntoView({ block: 'start' }))
    await capture('private-desktop-result')
    await page.getByRole('button', { name: 'Modifier : Métier ou fonction', exact: true }).click()
    await submit('Nouvelle fonction')
    assert.equal(await page.locator('.pathway-result').count(), 0)
    assert.equal(requests.length, 1)
    await page.reload()
    assert.equal(await page.locator('#sum-role').innerText(), 'Nouvelle fonction')
    assert.equal(requests.length, 1)
    await confirm(); assert.equal(service.status().total, 2)
    current = references(value => { value.pathway.fields.personnelCategory.options[0].label = 'Groupe de test A renommé' })
    await page.getByRole('button', { name: 'Actualiser les choix', exact: true }).click()
    await page.getByRole('status').filter({ hasText: 'Choix actualisés.' }).waitFor()
    assert.equal(await page.locator('#sum-profile').innerText(), 'Groupe de test A renommé')
    assert.equal(await page.locator('.pathway-result').count(), 0)
    assert.equal(requests.length, 2)
    await page.setViewportSize({ width: 390, height: 844 })
    await capture('private-mobile-confirmation')
    await confirm(); assert.equal(service.status().total, 3)
    await page.locator('.pathway-result').evaluate(element => element.scrollIntoView({ block: 'start' }))
    await capture('private-mobile-result')
    await page.getByRole('button', { name: 'Revoir le profil', exact: true }).click()
    await confirm()
    assert.match(await page.locator('.msg.simulation').innerText(), /Plafond de simulation atteint/)
    assert.equal(await page.locator('.pathway-result').count(), 0)
    assert.equal(service.status().total, 3); assert.equal(requests.length, 4)
    assert.equal(await page.getByRole('button', { name: 'Confirmer le profil et simuler', exact: true }).count(), 1)
    await capture('private-mobile-quota')
    const count = requests.length
    await page.reload()
    assert.equal(requests.length, count); assert.equal(service.status().total, 3)
    assert.equal(await page.locator('.pathway-result').count(), 0)
    for (const measurement of measurements) assert.equal(measurement.horizontalOverflow, false)
    assert.deepEqual(errors, []); assert.deepEqual(external, [])
    return { simulationRequests: requests.length, accepted: service.status().total, quotaRefused: 1,
      restoredDraft: true, refreshedChoices: true, browserErrors: errors, externalRequests: external, measurements }
  } finally {
    if (context) await context.close()
    service.stop()
    await new Promise(resolve => { service.server.closeAllConnections(); service.server.close(resolve) })
  }
}
