import client from './client'

export const authApi = {
  register: (data) => client.post('/auth/register/', data),
  login: (data) => client.post('/auth/login/', data),
  logout: (refresh) => client.post('/auth/logout/', { refresh }),
  profile: () => client.get('/auth/profile/'),
  updateProfile: (data) => client.patch('/auth/profile/', data),
  changePassword: (data) => client.post('/auth/password/change/', data),
  googleAuth: (credential) => client.post('/auth/google/', { credential }),
  // redirect sign-in (phones): the one-time code the server put in /auth/google#code=…
  googleExchange: (code) => client.post('/auth/google/exchange/', { code }),
  students: (archived = false) => client.get('/auth/students/', { params: archived ? { archived: 1 } : {} }),
  createStudent: (data) => client.post('/auth/students/', data),
  updateStudent: (id, data) => client.patch(`/auth/students/${id}/`, data),
  archiveStudent: (id) => client.delete(`/auth/students/${id}/`),
  restoreStudent: (id) => client.post(`/auth/students/${id}/restore/`),
  bulkCreateStudents: (students, classId = null) => client.post('/auth/students/bulk/', { students, class_id: classId }),
  checkUsernames: (usernames) => client.post('/auth/students/check-usernames/', { usernames }),
  assignStudents: (ids, classId) => client.post('/auth/students/assign/', { student_ids: ids, class_id: classId }),
  resetStudentPasswords: (ids) => client.post('/auth/students/reset-passwords/', { student_ids: ids }),
  purgeStudents: (ids) => client.post('/auth/students/purge/', { student_ids: ids }),
  verifyEmail: (token) => client.post('/auth/verify-email/', { token }),
  resendVerification: () => client.post('/auth/resend-verification/'),
  resetPasswordRequest: (email) => client.post('/auth/password/reset/', { email }),
  resetPasswordConfirm: (token, new_password) => client.post('/auth/password/reset/confirm/', { token, new_password }),
}
