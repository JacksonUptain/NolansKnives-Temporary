import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import GalleryCard from "./GalleryCard";
import { ref, onValue } from "firebase/database";
import { db } from "./firebase";
import { formatKnifeStatus, getPublicKnifeStatus } from "./knifeStatus";
import Skeleton from "../components/ui/Skeleton";
import LucideIcon from "../components/ui/LucideIcon";
import "./Gallery.css";

function normalizeImages(src) {
  if (Array.isArray(src)) return src.filter(Boolean);
  if (typeof src === "string" && src.trim()) return [src.trim()];
  return [];
}

function formatCurrency(value) {
  if (value === null || value === undefined || value === "") return "Not listed";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD"
  }).format(Number(value || 0));
}

function formatDate(value) {
  if (!value) return "";
  const date = typeof value === "number" ? new Date(value) : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString();
}

function getSoldDate(product = {}) {
  return product.soldAt || product.soldDate || product.dateSold || product.saleDate || "";
}

function isGalleryVisible(product = {}) {
  const location = product.displayLocation || "gallery";
  return product.published !== false && (location === "gallery" || location === "both");
}

function sortGalleryItems(items) {
  return [...items].sort((a, b) => {
    const aTime = new Date(a.updatedAt || a.createdAt || 0).getTime();
    const bTime = new Date(b.updatedAt || b.createdAt || 0).getTime();
    return bTime - aTime;
  });
}

