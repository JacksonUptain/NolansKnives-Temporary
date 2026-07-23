import { auth } from "../pages/firebase";

const FUNCTIONS_BASE_URL = "https://us-central1-nolansknives.cloudfunctions.net";

export async function callHttpFunction(name, payload = {}) {
  const user = auth.currentUser;
  if (!user) throw new Error("You must be signed in.");

  const token = await user.getIdToken();
  const response = await fetch(`${FUNCTIONS_BASE_URL}/${name}`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.message || data?.error || "Request failed.");
  }

  return data;
}
