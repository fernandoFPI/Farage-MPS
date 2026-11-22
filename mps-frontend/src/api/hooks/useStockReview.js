import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import client from '../client'

// Stock review of one billing cycle: the stock each location submitted, anomalies, and its confirmation.
// All keys sit under ['billing-cycles', id, …] so any cycle mutation refreshes them too.

export function useStockReview(cycleId, enabled = true) {
  return useQuery({
    queryKey: ['billing-cycles', cycleId, 'stock-review'],
    queryFn: () => client.get(`/api/billing-cycles/${cycleId}/stock-review`).then(r => r.data),
    enabled: !!cycleId && enabled,
  })
}

export function useCycleActivity(cycleId, enabled = true) {
  return useQuery({
    queryKey: ['billing-cycles', cycleId, 'activity'],
    queryFn: () => client.get(`/api/billing-cycles/${cycleId}/activity`).then(r => r.data),
    enabled: !!cycleId && enabled,
  })
}

function useRefreshAfterStockChange() {
  const qc = useQueryClient()
  return () => {
    qc.invalidateQueries({ queryKey: ['billing-cycles'] })
    qc.invalidateQueries({ queryKey: ['customer-storage'] })
    qc.invalidateQueries({ queryKey: ['monitor'] })
  }
}

export function useConfirmStock() {
  const refresh = useRefreshAfterStockChange()
  return useMutation({
    mutationFn: (cycleId) => client.post(`/api/billing-cycles/${cycleId}/stock-review/confirm`).then(r => r.data),
    onSuccess: refresh,
  })
}

export function useAdjustStock() {
  const refresh = useRefreshAfterStockChange()
  return useMutation({
    mutationFn: ({ cycleId, historyId, quantities, reason }) =>
      client.patch(`/api/billing-cycles/${cycleId}/stock-review/${historyId}`, { quantities, reason }).then(r => r.data),
    onSuccess: refresh,
  })
}

export function useAddStock() {
  const refresh = useRefreshAfterStockChange()
  return useMutation({
    mutationFn: ({ cycleId, printerModel, location, quantities, reason }) =>
      client.post(`/api/billing-cycles/${cycleId}/stock-review`, { printerModel, location, quantities, reason }).then(r => r.data),
    onSuccess: refresh,
  })
}

export function useAcknowledgeStockAnomaly() {
  const refresh = useRefreshAfterStockChange()
  return useMutation({
    mutationFn: ({ cycleId, historyId }) =>
      client.post(`/api/billing-cycles/${cycleId}/stock-review/${historyId}/acknowledge`).then(r => r.data),
    onSuccess: refresh,
  })
}

// Unacknowledged abnormal stock jumps on cycles still being worked on (Operations Monitor)
export function useStockAnomalies() {
  return useQuery({
    queryKey: ['monitor', 'stock-anomalies'],
    queryFn: () => client.get('/api/monitor/stock-anomalies').then(r => r.data),
    staleTime: 5 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
  })
}
