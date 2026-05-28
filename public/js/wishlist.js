// ── Wishlist State & UI Manager ─────────────────────────────
const Wishlist = {
  items: JSON.parse(localStorage.getItem('rk_wishlist') || '[]'),

  save() {
    localStorage.setItem('rk_wishlist', JSON.stringify(this.items));
    this.updateBadge();
  },

  has(id) {
    return this.items.some(i => i.id === id);
  },

  toggle(product) {
    const index = this.items.findIndex(i => i.id === product.id);
    if (index !== -1) {
      this.items.splice(index, 1);
      this.save();
      this.renderDrawer();
      this.syncUi();
      showToast(`${product.name} removed from Wishlist 💔`, 'info');
    } else {
      this.items.push(product);
      this.save();
      this.renderDrawer();
      this.syncUi();
      showToast(`${product.name} added to Wishlist! ❤️`, 'success');

      // Auto-subscribe to back-in-stock alerts if logged in
      const user = JSON.parse(localStorage.getItem('rk_user') || 'null');
      if (user && user.email) {
        fetch('/api/wishlist/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: user.email, productId: product.id })
        }).catch(err => console.error('Failed to register stock alert:', err));
      }
    }
  },

  remove(id) {
    const item = this.items.find(i => i.id === id);
    this.items = this.items.filter(i => i.id !== id);
    this.save();
    this.renderDrawer();
    this.syncUi();
    if (item) {
      showToast(`${item.name} removed from Wishlist 💔`, 'info');
    }
  },

  count() {
    return this.items.length;
  },

  updateBadge() {
    const badge = document.getElementById('wishlistBadge');
    if (badge) badge.textContent = this.count();
    const countEl = document.getElementById('wishlistItemCount');
    if (countEl) countEl.textContent = `(${this.count()} item${this.count() !== 1 ? 's' : ''})`;
  },

  moveToCart(id) {
    const item = this.items.find(i => i.id === id);
    if (!item) return;
    Cart.add(item);
    this.remove(id);
    Cart.openDrawer();
  },

  syncUi() {
    // Sync all card heart buttons currently on screen
    document.querySelectorAll('.wishlist-card-btn').forEach(btn => {
      const pid = Number(btn.dataset.pid);
      if (this.has(pid)) {
        btn.classList.add('active');
        btn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" style="color: var(--red);"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>`;
      } else {
        btn.classList.remove('active');
        btn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>`;
      }
    });

    // Sync modal heart button if open
    const modalBtn = document.getElementById('modalWishlistBtn');
    if (modalBtn) {
      const pid = Number(modalBtn.dataset.pid);
      if (this.has(pid)) {
        modalBtn.classList.add('active');
        modalBtn.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" style="color: var(--red);"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>`;
      } else {
        modalBtn.classList.remove('active');
        modalBtn.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>`;
      }
    }
  },

  syncAllSubscriptions() {
    const user = JSON.parse(localStorage.getItem('rk_user') || 'null');
    if (!user || !user.email || !this.items.length) return;

    // Subscribe to all wishlisted items automatically on login/load
    this.items.forEach(item => {
      fetch('/api/wishlist/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: user.email, productId: item.id })
      }).catch(err => console.error('Failed to sync stock alert subscription:', err));
    });
  },

  renderDrawer() {
    const container = document.getElementById('wishlistItems');
    if (!container) return;

    this.updateBadge();

    if (!this.items.length) {
      container.innerHTML = `
        <div class="empty-cart">
          <div style="font-size:3.5rem; margin-bottom: 12px;">❤️</div>
          <p style="font-weight: 700; color: var(--ink);">Your wishlist is empty</p>
          <small style="color: var(--muted); font-size: 0.8rem; display: block; margin-top: 4px;">Save items you love to shop them later!</small>
        </div>`;
      return;
    }

    const user = JSON.parse(localStorage.getItem('rk_user') || 'null');
    let alertBoxHTML = '';
    
    if (user && user.email) {
      alertBoxHTML = `
        <div class="wishlist-stock-alert-box" style="margin-bottom: 16px; padding: 10px 12px; background: rgba(15,118,110,0.05); border: 1px dashed var(--p); border-radius: 10px; font-size: 0.75rem; color: var(--p); display: flex; align-items: center; gap: 8px;">
          <span style="font-size:1.1rem">🔔</span>
          <span>We'll automatically email you at <strong>${user.email}</strong> when wishlisted items are back in stock!</span>
        </div>
      `;
    } else {
      const savedEmail = localStorage.getItem('rk_wl_subscribed_email') || '';
      alertBoxHTML = `
        <div class="wishlist-stock-alert-box" style="margin-bottom: 16px; padding: 12px; background: var(--bg); border: 1.5px solid var(--border); border-radius: 10px;">
          <p style="font-size: 0.78rem; font-weight: 700; margin: 0 0 4px; color: var(--ink); display: flex; align-items: center; gap: 6px;"><span style="font-size:1rem">📧</span> Stock Alerts</p>
          <p style="font-size: 0.7rem; color: var(--muted); margin: 0 0 8px;">Enter your email to get notified when these items go back in stock.</p>
          <div style="display: flex; gap: 6px;">
            <input type="email" id="wlSubscribeEmail" value="${savedEmail}" placeholder="you@email.com" style="flex: 1; padding: 6px 10px; border-radius: 6px; border: 1px solid var(--border); font-size: 0.78rem; outline: none; background: var(--white); color: var(--ink);">
            <button id="wlSubscribeBtn" style="padding: 6px 12px; font-size: 0.78rem; font-weight: 700; background: var(--p); color: #fff; border: none; border-radius: 6px; cursor: pointer; transition: background 0.2s;">Alert Me</button>
          </div>
        </div>
      `;
    }

    container.innerHTML = alertBoxHTML + `<div class="wishlist-items-list" style="display:flex; flex-direction:column; gap:12px;">` + this.items.map(item => `
      <div class="cart-item" data-id="${item.id}" style="position:relative;">
        <div class="cart-item-thumb" style="background:${item.thumbBg || '#f0eef8'}">
          ${item.imageUrl ? `<img src="${item.imageUrl}" alt="${item.name}">` : (item.emoji || '📦')}
        </div>
        <div class="cart-item-info">
          <div class="cart-item-name" style="font-weight: 700;">${item.name}</div>
          <div class="cart-item-price" style="color: var(--red); font-weight: 800; font-size: 0.95rem;">₹${item.price.toLocaleString('en-IN')}</div>
          <div class="wishlist-item-actions" style="margin-top: 8px;">
            <button class="wl-add-cart-btn" data-id="${item.id}">Add to Cart 🛒</button>
          </div>
        </div>
        <button class="wl-remove-btn" data-remove="${item.id}" title="Remove from Wishlist">×</button>
      </div>`).join('') + `</div>`;

    // bind controls
    container.querySelectorAll('.wl-add-cart-btn').forEach(btn => {
      btn.onclick = () => {
        this.moveToCart(Number(btn.dataset.id));
      };
    });
    container.querySelectorAll('.wl-remove-btn').forEach(btn => {
      btn.onclick = () => {
        this.remove(Number(btn.dataset.remove));
      };
    });

    const subscribeBtn = container.querySelector('#wlSubscribeBtn');
    if (subscribeBtn) {
      subscribeBtn.onclick = () => {
        const emailInput = container.querySelector('#wlSubscribeEmail');
        const email = emailInput ? emailInput.value.trim() : '';
        if (!email || !email.includes('@')) return showToast('Please enter a valid email address 📧', 'error');

        // Subscribe all wishlist products
        Promise.all(this.items.map(item => 
          fetch('/api/wishlist/subscribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, productId: item.id })
          })
        ))
        .then(() => {
          showToast('Stock alert subscription active! 🔔', 'success');
          // Save email locally to make it smooth
          localStorage.setItem('rk_wl_subscribed_email', email);
          this.renderDrawer();
        })
        .catch(err => {
          console.error(err);
          showToast('Failed to subscribe', 'error');
        });
      };
    }
  },

  openDrawer() {
    // Close cart drawer if open
    if (typeof Cart !== 'undefined') {
      Cart.closeDrawer();
    }
    document.getElementById('wishlistDrawer').classList.add('open');
    document.getElementById('drawerOverlay').classList.add('open');
    this.renderDrawer();
  },

  closeDrawer() {
    document.getElementById('wishlistDrawer').classList.remove('open');
    // Only close overlay if both cart and wishlist drawers are closed
    const cartOpen = document.getElementById('cartDrawer') && document.getElementById('cartDrawer').classList.contains('open');
    if (!cartOpen) {
      document.getElementById('drawerOverlay').classList.remove('open');
    }
  }
};

// Init badge on load
Wishlist.updateBadge();
Wishlist.syncAllSubscriptions();

// Bind events
document.addEventListener('DOMContentLoaded', () => {
  const wlBtn = document.getElementById('wishlistBtn');
  if (wlBtn) wlBtn.onclick = () => Wishlist.openDrawer();
  const wlClose = document.getElementById('closeWishlist');
  if (wlClose) wlClose.onclick = () => Wishlist.closeDrawer();

  // Wire into drawer overlay click to close wishlist drawer too
  const overlay = document.getElementById('drawerOverlay');
  if (overlay) {
    const originalClick = overlay.onclick;
    overlay.onclick = (e) => {
      if (originalClick) originalClick(e);
      Wishlist.closeDrawer();
    };
  }
});
