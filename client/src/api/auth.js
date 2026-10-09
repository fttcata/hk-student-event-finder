import { apiPost } from './client.js'

export function registerUser(payload) {
  return apiPost('/auth/register', payload)
}

export function loginUser(payload) {
  return apiPost('/auth/login', payload)
}