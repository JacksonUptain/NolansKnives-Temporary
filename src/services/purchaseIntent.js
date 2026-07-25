const STORAGE_KEY = "nk_purchase_intent";
const MAX_INTENT_AGE_MS = 60 * 60 * 1000;

export function savePurchaseIntent({ knifeId, returnTo = "/store" }) {
  if (!knifeId) return;
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ knifeId, returnTo, savedAt: Date.now() }));
}

export function readPurchaseIntent() {
  const raw = sessionStorage.getItem(STORAGE_KEY);
  if (!raw) return null;

  try {
    const intent = JSON.parse(raw);
    if (!intent?.knifeId || !intent?.savedAt || Date.now() - Number(intent.savedAt) > MAX_INTENT_AGE_MS) {
      sessionStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return intent;
  } catch {
    sessionStorage.removeItem(STORAGE_KEY);
    return null;
  }
}

export function clearPurchaseIntent() {
  sessionStorage.removeItem(STORAGE_KEY);
}
