import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { savePurchaseIntent } from '../services/purchaseIntent';
import { formatKnifeStatus, getPublicKnifeStatus } from './knifeStatus';
import './Gallery.css';
import LucideIcon from '../components/ui/LucideIcon';
import ProductGallery from '../components/ProductGallery';
import OffScreen from './offScreen';
import { showToast } from '../components/Toast';

function Product({ product, expanded }) {
  const navigate = useNavigate();
  const { isAuthenticated, isActiveUser } = useAuth();
  const [showExpanded, setShowExpanded] = useState(false);
  const [error, setError] = useState(null);

  const safeDescription = product.description || "No description provided yet.";
  const productDescription = expanded === "Y"
    ? safeDescription
    : `${safeDescription.substring(0, 150)}${safeDescription.length > 150 ? "..." : ""}`;
  const publicStatus = getPublicKnifeStatus(product);

  const handleBuy = async (e) => {
    e.stopPropagation();
    setError(null);

    if (publicStatus !== "available") {
      const message = `This knife is currently ${formatKnifeStatus(publicStatus)}.`;
      setError(message);
      showToast(message, "warning");
      return;
    }

    if (!isAuthenticated) {
      savePurchaseIntent({ knifeId: product.id, returnTo: "/Store" });
      showToast("Sign in to continue checkout.", "info");
      navigate("/account", { state: { from: `/checkout/${product.id}` } });
      return;
    }

    if (!isActiveUser) {
      const message = "Your account is not active yet. Please contact Nolan's Knives before checkout.";
      setError(message);
      showToast(message, "warning");
      return;
    }

    navigate(`/checkout/${product.id}`);
  };

  // ---- Helper to render shared content ----
  const renderContent = () => (
    <div className="product-card" onClick={() => {if(expanded !== "Y") setShowExpanded(true)}}>
      {error && <div className="error-message"><LucideIcon name="AlertTriangle" size={18} /> {error}</div>}

      <div className="product-info">
        <h2 className="product-title">{product.name}</h2>
        <p className="product-description">{productDescription}</p>
        <span className="price-badge">
          {formatKnifeStatus(publicStatus)} - ${product.price} USD
        </span>
      </div>

      {!product.src || product.src.length === 0 ? (
        <div className="no-image">No image available</div>
      ) : product.src.length === 1 ? (
        <img
          alt={productDescription}
          src={product.src[0]}
          id="productImage"
          style={{ width: '100%', height: 180, objectFit: 'cover', borderRadius: 12 }}
        />
      ) : (
        <div onClick={(e) => { if (expanded !== "Y") setShowExpanded(true); e.stopPropagation(); }}>
          <ProductGallery items={product.src} alt={product.name} />
        </div>
      )}

      {publicStatus === "available" ? (
        <button
          className="buy-button"
          onClick={handleBuy}
        >
          Buy Now - ${product.price} USD
        </button>
      ) : (
        <button className="buy-button" disabled>
          {formatKnifeStatus(publicStatus)}
        </button>
      )}
    </div>
  );

  // ---- Expanded fullscreen via OffScreen ----
  if (showExpanded) {
    return (
      <OffScreen buttonText="" product={product} onHide={() => setShowExpanded(false)}>
        {renderContent()}
      </OffScreen>
    );
  }

  // ---- Default product ----
  return renderContent();
}

export default Product;
