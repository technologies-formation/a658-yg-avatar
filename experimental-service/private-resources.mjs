// Ressources privées communes ; aucune écoute ni requête implicite.
import { readFileSync } from 'node:fs'

const modules = new Map([
  ['/private/pathway-ticket.mjs', new URL('./pathway-ticket.mjs', import.meta.url)],
  ['/private/guided-questions.mjs', new URL('./guided-questions.mjs', import.meta.url)],
  ['/private/private-response.mjs', new URL('./private-response.mjs', import.meta.url)],
  ['/private/catalogue-version.mjs', new URL('./catalogue-version.mjs', import.meta.url)],
  ['/private/device-memory-client.mjs', new URL('./device-memory-client.mjs', import.meta.url)],
  ['/private/research-email-client.mjs', new URL('./research-email-client.mjs', import.meta.url)],
  ['/private/pathway-pdf.mjs', new URL('./pathway-pdf.mjs', import.meta.url)],
  ['/private/vendor/jspdf.umd.min.js', new URL('./vendor/jspdf.umd.min.js', import.meta.url)],
  ['/private/assistant-presentation.mjs', new URL('./assistant-presentation.mjs', import.meta.url)],
  ['/private/messaging-navigation.mjs', new URL('./messaging-navigation.mjs', import.meta.url)],
  ['/private/research-tabs.mjs', new URL('./research-tabs.mjs', import.meta.url)],
  ['/private/messaging-client.mjs', new URL('./messaging-client.mjs', import.meta.url)],
  ['/private/messaging-state.mjs', new URL('./messaging-state.mjs', import.meta.url)],
  ['/private/pathway-result-view.mjs', new URL('./pathway-result-view.mjs', import.meta.url)],
  ['/private/pathway-result.mjs', new URL('./pathway-result.mjs', import.meta.url)],
])
const binaries = new Map([
  ['/private/assistant-robot.webp', [new URL('./assistant-robot.webp', import.meta.url),'image/webp']],
  ['/private/pdf-font-regular.ttf', [new URL('./vendor/DejaVuSans.ttf', import.meta.url),'font/ttf']],
  ['/private/pdf-font-bold.ttf', [new URL('./vendor/DejaVuSans-Bold.ttf', import.meta.url),'font/ttf']],
])
const csp = "default-src 'self'; img-src 'self' data:; script-src 'self' 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'"

export function createPrivateResources(session, renderPage, timeoutMs) {
  return async (req, res, { signal }) => {
    if (req.method !== 'GET') return false
    if (req.url !== '/' && req.url !== '/private/' && !modules.has(req.url) && !binaries.has(req.url)) return false
    let body, type
    if (binaries.has(req.url)) { const [file,mime]=binaries.get(req.url);body = readFileSync(file); type = mime }
    else if (modules.has(req.url)) { body = readFileSync(modules.get(req.url), 'utf8'); type = 'text/javascript' }
    else { body = renderPage(await session.getReferences({ signal }), { timeoutMs }); type = 'text/html' }
    if (signal.aborted) return true
    res.writeHead(200, { 'Content-Type': type + (binaries.has(req.url) ? '' : '; charset=utf-8'), 'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': csp, 'Referrer-Policy': 'no-referrer' })
    res.end(body)
    return true
  }
}
