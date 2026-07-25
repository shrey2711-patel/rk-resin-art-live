// ── Cart ────────────────────────────────────────────────────
const Cart = {
  items: JSON.parse(localStorage.getItem('rk_cart') || '[]'),

  save(syncWithServer = true) {
    localStorage.setItem('rk_cart', JSON.stringify(this.items));
    this.updateBadge();
    if (syncWithServer && typeof API !== 'undefined' && API.isUserLoggedIn()) {
      API.updateCart(this.items).catch(() => {});
    }
  },

  add(product) {
    const existing = this.items.find(i => i.id === product.id && (i.selectedVariant || null) === (product.selectedVariant || null));
    const currentQty = existing ? existing.qty : 0;
    const isTracking = typeof App !== 'undefined' && App.state && App.state.trackStock !== false;
    if (isTracking && product.stock !== undefined && currentQty + 1 > product.stock) {
      showToast(`Sorry, only ${product.stock} units available!`, 'error');
      return;
    }
    if (existing) {
      existing.qty += 1;
    } else {
      this.items.push({ ...product, qty: 1 });
    }
    this.save();
    this.renderDrawer();
    showToast(`${product.name} added to cart 🛒`, 'success');
  },

  remove(id, selectedVariant = null) {
    this.items = this.items.filter(i => !(i.id === id && (i.selectedVariant || null) === (selectedVariant || null)));
    this.save();
    this.renderDrawer();
  },

  updateQty(id, selectedVariant, delta) {
    const item = this.items.find(i => i.id === id && (i.selectedVariant || null) === (selectedVariant || null));
    if (!item) return;
    const isTracking = typeof App !== 'undefined' && App.state && App.state.trackStock !== false;
    if (delta > 0 && isTracking && item.stock !== undefined && item.qty + delta > item.stock) {
      showToast(`Only ${item.stock} units available!`, 'error');
      return;
    }
    item.qty += delta;
    if (item.qty <= 0) return this.remove(id, selectedVariant);
    this.save();
    this.renderDrawer();
  },

  total() {
    return this.items.reduce((s, i) => s + i.price * i.qty, 0);
  },

  count() {
    return this.items.reduce((s, i) => s + i.qty, 0);
  },

  clear() {
    this.items = [];
    this.save();
    this.renderDrawer();
  },

  updateBadge() {
    const badge = document.getElementById('cartBadge');
    if (badge) badge.textContent = this.count();
    const countEl = document.getElementById('cartItemCount');
    if (countEl) countEl.textContent = `(${this.count()} item${this.count() !== 1 ? 's' : ''})`;
  },

  renderDrawer() {
    const container = document.getElementById('cartItems');
    const footer = document.getElementById('cartFooter');
    const totalEl = document.getElementById('cartTotal');
    if (!container) return;

    this.updateBadge();

    if (!this.items.length) {
      container.innerHTML = `
        <div class="empty-cart">
          <div style="font-size:3rem">🛒</div>
          <p>Your cart is empty</p>
          <small>Add some products to get started!</small>
        </div>`;
      if (footer) footer.style.display = 'none';
      return;
    }

    if (footer) footer.style.display = 'block';
    if (totalEl) totalEl.textContent = `₹${this.total().toLocaleString('en-IN')}`;

    container.innerHTML = this.items.map(item => `
      <div class="cart-item" data-id="${item.id}" data-variant="${item.selectedVariant || ''}">
        <div class="cart-item-thumb" style="background:${item.thumbBg || '#f0eef8'}">
          ${item.imageUrl ? `<img src="${item.imageUrl}" alt="${item.name}">` : (item.emoji || '📦')}
        </div>
        <div class="cart-item-info">
          <div class="cart-item-name">${item.name}</div>
          <div class="cart-item-price">₹${(item.price * item.qty).toLocaleString('en-IN')}</div>
          <div class="cart-item-controls">
            <button class="qty-btn" data-action="dec" data-id="${item.id}" data-variant="${item.selectedVariant || ''}">−</button>
            <span class="qty-val">${item.qty}</span>
            <button class="qty-btn" data-action="inc" data-id="${item.id}" data-variant="${item.selectedVariant || ''}">+</button>
          </div>
        </div>
        <button class="remove-btn" data-remove="${item.id}" data-variant="${item.selectedVariant || ''}" title="Remove">×</button>
      </div>`).join('');

    // bind controls
    container.querySelectorAll('.qty-btn').forEach(btn => {
      btn.onclick = () => {
        const id = Number(btn.dataset.id);
        const variant = btn.dataset.variant || null;
        Cart.updateQty(id, variant, btn.dataset.action === 'inc' ? 1 : -1);
      };
    });
    container.querySelectorAll('.remove-btn').forEach(btn => {
      btn.onclick = () => {
        const id = Number(btn.dataset.remove);
        const variant = btn.dataset.variant || null;
        Cart.remove(id, variant);
      };
    });
  },

  openDrawer() {
    document.getElementById('cartDrawer').classList.add('open');
    document.getElementById('drawerOverlay').classList.add('open');
    this.renderDrawer();
  },

  closeDrawer() {
    document.getElementById('cartDrawer').classList.remove('open');
    document.getElementById('drawerOverlay').classList.remove('open');
  },

  async syncWithServer(forceOverwrite = false) {
    if (typeof API !== 'undefined' && API.isUserLoggedIn()) {
      try {
        const res = await API.getCart();
        if (res && Array.isArray(res.cart)) {
          const serverItems = res.cart;
          if (forceOverwrite) {
            const localStr = JSON.stringify(this.items);
            const serverStr = JSON.stringify(serverItems);
            if (localStr !== serverStr) {
              this.items = serverItems;
              this.save(false);
              this.renderDrawer();
            }
          } else {
            if (serverItems.length > 0) {
              this.items = serverItems;
              this.save(false);
              this.renderDrawer();
            } else if (this.items.length > 0) {
              this.save(true);
            }
          }
        }
      } catch (err) {
        if (typeof API !== 'undefined' && !API.isUserLoggedIn()) return;
        if (err && err.message && err.message.toLowerCase().includes('login')) return;
        console.warn('Cart sync paused:', err.message || err);
      }
    }
  }
};

// Init cart badge on load
Cart.updateBadge();

// Cart button
document.getElementById('cartBtn').onclick = () => Cart.openDrawer();
document.getElementById('closeCart').onclick = () => Cart.closeDrawer();
document.getElementById('drawerOverlay').onclick = () => Cart.closeDrawer();

// Checkout button
document.getElementById('checkoutBtn').onclick = () => {
  if (typeof Auth !== 'undefined' && !Auth.user) {
    showToast('🔒 Please login or register to proceed to checkout!', 'error');
    Cart.closeDrawer();
    Auth.open();
    return;
  }
  Cart.closeDrawer();
  openCheckoutModal();
};
