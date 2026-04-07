import client from './client'

export const paymentsApi = {
  getRequisites: () =>
    client.get('/payments/requisites/'),

  submitRequest: (formData) =>
    client.post('/payments/submit/', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),

  getMyRequests: () =>
    client.get('/payments/my-requests/'),
}
