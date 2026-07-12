import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import client from '../client'

export function useUsers(params = {}) {
  return useQuery({
    queryKey: ['users', params],
    queryFn: () => client.get('/api/users', { params }).then(r => r.data),
  })
}

export function useUser(id) {
  return useQuery({
    queryKey: ['users', id],
    queryFn: () => client.get(`/api/users/${id}`).then(r => r.data),
    enabled: !!id,
  })
}

export function useCreateUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data) => client.post('/api/users', data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  })
}

export function useUpdateUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }) => client.put(`/api/users/${id}`, data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  })
}

export function useUpdateUserPermissions() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, overrides }) =>
      client.patch(`/api/users/${id}/permissions`, { overrides }).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  })
}

export function useDeactivateUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id) => client.delete(`/api/users/${id}`).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  })
}
