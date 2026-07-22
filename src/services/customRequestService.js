import { auth } from '../pages/firebase';

const BASE_URL = 'https://us-central1-nolansknives.cloudfunctions.net';

async function postCustomRequestEndpoint(path, payload) {
  const user = auth.currentUser;
  if (!user) throw new Error('You must be signed in.');

  const token = await user.getIdToken();
  const response = await fetch(`${BASE_URL}/${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify(payload)
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.message || 'Custom request payment failed.');
  }

  return data;
}

export const customRequestService = {
  /**
   * Authoritatively creates a custom knife request on the server.
   * This ensures pricing is validated and the request is correctly logged.
   */
  createRequest: async (formData) => (
    postCustomRequestEndpoint('createCustomRequestHttp', formData)
  ),

  createDepositPayPalOrder: async (requestId) => (
    postCustomRequestEndpoint('createCustomRequestDepositPayPalOrderHttp', { requestId })
  ),

  captureDepositPayPalOrder: async ({ requestId, paypalOrderId }) => (
    postCustomRequestEndpoint('captureCustomRequestDepositPayPalOrderHttp', { requestId, paypalOrderId })
  )
};
