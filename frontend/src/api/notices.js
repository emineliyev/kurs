import client from './client'

export const noticesApi = {
  // teacher
  list:       ()     => client.get('/notices/'),
  recipients: ()     => client.get('/notices/recipients/'),
  send:       (data) => client.post('/notices/', data),
  remove:     (id)   => client.delete(`/notices/${id}/`),
  readers:    (id)   => client.get(`/notices/${id}/readers/`),
  // student
  inbox:      ()     => client.get('/notices/inbox/'),
  markRead:   (ids)  => client.post('/notices/inbox/', ids ? { ids } : {}),
  unread:     ()     => client.get('/notices/inbox/unread/'),
}
