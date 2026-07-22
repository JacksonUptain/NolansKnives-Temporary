import { useEffect, useMemo, useState } from "react";
import LucideIcon from "../components/ui/LucideIcon";
import { formatKnifeStatus } from "./knifeStatus";

function normalizeImages(src) {
  if (Array.isArray(src)) return src.filter(Boolean);
  if (typeof src === "string" && src.trim()) return [src.trim()];
  return [];
}

function trimDescription(value) {
  const description = String(value || "").trim();
  if (!description) return "A completed Nolan's Knives build with materials and finish selected for the piece.";
  if (description.length <= 190) return description;
  return `${description.slice(0, 187).trim()}...`;
}

export default function GalleryCard({ product, featured = false, onRequest, onView }) {
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
            <img
              key={`${image}-${index}`}
              src={image}
              alt={`${product.name || "Nolan knife"} angle ${index + 1}`}
              className={index === activeIndex ? "active" : ""}
            />
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
        <div className="gallery-card-topline">
          <span>{formatKnifeStatus(product.publicStatus || "available")}</span>
        </div>
        <h2>{product.name || "Finished Piece"}</h2>
        <p>{trimDescription(product.description)}</p>

        <div className="gallery-card-actions">
          {onView && (
            <button type="button" className="gallery-text-action" onClick={onView}>
              View details <LucideIcon name="ArrowRight" size={15} />
            </button>
          )}
          <button type="button" className="gallery-text-action muted" onClick={onRequest}>
            Request something similar
          </button>
        </div>
      </div>
    </article>
  );
}
