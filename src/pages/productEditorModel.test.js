import { buildProductPayload } from './productEditorModel';

describe('buildProductPayload', () => {
  it('publishes the product and records a sold timestamp when sold is selected', () => {
    const product = {
      id: 'abc123',
      name: 'Wave Knife',
      description: 'A clean everyday carry.',
      price: '980',
      src: ['https://example.com/knife.jpg'],
      stock: '2',
      saleStatus: 'sold',
      published: false,
      custom_id: 'WK-01',
      specifications: 'Steel: CPM S35VN',
      createdAt: '2024-01-01T00:00:00.000Z'
    };

    const payload = buildProductPayload(product, { publish: true, now: '2024-02-01T00:00:00.000Z' });

    expect(payload).toMatchObject({
      id: 'abc123',
      name: 'Wave Knife',
      published: true,
      sold: true,
      soldAt: '2024-02-01T00:00:00.000Z',
      price: 980,
      stock: 2,
      src: ['https://example.com/knife.jpg']
    });
    expect(payload.updatedAt).toBe('2024-02-01T00:00:00.000Z');
    expect(payload.createdAt).toBe('2024-01-01T00:00:00.000Z');
  });

  it('normalizes featured visibility to a boolean flag', () => {
    const product = {
      name: 'Featured Knife',
      price: '540',
      src: ['https://example.com/featured.jpg'],
      stock: 1,
      saleStatus: 'available',
      published: true,
      featured: 'true'
    };

    const payload = buildProductPayload(product, { publish: true, now: '2024-03-01T00:00:00.000Z' });

    expect(payload.featured).toBe(true);
  });

  it('keeps a draft unpublished when the visibility toggle is off', () => {
    const product = {
      name: 'Draft Knife',
      price: '120',
      src: ['https://example.com/draft.jpg'],
      stock: 1,
      saleStatus: 'available',
      published: true
    };

    const payload = buildProductPayload(product, { publish: false, now: '2024-03-01T00:00:00.000Z' });

    expect(payload.published).toBe(false);
    expect(payload.sold).toBe(false);
    expect(payload.soldAt).toBeNull();
    expect(payload.price).toBe(120);
  });
});
