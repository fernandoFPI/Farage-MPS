import { getAnalytics } from '../repositories/analyticsRepository.js'

export async function get(req, res, next) {
  try {
    const { year, customerId } = req.query
    const data = await getAnalytics({
      year:       year       ? parseInt(year)   : new Date().getFullYear(),
      customerId: customerId || null,
    })
    res.json(data)
  } catch (err) {
    next(err)
  }
}
