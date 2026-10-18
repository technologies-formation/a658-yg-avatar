// Essai Chromium avec TLS local réel et comptes synthétiques ; aucun hébergement distant.
import assert from 'node:assert/strict'
import https from 'node:https'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { createPilotCredential } from './pilot-auth.mjs'
import { createPilotPrivateHandler } from './pilot-private.mjs'
import { references } from './reference-test-fixtures.mjs'
import { checkPrivatePageBrowser } from './private-page-browser-check.mjs'

export async function checkPilotBrowser(browser, output) {
  const dir = mkdtempSync(join(tmpdir(), 'avatar-pilot-tls-'))
  const contexts = []; let server, gateway, referencesRead = 0, builds = 0
  const external = [], errors = []
  try {
    execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1',
      '-subj', '/CN=127.0.0.1', '-addext', 'subjectAltName=IP:127.0.0.1',
      '-keyout', join(dir, 'key.pem'), '-out', join(dir, 'cert.pem')], { stdio: 'ignore' })
    server = https.createServer({ key: readFileSync(join(dir, 'key.pem')), cert: readFileSync(join(dir, 'cert.pem')) },
      (req, res) => {
        // Page de test vide, sans profil ni secret ; toutes les données restent protégées par la passerelle.
        if (req.url === '/browser-probe') {
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': "default-src 'self'" })
          res.end('<!doctype html><title>Essai HTTPS local</title>'); return
        }
        return gateway.handler(req, res)
      })
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
    const origin = 'https://127.0.0.1:' + server.address().port, contract = references()
    const username = 'browser-test', password = randomBytes(24).toString('hex')
    const user = await createPilotCredential({ id: 'browser-tester', username, password })
    gateway = createPilotPrivateHandler({ enabled: true, publicOrigin: origin, users: [user], maxAttempts: 20, windowMs: 60000,
      isSecureRequest: req => req.socket.encrypted === true, session: {
        async getReferences() { referencesRead++; return contract },
        async buildPathway() { builds++; return { mode: 'historical-pathway', result: { ok: true, summary: 'Simulation HTTPS', recommendedSteps: [] } } },
        stop() {},
      },
    })
    const context = async options => {
      const value = await browser.newContext({ ignoreHTTPSErrors: true, ...options })
      contexts.push(value)
      // Le certificat auto-signé est accepté exclusivement dans ce contexte de test local.
      await value.route('**/*', route => {
        if (new URL(route.request().url()).origin === origin) return route.continue()
        external.push(route.request().url()); return route.abort()
      })
      return value
    }
    const anonymous = await context()
    const denied = await anonymous.request.get(origin + '/private/profile-references')
    assert.equal(denied.status(), 401)
    assert.match(denied.headers()['www-authenticate'], /^Basic /)
    assert.equal(referencesRead, 0)
    const authenticated = await context({ httpCredentials: { username, password, origin } })
    const page = await authenticated.newPage()
    page.on('pageerror', error => errors.push(error.message))
    const response = await page.goto(origin + '/private/profile-references')
    assert.equal(response.status(), 200)
    const ticket = await response.json()
    await page.goto(origin + '/browser-probe')
    const body = { confirmed: true, requestId: ticket.requestId, referenceRevision: contract.revision,
      profile: { role: 'x', objective: 'y' } }
    const status = await page.evaluate(async body => (await fetch('/private/pathway', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    })).status, body)
    assert.equal(status, 200); assert.equal(builds, 1)
    const duplicate = await page.evaluate(async body => (await fetch('/private/pathway', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    })).status, body)
    assert.equal(duplicate, 409); assert.equal(builds, 1)
    gateway.revoke('browser-tester')
    assert.equal((await authenticated.request.get(origin + '/private/profile-references')).status(), 401)
    gateway.stop()
    assert.equal((await authenticated.request.get(origin + '/private/profile-references')).status(), 503)
    assert.equal(errors.length, 0); assert.equal(external.length, 0)
    for (const value of contexts) await value.close()
    contexts.length = 0
    await new Promise(resolve => { server.closeAllConnections(); server.close(resolve) })
    server = null
    const privatePage = await checkPrivatePageBrowser(browser, {
      tls: { key: readFileSync(join(dir, 'key.pem')), cert: readFileSync(join(dir, 'cert.pem')) },
      user, password, origin, dir, output,
    })
    return { tls: true, anonymous: 401, authenticated: 200, duplicate: 409, revoked: 401, stopped: 503,
      simulatedBuilds: builds, browserErrors: errors, externalRequests: external, privatePage }
  } finally {
    gateway?.stop()
    for (const context of contexts) await context.close()
    if (server) await new Promise(resolve => { server.closeAllConnections(); server.close(resolve) })
    rmSync(dir, { recursive: true, force: true })
  }
}
