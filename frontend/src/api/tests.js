import client from './client'

export const testsApi = {
  list: () => client.get('/tests/'),
  get: (id) => client.get(`/tests/${id}/`),
  // print pages ask with ?print=1: printing needs a live subscription
  getForPrint: (id) => client.get(`/tests/${id}/`, { params: { print: 1 } }),
  create: (data) => client.post('/tests/', data),
  update: (id, data) => client.patch(`/tests/${id}/`, data),
  delete: (id) => client.delete(`/tests/${id}/`),
  duplicate: (id) => client.post(`/tests/${id}/duplicate/`),
  questions: (id) => client.get(`/tests/${id}/questions/`),
  questionsForPrint: (id) => client.get(`/tests/${id}/questions/`, { params: { print: 1 } }),
  versions: (id) => client.get(`/tests/${id}/versions/`),

  createQuestion: (data) => client.post('/tests/questions/', data),
  updateQuestion: (id, data) => client.patch(`/tests/questions/${id}/`, data),
  deleteQuestion: (id) => client.delete(`/tests/questions/${id}/`),
  reorderQuestions: (orderedIds) => client.post('/tests/questions/reorder/', { ordered_ids: orderedIds }),
  // the answer key can be corrected even after students answered; the server re-marks them
  fixKey: (id, data) => client.post(`/tests/questions/${id}/fix_key/`, data),
}
