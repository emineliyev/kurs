import client from './client'

export const authApi = {
  register: (data) => client.post('/auth/register/', data),
  login: (data) => client.post('/auth/login/', data),
  logout: (refresh) => client.post('/auth/logout/', { refresh }),
  profile: () => client.get('/auth/profile/'),
  updateProfile: (data) => client.patch('/auth/profile/', data),
  changePassword: (data) => client.post('/auth/password/change/', data),
  googleAuth: (credential) => client.post('/auth/google/', { credential }),
  updateStudent: (id, data) => client.patch(`/auth/students/${id}/`, data),
  deactivateStudent: (id) => client.delete(`/auth/students/${id}/`),
  verifyEmail: (token) => client.post('/auth/verify-email/', { token }),
  resendVerification: () => client.post('/auth/resend-verification/'),
  resetPasswordRequest: (email) => client.post('/auth/password/reset/', { email }),
  resetPasswordConfirm: (token, new_password) => client.post('/auth/password/reset/confirm/', { token, new_password }),
}
