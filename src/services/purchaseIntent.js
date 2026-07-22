const STORAGE_KEY = "nk_purchase_intent";

export function savePurchaseIntent({ knifeId, returnTo = "/Store" }) {
  if (!knifeId) return;
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ knifeId, returnTo, savedAt: Date.now() }));
}

export function readPurchaseIntent() {
  const raw = sessionStorage.getItem(STORAGE_KEY);
  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function clearPurchaseIntent() {
  sessionStorage.removeItem(STORAGE_KEY);
}
