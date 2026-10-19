import client from './client'

export const examsApi = {
  list: (params) => client.get('/exams/', { params }),
  get: (id) => client.get(`/exams/${id}/`),
  create: (data) => client.post('/exams/', data),
  update: (id, data) => client.patch(`/exams/${id}/`, data),
  delete: (id) => client.delete(`/exams/${id}/`),
  bulkDelete: (ids) => client.post('/exams/bulk_delete/', { exam_ids: ids }),
  archive: (ids, archived = true) => client.post('/exams/archive/', { exam_ids: ids, archived }),
  start: (id) => client.post(`/exams/${id}/start/`),
  submit: (id, answers) => client.post(`/exams/${id}/submit/`, { answers }),
  tabSwitch: (id) => client.patch(`/exams/${id}/tab_switch/`),
  myResult: (id) => client.get(`/exams/${id}/my_result/`),
  saveDraft: (id, answers) => client.patch(`/exams/${id}/save_draft/`, { answers }),
  results: (id) => client.get(`/exams/${id}/results/`),
  absent: (id) => client.get(`/exams/${id}/absent/`),
  saveOffline: (id, data) => client.post(`/exams/${id}/offline_result/`, data),
  deleteOffline: (id, studentId) => client.delete(`/exams/${id}/offline_result/`, { params: { student_id: studentId } }),
  reportCards: (id, studentId) => client.get(`/exams/${id}/report_cards/`, { params: studentId ? { student_id: studentId } : {} }),
  resultDetail: (id, studentId) => client.get(`/exams/${id}/result_detail/?student_id=${studentId}`),
  gradeAnswer: (id, data) => client.post(`/exams/${id}/grade_answer/`, data),
  needsGradingCount: () => client.get('/exams/needs_grading_count/'),
}
