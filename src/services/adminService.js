import { httpsCallable } from "firebase/functions";
import { functions } from "../pages/firebase";

const call = (name) => httpsCallable(functions, name);

export async function setUserRole(uid, role) {
  return (await call("setUserRole")({ uid, role })).data;
}

export async function setUserBlocked(uid, blocked) {
  return (await call("setUserBlocked")({ uid, blocked })).data;
}

export async function inviteAdminUser({ displayName, email, role }) {
  return (await call("inviteAdminUser")({ displayName, email, role })).data;
}

export async function getEmailTemplateCatalog() {
  return (await call("getEmailTemplateCatalog")({})).data;
}

export async function getMailgunWebhookStatus() {
  return (await call("getMailgunWebhookStatus")({})).data;
}

export async function sendEmailCampaign(payload) {
  return (await call("sendEmailCampaign")(payload)).data;
}

export async function assignHistoricalPurchase(payload) {
  return (await call("assignHistoricalPurchase")(payload)).data;
}

export async function updateFulfillmentStatus(payload) {
  return (await call("updateFulfillmentStatus")(payload)).data;
}
