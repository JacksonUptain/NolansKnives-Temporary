import { httpsCallable } from "firebase/functions";
import { functions } from "../pages/firebase";

export async function getMyPurchases() {
  const callable = httpsCallable(functions, "getMyPurchases");
  const response = await callable({});
  return response.data;
}

export async function updateOrderShippingAddress({ orderId, shippingAddress }) {
  const callable = httpsCallable(functions, "updateOrderShippingAddress");
  const response = await callable({ orderId, shippingAddress });
  return response.data;
}
