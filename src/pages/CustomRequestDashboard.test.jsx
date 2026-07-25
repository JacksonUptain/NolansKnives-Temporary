import { getEmailActivityRows } from './CustomRequestDashboard';

jest.mock('./firebase', () => ({ db: {} }));
jest.mock('firebase/database', () => ({
  onValue: jest.fn(),
  ref: jest.fn(),
  serverTimestamp: jest.fn(),
  update: jest.fn()
}));
jest.mock('../services/emailService', () => ({
  emailService: { sendQuote: jest.fn() }
}));
jest.mock('../services/customRequestService', () => ({
  customRequestService: { requestFinalPayment: jest.fn() }
}));

describe('custom request email activity', () => {
  test.each([null, undefined, false, '', [], { emailActivity: null }, { emailActivity: [] }])(
    'returns an empty list for an absent or malformed request: %p',
    (request) => {
      expect(getEmailActivityRows(request)).toEqual([]);
    }
  );

  test('ignores malformed activity rows and preserves valid tracked activity', () => {
    const rows = getEmailActivityRows({
      emailActivity: {
        missing: null,
        invalid: 'not-an-object',
        quote: {
          emailPurpose: 'quote',
          recipient: 'customer@example.com',
          sentAt: 100,
          counts: {
            delivered: 1,
            opens: 2
          }
        }
      }
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      key: 'quote',
      label: 'Quote email',
      recipient: 'customer@example.com',
      lastEventLabel: 'Sent'
    });
    expect(rows[0].metrics).toContainEqual(['Delivered', 1]);
    expect(rows[0].metrics).toContainEqual(['Opens', 2]);
  });
});
