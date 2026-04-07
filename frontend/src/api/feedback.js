import client from './client'

export const feedbackApi = {
  send: (data) => client.post('/auth/feedback/', data),
}
