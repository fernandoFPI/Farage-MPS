import jwt from 'jsonwebtoken';
import pool from '../config/db.js';
import { applyOverrides } from '../utils/permissions.js';

export async function verifyToken(req, res, next) {
  const header = req.headers['authorization'];
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const token = header.slice(7);

  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    // Verify user still exists, is active, and fetch current role permissions
    const { rows } = await pool.query(
      `SELECT u.id, u.email, u.full_name, u.is_active,
              u.permission_overrides, row_to_json(r.*) AS role
       FROM users u
       JOIN roles r ON u.role_id = r.id
       WHERE u.id = $1`,
      [payload.id],
    );

    const user = rows[0];
    if (!user || !user.is_active) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const effectiveRole = applyOverrides(user.role, user.permission_overrides);
    req.user = { id: user.id, email: user.email, fullName: user.full_name, role: effectiveRole };
    next();
  } catch (err) {
    next(err);
  }
}

export function requirePermission(flag) {
  return (req, res, next) => {
    if (!req.user?.role?.[flag]) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    next();
  };
}
