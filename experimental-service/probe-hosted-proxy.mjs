// Diagnostic temporaire sans identifiant, profil ni contenu utilisateur.
// Ne journalise ni URL, ni cookie, ni Authorization, ni X-Forwarded-For.
import http from 'node:http'
import { pathToFileURL } from 'node:url'
export function createProxyProbe(log = console.log) {
  const safe = value => typeof value === 'string' && /^[a-zA-Z0-9.:,_ -]{1,160}$/.test(value) ? value : '(absent ou invalide)'
  const server = http.createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/proxy-check') log(JSON.stringify({
      peer: safe(req.socket.remoteAddress), host: safe(req.headers.host), proto: safe(req.headers['x-forwarded-proto']),
    }))
    res.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store',
      'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'" })
    res.end('Préparation du pilote privé. Aucun identifiant demandé.')
  })
  server.requestTimeout = 10000; server.headersTimeout = 5000
  return server
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const server = createProxyProbe()
  for (const event of ['SIGINT', 'SIGTERM']) process.once(event, () => { server.close(); server.closeAllConnections() })
  server.listen(3000, '0.0.0.0', () => console.log('Diagnostic proxy seul sur 3000 ; aucune authentification active.'))
}
