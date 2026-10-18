// Assemblage inactif : aucun serveur démarré, fichier lu ou appel distant implicite.
import { createPilotAuthenticator } from './pilot-auth.mjs'
import { createPrivatePathwayHandler } from './private-pathway-handler.mjs'

export function createPilotPrivateHandler({ enabled = false, publicOrigin, session, users, maxAttempts, windowMs, isSecureRequest, now } = {}) {
  if (!enabled) return createPrivatePathwayHandler({ enabled })
  const access = createPilotAuthenticator({ enabled, users, maxAttempts, windowMs, isSecureRequest, now })
  const gateway = createPrivatePathwayHandler({ enabled, publicOrigin, session, authenticate: access.authenticate, now })
  let stopped = false
  return {
    handler: gateway.handler,
    revoke: access.revoke,
    stop() { if (stopped) return; stopped = true; access.stop(); gateway.stop() },
  }
}
