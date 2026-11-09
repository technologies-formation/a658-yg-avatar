import test from 'node:test'
import assert from 'node:assert/strict'
import { basename, dirname, join, resolve } from 'node:path'
import { prepareInfomaniakPrivatePilot } from './infomaniak-private-pilot.mjs'

test('lanceur Infomaniak court : trois fichiers privés, activations explicites et aucun secret retourné', () => {
  const configFile = resolve('private-fixture', 'config.json')
  const pathwayDirectory = resolve('private-fixture', 'existing-pathway')
  const environment = { AVATAR_PRIVATE_UNLIMITED_ENABLED: 'false' }
  const loaded = []
  const privateValues = {
    'openai.env': { AVATAR_DIALOGUE_OPENAI_API_KEY: 'FAKE_OPENAI_VALUE' },
    'mail.env': { AVATAR_MAIL_PASSWORD: 'FAKE_MAIL_VALUE' },
    'consumption.env': { A658_REPORT_TOKEN: 'FAKE_REPORT_VALUE' },
  }
  const prepared = prepareInfomaniakPrivatePilot({ configFile, pathwayDirectory, environment,
    loadFile(path, target) {
      loaded.push(path)
      Object.assign(target, privateValues[basename(path)])
    } })
  assert.deepEqual(loaded, ['openai.env', 'mail.env', 'consumption.env'].map(name => join(dirname(configFile), name)))
  for (const name of ['AVATAR_DIALOGUE_TRIAL_ENABLED', 'AVATAR_PATHWAY_TRIAL_ENABLED',
    'AVATAR_PATHWAY_VALIDATION_ENABLED', 'AVATAR_PRIVATE_UNLIMITED_ENABLED', 'AVATAR_MAIL_ENABLED',
    'A658_DAILY_REPORT_ENABLED', 'AVATAR_DEVICE_MEMORY_ENABLED']) assert.equal(environment[name], 'true')
  assert.equal(environment.AVATAR_DIALOGUE_OPENAI_API_KEY, 'FAKE_OPENAI_VALUE')
  assert.equal(environment.AVATAR_MAIL_PASSWORD, 'FAKE_MAIL_VALUE')
  assert.equal(environment.A658_REPORT_TOKEN, 'FAKE_REPORT_VALUE')
  assert.match(prepared.launcher, /hosted-private-pilot\.mjs$/)
  assert.deepEqual(prepared.args, [configFile, pathwayDirectory])
  assert.doesNotMatch(JSON.stringify(prepared), /FAKE_|OPENAI|PASSWORD|TOKEN/)
})

test('lanceur Infomaniak court : refus avant lecture pour paramètres relatifs ou incomplets', () => {
  let loads = 0
  const loadFile = () => { loads++ }
  assert.throws(() => prepareInfomaniakPrivatePilot({ configFile: 'config.json',
    pathwayDirectory: resolve('private-fixture', 'existing-pathway'), environment: {}, loadFile }))
  assert.throws(() => prepareInfomaniakPrivatePilot({ configFile: resolve('private-fixture', 'other.json'),
    pathwayDirectory: resolve('private-fixture', 'existing-pathway'), environment: {}, loadFile }))
  assert.throws(() => prepareInfomaniakPrivatePilot({ configFile: resolve('private-fixture', 'config.json'),
    pathwayDirectory: 'existing-pathway', environment: {}, loadFile }))
  assert.equal(loads, 0)
})
