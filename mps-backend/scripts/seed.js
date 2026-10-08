import 'dotenv/config';
import bcrypt from 'bcryptjs';
import pool from '../src/config/db.js';

// Mirrors the final role state after all migrations (001 → 061). Kept in
// sync manually — if you add a permission flag or role via migration, add it
// here too so `npm run seed` still produces a correct fresh DB.
const roles = [
  {
    name: 'admin',
    description: 'Full system access',
    can_submit_readings: true, can_view_contracts: true, can_create_contracts: true, can_edit_contracts: true,
    can_delete_contracts: true, can_view_billing: true, can_edit_billing: true, can_confirm_billing: true,
    can_push_to_odoo: true, can_view_users: true, can_manage_users: true,
    can_view_contract_pricing: true, can_view_billing_totals: true, can_view_billing_breakdown: true,
    can_view_manual_billing: true, can_view_operational_data: true, can_view_performance: true,
  },
  {
    name: 'mps_team_lead',
    description: 'Full billing and contract management access',
    can_submit_readings: true, can_view_contracts: true, can_create_contracts: true, can_edit_contracts: true,
    can_delete_contracts: true, can_view_billing: true, can_edit_billing: true, can_confirm_billing: true,
    can_push_to_odoo: false, can_view_users: true, can_manage_users: false,
    can_view_contract_pricing: true, can_view_billing_totals: true, can_view_billing_breakdown: true,
    can_view_manual_billing: true, can_view_operational_data: true, can_view_performance: true,
  },
  {
    name: 'mps_specialist',
    description: 'Manages billing cycles and confirms with customers',
    can_submit_readings: true, can_view_contracts: true, can_create_contracts: true, can_edit_contracts: true,
    can_delete_contracts: false, can_view_billing: true, can_edit_billing: true, can_confirm_billing: false,
    can_push_to_odoo: false, can_view_users: true, can_manage_users: false,
    can_view_contract_pricing: true, can_view_billing_totals: true, can_view_billing_breakdown: true,
    can_view_manual_billing: true, can_view_operational_data: true, can_view_performance: true,
  },
  {
    name: 'service_manager',
    description: 'Service manager — full operational access matching MPS Specialist, without visibility into prices or billing calculations, read-only',
    can_submit_readings: true, can_view_contracts: true, can_create_contracts: false, can_edit_contracts: false,
    can_delete_contracts: false, can_view_billing: true, can_edit_billing: false, can_confirm_billing: false,
    can_push_to_odoo: false, can_view_users: true, can_manage_users: false,
    can_view_contract_pricing: false, can_view_billing_totals: false, can_view_billing_breakdown: false,
    can_view_manual_billing: false, can_view_operational_data: true, can_view_performance: true,
  },
  {
    name: 'finance',
    description: 'Confirms billing and pushes approved invoices to Odoo',
    can_submit_readings: false, can_view_contracts: true, can_create_contracts: false, can_edit_contracts: false,
    can_delete_contracts: false, can_view_billing: true, can_edit_billing: false, can_confirm_billing: true,
    can_push_to_odoo: true, can_view_users: true, can_manage_users: false,
    can_view_contract_pricing: true, can_view_billing_totals: true, can_view_billing_breakdown: true,
    can_view_manual_billing: true, can_view_operational_data: true, can_view_performance: true,
  },
  {
    name: 'engineer',
    description: 'Field engineer — submits meter readings',
    can_submit_readings: true, can_view_contracts: true, can_create_contracts: false, can_edit_contracts: false,
    can_delete_contracts: false, can_view_billing: true, can_edit_billing: false, can_confirm_billing: false,
    can_push_to_odoo: false, can_view_users: false, can_manage_users: false,
    can_view_contract_pricing: false, can_view_billing_totals: false, can_view_billing_breakdown: false,
    can_view_manual_billing: false, can_view_operational_data: true, can_view_performance: false,
  },
  {
    name: 'operations_viewer',
    description: 'Operations viewer — printers, users and engineer performance, no financial or pricing data',
    can_submit_readings: false, can_view_contracts: true, can_create_contracts: false, can_edit_contracts: false,
    can_delete_contracts: false, can_view_billing: true, can_edit_billing: false, can_confirm_billing: false,
    can_push_to_odoo: false, can_view_users: true, can_manage_users: false,
    can_view_contract_pricing: false, can_view_billing_totals: false, can_view_billing_breakdown: false,
    can_view_manual_billing: false, can_view_operational_data: true, can_view_performance: true,
  },
  {
    name: 'odoo_integration',
    description: 'Dedicated role for Odoo ERP integration — read-only access to confirmed billing data',
    can_submit_readings: false, can_view_contracts: false, can_create_contracts: false, can_edit_contracts: false,
    can_delete_contracts: false, can_view_billing: false, can_edit_billing: false, can_confirm_billing: false,
    can_push_to_odoo: true, can_view_users: false, can_manage_users: false,
    can_view_contract_pricing: false, can_view_billing_totals: false, can_view_billing_breakdown: false,
    can_view_manual_billing: false, can_view_operational_data: false, can_view_performance: true,
  },
];

const ROLE_COLUMNS = [
  'can_submit_readings', 'can_view_contracts', 'can_create_contracts', 'can_edit_contracts',
  'can_delete_contracts', 'can_view_billing', 'can_edit_billing', 'can_confirm_billing',
  'can_push_to_odoo', 'can_view_users', 'can_manage_users',
  'can_view_contract_pricing', 'can_view_billing_totals', 'can_view_billing_breakdown',
  'can_view_manual_billing', 'can_view_operational_data', 'can_view_performance',
];

const roleSql = `
  INSERT INTO roles (name, description, ${ROLE_COLUMNS.join(', ')})
  VALUES ($1, $2, ${ROLE_COLUMNS.map((_, i) => `$${i + 3}`).join(', ')})
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
        ...ROLE_COLUMNS.map((col) => role[col]),
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
