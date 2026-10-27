// Registre distinct, append-only : aucune création de dossier ni remise à zéro implicite.
import { openSync, closeSync, writeFileSync, readFileSync, fsyncSync, lstatSync, readdirSync, realpathSync, unlinkSync } from 'node:fs'
import { isAbsolute, resolve, join } from 'node:path'
import { createHash } from 'node:crypto'
import { DialogueError } from './dialogue-session.mjs'
const fail = code => { throw new DialogueError(code) }
export const TRIAL_POLICY = Object.freeze({ model: 'gpt-6-luna', maxAttempts: 10, maxReservedMicroUsd: 100000,
  reserveMicroUsd: 10000, maxInputTokens: 30000, maxOutputTokens: 2000, pricingDate: '2026-10-23' })
export function createDialogueBudget({ directory, singleInstance = false, unlimited = false } = {}) {
  if (typeof unlimited !== 'boolean' || typeof directory !== 'string' || !isAbsolute(directory) || singleInstance !== true) fail('budget_configuration')
  const stat = lstatSync(directory)
  if (!stat.isDirectory() || stat.isSymbolicLink() || (stat.mode & 0o077) || realpathSync(directory) !== resolve(directory)) fail('budget_directory')
  const lock = join(directory, '.dialogue-lock'); let fd
  try { fd = openSync(lock, 'wx', 0o600) } catch { fail('budget_locked') }
  let closed = false, blocked = false
  const records = []
  const checkFile = path => {
    const info = lstatSync(path)
    if (!info.isFile() || info.isSymbolicLink() || info.size > 512 || (info.mode & 0o077)) fail('budget_corrupt')
  }
  const release = () => { if (!closed) { closed = true; closeSync(fd); unlinkSync(lock) } }
  try {
    for (const name of readdirSync(directory).filter(x => x.startsWith('attempt-')).sort((a,b)=>parseInt(a.slice(8),10)-parseInt(b.slice(8),10))) {
      if (name !== 'attempt-' + String(records.length + 1).padStart(2, '0') + '.json') fail('budget_corrupt')
      const file = join(directory, name); checkFile(file)
      const data = JSON.parse(readFileSync(file, 'utf8'))
      if (Object.keys(data).sort().join(',') !== 'requestHash,reservedMicroUsd' || !/^[a-f0-9]{64}$/.test(data.requestHash) ||
          data.reservedMicroUsd !== TRIAL_POLICY.reserveMicroUsd || records.includes(data.requestHash)) fail('budget_corrupt')
      records.push(data.requestHash)
    }
    if (readdirSync(directory).includes('.dialogue-stopped')) { checkFile(join(directory, '.dialogue-stopped')); blocked = true }
  } catch { release(); fail('budget_corrupt') }
  function persist(name, data) {
    let file
    try {
      file = openSync(join(directory, name), 'wx', 0o600)
      writeFileSync(file, JSON.stringify(data)); fsyncSync(file); closeSync(file); file = undefined
      const dir = openSync(directory, 'r'); try { fsyncSync(dir) } finally { closeSync(dir) }
    } catch { if (file !== undefined) closeSync(file); blocked = true; fail('budget_storage') }
  }
  return Object.freeze({
    status: () => ({ ...TRIAL_POLICY, ...(unlimited ? { unlimited: true, maxAttempts: null, maxReservedMicroUsd: null } : {}), attempts: records.length, reservedMicroUsd: records.length * 10000, stopped: blocked || closed }),
    reserve(requestId) {
      if (blocked || closed) fail('budget_stopped')
      if (typeof requestId !== 'string' || !/^[a-zA-Z0-9_-]{16,128}$/.test(requestId)) fail('invalid_request')
      const hash = createHash('sha256').update(requestId).digest('hex')
      if (records.includes(hash)) fail('duplicate_request')
      if (!unlimited && records.length >= TRIAL_POLICY.maxAttempts) fail('quota_exceeded')
      persist('attempt-' + String(records.length + 1).padStart(2, '0') + '.json', { requestHash: hash, reservedMicroUsd: 10000 })
      records.push(hash)
    },
    stop() { if (!blocked && !closed) persist('.dialogue-stopped', { stopped: true }); blocked = true },
    close: release,
  })
}
