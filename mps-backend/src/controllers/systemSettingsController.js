import * as service from '../services/systemSettingsService.js'

export async function list(req, res, next) {
  try {
    const settings = await service.getAllSettings()
    res.json(settings)
  } catch (err) {
    next(err)
  }
}

export async function update(req, res, next) {
  try {
    const { key } = req.params
    const { value } = req.body
    if (value === undefined || value === null) {
      return res.status(400).json({ error: 'value is required' })
    }
    const setting = await service.updateSetting(key, String(value), req.user.id)
    res.json(setting)
  } catch (err) {
    next(err)
  }
}
