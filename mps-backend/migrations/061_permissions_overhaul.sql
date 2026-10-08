-- Permissions overhaul:
--   1. Two new flags: can_view_operational_data (baseline read access to
--      contracts/printers/customers/readings/cycle-groups/contract-groups
--      lists, independent of pricing) and can_view_performance (engineer
--      performance stats, decoupled from can_push_to_odoo).
--   2. Restore service_manager to its originally-intended "full operational
--      access, zero financial visibility, read-only" state. Migration 053
--      ("granular_permissions") silently re-granted it full financial
--      visibility and user management, reversing 048 and 049 — this undoes
--      that regression.
--   3. New role operations_viewer: printers, users, performance — no
--      financial data anywhere.

ALTER TABLE roles
  ADD COLUMN IF NOT EXISTS can_view_operational_data BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS can_view_performance      BOOLEAN NOT NULL DEFAULT true;

-- odoo_integration never had UI/list access to begin with (blockOdoo already
-- shuts it out of every route below) — reflect that explicitly instead of
-- leaving it on the permissive default.
UPDATE roles SET can_view_operational_data = false WHERE name = 'odoo_integration';

-- engineer never had Performance-page access (it was gated by can_push_to_odoo,
-- which engineer never had) — the new flag defaults to true, so pin it back to
-- false explicitly or this migration would silently grant new access.
UPDATE roles SET can_view_performance = false WHERE name = 'engineer';

-- Restore service_manager's original intent (048: no pricing/billing
-- visibility: 049: read-only). 053 had reversed both.
UPDATE roles SET
  can_create_contracts       = false,
  can_edit_contracts         = false,
  can_delete_contracts       = false,
  can_edit_billing           = false,
  can_confirm_billing        = false,
  can_manage_users           = false,
  can_view_contract_pricing  = false,
  can_view_billing_totals    = false,
  can_view_billing_breakdown = false,
  can_view_manual_billing    = false
WHERE name = 'service_manager';

-- New role: operations access (printers, users, engineer performance),
-- zero financial data anywhere.
INSERT INTO roles (
  name, description,
  can_submit_readings, can_view_contracts, can_create_contracts, can_edit_contracts,
  can_delete_contracts, can_view_billing, can_edit_billing, can_confirm_billing,
  can_push_to_odoo, can_view_users, can_manage_users,
  can_view_contract_pricing, can_view_billing_totals, can_view_billing_breakdown,
  can_view_manual_billing, can_view_operational_data, can_view_performance
) VALUES (
  'operations_viewer',
  'Operations viewer — printers, users and engineer performance, no financial or pricing data',
  false, true, false, false,
  false, true, false, false,
  false, true, false,
  false, false, false,
  false, true, true
) ON CONFLICT (name) DO NOTHING;
