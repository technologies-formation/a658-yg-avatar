// Diagnostic sans comptes, quotas ni simulateur : uniquement une preuve HTTPS.
import http from 'node:http'
import { pathToFileURL } from 'node:url'
import { createProxyAttestation } from './proxy-attestation.mjs'
export function createAttestationProbe({ publicOrigin, requestProbe, log = console.log } = {}) {
  const attestation = createProxyAttestation({ publicOrigin, requestProbe })
  const server = http.createServer((req, res) => {
    if (attestation.handleProof(req, res)) return
    const run = async () => {
      const verified = req.method === 'GET' && req.url === '/proxy-attestation-check' && await attestation.ensure(req)
      res.writeHead(verified ? 200 : 503, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store',
        'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'", 'Referrer-Policy': 'no-referrer' })
      res.end(verified ? 'Vérification HTTPS du proxy réussie. Aucun accès privé activé.' : 'Diagnostic en attente de vérification HTTPS. Aucun identifiant demandé.')
      if (req.method === 'GET' && req.url === '/proxy-attestation-check') log(verified ? 'Contrôle HTTPS automatique réussi.' : 'Contrôle HTTPS automatique non abouti ; aucun accès privé activé.')
    }
    run().catch(() => { if (!res.headersSent) res.writeHead(503, { 'Cache-Control': 'no-store' }); res.end() })
  })
  server.requestTimeout = 15000; server.headersTimeout = 10000
  server.setTimeout(15000, socket => socket.destroy())
  server.on('close', () => attestation.stop())
  return { server, verify: attestation.refresh }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { server, verify } = createAttestationProbe({ publicOrigin: 'https://avatar.a658yg-catalogue.ch' })
  for (const event of ['SIGINT', 'SIGTERM']) process.once(event, () => { server.close(); server.closeAllConnections() })
  server.listen(3000, '0.0.0.0', async () => {
    console.log('Diagnostic HTTPS automatique démarré. Aucun accès privé activé.')
    console.log(await verify() ? 'Passage HTTPS vérifié.' : 'Passage HTTPS non vérifié ; accès privé toujours désactivé.')
  })
}
