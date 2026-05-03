import 'dotenv/config';
import bcrypt from 'bcryptjs';
import pool from '../src/config/db.js';

const roles = [
  {
    name: 'engineer',
    description: 'Field engineer — submits meter readings',
    can_submit_readings: true,
    can_manage_billing: false,
    can_confirm_billing: false,
    can_manage_contracts: false,
    can_manage_users: false,
    can_push_to_odoo: false,
  },
  {
    name: 'mps_specialist',
    description: 'Manages billing cycles and confirms with customers',
    can_submit_readings: true,
    can_manage_billing: true,
    can_confirm_billing: true,
    can_manage_contracts: false,
    can_manage_users: false,
    can_push_to_odoo: false,
  },
  {
    name: 'mps_team_lead',
    description: 'Full billing and contract management access',
    can_submit_readings: true,
    can_manage_billing: true,
    can_confirm_billing: true,
    can_manage_contracts: true,
    can_manage_users: false,
    can_push_to_odoo: false,
  },
  {
    name: 'finance',
    description: 'Pushes approved invoices to Odoo',
    can_submit_readings: false,
    can_manage_billing: false,
    can_confirm_billing: false,
    can_manage_contracts: false,
    can_manage_users: false,
    can_push_to_odoo: true,
  },
  {
    name: 'admin',
    description: 'Full system access',
    can_submit_readings: true,
    can_manage_billing: true,
    can_confirm_billing: true,
    can_manage_contracts: true,
    can_manage_users: true,
    can_push_to_odoo: true,
  },
];

const roleSql = `
  INSERT INTO roles (
    name, description,
    can_submit_readings, can_manage_billing, can_confirm_billing,
    can_manage_contracts, can_manage_users, can_push_to_odoo
  ) VALUES (
    $1, $2, $3, $4, $5, $6, $7, $8
  )
  ON CONFLICT (name) DO NOTHING
`;

async function seed() {
  const client = await pool.connect();

  try {
    // ── Roles ──────────────────────────────────────────────────────────────
    for (const role of roles) {
      await client.query(roleSql, [
        role.name,
        role.description,
        role.can_submit_readings,
        role.can_manage_billing,
        role.can_confirm_billing,
        role.can_manage_contracts,
        role.can_manage_users,
        role.can_push_to_odoo,
      ]);
      console.log(`✓ Seeded role: ${role.name}`);
    }

    // ── Admin user ─────────────────────────────────────────────────────────
    const { rows } = await client.query(
      `SELECT id FROM roles WHERE name = 'admin'`,
    );
    const adminRoleId = rows[0]?.id;
    if (!adminRoleId) throw new Error("'admin' role not found — did roles seed run?");

    const passwordHash = await bcrypt.hash('Admin1234!', 12);

    await client.query(
      `INSERT INTO users (full_name, email, password_hash, role_id, is_active)
       VALUES ($1, $2, $3, $4, true)
       ON CONFLICT (email) DO NOTHING`,
      ['Admin', 'admin@mps.local', passwordHash, adminRoleId],
    );
    console.log('✓ Seeded user:  admin@mps.local');

    console.log('\nSeed completed successfully.');
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
