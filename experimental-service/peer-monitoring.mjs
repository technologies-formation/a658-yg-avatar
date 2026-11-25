import { fetchCatalogueStatus } from './catalogue-status.mjs'
import { createPeerMonitor } from './peer-monitor.mjs'

export function buildPeerMonitoringMessage({ type, peerName, occurredAt, detectedAt }) {
  const restored = type === 'recovery'
  const subject = restored
    ? `[A658-YG] ${peerName} de nouveau disponible`
    : `[A658-YG] ALERTE : ${peerName} indisponible`
  const lines = restored
    ? [
        `${peerName} répond de nouveau au contrôle de disponibilité.`,
        `Rétablissement constaté : ${occurredAt.toISOString()}`,
        `Alerte initiale : ${detectedAt.toISOString()}`,
      ]
    : [
        `${peerName} ne répond plus correctement après trois contrôles consécutifs.`,
        `Alerte constatée : ${occurredAt.toISOString()}`,
        'Action : vérifier le service et solliciter une investigation si nécessaire.',
      ]
  const text = lines.join('\n')
  return { subject, text, html: `<p>${lines.join('</p><p>')}</p>` }
}

export function createAssistantPeerMonitoring({
  enabled,
  mail,
  recipient,
  fetchImpl = globalThis.fetch,
  createMonitor = createPeerMonitor,
  onStatus = (value) => console.log(JSON.stringify(value)),
} = {}) {
  if (!enabled) return null
  if (typeof mail?.sendReport !== 'function' || typeof recipient !== 'string') {
    throw new Error('Courriel de surveillance indisponible')
  }
  return createMonitor({
    peerName: 'Catalogue A658-YG',
    probe: () => fetchCatalogueStatus({ fetchImpl }),
    async notify(event) {
      const result = await mail.sendReport({ recipient, ...buildPeerMonitoringMessage(event) })
      if (result?.accepted !== true) throw new Error('Alerte non confirmee')
    },
    onStatus,
  })
}
