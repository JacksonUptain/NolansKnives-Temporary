export function getPublicKnifeStatus(product = {}, order = null) {
  const saleStatus = String(product.saleStatus || "").toLowerCase();
  if (product.sold || saleStatus === "sold" || order?.status === "paid") return "sold";
  if (saleStatus === "pending" || saleStatus === "reserved" || order?.status === "pending") return "pending";
  return "available";
}

export function formatKnifeStatus(status) {
  return String(status || "available")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (match) => match.toUpperCase());
}