export default function Gallery() {
  const navigate = useNavigate();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);

  useEffect(() => {
    const productsRef = ref(db, "Products");
    const unsubscribeProducts = onValue(productsRef, (snapshot) => {
      const data = snapshot.val();
      const productArray = data
        ? Object.entries(data)
            .map(([id, value]) => ({ id, ...value, publicStatus: getPublicKnifeStatus(value) }))
            .filter(isGalleryVisible)
        : [];

      setProducts(sortGalleryItems(productArray));
      setLoading(false);
    }, () => {
      setProducts([]);
      setLoading(false);
    });

    return () => {
      unsubscribeProducts();
    };
  }, []);

  const filteredProducts = useMemo(() => {
    const term = query.trim().toLowerCase();
    return products.filter((product) => {
      const haystack = [product.name, product.description, product.specifications, product.custom_id]
        .join(" ")
        .toLowerCase();
      const matchesSearch = !term || haystack.includes(term);
      const matchesFilter = filter === "all" || product.publicStatus === filter;
      return matchesSearch && matchesFilter;
    });
  }, [products, query, filter]);

  const featuredProduct = filteredProducts[0] || products[0] || null;
  const featuredImages = normalizeImages(featuredProduct?.src);
  const collectionItems = featuredProduct
    ? filteredProducts.filter((product) => product.id !== featuredProduct.id)
    : filteredProducts;
  const selectedImages = normalizeImages(selectedProduct?.src);

  const openDetails = (product) => {
    setSelectedProduct(product);
    setSelectedImageIndex(0);
  };

  const closeDetails = useCallback(() => {
    setSelectedProduct(null);
    setSelectedImageIndex(0);
  }, []);

  const moveDetailImage = useCallback((direction) => {
    if (selectedImages.length <= 1) return;
    setSelectedImageIndex((current) => {
      const next = current + direction;
      if (next < 0) return selectedImages.length - 1;
      if (next >= selectedImages.length) return 0;
      return next;
    });
  }, [selectedImages.length]);

  useEffect(() => {
    if (!selectedProduct) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === "Escape") closeDetails();
      if (event.key === "ArrowLeft") moveDetailImage(-1);
      if (event.key === "ArrowRight") moveDetailImage(1);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [closeDetails, moveDetailImage, selectedProduct]);

  return (
    <main className="gallery-page page-surface">
      <section className="gallery-hero">
        <div className="gallery-hero-copy">
          <h1>Gallery</h1>
          <p>
            Finished pieces, past work, and build details gathered for inspiration.
          </p>
          <div className="gallery-hero-actions">
            <button className="gallery-primary-action" type="button" onClick={() => navigate("/custom-knife-request")}>
              Request custom <LucideIcon name="ArrowRight" size={16} />
            </button>
            <button className="gallery-secondary-action" type="button" onClick={() => navigate("/store")}>
              Available work
            </button>
          </div>
        </div>

        <aside className="gallery-feature" aria-label="Featured gallery piece">
          {loading ? (
            <Skeleton height="520px" />
          ) : featuredProduct ? (
            <>
              <div className="gallery-feature-media">
                {featuredImages[0] ? (
                  <>
                    <img className="gallery-feature-backdrop" src={featuredImages[0]} alt="" aria-hidden="true" />
                    <img className="gallery-feature-primary" src={featuredImages[0]} alt={featuredProduct.name || "Nolan knife"} />
                  </>
                ) : (
                  <div className="gallery-media-placeholder">
                    <LucideIcon name="Image" size={32} />
                  </div>
                )}
              </div>
              <div className="gallery-feature-copy">
                <h2>{featuredProduct.name || "Finished Piece"}</h2>
                <button className="gallery-text-action" type="button" onClick={() => openDetails(featuredProduct)}>
                  View details <LucideIcon name="ArrowRight" size={15} />
                </button>
              </div>
            </>
          ) : (
            <div className="gallery-empty-panel">
              <LucideIcon name="Image" size={34} />
              <h2>Gallery pieces will appear here soon.</h2>
            </div>
          )}
        </aside>
      </section>

      <section className="gallery-toolbar" aria-label="Find gallery pieces">
        <label className="gallery-search">
          <LucideIcon name="Search" size={16} />
          <input
            type="search"
            placeholder="Search steel, handle, style, or notes"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <select value={filter} onChange={(event) => setFilter(event.target.value)} aria-label="Filter gallery pieces">
          <option value="all">All pieces</option>
          <option value="available">Available</option>
          <option value="pending">Reserved</option>
          <option value="sold">Sold</option>
        </select>
      </section>

      {loading ? (
        <section className="gallery-loading-grid">
          <Skeleton height="460px" />
          <Skeleton height="460px" />
          <Skeleton height="460px" />
        </section>
      ) : filteredProducts.length === 0 ? (
        <section className="gallery-empty-state">
          <LucideIcon name="SearchX" size={38} />
          <h2>No gallery pieces match that search.</h2>
          <p>Try a different material, style, or finish.</p>
        </section>
      ) : (
        <section className="gallery-section" aria-label="Gallery pieces">
          <div className="gallery-section-heading">
            <h2>Past work</h2>
          </div>

          <div className="gallery-showcase-grid">
            {(collectionItems.length ? collectionItems : filteredProducts).map((product, index) => (
              <GalleryCard
                key={product.id}
                product={product}
                featured={index === 0 && collectionItems.length <= 2}
                onView={() => openDetails(product)}
              />
            ))}
          </div>
        </section>
      )}

      {selectedProduct && (
        <div className="gallery-detail-overlay" role="dialog" aria-modal="true" aria-labelledby="gallery-detail-title" onClick={closeDetails}>
          <section className="gallery-detail-modal" onClick={(event) => event.stopPropagation()}>
            <button className="gallery-detail-close" type="button" onClick={closeDetails} aria-label="Close gallery details">
              <LucideIcon name="X" size={20} />
            </button>

            <div className="gallery-detail-media">
              {selectedImages[selectedImageIndex] ? (
                <img src={selectedImages[selectedImageIndex]} alt={`${selectedProduct.name || "Nolan knife"} angle ${selectedImageIndex + 1}`} />
              ) : (
                <div className="gallery-media-placeholder">
                  <LucideIcon name="Image" size={34} />
                </div>
              )}

              {selectedImages.length > 1 && (
                <div className="gallery-detail-image-actions">
                  <button type="button" onClick={() => moveDetailImage(-1)} aria-label="Previous image">
                    <LucideIcon name="ChevronLeft" size={18} />
                  </button>
                  <button type="button" onClick={() => moveDetailImage(1)} aria-label="Next image">
                    <LucideIcon name="ChevronRight" size={18} />
                  </button>
                </div>
              )}

              {selectedImages.length > 1 && (
                <div className="gallery-detail-thumbs" aria-label="Gallery image thumbnails">
                  {selectedImages.map((image, index) => (
                    <button
                      type="button"
                      key={`${image}-thumb`}
                      className={index === selectedImageIndex ? "active" : ""}
                      onClick={() => setSelectedImageIndex(index)}
                      aria-label={`Show image ${index + 1}`}
                    >
                      <img src={image} alt="" />
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="gallery-detail-copy">
              <p className="gallery-detail-status">{formatKnifeStatus(selectedProduct.publicStatus || "available")}</p>
              <h2 id="gallery-detail-title">{selectedProduct.name || "Finished Piece"}</h2>
              <div className="gallery-detail-meta">
                <div>
                  <span>Sale price</span>
                  <strong>{formatCurrency(selectedProduct.price)}</strong>
                </div>
                <div>
                  <span>Sold</span>
                  <strong>{getSoldDate(selectedProduct) ? formatDate(getSoldDate(selectedProduct)) : selectedProduct.publicStatus === "sold" ? "Date not listed" : "Not sold"}</strong>
                </div>
              </div>

              <div className="gallery-detail-description">
                <h3>Description</h3>
                <p>{selectedProduct.description || "No description has been added for this piece yet."}</p>
              </div>

              <div className="gallery-detail-actions">
                {selectedProduct.displayLocation === "both" && (
                  <button type="button" className="gallery-secondary-action" onClick={() => navigate(`/product/${selectedProduct.id}`)}>
                    Store page <LucideIcon name="ArrowRight" size={15} />
                  </button>
                )}
                <button type="button" className="gallery-primary-action" onClick={() => navigate("/custom-knife-request")}>
                  Request similar
                </button>
              </div>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
