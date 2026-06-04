-- Add financial data visibility flag to all roles (true = can see prices/billing amounts)
ALTER TABLE roles ADD COLUMN IF NOT EXISTS can_view_financial_data BOOLEAN NOT NULL DEFAULT TRUE;

-- Insert the service_manager role:
-- Same operational permissions as mps_specialist, but no financial data visibility
INSERT INTO roles (
  name,
  description,
  can_submit_readings,
  can_manage_billing,
  can_confirm_billing,
  can_manage_contracts,
  can_manage_users,
  can_push_to_odoo,
  can_view_financial_data
) VALUES (
  'service_manager',
  'Service manager — full operational access matching MPS Specialist, without visibility into prices or billing calculations',
  true,
  true,
  true,
  true,
  false,
  false,
  false
) ON CONFLICT (name) DO NOTHING;
