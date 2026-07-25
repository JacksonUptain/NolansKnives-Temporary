import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { db } from './firebase';
import { ref, get, set, remove, update, push } from 'firebase/database';
import { storage } from './firebase';
import { ref as storageRef, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import './ProductEditor.css';
import LucideIcon from '../components/ui/LucideIcon';
import { showConfirm } from '../components/ConfirmDialog';
import { showToast } from '../components/Toast';

function normalizeImages(src) {
  if (Array.isArray(src)) return src.filter(Boolean);
  if (typeof src === 'string' && src.trim()) return [src.trim()];
  return [];
}

function ProductEditor() {
  const { productId } = useParams();
  const navigate = useNavigate();

  const [product, setProduct] = useState({
    name: '',
    description: '',
    price: '',
    src: [],
    sold: false,
    saleStatus: 'available',
    displayLocation: 'store',
    published: false,
    custom_id: '',
    specifications: '',
    stock: 1
  });

  const [loading, setLoading] = useState(!!productId);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [uploadingImage, setUploadingImage] = useState(null);
  const [previewMode, setPreviewMode] = useState(false);
  const [activeTab, setActiveTab] = useState('details');
  const [dirty, setDirty] = useState(false);
  const [imageOrder, setImageOrder] = useState([]);
  const [draggedIndex, setDraggedIndex] = useState(null);

  // Load existing product
  useEffect(() => {
    if (productId) {
      loadProduct();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId]);

  const loadProduct = async () => {
    try {
      setLoading(true);
      const snapshot = await get(ref(db, `Products/${productId}`));
      if (snapshot.exists()) {
        const data = snapshot.val();
        const normalizedSrc = normalizeImages(data.src);
        setProduct({
          ...data,
          id: productId,
          src: normalizedSrc,
          saleStatus: data.saleStatus || (data.sold ? 'sold' : 'available'),
          displayLocation: data.displayLocation || 'store',
          stock: data.stock || 1
        });
        setImageOrder(normalizedSrc);
        setDirty(false);
      } else {
        setError('Product not found');
      }
    } catch (err) {
      setError(`Error loading product: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleFieldChange = (field, value) => {
    setProduct(prev => ({ ...prev, [field]: value }));
    setDirty(true);
  };

  useEffect(() => {
    const warnIfUnsaved = (event) => {
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warnIfUnsaved);
    return () => window.removeEventListener('beforeunload', warnIfUnsaved);
  }, [dirty]);

  const leaveEditor = async () => {
    if (!dirty) {
      navigate('/business/products');
      return;
    }
    await showConfirm(
      'Leave without saving?',
      'Your unsaved product changes will be lost.',
      async () => navigate('/business/products')
    );
  };

  const handleImageUpload = async (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;
    setUploadingImage(`Uploading ${files.length} image(s)...`);

    try {
      const newImageUrls = [];
      for (const file of files) {
        try {
          const timestamp = Date.now();
          const fileName = `${timestamp}-${file.name}`;
          const fileRef = storageRef(storage, `products/${productId || 'draft'}/${fileName}`);

          const snapshot = await uploadBytes(fileRef, file);
          const url = await getDownloadURL(snapshot.ref);
          newImageUrls.push(url);
        } catch (uploadError) {
          console.error(`Error uploading ${file.name}:`, uploadError);
          // Continue with other files
          if (uploadError.code === 'storage/unauthorized') {
            throw new Error(`Storage permission denied. Verify user is authenticated and email verified.`);
          } else if (uploadError.code === 'storage/unauthenticated') {
            throw new Error(`Storage authentication failed. Please sign in again.`);
          }
          throw uploadError;
        }
      }

      setProduct(prev => ({
        ...prev,
        src: [...(prev.src || []), ...newImageUrls]
      }));
      setImageOrder(prev => [...prev, ...newImageUrls]);
      setDirty(true);
      setSuccess(`${files.length} image(s) uploaded successfully`);
      showToast(`${files.length} image${files.length === 1 ? '' : 's'} added.`, 'success');
    } catch (err) {
      console.error('Upload error:', err);
      const message = `Error uploading image: ${err.message || 'Storage access denied'}`;
      setError(message);
      showToast(message, 'error');
    } finally {
      setUploadingImage(null);
    }
  };

  const handleRemoveImage = async (index) => {
    try {
      const currentImages = normalizeImages(product.src);
      const imageUrl = currentImages[index];
      // Attempt to delete from storage (won't fail if image doesn't exist there)
      try {
        await deleteObject(storageRef(storage, imageUrl));
      } catch (e) {
        console.warn('Could not delete image from storage:', e);
      }

      const newImages = currentImages.filter((_, i) => i !== index);
      const newOrder = imageOrder.filter((_, i) => i !== index);
      setProduct(prev => ({ ...prev, src: newImages }));
      setImageOrder(newOrder);
      setDirty(true);
      setSuccess('Image removed');
      showToast('Image removed.', 'success');
    } catch (err) {
      const message = `Error removing image: ${err.message}`;
      setError(message);
      showToast(message, 'error');
    }
  };

  const handleDragStart = (index) => {
    setDraggedIndex(index);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  const handleDropImage = (index) => {
    if (draggedIndex === null) return;

    const newImages = normalizeImages(product.src);
    const draggedImage = newImages[draggedIndex];
    newImages.splice(draggedIndex, 1);
    newImages.splice(index, 0, draggedImage);

    setProduct(prev => ({ ...prev, src: newImages }));
    setImageOrder(newImages);
    setDirty(true);
    setDraggedIndex(null);
    setSuccess('Image order updated');
    showToast('Image order updated.', 'success');
  };

  const handleSave = async (publish = false) => {
    try {
      setError(null);
      setSaving(true);

      // Validation
      if (!product.name?.trim()) {
        setError('Product name is required');
        showToast('Product name is required.', 'error');
        return;
      }
      if (!product.price || isNaN(product.price) || product.price <= 0) {
        setError('Valid price is required');
        showToast('Enter a valid price.', 'error');
        return;
      }
      if (!normalizeImages(product.src).length) {
        setError('At least one image is required');
        showToast('Add at least one product image.', 'error');
        return;
      }

      const productData = {
        ...product,
        src: normalizeImages(product.src),
        price: Number(product.price),
        stock: Number(product.stock) || 1,
        published: publish,
        sold: product.saleStatus === 'sold',
        soldAt: product.saleStatus === 'sold' ? product.soldAt || new Date().toISOString() : null,
        updatedAt: new Date().toISOString(),
        createdAt: product.createdAt || new Date().toISOString()
      };

      if (productId) {
        // Update existing
        await update(ref(db, `Products/${productId}`), productData);
        setSuccess(`Product "${product.name}" updated successfully${publish ? ' and published!' : ''}`);
        showToast(publish ? 'Product saved and published.' : 'Product saved.', 'success');
      } else {
        // Create new - use auto ID
        const newRef = push(ref(db, 'Products'));
        const newId = newRef.key;
        productData.id = newId;
        await set(newRef, productData);
        setSuccess(`Product "${product.name}" created successfully${publish ? ' and published!' : ''}`);
        showToast(publish ? 'Product created and published.' : 'Product draft created.', 'success');
        setTimeout(() => navigate(`/business/products/${newId}`), 1500);
      }

      setDirty(false);
      if (publish) {
        setTimeout(() => navigate('/business/products'), 1500);
      }
    } catch (err) {
      const message = `Error saving product: ${err.message}`;
      setError(message);
      showToast(message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    await showConfirm(
      'Delete Product',
      `Remove "${product.name || 'this product'}" from the catalog? This cannot be undone.`,
      async () => {
        try {
          setSaving(true);

          // Delete images from storage
          for (const imageUrl of normalizeImages(product.src)) {
            try {
              await deleteObject(storageRef(storage, imageUrl));
            } catch (e) {
              console.warn('Could not delete image:', e);
            }
          }

          await remove(ref(db, `Products/${productId}`));
          setSuccess('Product deleted successfully');
          showToast('Product deleted.', 'success');
          setTimeout(() => navigate('/business/products'), 1000);
        } catch (err) {
          const message = `Error deleting product: ${err.message}`;
          setError(message);
          showToast(message, 'error');
        } finally {
          setSaving(false);
        }
      }
    );
  };

  if (loading) {
    return <div className="product-editor-container"><div className="loading-shimmer">Loading product editor...</div></div>;
  }

  if (previewMode) {
    return (
      <div className="product-editor-container">
        <div className="preview-mode">
          <button className="btn-secondary" onClick={() => setPreviewMode(false)}>
            <LucideIcon name="ArrowLeft" size={16} /> Back to Editor
          </button>
          <h2>Product Preview</h2>
          <div className="preview-content">
            <h3>{product.name}</h3>
            {product.src?.length > 0 && (
              <div className="preview-image">
                <img src={normalizeImages(product.src)[0]} alt={product.name} />
              </div>
            )}
            <p><strong>Price:</strong> ${product.price}</p>
            <p><strong>Status:</strong> {product.published ? 'Published' : 'Draft'}</p>
            {product.specifications && <p><strong>Specifications:</strong> {product.specifications}</p>}
            <p><strong>Description:</strong> {product.description}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="product-editor-container">
      <div className="product-editor">
        <div className="product-editor-header">
          <div>
            <h1>{productId ? 'Edit Product' : 'Create New Product'}</h1>
            <p>{productId ? 'Update pricing, availability, images, and storefront placement.' : 'Create a polished product record ready for the store or gallery.'}</p>
          </div>
          <button className="btn-secondary" onClick={leaveEditor} disabled={saving}>
            <LucideIcon name="ArrowLeft" size={16} /> Products
          </button>
        </div>

        {error && <div className="alert-error">{error}</div>}
        {success && <div className="alert-success">{success}</div>}
        {uploadingImage && <div className="alert-info">{uploadingImage}</div>}

        <nav className="product-editor-tabs" aria-label="Product editor sections">
          <button type="button" className={activeTab === 'details' ? 'active' : ''} onClick={() => setActiveTab('details')}>
            <LucideIcon name="FileText" size={17} />
            <span>Details</span>
            <small>{product.name && product.price ? 'Ready' : 'Required'}</small>
          </button>
          <button type="button" className={activeTab === 'images' ? 'active' : ''} onClick={() => setActiveTab('images')}>
            <LucideIcon name="Images" size={17} />
            <span>Images</span>
            <small>{normalizeImages(product.src).length} added</small>
          </button>
          <button type="button" className={activeTab === 'publishing' ? 'active' : ''} onClick={() => setActiveTab('publishing')}>
            <LucideIcon name="Store" size={17} />
            <span>Availability</span>
            <small>{product.published ? 'Published' : 'Draft'}</small>
          </button>
        </nav>

        <div className="editor-form">
          {/* Basic Info */}
          <div className="form-section" hidden={activeTab !== 'details'}>
            <h3>Product Information</h3>

            <div className="form-group">
              <label>Product Name *</label>
              <input
                type="text"
                value={product.name}
                onChange={(e) => handleFieldChange('name', e.target.value)}
                placeholder="e.g., Custom Chef's Knife"
              />
            </div>

            <div className="form-group">
              <label>Price (USD) *</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={product.price}
                onChange={(e) => handleFieldChange('price', e.target.value)}
                placeholder="0.00"
              />
            </div>

            <div className="form-group">
              <label>Stock/Quantity Available</label>
              <input
                type="number"
                min="1"
                value={product.stock}
                onChange={(e) => handleFieldChange('stock', e.target.value)}
              />
            </div>

            <div className="form-group">
              <label>Product ID / SKU</label>
              <input
                type="text"
                value={product.custom_id}
                onChange={(e) => handleFieldChange('custom_id', e.target.value)}
                placeholder="Internal reference ID"
              />
            </div>

            <div className="form-group full-width">
              <label>Description</label>
              <textarea
                value={product.description}
                onChange={(e) => handleFieldChange('description', e.target.value)}
                placeholder="Detailed product description..."
                rows="6"
              />
            </div>

            <div className="form-group full-width">
              <label>Specifications</label>
              <textarea
                value={product.specifications}
                onChange={(e) => handleFieldChange('specifications', e.target.value)}
                placeholder="Blade length, steel type, handle material, etc."
                rows="4"
              />
            </div>
          </div>

          {/* Images */}
          <div className="form-section" hidden={activeTab !== 'images'}>
            <h3>Product Images</h3>

            <div className="image-upload">
              <label htmlFor="image-input" className="btn-upload">
                <LucideIcon name="Camera" size={18} />
                <span>Add Images</span>
              </label>
              <input
                id="image-input"
                type="file"
                multiple
                accept="image/*"
                onChange={handleImageUpload}
                disabled={uploadingImage || saving}
                style={{ display: 'none' }}
              />
              <p className="help-text">You can upload multiple images at once. Drag to reorder.</p>
            </div>

            {product.src && product.src.length > 0 ? (
              <div className="image-gallery">
                {product.src.map((url, index) => (
                  <div
                    key={index}
                    className="image-item"
                    draggable
                    onDragStart={() => handleDragStart(index)}
                    onDragOver={handleDragOver}
                    onDrop={() => handleDropImage(index)}
                  >
                    <img src={url} alt={`Product ${index + 1}`} />
                    <div className="image-controls">
                      {index === 0 && <span className="badge-primary">Primary</span>}
                      <button
                        className="btn-remove"
                        onClick={() => handleRemoveImage(index)}
                        title="Remove image"
                      >
                        <LucideIcon name="X" size={16} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="no-images">No images yet. Upload some to get started.</div>
            )}
          </div>

          {/* Status */}
          <div className="form-section" hidden={activeTab !== 'publishing'}>
            <h3>Availability & Status</h3>

            <div className="form-group">
              <label>Sale Status</label>
              <select
                value={product.saleStatus}
                onChange={(e) => handleFieldChange('saleStatus', e.target.value)}
              >
                <option value="available">Available for Purchase</option>
                <option value="pending">Pending / Reserved</option>
                <option value="sold">Sold Out</option>
              </select>
            </div>

            <div className="form-group">
              <label>Display Location</label>
              <select
                value={product.displayLocation}
                onChange={(e) => handleFieldChange('displayLocation', e.target.value)}
              >
                <option value="store">Store (Main Shop)</option>
                <option value="gallery">Gallery (Featured Pieces)</option>
                <option value="both">Store and Gallery</option>
                <option value="hidden">Hidden (Not Public)</option>
              </select>
            </div>

            <div className="form-check">
              <input
                type="checkbox"
                id="published-check"
                checked={product.published}
                onChange={(e) => handleFieldChange('published', e.target.checked)}
              />
              <label htmlFor="published-check">Published (Visible to Customers)</label>
            </div>
          </div>

          {/* Actions */}
          <div className="form-section action-buttons">
            <span className={`editor-save-state ${dirty ? 'is-dirty' : ''}`}>
              <LucideIcon name={dirty ? 'Circle' : 'CircleCheck'} size={15} />
              {dirty ? 'Unsaved changes' : 'All changes saved'}
            </span>
            <button
              className="btn-secondary"
              onClick={() => setPreviewMode(true)}
              disabled={saving || !product.name}
            >
              <LucideIcon name="Eye" size={16} /> Preview
            </button>

            <button
              className="btn-primary"
              onClick={() => handleSave(false)}
              disabled={saving}
            >
              {saving ? 'Saving...' : `${productId ? 'Save Draft' : 'Create Draft'}`}
            </button>

            <button
              className="btn-success"
              onClick={() => handleSave(true)}
              disabled={saving || !product.name}
            >
              {saving ? 'Publishing...' : 'Save & Publish'}
            </button>

            {productId && (
              <button
                className="btn-danger"
                onClick={handleDelete}
                disabled={saving}
              >
                <LucideIcon name="Trash2" size={16} /> Delete
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default ProductEditor;
