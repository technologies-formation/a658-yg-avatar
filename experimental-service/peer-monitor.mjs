const DEFAULT_INTERVAL_MS = 300_000
const DEFAULT_FAILURE_THRESHOLD = 3

export function createPeerMonitor({
  peerName,
  probe,
  notify,
  intervalMs = DEFAULT_INTERVAL_MS,
  failureThreshold = DEFAULT_FAILURE_THRESHOLD,
  now = () => new Date(),
  setIntervalImpl = setInterval,
  clearIntervalImpl = clearInterval,
  onStatus = () => {},
} = {}) {
  if (typeof peerName !== 'string' || !peerName.trim() || typeof probe !== 'function' ||
      typeof notify !== 'function' || !Number.isInteger(intervalMs) || intervalMs < 60_000 ||
      !Number.isInteger(failureThreshold) || failureThreshold < 1 || typeof now !== 'function') {
    throw new Error('Configuration de surveillance croisee invalide')
  }

  let timer = null
  let busy = false
  let stopped = false
  let failures = 0
  let alertedAt = null

  async function tick() {
    if (stopped || busy) return { checked: false }
    busy = true
    try {
      let healthy = false
      try {
        await probe()
        healthy = true
      } catch {
        healthy = false
      }
      if (healthy) {
        failures = 0
        if (!alertedAt) return { checked: true, healthy: true }
        await notify({ type: 'recovery', peerName, detectedAt: alertedAt, occurredAt: now() })
        alertedAt = null
        onStatus({ event: 'peer-recovered', peerName })
        return { checked: true, healthy: true, notified: 'recovery' }
      }
      failures += 1
      if (!alertedAt && failures >= failureThreshold) {
        const occurredAt = now()
        await notify({ type: 'alert', peerName, occurredAt, failures })
        alertedAt = occurredAt
        onStatus({ event: 'peer-unavailable', peerName, failures })
        return { checked: true, healthy: false, notified: 'alert', failures }
      }
      return { checked: true, healthy: false, failures }
    } finally {
      busy = false
    }
  }

  return {
    tick,
    start() {
      if (timer || stopped) return
      timer = setIntervalImpl(() => {
        tick().catch(() => onStatus({ event: 'peer-monitor-error', peerName }))
      }, intervalMs)
      timer.unref?.()
    },
    stop() {
      stopped = true
      if (timer) clearIntervalImpl(timer)
      timer = null
    },
    status() {
      return Object.freeze({ failures, alertActive: Boolean(alertedAt), running: Boolean(timer) })
    },
  }
}
