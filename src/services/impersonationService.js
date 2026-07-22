import { httpsCallable } from "firebase/functions";
import { functions } from "../pages/firebase";

export async function createImpersonationSession(targetUid, reason) {
  const callable = httpsCallable(functions, "createImpersonationSession");
  const response = await callable({ targetUid, reason });
  return response.data;
}
