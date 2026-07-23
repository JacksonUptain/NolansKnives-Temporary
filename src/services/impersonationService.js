import { callHttpFunction } from "./httpFunctions";

export async function createImpersonationSession(targetUid, reason) {
  return callHttpFunction("createImpersonationSessionHttp", { targetUid, reason });
}
