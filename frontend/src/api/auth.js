import client from './client'

export const authApi = {
  register: (data) => client.post('/auth/register/', data),
  login: (data) => client.post('/auth/login/', data),
  logout: (refresh) => client.post('/auth/logout/', { refresh }),
  profile: () => client.get('/auth/profile/'),
  updateProfile: (data) => client.patch('/auth/profile/', data),
  changePassword: (data) => client.post('/auth/password/change/', data),
  googleAuth: (credential) => client.post('/auth/google/', { credential }),
  students: (archived = false) => client.get('/auth/students/', { params: archived ? { archived: 1 } : {} }),
  createStudent: (data) => client.post('/auth/students/', data),
  updateStudent: (id, data) => client.patch(`/auth/students/${id}/`, data),
  archiveStudent: (id) => client.delete(`/auth/students/${id}/`),
  restoreStudent: (id) => client.post(`/auth/students/${id}/restore/`),
  verifyEmail: (token) => client.post('/auth/verify-email/', { token }),
  resendVerification: () => client.post('/auth/resend-verification/'),
  resetPasswordRequest: (email) => client.post('/auth/password/reset/', { email }),
  resetPasswordConfirm: (token, new_password) => client.post('/auth/password/reset/confirm/', { token, new_password }),
}
