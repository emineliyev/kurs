import client from './client'

export const analyticsApi = {
  dashboard: () => client.get('/analytics/dashboard/'),
  classStats: (classId, params) => client.get(`/analytics/class/${classId}/`, { params }),
  classDetail: (classId, params) => client.get(`/analytics/class/${classId}/detail/`, { params }),
  studentResults: (studentId) => client.get(`/analytics/student/${studentId}/results/`),
  studentStats: () => client.get('/analytics/student/'),
}
