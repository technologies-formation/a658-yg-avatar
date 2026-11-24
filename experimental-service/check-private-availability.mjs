// Contrôle externe gratuit : distinguer l'application privée de la page de maintenance HTTP 200.
import { pathToFileURL } from 'node:url'
import { HOSTED_ORIGIN } from './hosted-transport.mjs'

export async function checkPrivateAvailability({ fetchImpl = globalThis.fetch,
  url = HOSTED_ORIGIN + '/private/' } = {}) {
  if (typeof fetchImpl !== 'function' || typeof url !== 'string' || !url.startsWith('https://')) throw Error('Contrôle de disponibilité invalide')
  const response = await fetchImpl(url, { method: 'GET', redirect: 'error', credentials: 'omit',
    headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(10000) })
  const challenge = response.headers.get('www-authenticate') ?? ''
  const transport = response.headers.get('strict-transport-security') ?? ''
  const type = response.headers.get('content-type') ?? ''
  try { await response.body?.cancel() } catch {}
  if (response.status !== 401 || challenge !== 'Basic realm="A658-YG pilote prive", charset="UTF-8"' ||
      !transport.startsWith('max-age=') || !type.startsWith('application/json')) {
    throw Error(`Assistant privé indisponible (status=${response.status}; challenge=${challenge ? 'present' : 'absent'}; hsts=${transport ? 'present' : 'absent'}; type=${type || 'absent'})`)
  }
  return Object.freeze({ ok: true, status: 401, authentication: 'basic', transport: 'https' })
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const result = await checkPrivateAvailability()
    console.log(`Assistant privé disponible : HTTP ${result.status}, authentification attendue.`)
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Assistant privé indisponible')
    process.exitCode = 1
  }
}
