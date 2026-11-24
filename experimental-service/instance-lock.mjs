// Verrou d'instance récupérable après arrêt brutal, sans suppression aveugle.
import { randomUUID } from 'node:crypto'
import { hostname } from 'node:os'
import { isAbsolute, join } from 'node:path'
import { closeSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, readdirSync,
  renameSync, rmdirSync, unlinkSync, writeFileSync } from 'node:fs'

const OWNER_FILE = 'owner.json'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const keys = 'createdAt,host,pid,renewedAt,token,version'

export class InstanceLockError extends Error {
  constructor(reason, path, ageMs = null) {
    const age = Number.isSafeInteger(ageMs) && ageMs >= 0 ? `; age=${Math.floor(ageMs / 1000)}s` : ''
    super(`Verrou d'instance indisponible (${reason}; lock=${path}${age})`)
    this.name = 'InstanceLockError'
    this.code = 'instance_locked'
    this.reason = reason
    this.lockPath = path
    this.ageMs = ageMs
  }
}

const processAlive = pid => {
  try { process.kill(pid, 0); return true } catch (error) { return error?.code !== 'ESRCH' }
}
const parseOwner = (text, path, now) => {
  let value
  try { value = JSON.parse(text) } catch { throw new InstanceLockError('corrompu', path) }
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).sort().join(',') !== keys ||
      value.version !== 1 || !Number.isSafeInteger(value.pid) || value.pid < 1 ||
      typeof value.host !== 'string' || !value.host || value.host.length > 255 ||
      typeof value.token !== 'string' || !UUID.test(value.token) ||
      typeof value.createdAt !== 'string' || !Number.isFinite(Date.parse(value.createdAt)) ||
      typeof value.renewedAt !== 'string' || !Number.isFinite(Date.parse(value.renewedAt)) ||
      Date.parse(value.renewedAt) < Date.parse(value.createdAt)) throw new InstanceLockError('corrompu', path)
  return { value, ageMs: Math.max(0, now() - Date.parse(value.renewedAt)) }
}
const ownerText = owner => JSON.stringify(owner)

function readDirectoryOwner(path, now) {
  let info
  try { info = lstatSync(path) } catch (error) {
    if (error?.code === 'ENOENT') return null
    throw error
  }
  if (!info.isDirectory() || info.isSymbolicLink() || (info.mode & 0o077)) throw new InstanceLockError('type-ou-permissions', path)
  const names = readdirSync(path)
  if (names.length === 0) throw new InstanceLockError('ancien-sans-proprietaire', path, Math.max(0, now() - info.mtimeMs))
  if (names.length !== 1 || names[0] !== OWNER_FILE) throw new InstanceLockError('corrompu', path)
  const file = join(path, OWNER_FILE), owner = lstatSync(file)
  if (!owner.isFile() || owner.isSymbolicLink() || owner.size > 2048 || (owner.mode & 0o077)) throw new InstanceLockError('corrompu', path)
  return parseOwner(readFileSync(file, 'utf8'), path, now)
}

function writeOwner(path, owner, exclusive = false) {
  const file = join(path, OWNER_FILE), temp = join(path, `.owner-${owner.token}.tmp`)
  let fd
  try {
    fd = openSync(exclusive ? file : temp, 'wx', 0o600)
    writeFileSync(fd, ownerText(owner)); fsyncSync(fd); closeSync(fd); fd = undefined
    if (!exclusive) renameSync(temp, file)
  } catch (error) {
    if (fd !== undefined) try { closeSync(fd) } catch {}
    if (!exclusive) try { unlinkSync(temp) } catch {}
    throw error
  }
}

function removeOwnedDirectory(path, token) {
  const current = readDirectoryOwner(path, Date.now)
  if (!current || current.value.token !== token) return false
  unlinkSync(join(path, OWNER_FILE)); rmdirSync(path); return true
}

export function acquireInstanceLock({ path, pid = process.pid, host = hostname(), now = Date.now,
  token = randomUUID(), isProcessAlive = processAlive, heartbeatMs = 30000,
  onRecovered = () => {}, onHeartbeatError = () => {} } = {}) {
  if (typeof path !== 'string' || !isAbsolute(path) || !Number.isSafeInteger(pid) || pid < 1 ||
      typeof host !== 'string' || !host || host.length > 255 || typeof now !== 'function' ||
      typeof token !== 'string' || !UUID.test(token) || typeof isProcessAlive !== 'function' ||
      !Number.isSafeInteger(heartbeatMs) || heartbeatMs < 0 || typeof onRecovered !== 'function' ||
      typeof onHeartbeatError !== 'function') throw Error('Configuration de verrou invalide')
  const timestamp = new Date(now()).toISOString()
  const owner = { version: 1, token, pid, host, createdAt: timestamp, renewedAt: timestamp }
  const create = () => {
    mkdirSync(path, { mode: 0o700 })
    try { writeOwner(path, owner, true) } catch (error) { try { rmdirSync(path) } catch {}; throw error }
  }
  let recovered = null
  try { create() } catch (error) {
    if (error?.code !== 'EEXIST') throw error
    const current = readDirectoryOwner(path, now)
    if (!current) return acquireInstanceLock({ path, pid, host, now, token, isProcessAlive, heartbeatMs, onRecovered, onHeartbeatError })
    const active = current.value.host === host && isProcessAlive(current.value.pid)
    if (active) throw new InstanceLockError('actif', path, current.ageMs)
    const quarantine = `${path}.stale-${token}`
    try { renameSync(path, quarantine) } catch (renameError) {
      if (renameError?.code === 'ENOENT') return acquireInstanceLock({ path, pid, host, now, token, isProcessAlive, heartbeatMs, onRecovered, onHeartbeatError })
      throw renameError
    }
    try { create() } catch (createError) {
      try { removeOwnedDirectory(quarantine, current.value.token) } catch {}
      if (createError?.code === 'EEXIST') throw new InstanceLockError('actif', path)
      throw createError
    }
    if (!removeOwnedDirectory(quarantine, current.value.token)) throw new InstanceLockError('quarantaine-corrompue', quarantine)
    recovered = { previousHost: current.value.host, previousPid: current.value.pid, ageMs: current.ageMs }
    onRecovered({ path, ...recovered })
  }
  let released = false, timer = null
  const refresh = () => {
    if (released) return false
    const current = readDirectoryOwner(path, now)
    if (!current || current.value.token !== token) throw new InstanceLockError('propriete-perdue', path)
    owner.renewedAt = new Date(now()).toISOString(); writeOwner(path, owner); return true
  }
  if (heartbeatMs > 0) {
    timer = setInterval(() => { try { refresh() } catch (error) { onHeartbeatError(error) } }, heartbeatMs)
    timer.unref()
  }
  const release = () => {
    if (released) return false
    released = true; if (timer) clearInterval(timer)
    try { return removeOwnedDirectory(path, token) } catch { return false }
  }
  return Object.freeze({ path, recovered, refresh, release })
}
