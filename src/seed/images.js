'use strict';

/** Public URLs of the rendered demo photos (see tools/render). */
function productImagePaths(product) {
  const base = `/img/products/${product.sku.toLowerCase()}`;
  const count = 1 + (product.photos ? product.photos.length : 0);
  return Array.from({ length: count }, (_, i) => (i === 0 ? `${base}.webp` : `${base}-${i + 1}.webp`));
}

function shopCoverPath(shop) {
  return `/img/shops/${shop.slug}-cover.webp`;
}

function shopLogoPath(shop) {
  return `/img/shops/${shop.slug}-logo.svg`;
}

module.exports = { productImagePaths, shopCoverPath, shopLogoPath };
