-- Add granular permission columns to roles table
ALTER TABLE roles
  ADD COLUMN IF NOT EXISTS can_view_contracts        BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_create_contracts      BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_edit_contracts        BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_delete_contracts      BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_view_billing          BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_edit_billing          BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_view_users            BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_view_contract_pricing BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_view_billing_totals   BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_view_billing_breakdown BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_view_manual_billing   BOOLEAN NOT NULL DEFAULT false;

-- admin: full access to everything
UPDATE roles SET
  can_view_contracts        = true,
  can_create_contracts      = true,
  can_edit_contracts        = true,
  can_delete_contracts      = true,
  can_view_billing          = true,
  can_edit_billing          = true,
  can_view_users            = true,
  can_view_contract_pricing = true,
  can_view_billing_totals   = true,
  can_view_billing_breakdown = true,
  can_view_manual_billing   = true
WHERE name = 'admin';

-- mps_specialist: contracts (no delete), billing (no confirm), all financial
UPDATE roles SET
  can_view_contracts        = true,
  can_create_contracts      = true,
  can_edit_contracts        = true,
  can_delete_contracts      = false,
  can_view_billing          = true,
  can_edit_billing          = true,
  can_view_users            = true,
  can_view_contract_pricing = true,
  can_view_billing_totals   = true,
  can_view_billing_breakdown = true,
  can_view_manual_billing   = true
WHERE name = 'mps_specialist';

-- mps_team_lead: full contracts, full billing, all financial
UPDATE roles SET
  can_view_contracts        = true,
  can_create_contracts      = true,
  can_edit_contracts        = true,
  can_delete_contracts      = true,
  can_view_billing          = true,
  can_edit_billing          = true,
  can_view_users            = true,
  can_view_contract_pricing = true,
  can_view_billing_totals   = true,
  can_view_billing_breakdown = true,
  can_view_manual_billing   = true
WHERE name = 'mps_team_lead';

-- service_manager: full contracts, full billing + manage users, all financial
UPDATE roles SET
  can_view_contracts        = true,
  can_create_contracts      = true,
  can_edit_contracts        = true,
  can_delete_contracts      = true,
  can_view_billing          = true,
  can_edit_billing          = true,
  can_view_users            = true,
  can_view_contract_pricing = true,
  can_view_billing_totals   = true,
  can_view_billing_breakdown = true,
  can_view_manual_billing   = true
WHERE name = 'service_manager';

-- engineer: view contracts & billing, submit readings only, no financial
UPDATE roles SET
  can_view_contracts        = true,
  can_create_contracts      = false,
  can_edit_contracts        = false,
  can_delete_contracts      = false,
  can_view_billing          = true,
  can_edit_billing          = false,
  can_view_users            = false,
  can_view_contract_pricing = false,
  can_view_billing_totals   = false,
  can_view_billing_breakdown = false,
  can_view_manual_billing   = false
WHERE name = 'engineer';

-- finance: view contracts & billing, confirm + push to odoo, all financial
UPDATE roles SET
  can_view_contracts        = true,
  can_create_contracts      = false,
  can_edit_contracts        = false,
  can_delete_contracts      = false,
  can_view_billing          = true,
  can_edit_billing          = false,
  can_view_users            = true,
  can_view_contract_pricing = true,
  can_view_billing_totals   = true,
  can_view_billing_breakdown = true,
  can_view_manual_billing   = true
WHERE name = 'finance';

-- odoo_integration: push to odoo only, no UI access
UPDATE roles SET
  can_view_contracts        = false,
  can_create_contracts      = false,
  can_edit_contracts        = false,
  can_delete_contracts      = false,
  can_view_billing          = false,
  can_edit_billing          = false,
  can_view_users            = false,
  can_view_contract_pricing = false,
  can_view_billing_totals   = false,
  can_view_billing_breakdown = false,
  can_view_manual_billing   = false
WHERE name = 'odoo_integration';

-- Fix existing columns for roles that weren't set correctly by earlier migrations
UPDATE roles SET can_confirm_billing = true,  can_manage_users = true  WHERE name = 'service_manager';
UPDATE roles SET can_confirm_billing = true                             WHERE name = 'finance';
UPDATE roles SET can_confirm_billing = false                            WHERE name = 'mps_specialist';

-- Drop replaced columns
ALTER TABLE roles
  DROP COLUMN IF EXISTS can_manage_billing,
  DROP COLUMN IF EXISTS can_manage_contracts,
  DROP COLUMN IF EXISTS can_view_financial_data;
