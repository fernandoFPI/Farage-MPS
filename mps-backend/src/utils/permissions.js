export const ALL_PERMISSION_FLAGS = [
  'can_submit_readings',
  'can_view_contracts',
  'can_create_contracts',
  'can_edit_contracts',
  'can_delete_contracts',
  'can_view_billing',
  'can_edit_billing',
  'can_confirm_billing',
  'can_push_to_odoo',
  'can_view_users',
  'can_manage_users',
  'can_view_contract_pricing',
  'can_view_billing_totals',
  'can_view_billing_breakdown',
  'can_view_manual_billing',
];

// Returns role unchanged when overrides is empty — no extra object allocation per request.
export function applyOverrides(role, overrides) {
  if (!overrides || Object.keys(overrides).length === 0) return role;
  return { ...role, ...overrides };
}

// Strips unknown flags and non-boolean values; null/undefined key = remove override.
export function sanitiseOverrides(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const clean = {};
  for (const flag of ALL_PERMISSION_FLAGS) {
    if (raw[flag] === true)  clean[flag] = true;
    if (raw[flag] === false) clean[flag] = false;
  }
  return clean;
}
