import client from './client'

export const bankApi = {
  list:       ()           => client.get('/tests/bank-questions/'),
  create:     (data)       => client.post('/tests/bank-questions/', data),
  update:     (id, data)   => client.patch(`/tests/bank-questions/${id}/`, data),
  delete:     (id)         => client.delete(`/tests/bank-questions/${id}/`),
  copyToTest: (id, testId) => client.post(`/tests/bank-questions/${id}/copy_to_test/`, { test_id: testId }),
}
