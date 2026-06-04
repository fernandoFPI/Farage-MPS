-- service_manager is read-only: strip management permissions
-- Navigation visibility is handled at the frontend level via role name checks
UPDATE roles
SET
  can_manage_billing   = false,
  can_confirm_billing  = false,
  can_manage_contracts = false,
  can_manage_users     = false
WHERE name = 'service_manager';
