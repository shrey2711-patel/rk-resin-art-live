// ── Cart ────────────────────────────────────────────────────
const Cart = {
  items: JSON.parse(localStorage.getItem('rk_cart') || '[]'),

  save() {
    localStorage.setItem('rk_cart', JSON.stringify(this.items));
    this.updateBadge();
  },

  add(product) {
    const existing = this.items.find(i => i.id === product.id);
    if (existing) {
      existing.qty += 1;
    } else {
      this.items.push({ ...product, qty: 1 });
    }
    this.save();
    this.renderDrawer();
    showToast(`${product.name} added to cart 🛒`, 'success');
  },

  remove(id) {
    this.items = this.items.filter(i => i.id !== id);
    this.save();
    this.renderDrawer();
  },

  updateQty(id, delta) {
    const item = this.items.find(i => i.id === id);
    if (!item) return;
    item.qty += delta;
    if (item.qty <= 0) return this.remove(id);
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
      <div class="cart-item" data-id="${item.id}">
        <div class="cart-item-thumb" style="background:${item.thumbBg || '#f0eef8'}">
          ${item.imageUrl ? `<img src="${item.imageUrl}" alt="${item.name}">` : (item.emoji || '📦')}
        </div>
        <div class="cart-item-info">
          <div class="cart-item-name">${item.name}</div>
          <div class="cart-item-price">₹${(item.price * item.qty).toLocaleString('en-IN')}</div>
          <div class="cart-item-controls">
            <button class="qty-btn" data-action="dec" data-id="${item.id}">−</button>
            <span class="qty-val">${item.qty}</span>
            <button class="qty-btn" data-action="inc" data-id="${item.id}">+</button>
          </div>
        </div>
        <button class="remove-btn" data-remove="${item.id}" title="Remove">×</button>
      </div>`).join('');

    // bind controls
    container.querySelectorAll('.qty-btn').forEach(btn => {
      btn.onclick = () => {
        const id = Number(btn.dataset.id);
        Cart.updateQty(id, btn.dataset.action === 'inc' ? 1 : -1);
      };
    });
    container.querySelectorAll('.remove-btn').forEach(btn => {
      btn.onclick = () => Cart.remove(Number(btn.dataset.remove));
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
  Cart.closeDrawer();
  openCheckoutModal();
};
