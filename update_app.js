const fs = require('fs');

const replacement = `  // ── Product Modal ─────────────────────────────────────────
  async openProductModal(id, products) {
    const prod = products.find(p => p.id === id);
    if (!prod) return;
    const cat = this.state.categories.find(c => c.name === prod.category) || {};
    const origHTML = prod.originalPrice ? \`<s style="color:#9CA3AF;font-size:0.85em">₹\${prod.originalPrice}</s>\` : '';
    const discountPct = (prod.originalPrice && prod.price < prod.originalPrice)
      ? Math.round((1 - prod.price / prod.originalPrice) * 100)
      : 0;

    const isWl = typeof Wishlist !== 'undefined' && Wishlist.has(prod.id);

    // Build variants HTML
    const hasVariants = prod.variants && prod.variants.length > 0 && prod.variantLabel;
    const variantLabel = prod.variantLabel || 'Variant';
    const variantsHTML = hasVariants ? \`
      <div class="pdp-variants-block">
        <div class="pdp-variants-label">\${variantLabel}</div>
        <div class="pdp-variants-chips">
          \${prod.variants.map((v, i) => \`
            <button class="pdp-chip\${i === 0 ? ' selected' : ''}" data-vi="\${i}" data-label="\${v.label}" data-price="\${v.price}" type="button">\${v.label}</button>\`).join('')}
        </div>
      </div>\` : '';

    const initPrice = hasVariants ? prod.variants[0].price : prod.price;
    const initStock = hasVariants ? (prod.variants[0].stock !== undefined ? prod.variants[0].stock : 0) : prod.stock;
    const isOutOfStock = initStock === 0;
    const isLowStock = !isOutOfStock && initStock > 0 && initStock <= 5;

    const badgeHTML = prod.badge ? \`<span class="pdp-badge pdp-badge-\${prod.badge.toLowerCase()}">\${prod.badge}</span>\` : '';

    const stockBadge = isOutOfStock
      ? \`<span class="pdp-stock-badge oos">❌ Out of Stock</span>\`
      : isLowStock
        ? \`<span class="pdp-stock-badge low">⚡ Only \${initStock} left!</span>\`
        : \`<span class="pdp-stock-badge in">\${this.state.trackStock ? \`✅ In Stock (\${initStock} units)\` : '✅ In Stock'}</span>\`;

    const descHTML = (prod.description && prod.description.trim())
      ? \`<div class="pdp-desc">\${parseMarkdown(prod.description)}</div>\`
      : '';

    const avgRating = prod._avgRating || 0;
    const ratingCount = prod._ratingCount || 0;
    const starsHTML = avgRating > 0
      ? \`<div class="pdp-rating-row">
          <span class="pdp-stars">\${'★'.repeat(Math.round(avgRating))}\${'☆'.repeat(5 - Math.round(avgRating))}</span>
          <span class="pdp-rating-val">\${(Math.round(avgRating * 10) / 10).toFixed(1)}</span>
          <a class="pdp-rating-count" id="goToReviewsTab" href="#">(\${ratingCount} review\${ratingCount !== 1 ? 's' : ''})</a>
        </div>\`
      : \`<div class="pdp-rating-row"><span class="pdp-no-rating">No reviews yet</span></div>\`;

    const relatedProducts = await this.getRelatedProducts(prod, products);
    const catMap = {};
    this.state.categories.forEach(c => catMap[c.name] = c);

    // Gallery images: collect all available images
    const galleryImages = [];
    if (prod.imageUrl) galleryImages.push(prod.imageUrl);
    if (prod.variants && prod.variants.length > 0) {
      prod.variants.forEach(v => { if (v.imageUrl && !galleryImages.includes(v.imageUrl)) galleryImages.push(v.imageUrl); });
    }
    const hasGallery = galleryImages.length > 1;

    // Payment icons SVG
    const paymentIconsHTML = \`
      <div class="pdp-payment-icons">
        <span class="pdp-pay-label">Pay with</span>
        <svg class="pdp-pay-icon" viewBox="0 0 50 30" title="Visa"><rect width="50" height="30" rx="4" fill="#1A1F71"/><text x="5" y="22" font-family="Arial" font-size="16" font-weight="900" fill="#FFFFFF" font-style="italic">VISA</text></svg>
        <svg class="pdp-pay-icon" viewBox="0 0 50 30" title="Mastercard"><rect width="50" height="30" rx="4" fill="#252525"/><circle cx="18" cy="15" r="9" fill="#EB001B"/><circle cx="32" cy="15" r="9" fill="#F79E1B"/></svg>
        <svg class="pdp-pay-icon" viewBox="0 0 50 30" title="UPI"><rect width="50" height="30" rx="4" fill="#5F259F"/><text x="7" y="21" font-family="Arial" font-size="13" font-weight="900" fill="#FFFFFF">UPI</text></svg>
        <svg class="pdp-pay-icon" viewBox="0 0 50 30" title="GPay"><rect width="50" height="30" rx="4" fill="#FFFFFF"/><text x="3" y="21" font-family="Arial" font-size="12" font-weight="700" fill="#4285F4">GPay</text></svg>
      </div>\`;

    const highlightsHTML = \`
      <div class="pdp-highlights">
        <div class="pdp-highlight"><span class="pdp-hl-icon">✓</span><span>Premium Quality</span></div>
        <div class="pdp-highlight"><span class="pdp-hl-icon">✓</span><span>Fast Shipping</span></div>
        <div class="pdp-highlight"><span class="pdp-hl-icon">✓</span><span>Secure Payment</span></div>
        <div class="pdp-highlight"><span class="pdp-hl-icon">✓</span><span>Easy Returns</span></div>
        <div class="pdp-highlight"><span class="pdp-hl-icon">✓</span><span>Handmade</span></div>
        <div class="pdp-highlight"><span class="pdp-hl-icon">✓</span><span>1000+ Customers</span></div>
      </div>\`;

    const deliveryHTML = \`
      <div class="pdp-delivery-row">
        <div class="pdp-delivery-item"><span>🚚</span><span>Free Delivery above ₹999</span></div>
        <div class="pdp-delivery-item"><span>📦</span><span>Ships within 24 hours</span></div>
        <div class="pdp-delivery-item"><span>🔒</span><span>Secure Checkout</span></div>
      </div>\`;

    // Similar products mini carousel
    const similarHTML = relatedProducts.length > 0 ? \`
      <section class="pdp-similar">
        <h3 class="pdp-similar-title">Similar Products</h3>
        <div class="pdp-similar-carousel">
          \${relatedProducts.map(item => {
            const itemCat = catMap[item.category] || {};
            const itemPrice = item.price !== undefined ? item.price : (item.variants && item.variants[0] ? item.variants[0].price : 0);
            return \`
              <button class="pdp-similar-card" type="button" data-related-pid="\${item.id}" data-related-context="modal">
                <div class="pdp-similar-img" style="background:\${itemCat.color || '#f0eef8'}">
                  \${this.productMedia(item, itemCat.color || '#f0eef8', 'related')}
                </div>
                <div class="pdp-similar-info">
                  <div class="pdp-similar-name">\${item.name}</div>
                  <div class="pdp-similar-price">₹\${itemPrice}</div>
                </div>
              </button>\`;
          }).join('')}
        </div>
      </section>\` : '';

    // Main image HTML
    const mainImgSrc = galleryImages[0] || null;
    const mainImgHTML = mainImgSrc
      ? \`<div class="pdp-main-img-wrap" id="pdpMainImgWrap">
          <img class="pdp-main-img" id="pdpMainImg" src="\${mainImgSrc}" alt="\${prod.name}">
        </div>\`
      : \`<div class="pdp-main-img-wrap pdp-emoji-wrap" id="pdpMainImgWrap" style="background:\${cat.color || '#f0eef8'}">
          <div class="pdp-emoji-big">\${prod.emoji || '📦'}</div>
        </div>\`;

    const thumbnailsHTML = hasGallery ? \`
      <div class="pdp-thumbs" id="pdpThumbs">
        \${galleryImages.map((img, i) => \`
          <button class="pdp-thumb\${i === 0 ? ' active' : ''}" data-img="\${img}" type="button">
            <img src="\${img}" alt="view \${i+1}">
          </button>\`).join('')}
      </div>\` : '';

    document.getElementById('modalBody').innerHTML = \`
      <div class="pdp-container">
        <!-- LEFT: Image Gallery -->
        <div class="pdp-left">
          <div class="pdp-gallery">
            \${thumbnailsHTML}
            \${mainImgHTML}
          </div>
          \${highlightsHTML}
        </div>

        <!-- RIGHT: Product Info & Purchase -->
        <div class="pdp-right">
          <div class="pdp-sticky-panel">
            <!-- Header -->
            <div class="pdp-meta">
              <span class="pdp-category">\${prod.category || ''}</span>
              \${badgeHTML}
            </div>
            <h1 class="pdp-title">\${prod.name}</h1>
            \${prod.unit ? \`<div class="pdp-unit">\${prod.unit}</div>\` : ''}
            \${starsHTML}

            <!-- Price -->
            <div class="pdp-price-block">
              <div class="pdp-price" id="modalPriceDisplay">₹\${initPrice}</div>
              \${origHTML ? \`<div class="pdp-orig-price">\${origHTML}</div>\` : ''}
              \${discountPct > 0 ? \`<span class="pdp-discount-badge">Save \${discountPct}%</span>\` : ''}
            </div>

            <!-- Stock -->
            <div class="pdp-stock-row">
              <span id="modalStockDisplay">\${stockBadge}</span>
            </div>

            <!-- Variants -->
            \${variantsHTML}

            <!-- Quantity -->
            <div class="pdp-qty-row">
              <span class="pdp-qty-label">Quantity</span>
              <div class="pdp-qty-ctrl">
                <button type="button" class="pdp-qty-btn" id="pdpQtyMinus">−</button>
                <span class="pdp-qty-val" id="pdpQtyVal">1</span>
                <button type="button" class="pdp-qty-btn" id="pdpQtyPlus">+</button>
              </div>
            </div>

            <!-- Actions -->
            <div class="pdp-actions">
              <button class="pdp-btn-primary" id="modalAddBtn" \${isOutOfStock ? 'disabled' : ''}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>
                Add to Cart
              </button>
              <button class="pdp-btn-secondary" id="modalBuyNowBtn" \${isOutOfStock ? 'disabled' : ''}>
                \${this.state.cartEnabled !== false ? 'Buy Now' : 'Enquire Now'}
              </button>
              <button class="pdp-btn-wish \${isWl ? 'active' : ''}" id="modalWishlistBtn" data-pid="\${prod.id}" title="\${isWl ? 'Remove from Wishlist' : 'Add to Wishlist'}" type="button">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="\${isWl ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
              </button>
            </div>

            <!-- Delivery -->
            \${deliveryHTML}

            <!-- Payment -->
            \${paymentIconsHTML}
          </div>
        </div>

        <!-- FULL WIDTH BOTTOM: Tabs + Similar -->
        <div class="pdp-bottom">
          <!-- Tabs -->
          <div class="pdp-tabs" id="pdpTabs">
            <button class="pdp-tab active" data-tab="info" type="button">📦 Description</button>
            <button class="pdp-tab" data-tab="reviews" type="button" id="modalTabReviews">⭐ Reviews</button>
          </div>

          <div class="pdp-tab-pane active" id="pdpPaneInfo" data-pane="info">
            <div class="pdp-desc-content" id="modalPaneInfo">
              \${descHTML || '<p style="color:#9CA3AF">No description available.</p>'}
            </div>
          </div>

          <div class="pdp-tab-pane" id="pdpPaneReviews" data-pane="reviews" style="display:none">
            <div id="reviewsContent"><div class="reviews-empty">Loading reviews...</div></div>
          </div>

          <!-- Similar -->
          \${similarHTML}
        </div>
      </div>\`;

    // Bind thumbnail gallery
    const thumbBtns = document.querySelectorAll('#pdpThumbs .pdp-thumb');
    const mainImg = document.getElementById('pdpMainImg');
    thumbBtns.forEach(btn => {
      btn.onclick = () => {
        thumbBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        if (mainImg) {
          mainImg.style.opacity = '0';
          setTimeout(() => { mainImg.src = btn.dataset.img; mainImg.style.opacity = '1'; }, 150);
        }
      };
    });

    // Quantity stepper
    let qty = 1;
    const qtyValEl = document.getElementById('pdpQtyVal');
    document.getElementById('pdpQtyMinus').onclick = () => { if (qty > 1) { qty--; qtyValEl.textContent = qty; } };
    document.getElementById('pdpQtyPlus').onclick = () => { qty++; qtyValEl.textContent = qty; };

    // Reviews tab link
    const goToReviewsLink = document.getElementById('goToReviewsTab');
    if (goToReviewsLink) {
      goToReviewsLink.onclick = (e) => { e.preventDefault(); document.querySelector('[data-tab="reviews"]')?.click(); };
    }

    // Tab switching
    document.querySelectorAll('.pdp-tab').forEach(tab => {
      tab.onclick = () => {
        document.querySelectorAll('.pdp-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.pdp-tab-pane').forEach(p => { p.classList.remove('active'); p.style.display = 'none'; });
        tab.classList.add('active');
        const pane = document.getElementById(\`pdpPane\${tab.dataset.tab.charAt(0).toUpperCase() + tab.dataset.tab.slice(1)}\`);
        if (pane) { pane.classList.add('active'); pane.style.display = ''; }
        if (tab.dataset.tab === 'reviews') this.loadReviewsForModal(prod.id);
      };
    });
    // Legacy tab IDs for backward compat
    document.getElementById('modalTabInfo') && (document.getElementById('modalTabInfo').onclick = () => document.querySelector('[data-tab="info"]')?.click());

    // Track currently selected variant
    let selectedVariant = hasVariants ? prod.variants[0] : null;

    // Variant chip selection
    if (hasVariants) {
      if (prod.variants[0] && prod.variants[0].imageUrl) {
        if (mainImg) mainImg.src = prod.variants[0].imageUrl;
      }

      document.querySelectorAll('.pdp-chip').forEach(chip => {
        chip.onclick = () => {
          document.querySelectorAll('.pdp-chip').forEach(c => c.classList.remove('selected'));
          chip.classList.add('selected');
          const vi = parseInt(chip.dataset.vi);
          selectedVariant = prod.variants[vi];
          const priceEl = document.getElementById('modalPriceDisplay');
          if (priceEl) priceEl.innerHTML = \`₹\${selectedVariant.price}\`;

          const stockEl = document.getElementById('modalStockDisplay');
          const addBtn = document.getElementById('modalAddBtn');
          const buyBtn = document.getElementById('modalBuyNowBtn');
          const vStock = selectedVariant.stock !== undefined ? selectedVariant.stock : 0;

          if (stockEl) {
            const vLow = vStock > 0 && vStock <= 5;
            stockEl.innerHTML = vStock === 0
              ? \`<span class="pdp-stock-badge oos">❌ Out of Stock</span>\`
              : vLow
                ? \`<span class="pdp-stock-badge low">⚡ Only \${vStock} left!</span>\`
                : \`<span class="pdp-stock-badge in">\${this.state.trackStock ? \`✅ In Stock (\${vStock} units)\` : '✅ In Stock'}</span>\`;
          }
          if (addBtn) addBtn.disabled = (vStock === 0);
          if (buyBtn) buyBtn.disabled = (vStock === 0);

          if (selectedVariant.imageUrl && mainImg) {
            mainImg.style.opacity = '0';
            setTimeout(() => { mainImg.src = selectedVariant.imageUrl; mainImg.style.opacity = '1'; }, 150);
          }
        };
      });
    }

    const getCartItem = () => {
      const base = { ...prod, thumbBg: cat.color || '#f0eef8', quantity: qty };
      if (selectedVariant) {
        base.price = selectedVariant.price;
        base.selectedVariant = selectedVariant.label;
        base.name = \`\${prod.name} (\${variantLabel}: \${selectedVariant.label})\`;
        base.stock = selectedVariant.stock !== undefined ? selectedVariant.stock : 0;
        if (selectedVariant.imageUrl) base.imageUrl = selectedVariant.imageUrl;
      } else {
        base.stock = prod.stock;
      }
      return base;
    };

    document.getElementById('modalAddBtn').onclick = () => {
      if (hasVariants && !selectedVariant) { showToast(\`Please select a \${variantLabel} first\`, 'error'); return; }
      const item = getCartItem();
      for (let i = 0; i < qty; i++) Cart.add(item);
      const btn = document.getElementById('modalAddBtn');
      if (btn) { btn.textContent = '✓ Added!'; btn.classList.add('added'); setTimeout(() => { btn.innerHTML = \`<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg> Add to Cart\`; btn.classList.remove('added'); }, 1500); }
      document.getElementById('productModalOverlay').classList.remove('open');
    };

    document.getElementById('modalBuyNowBtn').onclick = () => {
      if (hasVariants && !selectedVariant) { showToast(\`Please select a \${variantLabel} first\`, 'error'); return; }
      document.getElementById('productModalOverlay').classList.remove('open');
      this.openBuyNowCheckout(getCartItem(), cat);
    };

    document.getElementById('modalWishlistBtn').onclick = () => {
      if (typeof Wishlist !== 'undefined') {
        Wishlist.toggle({ ...prod, thumbBg: cat.color || '#f0eef8' });
        const btn = document.getElementById('modalWishlistBtn');
        if (btn) {
          const nowWl = typeof Wishlist !== 'undefined' && Wishlist.has(prod.id);
          btn.classList.toggle('active', nowWl);
          btn.querySelector('svg').setAttribute('fill', nowWl ? 'currentColor' : 'none');
        }
      }
    };

    this.bindRelatedProductLinks(relatedProducts, '#modalBody', 'modal', products);

    document.getElementById('productModalOverlay').classList.add('open');

    // Load reviews in background
    this.loadReviewsForModal(prod.id);
  }`;

let content = fs.readFileSync('public/js/app.js', 'utf8');
const startMarker = '  // ── Product Modal ─────────────────────────────────────────';
const endMarker = '  async loadReviewsForModal(productId, containerId = \'reviewsContent\') {';

const startIndex = content.indexOf(startMarker);
const endIndex = content.indexOf(endMarker);
if (startIndex !== -1 && endIndex !== -1) {
  content = content.substring(0, startIndex) + replacement + '\n\n' + content.substring(endIndex);
  fs.writeFileSync('public/js/app.js', content, 'utf8');
  console.log('Success replacing app.js');
} else {
  console.log('Markers not found');
}
