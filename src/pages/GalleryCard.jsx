

import ProductCarousel from "./productCarousel";

export default function GalleryCard({ product }) {

  const images = Array.isArray(product.src)
    ? product.src
    : product.src ? [product.src] : [];

  return (
    <div className="product-card">
      <div className="product-image">
        {images.length <= 1 ? (
          <img
            className="d-block w-100 h-50"
            src={images[0]}
            alt={product.description}
          />
        ) : (
          <div ><ProductCarousel items={product.src}  /></div>
        )}
      </div>

      <h2 className="product-title">{product.name}</h2>
      <p className="product-description">{product.description}</p>
      <span className="product-price">{product.createdDate}</span>
    </div>
  );
}
