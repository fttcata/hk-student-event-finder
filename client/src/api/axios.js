import axios from 'axios'

const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api',
  headers: {
    'Content-Type': 'application/json',
  },
})

apiClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('campushub:token')
    if (token) config.headers.Authorization = `Bearer ${token}`
    return config
  },
  (error) => Promise.reject(error),
)

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status
    if (status === 401) {
      console.error('Unauthorized: Please log in again.')
    } else if (status === 403) {
      console.error('Forbidden: You do not have permission for this action.')
    } else if (status === 500) {
      console.error('Server Error: The backend crashed or is unreachable.')
    }
    return Promise.reject(error)
  },
)

export default apiClient
