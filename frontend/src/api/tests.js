import client from './client'

export const testsApi = {
  list: () => client.get('/tests/'),
  get: (id) => client.get(`/tests/${id}/`),
  create: (data) => client.post('/tests/', data),
  update: (id, data) => client.patch(`/tests/${id}/`, data),
  delete: (id) => client.delete(`/tests/${id}/`),
  duplicate: (id) => client.post(`/tests/${id}/duplicate/`),
  questions: (id) => client.get(`/tests/${id}/questions/`),
  versions: (id) => client.get(`/tests/${id}/versions/`),

  createQuestion: (data) => client.post('/tests/questions/', data),
  updateQuestion: (id, data) => client.patch(`/tests/questions/${id}/`, data),
  deleteQuestion: (id) => client.delete(`/tests/questions/${id}/`),
  reorderQuestions: (orderedIds) => client.post('/tests/questions/reorder/', { ordered_ids: orderedIds }),
}
