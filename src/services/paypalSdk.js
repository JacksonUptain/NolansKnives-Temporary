let loadingPromise = null;

export function loadPayPalSdk({ currency = "USD", components = "buttons,funding-eligibility", intent = "capture" } = {}) {
  if (window.paypal?.Buttons) return Promise.resolve(window.paypal);
  if (loadingPromise) return loadingPromise;

  const clientId = process.env.REACT_APP_PAYPAL_CLIENT_ID;
  if (!clientId) {
    return Promise.reject(new Error("Missing REACT_APP_PAYPAL_CLIENT_ID."));
  }

  const params = new URLSearchParams({
    "client-id": clientId,
    currency,
    intent,
    components
  });

  loadingPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `https://www.paypal.com/sdk/js?${params.toString()}`;
    script.async = true;
    script.onload = () => resolve(window.paypal);
    script.onerror = () => reject(new Error("Failed to load PayPal SDK."));
    document.body.appendChild(script);
  });

  return loadingPromise;
}
