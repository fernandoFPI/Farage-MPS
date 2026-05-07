import * as repo from '../repositories/systemSettingsRepository.js'

export async function getAllSettings() {
  return repo.getAll()
}

export async function updateSetting(key, value, userId) {
  const existing = await repo.get(key)
  if (!existing) {
    const err = new Error('Setting not found')
    err.status = 404
    throw err
  }
  return repo.set(key, value, userId)
}
