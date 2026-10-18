// Test d'integration local : donnees construites par l'interface V5 -> service de simulation.
// Aucun navigateur public, aucune cle API, aucun appel vers Luna.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runInNewContext } from 'node:vm'
import { createServer } from './server.mjs'

const html = readFileSync(fileURLToPath(new URL('../index.html', import.meta.url)), 'utf8')
const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1]
assert.ok(script, 'Script de l avatar introuvable')

function frontendPayload(type, personnelCategory) {
  // Reutiliser les fonctions de production sans executer les interactions DOM.
  const names = ['clean', 'pathwayPayload', 'searchDraft']
  const sources = names.map(name => {
    const match = script.match(new RegExp('function ' + name + '\\([^\\n]*?\\}(?=\\nfunction |\\nconst |\\nif\\(|$)', 'm'))
    assert.ok(match, 'Fonction manquante : ' + name)
    return match[0]
  })
  const context = {
    referenceFields: null,
    profiles: ['PAT', 'PE', 'PU Police', 'PU Prison', 'PJ'],
    categoryCodes: ['PAT', 'PE', 'PU Police', 'PU Prison', 'PJ'],
    answers: {
      personnelCategory,
      role: 'Conseiller formation',
      objective: 'Developper les competences',
      existingSkills: 'Bases',
      timeAvailable: 'Deux jours',
      constraints: 'Aucune',
    },
  }
  // Les fonctions sont evaluees uniquement dans un contexte local sans reseau.
  return runInNewContext(sources.join('\n') +
    '\n({ profile: pathwayPayload(), query: searchDraft().query })', context)
}

test('V5 vers service local : recherche et parcours, sans API externe', async () => {
  const token = 'local-only-test-token-at-least-32-characters'
  const dir = mkdtempSync(join(tmpdir(), 'avatar-e2e-'))
  const { server, guard } = createServer({
    token, stateFile: join(dir, 'quotas.json'), enabled: () => true,
    maxDailyRequests: 5, maxTotalRequests: 5,
  })
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
    const endpoint = 'http://127.0.0.1:' + server.address().port + '/test/request'
    for (const [type, category] of [['search', 'PAT'], ['pathway', 'PU Prison']]) {
      const { profile, query } = frontendPayload(type, category)
      assert.equal(profile.personnelCategory, category)
      const body = type === 'search' ? { type, profile, query } : { type, profile }
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify(body),
      })
      assert.equal(response.status, 200)
      const result = await response.json()
      assert.equal(result.mode, 'simulation')
      assert.equal(result.ok, true)
    }
    assert.equal(guard.status().total, 2)
    assert.equal((await fetch(endpoint, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'pathway', profile: frontendPayload('pathway', 'PE').profile }),
    })).status, 401)
    assert.equal(guard.status().total, 2)
  } finally {
    await new Promise(resolve => server.close(resolve))
    rmSync(dir, { recursive: true, force: true })
  }
})
