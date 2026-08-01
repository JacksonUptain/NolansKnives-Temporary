// Mirrors src/pages/productEditorModel.js:buildProductPayload — kept in sync
// by hand since functions/ can't import from src/.
function buildProductPayload(product = {}, options = {}) {
  const now = options.now || new Date().toISOString();
  const publish = options.publish !== undefined ? Boolean(options.publish) : Boolean(product.published);
  const normalizedSrc = Array.isArray(product.src)
    ? product.src.filter(Boolean)
    : typeof product.src === "string" && product.src.trim()
      ? [product.src.trim()]
      : [];

  const featuredValue = product.featured === true || product.featured === "true" || product.featured === 1 || product.featured === "1";

  return {
    ...product,
    src: normalizedSrc,
    price: Number(product.price),
    stock: Number(product.stock) || 1,
    published: publish,
    sold: product.saleStatus === "sold",
    soldAt: product.saleStatus === "sold" ? product.soldAt || now : null,
    featured: featuredValue,
    updatedAt: now,
    createdAt: product.createdAt || now
  };
}

module.exports = { buildProductPayload };
