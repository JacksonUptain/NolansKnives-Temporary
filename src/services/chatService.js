import { auth, functions } from "../pages/firebase";
import { httpsCallable } from "firebase/functions";

const BASE_URL = "https://us-central1-nolansknives.cloudfunctions.net";

async function postChatEndpoint(path, payload) {
  const user = auth.currentUser;
  if (!user) throw new Error("You must be signed in.");

  const token = await user.getIdToken();
  const response = await fetch(`${BASE_URL}/${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify(payload)
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.message || "Failed to send message.");
  }

  return data;
}

export async function sendChatMessage({ orderId, text }) {
  return postChatEndpoint("sendChatMessageHttp", { orderId, text });
}

export async function sendStaffMessage({ orderId, text }) {
  return postChatEndpoint("sendStaffMessageHttp", { orderId, text });
}

export async function markConversationRead({ orderId }) {
  const callable = httpsCallable(functions, "markConversationRead");
  const response = await callable({ orderId });
  return response.data;
}

export async function markCustomerConversationRead({ orderId }) {
  const callable = httpsCallable(functions, "markCustomerConversationRead");
  const response = await callable({ orderId });
  return response.data;
}
