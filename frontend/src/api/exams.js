import client from './client'

export const examsApi = {
  list: (params) => client.get('/exams/', { params }),
  get: (id) => client.get(`/exams/${id}/`),
  create: (data) => client.post('/exams/', data),
  update: (id, data) => client.patch(`/exams/${id}/`, data),
  delete: (id) => client.delete(`/exams/${id}/`),
  start: (id) => client.post(`/exams/${id}/start/`),
  submit: (id, answers) => client.post(`/exams/${id}/submit/`, { answers }),
  tabSwitch: (id) => client.patch(`/exams/${id}/tab_switch/`),
  myResult: (id) => client.get(`/exams/${id}/my_result/`),
  results: (id) => client.get(`/exams/${id}/results/`),
  resultDetail: (id, studentId) => client.get(`/exams/${id}/result_detail/?student_id=${studentId}`),
  gradeAnswer: (id, data) => client.post(`/exams/${id}/grade_answer/`, data),
  needsGradingCount: () => client.get('/exams/needs_grading_count/'),
}
