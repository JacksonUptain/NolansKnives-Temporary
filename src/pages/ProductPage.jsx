import React, { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ref, get } from 'firebase/database';
import { useAuth } from '../auth/AuthProvider';
import { db } from './firebase';
import { savePurchaseIntent } from '../services/purchaseIntent';
import ProductGallery from '../components/ProductGallery';
import LucideIcon from '../components/ui/LucideIcon';
import Skeleton from '../components/ui/Skeleton';
import { formatKnifeStatus, getPublicKnifeStatus } from './knifeStatus';
import { showToast } from '../components/Toast';
import './ProductPage.css';

function normalizeImages(src) {
  const images = Array.isArray(src)
    ? src.filter(Boolean)
    : (typeof src === 'string' && src.trim() ? [src.trim()] : []);

  return [...images].sort((a, b) => Number(isSiteIconImage(a)) - Number(isSiteIconImage(b)));
}

function isSiteIconImage(src) {
  const value = String(src || '').toLowerCase();
  return value.includes('favicon') || value.includes('.ico') || value.includes('%2ffavicon');
}

function formatCurrency(value) {
  const amount = Number(value || 0);
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(Number.isFinite(amount) ? amount : 0);
}

function splitLines(value) {
  return String(value || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function splitParagraphs(value) {
  const blocks = String(value || '')
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);

  if (blocks.length) return blocks;
  return ['A finished Nolan\'s Knives piece with the materials, proportions, and final edge already dialed in.'];
}

function parseSpecLine(line) {
  const [label, ...rest] = line.split(':');
  if (rest.length === 0) {
    return { label: 'Detail', value: line };
  }
  return {
    label: label.trim() || 'Detail',
    value: rest.join(':').trim() || line,
  };
}

function ProductPage() {
  const { productId } = useParams();
  const navigate = useNavigate();
  const { isAuthenticated, isActiveUser } = useAuth();

  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [buyError, setBuyError] = useState(null);
  const [shareNotice, setShareNotice] = useState('');

  useEffect(() => {
    let mounted = true;

    async function loadProduct() {
      try {
        setLoading(true);
        setError(null);
        setBuyError(null);

        const snapshot = await get(ref(db, `Products/${productId}`));
        if (!mounted) return;

        if (!snapshot.exists()) {
          setError('Product not found.');
          setProduct(null);
          return;
        }

        const data = snapshot.val();
        const displayLocation = data.displayLocation || 'store';
        const publicLocation = displayLocation === 'store' || displayLocation === 'both';

        if (data.published === false || !publicLocation) {
          setError('This product is not currently available.');
          setProduct(null);
          return;
        }

        setProduct({ ...data, id: productId });
      } catch (err) {
        if (mounted) setError(`Error loading product: ${err.message}`);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    loadProduct();
    return () => {
      mounted = false;
    };
  }, [productId]);

  const images = useMemo(() => normalizeImages(product?.src), [product?.src]);
  const publicStatus = useMemo(() => getPublicKnifeStatus(product || {}), [product]);
  const isAvailable = publicStatus === 'available';
  const specLines = useMemo(() => splitLines(product?.specifications), [product?.specifications]);
  const specRows = useMemo(() => specLines.map(parseSpecLine), [specLines]);
  const fallbackSpecRows = useMemo(() => {
    if (!product) return [];

    return [
      { label: 'Status', value: formatKnifeStatus(publicStatus) },
      { label: 'Price', value: formatCurrency(product.price) },
    ].filter(Boolean);
  }, [product, publicStatus]);
  const visibleSpecRows = specRows.length ? specRows : fallbackSpecRows;
  const descriptionBlocks = useMemo(() => splitParagraphs(product?.description), [product?.description]);

  const handleBuyNow = () => {
    setBuyError(null);

    if (!isAvailable) {
      const message = `This knife is currently ${formatKnifeStatus(publicStatus)}.`;
      setBuyError(message);
      showToast(message, 'warning');
      return;
    }

    if (!isAuthenticated) {
      savePurchaseIntent({ knifeId: productId, returnTo: `/product/${productId}` });
      showToast('Sign in to continue checkout.', 'info');
      navigate('/account', { state: { from: `/checkout/${productId}` } });
      return;
    }

    if (!isActiveUser) {
      const message = 'Your account is not active yet. Please contact Nolan\'s Knives before checkout.';
      setBuyError(message);
      showToast(message, 'warning');
      return;
    }

    navigate(`/checkout/${productId}`);
  };

  const handleShare = async () => {
    const url = window.location.href;
    const text = `Check out ${product?.name || 'this knife'} from Nolan's Knives.`;
    setShareNotice('');

    try {
      if (navigator.share) {
        await navigator.share({
          title: product?.name || 'Nolan\'s Knives',
          text,
          url,
        });
        showToast('Shared.', 'success');
        return;
      }

      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        setShareNotice('Link copied');
        showToast('Link copied.', 'success');
        return;
      }

      setShareNotice('Copy the page link from your browser');
      showToast('Copy the page link from your browser.', 'info');
    } catch (err) {
      if (err?.name !== 'AbortError') {
        setShareNotice('Sharing is not available right now');
        showToast('Sharing is not available right now.', 'warning');
      }
    }
  };

  if (loading) {
    return (
      <main className="product-page">
        <div className="product-loading-layout">
          <Skeleton height="640px" />
          <div className="product-loading-copy">
            <Skeleton height="24px" style={{ width: '34%' }} />
            <Skeleton height="104px" style={{ width: '92%' }} />
            <Skeleton height="20px" style={{ width: '78%' }} />
            <Skeleton height="180px" />
          </div>
        </div>
      </main>
    );
  }

  if (error || !product) {
    return (
      <main className="product-page">
        <section className="product-state-card" role="alert">
          <p className="product-kicker">Nolan's Knives</p>
          <h1>Product Not Available</h1>
          <p>{error || 'This product could not be found.'}</p>
          <button className="product-primary-button" type="button" onClick={() => navigate('/Store')}>
            Back to store <LucideIcon name="ArrowRight" size={16} />
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="product-page">
      <button className="product-back-link" type="button" onClick={() => navigate('/Store')}>
        <LucideIcon name="ArrowLeft" size={16} />
        Store
      </button>

      <section className="product-hero-detail">
        <div className="product-hero-copy">
          <p className="product-kicker">Nolan's Knives</p>
          <h1>{product.name || 'Untitled Knife'}</h1>
          <p className="product-lede">
            {descriptionBlocks[0]}
          </p>

          <div className="product-purchase-panel">
            <div className="product-status-row">
              <span className={`product-status-pill ${publicStatus}`}>
                {formatKnifeStatus(publicStatus)}
              </span>
            </div>

            <div className="product-price-block">
              <span>Price</span>
              <strong>{formatCurrency(product.price)}</strong>
              <em>USD</em>
            </div>

            {buyError && (
              <div className="product-inline-error" role="alert">
                <LucideIcon name="AlertCircle" size={16} />
                {buyError}
              </div>
            )}

            <div className="product-cta-row">
              <button
                className="product-primary-button"
                type="button"
                onClick={handleBuyNow}
                disabled={!isAvailable}
              >
                <LucideIcon name="ShoppingCart" size={18} />
                {isAvailable ? 'Buy now' : formatKnifeStatus(publicStatus)}
              </button>
              <button className="product-icon-button" type="button" onClick={handleShare} aria-label="Share product">
                <LucideIcon name="Share2" size={18} />
              </button>
            </div>

            {shareNotice && <p className="product-share-note">{shareNotice}</p>}
          </div>
        </div>

        <div className="product-detail-gallery">
          <ProductGallery items={images} alt={product.name || 'Nolan knife'} />
        </div>
      </section>

      <section className="product-story-section">
        <div>
          <p className="product-kicker">Overview</p>
          <h2>Materials, finish, and feel.</h2>
        </div>
        <div className="product-story-copy">
          {descriptionBlocks.map((paragraph, index) => (
            <p key={`${paragraph}-${index}`}>{paragraph}</p>
          ))}
        </div>
      </section>

      <section className="product-detail-grid" aria-label="Knife details">
        <article className="product-detail-panel">
          <div className="product-panel-heading">
            <LucideIcon name="Ruler" size={19} />
            <h3>Specifications</h3>
          </div>
          {visibleSpecRows.length ? (
            <dl className="product-spec-list">
              {visibleSpecRows.map((row, index) => (
                <div className="product-spec-row" key={`${row.label}-${row.value}-${index}`}>
                  <dt>{row.label}</dt>
                  <dd>{row.value}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p>Detailed material notes will be confirmed directly by Nolan's Knives.</p>
          )}
        </article>

        <article className="product-detail-panel">
          <div className="product-panel-heading">
            <LucideIcon name="ShieldCheck" size={19} />
            <h3>Purchase</h3>
          </div>
          <div className="product-info-list">
            <p>Pay through PayPal when you are ready.</p>
            <p>After purchase, updates and messages live with your order in Your Knives.</p>
          </div>
        </article>

        <article className="product-detail-panel">
          <div className="product-panel-heading">
            <LucideIcon name="Hammer" size={19} />
            <h3>Craft Notes</h3>
          </div>
          <div className="product-info-list">
            <p>The photos show the actual finished knife available for purchase.</p>
            <p>After purchase, Your Knives keeps the order, updates, and messages together.</p>
          </div>
        </article>
      </section>

      {images.length > 1 && (
        <section className="product-image-strip" aria-label="Product image set">
          {images.map((image, index) => (
            <img key={`${image}-${index}`} src={image} alt={`${product.name || 'Knife'} angle ${index + 1}`} />
          ))}
        </section>
      )}

      <section className="product-next-step">
        <div>
          <p className="product-kicker">Need Something Different?</p>
          <h2>Start a custom request instead.</h2>
        </div>
        <button className="product-secondary-button" type="button" onClick={() => navigate('/custom-knife-request')}>
          Custom request <LucideIcon name="ArrowRight" size={16} />
        </button>
      </section>
    </main>
  );
}

export default ProductPage;
