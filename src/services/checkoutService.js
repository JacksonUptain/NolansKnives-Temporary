import { auth } from "../pages/firebase";

const BASE_URL = "https://us-central1-nolansknives.cloudfunctions.net";

async function postCheckoutEndpoint(path, payload) {
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
    throw new Error(data?.message || "Checkout request failed.");
  }

  return data;
}

export async function startKnifeCheckout(knifeId) {
  return postCheckoutEndpoint("startKnifeCheckoutHttp", { knifeId });
}

export async function createPayPalOrder(payload) {
  return postCheckoutEndpoint("createPayPalOrderHttp", payload);
}

export async function capturePayPalOrder(payload) {
  return postCheckoutEndpoint("capturePayPalOrderHttp", payload);
}
