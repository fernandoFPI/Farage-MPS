import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import client from '../client'

export function useRoles() {
  return useQuery({
    queryKey: ['roles'],
    queryFn: () => client.get('/api/roles').then(r => r.data),
  })
}

export function useCreateRole() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload) => client.post('/api/roles', payload).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['roles'] }),
  })
}

export function useUpdateRole() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...payload }) => client.put(`/api/roles/${id}`, payload).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['roles'] }),
  })
}

export function useDeleteRole() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id) => client.delete(`/api/roles/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['roles'] }),
  })
}
