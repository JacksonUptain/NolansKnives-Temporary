import { Fragment, useEffect, useMemo, useState } from "react";
import LucideIcon from "../components/ui/LucideIcon";
import HeartButton from "../components/ui/HeartButton";
import { formatKnifeStatus } from "./knifeStatus";

function normalizeImages(src) {
  if (Array.isArray(src)) return src.filter(Boolean);
  if (typeof src === "string" && src.trim()) return [src.trim()];
  return [];
}

export default function GalleryCard({ product, size = "sm", dateLabel = "", isSold = false, onView }) {
  const images = useMemo(() => normalizeImages(product?.src), [product?.src]);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    setActiveIndex(0);
  }, [product?.id]);

  useEffect(() => {
    if (images.length <= 1) return undefined;
    const timer = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % images.length);
    }, 4200);
    return () => window.clearInterval(timer);
  }, [images.length]);

  const handleKeyDown = (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onView?.();
    }
  };

  return (
    <article
      className={`mosaic-tile mosaic-size-${size} ${isSold ? "mosaic-sold" : ""}`}
      role="button"
      tabIndex={0}
      onClick={onView}
      onKeyDown={handleKeyDown}
    >
      <div className="mosaic-media">
        {images.length > 0 ? (
          images.map((image, index) => (
            <Fragment key={`${image}-${index}`}>
              <img
                src={image}
                alt=""
                aria-hidden="true"
                className={`mosaic-backdrop ${index === activeIndex ? "active" : ""}`}
              />
              <img
                src={image}
                alt={`${product.name || "Nolan knife"} angle ${index + 1}`}
                className={`mosaic-primary ${index === activeIndex ? "active" : ""}`}
              />
            </Fragment>
          ))
        ) : (
          <div className="gallery-media-placeholder">
            <LucideIcon name="Image" size={30} />
          </div>
        )}

        {images.length > 1 && (
          <div className="mosaic-dots" aria-hidden="true">
            {images.map((image, index) => (
              <span key={`${image}-dot`} className={index === activeIndex ? "active" : ""} />
            ))}
          </div>
        )}
      </div>

      <div className="mosaic-scrim" aria-hidden="true" />

      <div className="mosaic-copy">
        {product.publicStatus && (
          <span className={`mosaic-status-pill status-${product.publicStatus}`}>
            {formatKnifeStatus(product.publicStatus)}
          </span>
        )}

        <h2>{product.name || "Finished Piece"}</h2>

        <div className="mosaic-footer">
          {dateLabel && (
            <span className="mosaic-date">
              <LucideIcon name="Calendar" size={13} />
              {isSold ? `Sold ${dateLabel}` : `Added ${dateLabel}`}
            </span>
          )}

          <div className="mosaic-actions">
            <HeartButton product={product} compact />
            {onView && (
              <button type="button" className="mosaic-view-action" onClick={(event) => { event.stopPropagation(); onView(); }}>
                View <LucideIcon name="ArrowRight" size={14} />
              </button>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}
