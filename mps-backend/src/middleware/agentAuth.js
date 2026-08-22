import crypto from 'crypto';
import pool from '../config/db.js';

function sha256(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export async function verifyAgentToken(req, res, next) {
  const header = req.headers['authorization'];
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Agent token required' });
  }

  const token = header.slice(7);
  const hash  = sha256(token);

  try {
    const { rows } = await pool.query(
      `SELECT id, customer_id, name, snmp_community, poll_interval, status
       FROM agent_sites WHERE api_token_hash = $1`,
      [hash],
    );

    if (!rows[0]) return res.status(401).json({ error: 'Invalid agent token' });

    req.agentSite = rows[0];

    // Keep last_seen fresh and flip status to active
    await pool.query(
      `UPDATE agent_sites SET last_seen = now(), status = 'active' WHERE id = $1`,
      [rows[0].id],
    );

    next();
  } catch (err) {
    next(err);
  }
}
