import { useAuth } from '../context/AuthContext'

export function usePermission(flag) {
  const { user } = useAuth()
  if (!user?.role) return false
  return user.role[flag] === true
}
