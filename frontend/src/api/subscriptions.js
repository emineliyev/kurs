import client from './client'

export const subscriptionsApi = {
  plans:          ()            => client.get('/subscriptions/plans/'),
  signupGift:     ()            => client.get('/subscriptions/signup-gift/'),   // running sign-up campaign or null
  mySubscription: ()            => client.get('/subscriptions/my/'),
  subscribe:      (planId, ref) => client.post('/subscriptions/my/', { plan_id: planId, payment_reference: ref }),
  downgrade:      (planId)      => client.post('/subscriptions/downgrade/', { plan_id: planId }),
  cancel:         ()            => client.post('/subscriptions/cancel/'),
  resume:         ()            => client.post('/subscriptions/resume/'),
  previewUpgrade: (planId)      => client.get(`/subscriptions/preview/${planId}/`),
}
