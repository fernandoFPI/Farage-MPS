import pool from '../config/db.js';

function mapSite(row) {
  if (!row) return null;
  return {
    id:            row.id,
    customerId:    row.customer_id,
    name:          row.name,
    status:        row.status,
    snmpCommunity: row.snmp_community,
    pollInterval:  row.poll_interval,
    lastSeen:      row.last_seen,
    agentVersion:  row.agent_version,
    createdAt:     row.created_at,
  };
}

export async function findAll() {
  const { rows } = await pool.query(
    `SELECT s.*, cu.name AS customer_name
     FROM agent_sites s
     LEFT JOIN customers cu ON cu.id = s.customer_id
     ORDER BY s.created_at DESC`,
  );
  return rows.map(r => ({ ...mapSite(r), customerName: r.customer_name }));
}

export async function findById(id) {
  const { rows } = await pool.query(
    `SELECT * FROM agent_sites WHERE id = $1`,
    [id],
  );
  return mapSite(rows[0]);
}

export async function findByRegCode(regCode) {
  const { rows } = await pool.query(
    `SELECT * FROM agent_sites
     WHERE reg_code = $1 AND reg_code_expiry > now()`,
    [regCode],
  );
  return rows[0] ?? null;
}

export async function create({ customerId, name }) {
  const { rows } = await pool.query(
    `INSERT INTO agent_sites (customer_id, name)
     VALUES ($1, $2)
     RETURNING *`,
    [customerId || null, name],
  );
  return mapSite(rows[0]);
}

export async function setRegCode(id, regCode, expiry) {
  const { rows } = await pool.query(
    `UPDATE agent_sites SET reg_code = $1, reg_code_expiry = $2 WHERE id = $3 RETURNING *`,
    [regCode, expiry, id],
  );
  return mapSite(rows[0]);
}

export async function activateWithToken(id, tokenHash, version) {
  const { rows } = await pool.query(
    `UPDATE agent_sites
     SET api_token_hash = $1, agent_version = $2,
         status = 'active', reg_code = NULL, reg_code_expiry = NULL,
         last_seen = now()
     WHERE id = $3 RETURNING *`,
    [tokenHash, version || null, id],
  );
  return mapSite(rows[0]);
}

export async function update(id, { snmpCommunity, pollInterval }) {
  const { rows } = await pool.query(
    `UPDATE agent_sites
     SET snmp_community = COALESCE($1, snmp_community),
         poll_interval  = COALESCE($2, poll_interval)
     WHERE id = $3 RETURNING *`,
    [snmpCommunity ?? null, pollInterval ?? null, id],
  );
  return mapSite(rows[0]);
}

// Return serial_number → printer_id map for printers assigned to this site
export async function getKnownSerials(siteId) {
  const { rows } = await pool.query(
    `SELECT serial_number, id FROM printers WHERE agent_site_id = $1`,
    [siteId],
  );
  return Object.fromEntries(rows.map(r => [r.serial_number, r.id]));
}

// Match discovered serial numbers to printer IDs for this site's customer
export async function matchSerials(siteId, serials) {
  if (!serials.length) return {};
  const { rows } = await pool.query(
    `SELECT p.serial_number, p.id, p.is_bw_only
     FROM printers p
     JOIN contract_printers cp ON cp.printer_id = p.id
     JOIN contracts co ON co.id = cp.contract_id
     JOIN agent_sites s ON s.customer_id = co.customer_id
     WHERE s.id = $1 AND p.serial_number = ANY($2)
       AND co.is_active = true`,
    [siteId, serials],
  );
  return Object.fromEntries(rows.map(r => [r.serial_number, { id: r.id, isBwOnly: r.is_bw_only }]));
}

export async function updatePrinterNetwork(printerId, { ip, snmpStatus, lastPolled }) {
  await pool.query(
    `UPDATE printers SET ip_address = $1, snmp_status = $2, last_polled = $3 WHERE id = $4`,
    [ip, snmpStatus, lastPolled || new Date(), printerId],
  );
}
