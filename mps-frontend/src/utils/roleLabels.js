export const roleLabels = {
  admin:             { en: 'Administrator',    ar: 'مدير النظام' },
  mps_specialist:    { en: 'MPS Specialist',   ar: 'أخصائي الطباعة' },
  mps_team_lead:     { en: 'MPS Team Lead',    ar: 'قائد فريق الطباعة' },
  service_manager:   { en: 'Service Manager',  ar: 'مدير الخدمة' },
  engineer:          { en: 'Engineer',         ar: 'مهندس' },
  finance:           { en: 'Finance',          ar: 'المالية' },
  odoo_integration:  { en: 'Odoo Integration', ar: 'تكامل Odoo' },
}

export function getRoleLabel(roleName, lang = 'en') {
  return roleLabels[roleName]?.[lang] ?? roleName
}

export const PERMISSION_LABELS = {
  can_submit_readings:         { en: 'Submit Readings',           ar: 'إرسال القراءات' },
  can_view_contracts:          { en: 'View Contracts',            ar: 'عرض العقود' },
  can_create_contracts:        { en: 'Create Contracts',          ar: 'إنشاء العقود' },
  can_edit_contracts:          { en: 'Edit Contracts',            ar: 'تعديل العقود' },
  can_delete_contracts:        { en: 'Delete Contracts',          ar: 'حذف العقود' },
  can_view_billing:            { en: 'View Billing',              ar: 'عرض الفوترة' },
  can_edit_billing:            { en: 'Edit Billing',              ar: 'تعديل الفوترة' },
  can_confirm_billing:         { en: 'Confirm Billing',           ar: 'تأكيد الفوترة' },
  can_push_to_odoo:            { en: 'Push to Odoo',             ar: 'إرسال إلى أودو' },
  can_view_users:              { en: 'View Users',                ar: 'عرض المستخدمين' },
  can_manage_users:            { en: 'Manage Users',              ar: 'إدارة المستخدمين' },
  can_view_contract_pricing:   { en: 'View Contract Pricing',     ar: 'عرض أسعار العقود' },
  can_view_billing_totals:     { en: 'View Billing Totals',       ar: 'عرض إجماليات الفوترة' },
  can_view_billing_breakdown:  { en: 'View Billing Breakdown',    ar: 'عرض تفاصيل الفوترة' },
  can_view_manual_billing:     { en: 'View Manual Billing',       ar: 'عرض الفوترة اليدوية' },
}

export function getPermissionLabel(flag, lang = 'en') {
  return PERMISSION_LABELS[flag]?.[lang] ?? flag
}
