import React, { useState, useEffect, useCallback } from 'react';
import LucideIcon from './ui/LucideIcon';
import './ProductGallery.css';

export default function ProductGallery({ items = [], alt = '' }) {
  const [index, setIndex] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  const openLightbox = useCallback((i) => {
    setIndex(i);
    setLightboxOpen(true);
  }, []);

  const closeLightbox = useCallback(() => setLightboxOpen(false), []);

  const prev = useCallback((e) => {
    e && e.stopPropagation();
    setIndex((i) => (i - 1 + items.length) % items.length);
  }, [items.length]);

  const next = useCallback((e) => {
    e && e.stopPropagation();
    setIndex((i) => (i + 1) % items.length);
  }, [items.length]);

  const onKey = useCallback((e) => {
    if (!lightboxOpen) return;
    if (e.key === 'ArrowLeft') prev();
    if (e.key === 'ArrowRight') next();
    if (e.key === 'Escape') closeLightbox();
  }, [lightboxOpen, prev, next, closeLightbox]);

  useEffect(() => {
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onKey]);

  if (!items || items.length === 0) {
    return <div className="pg-no-image">No images available</div>;
  }

  return (
    <div className="product-gallery-component">
      <div className="pg-main" onClick={() => openLightbox(index)}>
        <img src={items[index]} alt={`${alt} ${index + 1}`} className="pg-main-img" />
        {items.length > 1 && (
          <>
            <button className="pg-prev" onClick={(e) => { e.stopPropagation(); prev(e); }} aria-label="Previous image"><LucideIcon name="ChevronLeft" /></button>
            <button className="pg-next" onClick={(e) => { e.stopPropagation(); next(e); }} aria-label="Next image"><LucideIcon name="ChevronRight" /></button>
          </>
        )}
      </div>

      {items.length > 1 && (
        <div className="pg-thumbs">
          {items.map((src, i) => (
            <button key={i} className={`pg-thumb ${i === index ? 'active' : ''}`} onClick={() => setIndex(i)}>
              <img src={src} alt={`${alt} thumb ${i + 1}`} />
            </button>
          ))}
        </div>
      )}

      {lightboxOpen && (
        <div className="pg-lightbox" onClick={closeLightbox} role="dialog" aria-modal="true">
          <div className="pg-lightbox-inner" onClick={(e) => e.stopPropagation()}>
            <button className="pg-lightbox-close" onClick={closeLightbox} aria-label="Close"><LucideIcon name="X" /></button>
            <button className="pg-lightbox-prev" onClick={prev} aria-label="Previous"><LucideIcon name="ChevronLeft" /></button>
            <img src={items[index]} alt={`${alt} large ${index + 1}`} className="pg-lightbox-img" />
            <button className="pg-lightbox-next" onClick={next} aria-label="Next"><LucideIcon name="ChevronRight" /></button>
          </div>
        </div>
      )}
    </div>
  );
}
