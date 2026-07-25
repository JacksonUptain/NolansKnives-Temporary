import { Fragment, useEffect, useMemo, useState } from "react";
import LucideIcon from "../components/ui/LucideIcon";

function normalizeImages(src) {
  if (Array.isArray(src)) return src.filter(Boolean);
  if (typeof src === "string" && src.trim()) return [src.trim()];
  return [];
}

export default function GalleryCard({ product, featured = false, onView }) {
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

  return (
    <article className={`gallery-card ${featured ? "gallery-card-featured" : ""}`}>
      <div className="gallery-card-media">
        {images.length > 0 ? (
          images.map((image, index) => (
            <Fragment key={`${image}-${index}`}>
              <img
                src={image}
                alt=""
                aria-hidden="true"
                className={`gallery-card-backdrop ${index === activeIndex ? "active" : ""}`}
              />
              <img
                src={image}
                alt={`${product.name || "Nolan knife"} angle ${index + 1}`}
                className={`gallery-card-primary ${index === activeIndex ? "active" : ""}`}
              />
            </Fragment>
          ))
        ) : (
          <div className="gallery-media-placeholder">
            <LucideIcon name="Image" size={30} />
          </div>
        )}

        {images.length > 1 && (
          <div className="gallery-card-dots" aria-hidden="true">
            {images.map((image, index) => (
              <span key={`${image}-dot`} className={index === activeIndex ? "active" : ""} />
            ))}
          </div>
        )}
      </div>

      <div className="gallery-card-copy">
        <h2>{product.name || "Finished Piece"}</h2>

        <div className="gallery-card-actions">
          {onView && (
            <button type="button" className="gallery-text-action" onClick={onView}>
              View details <LucideIcon name="ArrowRight" size={15} />
            </button>
          )}
        </div>
      </div>
    </article>
  );
}
