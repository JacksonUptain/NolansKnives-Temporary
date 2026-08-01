export function getJourneyDestinationLabel(pathname = '') {
  if (!pathname) return 'your account';

  if (pathname.includes('/checkout/')) return 'checkout';
  if (pathname.includes('/my-knives')) return 'your knives';
  if (pathname.includes('/custom-knife-request')) return 'your custom request';
  if (pathname.includes('/my-account')) return 'your account';
  return 'your account';
}

export function getIncompleteShippingFields(shippingInfo = {}) {
  const requiredFields = ['fullName', 'addressLine1', 'city', 'state', 'postalCode'];

  return requiredFields.filter((field) => {
    const value = shippingInfo[field];
    return typeof value !== 'string' || !value.trim();
  });
}
