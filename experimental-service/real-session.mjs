// Raccordement commun : une tentative par défaut ; série de trois explicitement configurée.
import { writeFileSync } from 'node:fs'
import { createPathwaySession } from './pathway-session.mjs'
const backend = 'https://api.a658yg-catalogue.ch'
export function createRealSession({ stateFile, reportFile, singleInstance, fetchImpl = globalThis.fetch, maxRequests = 1, beforeReserve = null, unlimited = false }) {
  if(typeof unlimited!=='boolean'||![1,3].includes(maxRequests))throw Error('Plafond d’essai invalide')
  const session = createPathwaySession({ enabled: true, singleInstance, stateFile,
    endpoint: backend + '/api/pathway', referencesEndpoint: backend + '/api/profile-references',
    allowedOrigins: [backend], pathwayTimeoutMs: 200000, referenceTimeoutMs: 5000,
    maxDailyRequests: maxRequests, maxTotalRequests: maxRequests, unlimited, fetchImpl, beforeReserve,
  })
  const realSession = {
    status: session.status, getReferences: session.getReferences, stop: session.stop,
    async buildPathway(...args) {
      const value = await session.buildPathway(...args)
      const result = value.result
      const report = { completedAt: new Date().toISOString(), mode: 'real', quota: session.status(),
        usage: result.usage ?? null,
        courseCodes: Object.fromEntries(['recommendedSteps', 'optionalSteps', 'informationalCourses'].map(key =>
          [key, (result[key] ?? (key === 'recommendedSteps' ? result.steps : null) ?? []).map(item => item.course.code)])),
      }
      // La tentative est déjà réservée. Un échec de rapport n'entraîne jamais un nouvel appel.
      let reportSaved = false
      try { writeFileSync(maxRequests===1&&!unlimited?reportFile:reportFile.replace(/\.json$/, '-'+session.status().total+'.json'), JSON.stringify(report, null, 2), { flag: 'wx', mode: 0o600 }); reportSaved = true } catch {}
      return { mode: 'real', result, quota: session.status(), reportSaved }
    },
  }
  return realSession
}
