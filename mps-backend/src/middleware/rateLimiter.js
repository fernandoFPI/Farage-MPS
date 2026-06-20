import rateLimit from 'express-rate-limit'

export const odooRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  message: { error: 'Too many requests — please slow down' },
  standardHeaders: true,
  legacyHeaders: false,
})

export const loginRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many login attempts — try again later' },
})
