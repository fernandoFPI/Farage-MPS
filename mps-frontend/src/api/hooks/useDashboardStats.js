import { useCustomers } from './useCustomers'
import { useContracts } from './useContracts'
import { usePrinters } from './usePrinters'
import { useBillingCycles } from './useBillingCycles'

export function useDashboardStats() {
  const customers = useCustomers()
  const contracts = useContracts()
  const printers  = usePrinters()
  const cycles    = useBillingCycles()

  const cycleData = cycles.data ?? []
  const recentCycles = [...cycleData]
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 5)

  return {
    isLoading: customers.isLoading || contracts.isLoading || printers.isLoading || cycles.isLoading,
    stats: {
      totalCustomers:     customers.data?.length ?? 0,
      activeContracts:    contracts.data?.filter(c => c.isActive).length ?? 0,
      totalPrinters:      printers.data?.length ?? 0,
      xsmEnabledPrinters: printers.data?.filter(p => p.xsmEnabled).length ?? 0,
      openCycles:         cycleData.filter(c => c.status === 'open').length,
      pendingCycles:      cycleData.filter(c => c.status === 'pending_confirmation').length,
      confirmedCycles:    cycleData.filter(c => c.status === 'confirmed').length,
      disputedCycles:     cycleData.filter(c => c.status === 'disputed').length,
      invoicedCycles:     cycleData.filter(c => c.status === 'invoiced').length,
    },
    recentCycles,
  }
}
