// La simulation n’importe ni l’adaptateur ni la session du moteur réel.
import { isAbsolute } from 'node:path'
import { randomBytes } from 'node:crypto'
import { createGuard } from './server.mjs'
import { validateProfileReferences, normalizePathwayProfile } from './profile-references.mjs'
import { validatePathwayResult } from './pathway-result.mjs'

export function createPilotSimulation({ stateFile, maxDailyRequests, maxTotalRequests, singleInstance = false,
  loadProfileReferences, preview, isEnabled = () => true } = {}) {
  if (typeof stateFile !== 'string' || !isAbsolute(stateFile) || singleInstance !== true ||
      !Number.isInteger(maxDailyRequests) || maxDailyRequests < 1 || !Number.isInteger(maxTotalRequests) || maxTotalRequests < 1 ||
      typeof loadProfileReferences !== 'function' || typeof isEnabled !== 'function') throw Error('Configuration explicite de simulation requise')
  const result = structuredClone(validatePathwayResult(preview).result)
  let stopped = false, current = null, busy = false
  const seen = new Set(), token = randomBytes(32).toString('hex')
  const error = (code, status) => Object.assign(Error('Simulation privée non aboutie'), { code, status })
  const allowed = () => { try { return !stopped && isEnabled() === true } catch { return false } }
  const check = () => { if (!allowed() || guard.status().stopped) throw error('disabled', 503) }
  const read = async () => {
    try { return validateProfileReferences(await loadProfileReferences()) }
    catch { throw error('references_unavailable', 503) }
  }
  const guard = createGuard({ token, stateFile, maxDailyRequests, maxTotalRequests, enabled: allowed, getProfileReferences: () => current })
  return {
    status: () => ({ ...guard.status(), busy, enabled: allowed() && !guard.status().stopped }),
    stop() { stopped = true; guard.stop() },
    async getReferences({ signal } = {}) {
      check()
      const references = await read()
      check()
      if (signal?.aborted) throw error('cancelled', 499)
      return references
    },
    async buildPathway(profile, { confirmed, referenceRevision, requestId, signal } = {}) {
      check()
      if (confirmed !== true) throw error('invalid_profile', 400)
      if (typeof requestId !== 'string' || !/^[a-zA-Z0-9_-]{16,128}$/.test(requestId)) throw error('invalid_profile', 400)
      if (seen.has(requestId)) throw error('duplicate_request', 409)
      if (busy) throw error('busy', 409)
      const snapshot = structuredClone(profile)
      busy = true
      try {
        current = await read()
        check()
        if (signal?.aborted) throw error('cancelled', 499)
        if (referenceRevision !== current.revision) throw error('references_changed', 409)
        let normalized
        try { normalized = normalizePathwayProfile(snapshot, current) } catch { throw error('invalid_profile', 400) }
        const reservation = guard.check(token, { type: 'pathway', profile: normalized })
        if (reservation.status !== 200) throw error(reservation.status === 429 ? 'quota_exceeded' : 'session_unavailable', reservation.status)
        seen.add(requestId)
        return { mode: 'simulation', preview: structuredClone(result), quota: guard.status() }
      } finally { busy = false }
    },
  }
}
