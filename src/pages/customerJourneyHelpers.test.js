import { getJourneyDestinationLabel, getIncompleteShippingFields } from './customerJourneyHelpers';

describe('customer journey helpers', () => {
  it('maps checkout intent to an explicit destination label', () => {
    expect(getJourneyDestinationLabel('/checkout/knife-123')).toBe('checkout');
    expect(getJourneyDestinationLabel('/my-knives')).toBe('your knives');
    expect(getJourneyDestinationLabel('/custom-knife-request')).toBe('your custom request');
  });

  it('identifies incomplete shipping fields before payment', () => {
    expect(getIncompleteShippingFields({ fullName: 'Nolan', addressLine1: '', city: 'Huntsville', state: 'AL', postalCode: '' })).toEqual(['addressLine1', 'postalCode']);
    expect(getIncompleteShippingFields({ fullName: 'Nolan', addressLine1: '123 Main', city: 'Huntsville', state: 'AL', postalCode: '35801' })).toEqual([]);
  });
});
