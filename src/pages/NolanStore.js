import './Product.css';
import Skeleton from '../components/ui/Skeleton';
import { Fragment, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ref, onValue } from "firebase/database";
import { db } from './firebase';
import { getPublicKnifeStatus } from './knifeStatus';
import LucideIcon from '../components/ui/LucideIcon';

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

function RotatingProductMedia({ product, className = '' }) {
  const images = useMemo(() => normalizeImages(product?.src), [product]);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    setIndex(0);
  }, [product?.id]);

  useEffect(() => {
    if (images.length <= 1) return undefined;
    const timer = window.setInterval(() => {
      setIndex((current) => (current + 1) % images.length);
    }, 3800);
    return () => window.clearInterval(timer);
  }, [images.length]);

  if (images.length === 0) {
    return (
      <div className={`store-media-placeholder ${className}`}>
        <LucideIcon name="Image" size={34} />
      </div>
    );
  }

  return (
    <div className={`store-rotating-media ${className}`}>
      {images.map((image, imageIndex) => (
        <Fragment key={`${image}-${imageIndex}`}>
          <img
            src={image}
            alt=""
            aria-hidden="true"
            className={`store-media-backdrop ${imageIndex === index ? 'active' : ''}`}
          />
          <img
            src={image}
            alt={`${product.name || 'Knife'} ${imageIndex + 1}`}
            className={`store-media-primary ${imageIndex === index ? 'active' : ''}`}
          />
        </Fragment>
      ))}
      {images.length > 1 && (
        <div className="store-media-dots" aria-hidden="true">
          {images.map((image, imageIndex) => (
            <span key={`${image}-dot`} className={imageIndex === index ? 'active' : ''} />
          ))}
        </div>
      )}
    </div>
  );
}

function NolanStore() {
  const navigate = useNavigate();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [sortMode, setSortMode] = useState("featured");
  const [showSold, setShowSold] = useState(false);

  useEffect(() => {
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

    return () => unsubscribe();
  }, []);

  const publicProducts = useMemo(() => products.map((product) => ({
    ...product,
    publicStatus: getPublicKnifeStatus(product)
  })).filter((product) => {
    const displayLocation = product.displayLocation || "store";
    const publicLocation = displayLocation === "store" || displayLocation === "both";
    return product.published !== false && publicLocation;
  }), [products]);

  const filteredProducts = useMemo(() => {
    const term = query.trim().toLowerCase();
    const items = publicProducts.filter((product) => {
      const matchesQuery = !term || [product.name, product.description, product.specifications, product.custom_id]
        .some((field) => (field || "").toLowerCase().includes(term));
      const matchesSold = showSold || product.publicStatus !== "sold";
      return matchesQuery && matchesSold;
    });

    const sorted = [...items];
    if (sortMode === "price-asc") {
      sorted.sort((a, b) => Number(a.price || 0) - Number(b.price || 0));
    } else if (sortMode === "price-desc") {
      sorted.sort((a, b) => Number(b.price || 0) - Number(a.price || 0));
    } else if (sortMode === "name") {
      sorted.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    } else {
      sorted.sort((a, b) => {
        const aAvailable = a.publicStatus === "available" ? 1 : 0;
        const bAvailable = b.publicStatus === "available" ? 1 : 0;
        if (aAvailable !== bAvailable) return bAvailable - aAvailable;
        return new Date(b.createdAt || b.updatedAt || 0) - new Date(a.createdAt || a.updatedAt || 0);
      });
    }
    return sorted;
  }, [publicProducts, query, sortMode, showSold]);

  const hasAvailableProducts = publicProducts.some((product) => product.publicStatus === 'available');
  const featuredProduct = filteredProducts[0] || null;

  const scrollToCollection = () => {
    document.getElementById('store-collection')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <main className="store-container">
      <section className="store-hero">
        <div className="store-hero-copy">
          <h1>{hasAvailableProducts ? 'Available Work' : 'New Work Coming Soon'}</h1>
          <p>
            {hasAvailableProducts
              ? 'Finished handmade knives with clear photos, pricing, and details.'
              : 'There are no finished knives available to purchase right now. Browse past work or request a custom knife.'}
          </p>
          <div className="store-hero-actions">
            <button className="store-primary-action" type="button" onClick={hasAvailableProducts ? scrollToCollection : () => navigate('/gallery')}>
              {hasAvailableProducts ? 'Shop knives' : 'View past work'} <LucideIcon name={hasAvailableProducts ? 'ArrowDown' : 'ArrowRight'} size={16} />
            </button>
            <button className="store-secondary-action" type="button" onClick={() => navigate('/custom-knife-request')}>
              Request custom
            </button>
          </div>
        </div>

        <aside className="store-feature-panel" aria-label="Featured knife">
          {loading ? (
            <Skeleton height="640px" />
          ) : featuredProduct ? (
            <>
              <RotatingProductMedia product={featuredProduct} className="featured-media" />
              <div className="store-feature-copy">
                <h2>{featuredProduct.name || "Untitled Knife"}</h2>
                <div className="store-feature-footer">
                  <div className="store-feature-actions">
                    <button className="store-primary-action" type="button" onClick={() => navigate(`/product/${featuredProduct.id}`)}>
                      View details <LucideIcon name="ArrowRight" size={16} />
                    </button>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="store-state-card hero-empty">
              <h2>No knives available right now</h2>
              <p>New finished pieces will appear here when they are ready.</p>
            </div>
          )}
        </aside>
      </section>

      <section className="store-controls-panel" aria-label="Find a knife">
        <label className="store-search-wrap">
          <LucideIcon name="Search" size={16} />
          <input
            className="store-search"
            type="search"
            placeholder="Search steel, handle, name, or notes"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <select className="store-select" value={sortMode} onChange={(e) => setSortMode(e.target.value)} aria-label="Sort knives">
          <option value="featured">Featured first</option>
          <option value="name">Name</option>
          <option value="price-asc">Price: Low to High</option>
          <option value="price-desc">Price: High to Low</option>
        </select>
        <label className="store-toggle">
          <input type="checkbox" checked={showSold} onChange={(e) => setShowSold(e.target.checked)} />
          <span>Include sold pieces</span>
        </label>
      </section>

      <section className="store-collection-heading" id="store-collection">
        <h2>Available knives</h2>
      </section>

      {loading ? (
        <div className="store-loading-grid">
          <Skeleton height="520px" />
          <Skeleton height="520px" />
        </div>
      ) : filteredProducts.length === 0 ? (
        <div className="store-state-card">
          <h2>No matching knives</h2>
          <p>Try a different search or include sold pieces to view more of Nolan's work.</p>
        </div>
      ) : (
        <section className="store-showcase-list" aria-label="Available knives">
          {filteredProducts.map((product) => (
            <article className="store-showcase" key={product.id}>
              <RotatingProductMedia product={product} />

              <div className="store-showcase-copy">
                <h2>{product.name || "Untitled Knife"}</h2>

                <div className="showcase-actions">
                  <button className="store-primary-action" type="button" onClick={() => navigate(`/product/${product.id}`)}>
                    View details <LucideIcon name="ArrowRight" size={16} />
                  </button>
                </div>
              </div>
            </article>
          ))}
        </section>
      )}
    </main>
  );
}

export default NolanStore;
