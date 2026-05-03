import { createContext, useContext, useEffect, useState } from 'react'
import client from '../api/client'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [token, setToken] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const storedToken = localStorage.getItem('mps_token')
    const storedUser = localStorage.getItem('mps_user')

    if (!storedToken) {
      setLoading(false)
      return
    }

    // Verify token is still valid
    client.get('/api/auth/me')
      .then((res) => {
        setToken(storedToken)
        setUser(res.data)
        localStorage.setItem('mps_user', JSON.stringify(res.data))
      })
      .catch(() => {
        localStorage.removeItem('mps_token')
        localStorage.removeItem('mps_user')
        window.location.href = '/login'
      })
      .finally(() => setLoading(false))
  }, [])

  async function login(email, password) {
    const res = await client.post('/api/auth/login', { email, password })
    const { token: jwt, user: userData } = res.data
    localStorage.setItem('mps_token', jwt)
    localStorage.setItem('mps_user', JSON.stringify(userData))
    setToken(jwt)
    setUser(userData)
  }

  function logout() {
    localStorage.removeItem('mps_token')
    localStorage.removeItem('mps_user')
    setToken(null)
    setUser(null)
    window.location.href = '/login'
  }

  return (
    <AuthContext.Provider value={{ user, token, login, logout, isAuthenticated: !!token, loading }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
