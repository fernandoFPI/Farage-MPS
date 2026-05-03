export const roleLabels = {
  admin:          { en: 'Administrator',  ar: 'مدير النظام' },
  mps_specialist: { en: 'MPS Specialist', ar: 'أخصائي الطباعة' },
  mps_team_lead:  { en: 'MPS Team Lead',  ar: 'قائد فريق الطباعة' },
  engineer:       { en: 'Engineer',       ar: 'مهندس' },
  finance:        { en: 'Finance',        ar: 'المالية' },
}

export function getRoleLabel(roleName, lang = 'en') {
  return roleLabels[roleName]?.[lang] ?? roleName
}
