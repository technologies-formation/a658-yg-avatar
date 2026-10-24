// Ressources privées communes ; aucune écoute ni requête implicite.
import { readFileSync } from 'node:fs'

const modules = new Map([
  ['/private/messaging-client.mjs', new URL('./messaging-client.mjs', import.meta.url)],
  ['/private/messaging-state.mjs', new URL('./messaging-state.mjs', import.meta.url)],
  ['/private/pathway-result-view.mjs', new URL('./pathway-result-view.mjs', import.meta.url)],
  ['/private/pathway-result.mjs', new URL('./pathway-result.mjs', import.meta.url)],
])
const csp = "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'"

export function createPrivateResources(session, renderPage, timeoutMs) {
  return async (req, res, { signal }) => {
    if (req.method !== 'GET') return false
    if (req.url !== '/' && req.url !== '/private/' && !modules.has(req.url)) return false
    let body, type
    if (modules.has(req.url)) { body = readFileSync(modules.get(req.url), 'utf8'); type = 'text/javascript' }
    else { body = renderPage(await session.getReferences({ signal }), { timeoutMs }); type = 'text/html' }
    if (signal.aborted) return true
    res.writeHead(200, { 'Content-Type': type + '; charset=utf-8', 'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': csp, 'Referrer-Policy': 'no-referrer' })
    res.end(body)
    return true
  }
}
