import client from './client'

export const classesApi = {
  list: () => client.get('/classes/'),
  get: (id) => client.get(`/classes/${id}/`),
  create: (data) => client.post('/classes/', data),
  update: (id, data) => client.patch(`/classes/${id}/`, data),
  delete: (id) => client.delete(`/classes/${id}/`),
  students: (id) => client.get(`/classes/${id}/students/`),
  enroll: (id, studentId) => client.post(`/classes/${id}/enroll/`, { student_id: studentId }),
  unenroll: (id, studentId) => client.post(`/classes/${id}/unenroll/`, { student_id: studentId }),
  subjects: () => client.get('/classes/subjects/'),
}
