import { httpsCallable } from "firebase/functions";
import { functions } from "../pages/firebase";

const call = (name) => httpsCallable(functions, name);

export async function setUserRole(uid, role) {
  return (await call("setUserRole")({ uid, role })).data;
}

export async function setUserBlocked(uid, blocked) {
  return (await call("setUserBlocked")({ uid, blocked })).data;
}

export async function inviteAdminUser({ displayName, email }) {
  return (await call("inviteAdminUser")({ displayName, email })).data;
}

export async function assignHistoricalPurchase(payload) {
  return (await call("assignHistoricalPurchase")(payload)).data;
}

export async function updateFulfillmentStatus(payload) {
  return (await call("updateFulfillmentStatus")(payload)).data;
}
