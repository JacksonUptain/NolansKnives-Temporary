import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { db } from './firebase';
import { ref, onValue, update } from 'firebase/database';
import './ProductCatalog.css';
import LucideIcon from '../components/ui/LucideIcon';

function ProductCatalog() {
  const navigate = useNavigate();

  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [sortBy, setSortBy] = useState('recent');

  useEffect(() => {
    loadProducts();
  }, []);

  const loadProducts = () => {
    try {
      const productsRef = ref(db, 'Products');
      const unsubscribe = onValue(productsRef, (snapshot) => {
        const data = snapshot.val();
        if (data) {
          const productArray = Object.entries(data).map(([id, value]) => ({
            id,
            ...value
          }));
          setProducts(productArray);
        } else {
          setProducts([]);
        }
        setLoading(false);
      });
      return unsubscribe;
    } catch (err) {
      setError(`Error loading products: ${err.message}`);
      setLoading(false);
    }
  };

  const handleStatusChange = async (productId, newStatus) => {
    try {
      await update(ref(db, `Products/${productId}`), {
        saleStatus: newStatus
      });
    } catch (err) {
      setError(`Error updating status: ${err.message}`);
    }
  };

  const handlePublishToggle = async (productId, currentPublished) => {
    try {
      await update(ref(db, `Products/${productId}`), {
        published: !currentPublished
      });
    } catch (err) {
      setError(`Error updating published status: ${err.message}`);
    }
  };

  const filteredProducts = products.filter(product => {
    const matchesSearch = !searchTerm ||
      product.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      product.custom_id?.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesFilter = filterStatus === 'all' ||
      (filterStatus === 'published' && product.published) ||
      (filterStatus === 'draft' && !product.published) ||
      (filterStatus === 'sold' && product.saleStatus === 'sold') ||
      (filterStatus === 'available' && product.saleStatus === 'available');

    return matchesSearch && matchesFilter;
  }).sort((a, b) => {
    switch (sortBy) {
      case 'name':
        return (a.name || '').localeCompare(b.name || '');
      case 'price-asc':
        return (a.price || 0) - (b.price || 0);
      case 'price-desc':
        return (b.price || 0) - (a.price || 0);
      case 'recent':
      default:
        return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
    }
  });

  if (loading) {
    return <div className="catalog-container"><div className="spinner">Loading products...</div></div>;
  }

  return (
    <div className="catalog-container">
      <div className="catalog-header">
        <h1>Product Catalog</h1>
        <button className="btn-create" onClick={() => navigate('/business/product/new')}>
          ➕ Create New Product
        </button>
      </div>

      {error && <div className="alert-error">{error}</div>}

      <div className="catalog-controls">
        <input
          type="search"
          className="search-box"
          placeholder="Search by name or SKU..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />

        <select
          className="filter-select"
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
        >
          <option value="all">All Products</option>
          <option value="published">Published</option>
          <option value="draft">Draft</option>
          <option value="available">Available</option>
          <option value="sold">Sold Out</option>
        </select>

        <select
          className="sort-select"
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
        >
          <option value="recent">Recent</option>
          <option value="name">Name (A-Z)</option>
          <option value="price-asc">Price (Low to High)</option>
          <option value="price-desc">Price (High to Low)</option>
        </select>
      </div>

      <div className="products-count">
        Showing {filteredProducts.length} of {products.length} products
      </div>

      {filteredProducts.length === 0 ? (
        <div className="empty-state">
          <p>No products found. {products.length === 0 ? 'Create your first product to get started!' : 'Try adjusting your filters.'}</p>
          {products.length === 0 && (
            <button className="btn-create" onClick={() => navigate('/business/product/new')}>
              ➕ Create Your First Product
            </button>
          )}
        </div>
      ) : (
        <div className="products-table-wrapper">
          <table className="products-table">
            <thead>
              <tr>
                <th>Image</th>
                <th>Product Name</th>
                <th>SKU</th>
                <th>Price</th>
                <th>Status</th>
                <th>Published</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredProducts.map(product => (
                <tr key={product.id} className={!product.published ? 'draft-row' : ''}>
                  <td className="image-cell">
                    {product.src && product.src.length > 0 ? (
                      <img src={product.src[0]} alt={product.name} />
                    ) : (
                      <div className="no-image">No image</div>
                    )}
                  </td>
                  <td className="name-cell">
                    <strong>{product.name}</strong>
                    {!product.published && <span className="badge-draft">Draft</span>}
                  </td>
                  <td className="sku-cell">{product.custom_id || '—'}</td>
                  <td className="price-cell">${product.price || '0.00'}</td>
                  <td className="status-cell">
                    <select
                      value={product.saleStatus || 'available'}
                      onChange={(e) => handleStatusChange(product.id, e.target.value)}
                      className="status-select"
                    >
                      <option value="available">Available</option>
                      <option value="reserved">Reserved</option>
                      <option value="sold">Sold</option>
                      <option value="custom">Made to Order</option>
                    </select>
                  </td>
                  <td className="published-cell">
                    <button
                      className={`btn-publish ${product.published ? 'published' : 'draft'}`}
                      onClick={() => handlePublishToggle(product.id, product.published)}
                      title={product.published ? 'Click to unpublish' : 'Click to publish'}
                    >
                      {product.published ? (<><LucideIcon name="Globe" size={14} /> Live</>) : (<><LucideIcon name="Lock" size={14} /> Draft</>)}
                    </button>
                  </td>
                  <td className="actions-cell">
                    <button
                      className="btn-action btn-edit"
                      onClick={() => navigate(`/business/product/${product.id}`)}
                      title="Edit product"
                    >
                      <LucideIcon name="Edit2" size={14} /> Edit
                    </button>
                    <button
                      className="btn-action btn-view"
                      onClick={() => navigate(`/product/${product.id}`)}
                      title="View public page"
                      target="_blank"
                    >
                      <LucideIcon name="Eye" size={14} /> View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default ProductCatalog;
