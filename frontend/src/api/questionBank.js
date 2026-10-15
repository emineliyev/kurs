import client from './client'

export const bankApi = {
  list:       ()           => client.get('/tests/bank-questions/'),
  create:     (data)       => client.post('/tests/bank-questions/', data),
  update:     (id, data)   => client.patch(`/tests/bank-questions/${id}/`, data),
  delete:     (id)         => client.delete(`/tests/bank-questions/${id}/`),
  copyToTest: (id, testId) => client.post(`/tests/bank-questions/${id}/copy_to_test/`, { test_id: testId }),
  // a whole folder (subfolders too) or `count` random questions from it
  addToTest:  (testId, { folder, count }) => client.post('/tests/bank-questions/add_to_test/', { test_id: testId, folder, count }),
  move:       (ids, folder) => client.post('/tests/bank-questions/move/', { ids, folder }),

  folders:      ()         => client.get('/tests/bank-folders/'),
  createFolder: (data)     => client.post('/tests/bank-folders/', data),
  updateFolder: (id, data) => client.patch(`/tests/bank-folders/${id}/`, data),
  deleteFolder: (id)       => client.delete(`/tests/bank-folders/${id}/`),
}
