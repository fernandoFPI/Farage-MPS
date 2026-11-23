import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import client from '../client'

export function useCustomerStorage(customerId) {
  return useQuery({
    queryKey: ['customer-storage', customerId],
    queryFn: () => client.get(`/api/customer-storage/${customerId}`).then(r => r.data),
    enabled: !!customerId,
  })
}

// location: history of one site's stock row (the same model can exist at several sites)
export function useCustomerStorageHistory(customerId, printerModel, location) {
  return useQuery({
    queryKey: ['customer-storage', customerId, 'history', printerModel, location ?? null],
    queryFn: () =>
      client.get(`/api/customer-storage/${customerId}/history/${encodeURIComponent(printerModel)}`, {
        params: location == null ? {} : { location },
      }).then(r => r.data),
    enabled: !!customerId && !!printerModel,
  })
}

export function useUpdateCustomerStorage() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ customerId, printerModel, ...data }) =>
      client.put(`/api/customer-storage/${customerId}/${encodeURIComponent(printerModel)}`, data).then(r => r.data),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['customer-storage', vars.customerId] })
    },
  })
}
