import axios from 'axios'

const client = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:3000',
})

client.interceptors.request.use((config) => {
  const token = localStorage.getItem('mps_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

client.interceptors.response.use(
  (res) => res,
  (err) => {
    // Only redirect on 401 if a token existed — i.e. an authenticated session expired.
    // During login itself there is no token yet, so we let the error propagate normally.
    if (err.response?.status === 401 && localStorage.getItem('mps_token')) {
      localStorage.removeItem('mps_token')
      localStorage.removeItem('mps_user')
      window.location.href = '/login'
    }
    return Promise.reject(err)
  }
)

export default client
