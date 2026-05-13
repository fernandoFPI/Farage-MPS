export function blockOdoo(req, res, next) {
  if (req.user?.role?.name === 'odoo_integration') {
    return res.status(403).json({
      error: 'Access denied — this endpoint is not available for integration accounts',
    })
  }
  next()
}

export function requireOdooOrFinance(req, res, next) {
  const role = req.user?.role
  if (!role) return res.status(401).json({ error: 'Unauthorized' })
  if (role.name === 'odoo_integration' || role.can_push_to_odoo) return next()
  return res.status(403).json({ error: 'Access denied' })
}
