import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import client from '../client'

export function useCustomerStorage(customerId) {
  return useQuery({
    queryKey: ['customer-storage', customerId],
    queryFn: () => client.get(`/api/customer-storage/${customerId}`).then(r => r.data),
    enabled: !!customerId,
  })
}

export function useCustomerStorageHistory(customerId, printerModel) {
  return useQuery({
    queryKey: ['customer-storage', customerId, 'history', printerModel],
    queryFn: () =>
      client.get(`/api/customer-storage/${customerId}/history/${encodeURIComponent(printerModel)}`).then(r => r.data),
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
