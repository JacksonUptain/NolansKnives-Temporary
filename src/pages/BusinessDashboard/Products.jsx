import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ref, onValue, update, remove, serverTimestamp } from 'firebase/database';
import { db } from '../firebase';
import { getPublicKnifeStatus, formatKnifeStatus } from '../knifeStatus';
import { showToast } from '../../components/Toast';
import { showConfirm } from '../../components/ConfirmDialog';
import LucideIcon from '../../components/ui/LucideIcon';
import '../BusinessDashboard.css';

const STATUS_OPTIONS = ['all', 'available', 'pending', 'sold'];
const LOCATION_OPTIONS = ['all', 'store', 'gallery', 'both', 'hidden'];

function formatCurrency(value) {
  const amount = Number(value || 0);
  return `$${amount.toFixed(2)}`;
}

function formatDate(value) {
  if (!value) return 'Not updated';
  const date = typeof value === 'number' ? new Date(value) : new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not updated';
  return date.toLocaleDateString();
}

function primaryImage(product) {
  if (Array.isArray(product.src)) return product.src[0] || '';
  return product.src || '';
}

export default function Products() {
  const navigate = useNavigate();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [locationFilter, setLocationFilter] = useState('all');
  const [savingProductId, setSavingProductId] = useState('');

  useEffect(() => {
    const unsub = onValue(ref(db, 'Products'), (snapshot) => {
      const data = snapshot.val();
      const list = data
        ? Object.entries(data).map(([productId, value]) => ({ productId, ...value }))
        : [];

      list.sort((a, b) => {
        const aUpdated = new Date(a.updatedAt || a.createdAt || 0).getTime();
        const bUpdated = new Date(b.updatedAt || b.createdAt || 0).getTime();
        return bUpdated - aUpdated;
      });

      setProducts(list);
      setLoading(false);
      setError('');
    }, (err) => {
      setError(err?.message || 'Failed to load products');
      setLoading(false);
    });

    return () => unsub();
  }, []);

  const stats = useMemo(() => {
    const available = products.filter((product) => getPublicKnifeStatus(product) === 'available').length;
    const pending = products.filter((product) => getPublicKnifeStatus(product) === 'pending').length;
    const sold = products.filter((product) => getPublicKnifeStatus(product) === 'sold').length;
    const visible = products.filter((product) => (product.displayLocation || 'store') !== 'hidden').length;
    return { available, pending, sold, visible };
  }, [products]);

  const filteredProducts = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();

    return products.filter((product) => {
      const publicStatus = getPublicKnifeStatus(product);
      const displayLocation = product.displayLocation || 'store';
      const matchesSearch = !normalizedSearch ||
        product.name?.toLowerCase().includes(normalizedSearch) ||
        product.description?.toLowerCase().includes(normalizedSearch) ||
        product.custom_id?.toLowerCase().includes(normalizedSearch);
      const matchesStatus = statusFilter === 'all' || publicStatus === statusFilter || product.saleStatus === statusFilter;
      const matchesLocation = locationFilter === 'all' || displayLocation === locationFilter;
      return matchesSearch && matchesStatus && matchesLocation;
    });
  }, [products, searchTerm, statusFilter, locationFilter]);

  const updateProductPatch = async (productId, patch, successMessage) => {
    try {
      setSavingProductId(productId);
      await update(ref(db, `Products/${productId}`), {
        ...patch,
        updatedAt: serverTimestamp()
      });
      showToast(successMessage, 'success');
    } catch (err) {
      const message = err?.message || 'Failed to update product';
      setError(message);
      showToast(message, 'error');
    } finally {
      setSavingProductId('');
    }
  };

  const handleStatusChange = (product, saleStatus) => {
    updateProductPatch(
      product.productId,
      {
        saleStatus,
        sold: saleStatus === 'sold',
        soldAt: saleStatus === 'sold' ? product.soldAt || serverTimestamp() : null
      },
      `"${product.name || 'Knife'}" marked ${formatKnifeStatus(saleStatus)}.`
    );
  };

  const handleLocationChange = (product, displayLocation) => {
    updateProductPatch(
      product.productId,
      { displayLocation },
      `"${product.name || 'Knife'}" visibility updated.`
    );
  };

  const handleLikesVisibilityChange = (product, likesVisible) => {
    updateProductPatch(
      product.productId,
      { likesVisible },
      `"${product.name || 'Knife'}" like button ${likesVisible ? 'shown' : 'hidden'}.`
    );
  };

  const handleDeleteProduct = async (product) => {
    await showConfirm(
      'Delete Knife',
      `Remove "${product.name || 'this knife'}" from the catalog? This action cannot be undone.`,
      async () => {
        try {
          setSavingProductId(product.productId);
          await remove(ref(db, `Products/${product.productId}`));
          showToast('Knife deleted from catalog.', 'success');
        } catch (err) {
          showToast(err?.message || 'Failed to delete knife', 'error');
        } finally {
          setSavingProductId('');
        }
      }
    );
  };

  if (loading) {
    return (
      <div className="business-workspace">
        <div className="loading-shimmer">Loading product catalog...</div>
      </div>
    );
  }

  return (
    <div className="business-workspace business-products-page">
      <div className="workspace-hero">
        <div>
          <h1>Products</h1>
          <p>Manage public visibility, availability, pricing, and product storytelling from one place.</p>
        </div>
        <button className="action-btn workspace-primary-action" onClick={() => navigate('/business/products/new')}>
          <LucideIcon name="Plus" size={16} /> Create Product
        </button>
      </div>

      {error && <div className="alert-error">{error}</div>}

      <div className="workspace-stats">
        <div className="stat-card compact"><span>Available</span><strong>{stats.available}</strong></div>
        <div className="stat-card compact"><span>Pending</span><strong>{stats.pending}</strong></div>
        <div className="stat-card compact"><span>Sold</span><strong>{stats.sold}</strong></div>
        <div className="stat-card compact"><span>Visible</span><strong>{stats.visible}</strong></div>
      </div>

      <div className="workspace-toolbar">
        <label className="toolbar-search">
          <LucideIcon name="Search" size={16} />
          <input
            placeholder="Search products, descriptions, or SKU"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
          />
        </label>

        <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} aria-label="Filter by status">
          {STATUS_OPTIONS.map((status) => (
            <option key={status} value={status}>{status === 'all' ? 'All statuses' : formatKnifeStatus(status)}</option>
          ))}
        </select>

        <select value={locationFilter} onChange={(event) => setLocationFilter(event.target.value)} aria-label="Filter by location">
          {LOCATION_OPTIONS.map((location) => (
            <option key={location} value={location}>{location === 'all' ? 'All locations' : location}</option>
          ))}
        </select>
      </div>

      {filteredProducts.length === 0 ? (
        <div className="empty-state refined">
          <LucideIcon name="PackageOpen" size={42} />
          <h2>No products match this view.</h2>
          <p>Create a product or adjust the filters to see more catalog items.</p>
          <button className="action-btn" onClick={() => navigate('/business/products/new')}>Create Product</button>
        </div>
      ) : (
        <div className="product-workspace-grid">
          {filteredProducts.map((product) => {
            const image = primaryImage(product);
            const publicStatus = getPublicKnifeStatus(product);
            const displayLocation = product.displayLocation || 'store';
            const isSaving = savingProductId === product.productId;

            return (
              <article className="business-product-card" key={product.productId}>
                <div className="business-product-image">
                  {image ? (
                    <img src={image} alt={product.name || 'Knife'} />
                  ) : (
                    <div className="image-placeholder"><LucideIcon name="Image" size={26} /> No image</div>
                  )}
                  <span className={`status-badge status-${publicStatus}`}>{formatKnifeStatus(publicStatus)}</span>
                </div>

                <div className="business-product-body">
                  <div className="product-title-row">
                    <h2>{product.name || 'Untitled knife'}</h2>
                    <strong>{formatCurrency(product.price)}</strong>
                  </div>
                  <p>{product.description || 'No product description yet.'}</p>

                  <div className="product-meta-grid">
                    <div><span>Visibility</span><strong>{displayLocation}</strong></div>
                    <div><span>Updated</span><strong>{formatDate(product.updatedAt || product.createdAt)}</strong></div>
                    <div><span>Images</span><strong>{Array.isArray(product.src) ? product.src.length : image ? 1 : 0}</strong></div>
                    <div><span>SKU</span><strong>{product.custom_id || 'Not set'}</strong></div>
                  </div>

                  <div className="product-quick-controls">
                    <label>
                      <span>Status</span>
                      <select
                        value={product.saleStatus || publicStatus}
                        onChange={(event) => handleStatusChange(product, event.target.value)}
                        disabled={isSaving}
                      >
                        <option value="available">Available</option>
                        <option value="pending">Pending / Reserved</option>
                        <option value="sold">Sold</option>
                      </select>
                    </label>
                    <label>
                      <span>Location</span>
                      <select
                        value={displayLocation}
                        onChange={(event) => handleLocationChange(product, event.target.value)}
                        disabled={isSaving}
                      >
                        <option value="store">Store</option>
                        <option value="gallery">Gallery</option>
                        <option value="both">Both</option>
                        <option value="hidden">Hidden</option>
                      </select>
                    </label>
                    <label>
                      <span>Likes</span>
                      <select
                        value={product.likesVisible === false ? 'hidden' : 'visible'}
                        onChange={(event) => handleLikesVisibilityChange(product, event.target.value === 'visible')}
                        disabled={isSaving}
                      >
                        <option value="visible">Visible</option>
                        <option value="hidden">Hidden</option>
                      </select>
                    </label>
                  </div>

                  <div className="product-card-actions">
                    <button className="action-btn secondary" onClick={() => navigate(`/product/${product.productId}`)}>
                      <LucideIcon name="ExternalLink" size={15} /> View
                    </button>
                    <button className="action-btn" onClick={() => navigate(`/business/products/${product.productId}`)}>
                      <LucideIcon name="Pencil" size={15} /> Edit
                    </button>
                    <button className="action-btn danger" onClick={() => handleDeleteProduct(product)} disabled={isSaving}>
                      <LucideIcon name="Trash2" size={15} /> {isSaving ? 'Working...' : 'Delete'}
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
