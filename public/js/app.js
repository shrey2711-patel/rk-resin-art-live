// ── App State ────────────────────────────────────────────────
const App = {
  state: {
    activeCategory: 'All',
    searchQuery: '',
    page: 1,
    categories: [],
    bannerCur: 0,
    bannerTimer: null,
    lastOrderData: null, // store last order for invoice
    paymentMethod: 'online', // online (Razorpay) or cod (WhatsApp)
    appliedCoupon: null, // active coupon metadata
  },

  // ── Boot ──────────────────────────────────────────────────
  async init() {
    ThemeManager.init();
    await Promise.all([
      this.loadSettings(),
      this.loadBanners(),
      this.loadNav(),
      this.loadCategories(),
    ]);
    this.loadProducts();
    this.bindSearch();
    this.bindFooter();
    this.bindMobileNav();
    Auth.init();
    // Coupon apply listener
    const applyBtn = document.getElementById('applyPromoBtn');
    if (applyBtn) {
      applyBtn.onclick = async () => {
        const input = document.getElementById('ckPromoCode');
        const msgEl = document.getElementById('promoMsg');
        const code = input ? input.value.trim().toUpperCase() : '';

        if (!msgEl) return;
        msgEl.style.display = 'none';
        msgEl.textContent = '';
        msgEl.style.color = '';

        if (!code) {
          msgEl.textContent = 'Please enter a coupon code';
          msgEl.style.display = 'block';
          msgEl.style.color = 'var(--red)';
          return;
        }

        const isBuyNow = document.getElementById('placeOrderBtn')?._isBuyNow;
        const items = isBuyNow ? document.getElementById('placeOrderBtn')?._buyNowItems : Cart.items;
        const subtotal = items.reduce((s, i) => s + i.price * i.qty, 0);

        try {
          applyBtn.textContent = 'Checking...';
          applyBtn.disabled = true;
          const result = await API.validateCoupon(code, subtotal);

          App.state.appliedCoupon = {
            code: result.coupon.code,
            type: result.coupon.type,
            value: result.coupon.value,
            discount: result.discount
          };

          msgEl.textContent = `Coupon applied successfully! Saved ₹${result.discount} 🎉`;
          msgEl.style.display = 'block';
          msgEl.style.color = 'var(--green)';

          App.recalculateCheckout();
        } catch (e) {
          App.state.appliedCoupon = null;
          msgEl.textContent = e.message || 'Invalid coupon code';
          msgEl.style.display = 'block';
          msgEl.style.color = 'var(--red)';
          App.recalculateCheckout();
        } finally {
          applyBtn.textContent = 'Apply';
          applyBtn.disabled = false;
        }
      };
    }

    this.setupPaymentSelector();
    this.initRouter();
  },

  // ── Hash Router ───────────────────────────────────────────
  initRouter() {
    const route = () => {
      const hash = window.location.hash;
      const match = hash.match(/^#collection\/(.+)$/);
      if (match) {
        this.showCollectionPage(decodeURIComponent(match[1]));
      } else if (hash === '' || hash === '#') {
        this.showHomePage();
      }
    };
    window.addEventListener('hashchange', route);
    // Run on load (in case page is opened with a hash)
    route();

    // Back button in collection header
    const backBtn = document.getElementById('collPageBack');
    if (backBtn) backBtn.onclick = () => { window.location.hash = ''; };
  },

  showCollectionPage(catName) {
    // Hide home-only sections
    const banner = document.getElementById('bannerSection');
    const colls  = document.getElementById('collectionsSection');
    const header = document.getElementById('collectionPageHeader');
    if (banner)  banner.style.display  = 'none';
    if (colls)   colls.style.display   = 'none';
    if (header)  header.style.display  = '';

    // Update header text
    const titleEl    = document.getElementById('collPageTitle');
    const subtitleEl = document.getElementById('collPageSubtitle');
    if (titleEl)    titleEl.textContent    = catName;
    if (subtitleEl) subtitleEl.textContent = 'Browse all products in this collection';

    // Update shop heading & load products
    const shopHeading = document.getElementById('shopHeading');
    if (shopHeading) shopHeading.textContent = catName;

    this.state.activeCategory = catName;
    this.state.searchQuery    = '';
    this.state.page           = 1;
    const si = document.getElementById('searchInput');
    if (si) si.value = '';

    this.renderCatFilters(this.state.categories); // keep pills in sync
    this.syncNavbarActiveState();
    this.loadProducts();

    window.scrollTo({ top: 0, behavior: 'smooth' });
  },

  showHomePage() {
    const banner = document.getElementById('bannerSection');
    const colls  = document.getElementById('collectionsSection');
    const header = document.getElementById('collectionPageHeader');
    if (banner)  banner.style.display  = '';
    if (colls)   colls.style.display   = '';
    if (header)  header.style.display  = 'none';

    const shopHeading = document.getElementById('shopHeading');
    if (shopHeading) shopHeading.textContent = 'All Products';

    this.state.activeCategory = 'All';
    this.state.searchQuery    = '';
    this.state.page           = 1;
    const si = document.getElementById('searchInput');
    if (si) si.value = '';

    this.renderCatFilters(this.state.categories);
    this.syncNavbarActiveState();
    this.loadProducts();

    window.scrollTo({ top: 0, behavior: 'smooth' });
  },

  productMedia(product, fallbackBg = '#f0eef8', size = 'card') {
    if (product.imageUrl) {
      return `
        <div class="prod-image-wrap ${size}" style="background:${fallbackBg}">
          <img class="prod-image" src="${product.imageUrl}" alt="${product.name}" loading="lazy">
        </div>`;
    }
    return `<div class="prod-emoji-fallback ${size}" style="background:${fallbackBg}">${product.emoji || '📦'}</div>`;
  },

  setupPaymentSelector() {
    const onlineOpt = document.getElementById('payOnlineOpt');
    const codOpt = document.getElementById('payCodOpt');
    if (!onlineOpt || !codOpt) return;

    onlineOpt.onclick = () => {
      onlineOpt.classList.add('active');
      codOpt.classList.remove('active');
      this.state.paymentMethod = 'online';
      document.getElementById('placeOrderBtn').textContent = 'Pay securely with Razorpay';
    };

    codOpt.onclick = () => {
      codOpt.classList.add('active');
      onlineOpt.classList.remove('active');
      this.state.paymentMethod = 'cod';
      document.getElementById('placeOrderBtn').textContent = 'Send Inquiry on WhatsApp';
    };
  },

  // ── Settings / Announce ───────────────────────────────────
  async loadSettings() {
    try {
      const s = await API.getSettings();
      document.getElementById('announceText').textContent = s.announce;
    } catch {}
  },

  // ── Banners ───────────────────────────────────────────────
  async loadBanners() {
    try {
      const banners = await API.getBanners();
      this.renderBanners(banners);
    } catch {}
  },

  renderBanners(banners) {
    const track = document.getElementById('bannerTrack');
    const dots = document.getElementById('bannerDots');
    if (!track || !banners.length) return;
    const cur = this.state.bannerCur;

    track.innerHTML = banners.map(b => `
      <div class="banner-slide" style="cursor: zoom-in;">
        ${b.imageUrl ? `<img class="bs-background-image" src="${b.imageUrl}" alt="Banner">` : ''}
      </div>`).join('');

    dots.innerHTML = banners.map((_, i) =>
      `<button class="bdot ${i === cur ? 'active' : ''}" data-bi="${i}"></button>`
    ).join('');

    track.style.transform = `translateX(-${cur * 100}%)`;

    dots.querySelectorAll('.bdot').forEach(d => {
      d.onclick = () => this.goBanner(Number(d.dataset.bi), banners);
    });

    // Setup robust click-to-zoom that works perfectly on desktops, touchscreen laptops, and standard phones
    track.querySelectorAll('.banner-slide').forEach((slide, idx) => {
      let touchStartX = 0;
      let touchStartY = 0;
      let isDrag = false;

      slide.addEventListener('touchstart', (e) => {
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
        isDrag = false;
      }, { passive: true });

      slide.addEventListener('touchmove', (e) => {
        const moveX = Math.abs(e.touches[0].clientX - touchStartX);
        const moveY = Math.abs(e.touches[0].clientY - touchStartY);
        if (moveX > 10 || moveY > 10) {
          isDrag = true;
        }
      }, { passive: true });

      slide.onclick = () => {
        if (isDrag) {
          isDrag = false;
          return; // Dragging to slide, block zoom trigger
        }
        const b = banners[idx];
        if (b && b.imageUrl) {
          this.openBannerZoom(b.imageUrl);
        }
      };
    });

    clearTimeout(this.state.bannerTimer);
    this.state.bannerTimer = setTimeout(() => this.goBanner((cur + 1) % banners.length, banners), 5000); // 5s Autoplay

    document.getElementById('bPrev').onclick = () => {
      this.goBanner((cur - 1 + banners.length) % banners.length, banners);
    };
    document.getElementById('bNext').onclick = () => {
      this.goBanner((cur + 1) % banners.length, banners);
    };
  },

  goBanner(n, banners) {
    this.state.bannerCur = n;
    this.renderBanners(banners);
  },

  openBannerZoom(url) {
    const modal = document.getElementById('bannerZoomModal');
    const img = document.getElementById('zoomModalImg');
    if (!modal || !img) return;

    img.src = url;
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden'; // Lock background scroll

    // Reset zoom and pan state
    let scale = 1;
    let lastScale = 1;
    let startX = 0, startY = 0;
    let translateX = 0, translateY = 0;
    let lastTranslateX = 0, lastTranslateY = 0;
    let isPanning = false;
    let startDistance = 0;
    let lastTap = 0;

    // Zoom focus tracking helper variables
    let startScale = 1;
    let startMidX = 0, startMidY = 0;
    let startTx = 0, startTy = 0;

    img.style.transform = 'translate(0px, 0px) scale(1)';

    const updateTransform = () => {
      newImg.style.transform = `translate(${translateX}px, ${translateY}px) scale(${scale})`;
    };

    // Remove existing listeners by cloning the image element to prevent leaks
    const newImg = img.cloneNode(true);
    img.parentNode.replaceChild(newImg, img);

    // Prevent native page scrolling / pull-to-refresh when dragging or interacting inside the modal overlay
    modal.addEventListener('touchmove', (e) => {
      e.preventDefault();
    }, { passive: false });

    // Touch events for mobile pinch-to-zoom and pan
    newImg.addEventListener('touchstart', (e) => {
      newImg.style.transition = 'none'; // Instant responsiveness during touch movements
      if (e.touches.length === 1) {
        isPanning = true;
        startX = e.touches[0].clientX - lastTranslateX;
        startY = e.touches[0].clientY - lastTranslateY;
      } else if (e.touches.length === 2) {
        isPanning = false;
        startDistance = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
        startMidX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
        startMidY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
        startTx = translateX;
        startTy = translateY;
        startScale = scale;
      }
    }, { passive: false });

    newImg.addEventListener('touchmove', (e) => {
      if (e.touches.length === 1 && isPanning && scale > 1) {
        e.preventDefault();
        translateX = e.touches[0].clientX - startX;
        translateY = e.touches[0].clientY - startY;
        updateTransform();
      } else if (e.touches.length === 2) {
        e.preventDefault(); // Block browser native viewport zooming
        const dist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
        if (startDistance > 0) {
          scale = Math.max(1, Math.min(4, startScale * (dist / startDistance)));
          
          // Calculate pinch midpoint
          const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
          const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
          
          // Zoom focus relative to the pinch centroid (center-relative calculations)
          const Cx = window.innerWidth / 2;
          const Cy = window.innerHeight / 2;
          const factor = scale / startScale;
          translateX = (midX - Cx) - factor * (startMidX - Cx - startTx);
          translateY = (midY - Cy) - factor * (startMidY - Cy - startTy);
          
          updateTransform();
        }
      }
    }, { passive: false });

    newImg.addEventListener('touchend', (e) => {
      isPanning = false;
      lastScale = scale;
      lastTranslateX = translateX;
      lastTranslateY = translateY;
      
      if (e.touches.length === 1) {
        // Smoothly transition remaining finger to single-finger panning
        isPanning = true;
        startX = e.touches[0].clientX - lastTranslateX;
        startY = e.touches[0].clientY - lastTranslateY;
      } else if (e.touches.length < 2) {
        startDistance = 0;
      }

      // If zoomed out, slide everything smoothly back to center coordinates
      if (scale <= 1) {
        newImg.style.transition = 'transform 0.25s ease-out';
        scale = 1;
        translateX = 0;
        translateY = 0;
        lastScale = 1;
        lastTranslateX = 0;
        lastTranslateY = 0;
        updateTransform();
      }

      // Double tap detected: reset or zoom directly to 2.5x at the tapped position
      const now = Date.now();
      if (now - lastTap < 300) {
        newImg.style.transition = 'transform 0.25s ease-out';
        if (scale > 1) {
          scale = 1;
          translateX = 0;
          translateY = 0;
        } else {
          scale = 2.5;
          const touch = e.changedTouches[0];
          if (touch) {
            const tapX = touch.clientX;
            const tapY = touch.clientY;
            const Cx = window.innerWidth / 2;
            const Cy = window.innerHeight / 2;
            translateX = (tapX - Cx) * (1 - scale);
            translateY = (tapY - Cy) * (1 - scale);
          } else {
            translateX = 0;
            translateY = 0;
          }
        }
        lastScale = scale;
        lastTranslateX = translateX;
        lastTranslateY = translateY;
        updateTransform();
      }
      lastTap = now;
    }, { passive: false });

    // Mouse events for laptop/desktop drag-to-pan when zoomed in
    let isMouseDown = false;
    let mouseStartX = 0;
    let mouseStartY = 0;

    newImg.addEventListener('mousedown', (e) => {
      if (scale > 1) {
        e.preventDefault();
        isMouseDown = true;
        newImg.style.cursor = 'grabbing';
        mouseStartX = e.clientX - translateX;
        mouseStartY = e.clientY - translateY;
      }
    });

    window.addEventListener('mousemove', (e) => {
      if (isMouseDown && scale > 1) {
        translateX = e.clientX - mouseStartX;
        translateY = e.clientY - mouseStartY;
        updateTransform();
      }
    });

    window.addEventListener('mouseup', () => {
      if (isMouseDown) {
        isMouseDown = false;
        newImg.style.cursor = 'zoom-in';
        lastTranslateX = translateX;
        lastTranslateY = translateY;
      }
    });

    // Wheel / Trackpad pinch-to-zoom for laptops and desktops
    newImg.addEventListener('wheel', (e) => {
      e.preventDefault(); // Stop standard page scroll
      
      const zoomFactor = 0.08;
      const delta = -e.deltaY;
      
      newImg.style.transition = 'none'; // Smooth instant update
      
      const prevScale = scale;
      if (delta > 0) {
        scale = Math.min(4, scale + zoomFactor);
      } else {
        scale = Math.max(1, scale - zoomFactor);
      }
      
      if (scale <= 1) {
        scale = 1;
        translateX = 0;
        translateY = 0;
        lastTranslateX = 0;
        lastTranslateY = 0;
      } else {
        // Zoom relative to the exact cursor position on trackpads/mice
        const cursorX = e.clientX;
        const cursorY = e.clientY;
        const Cx = window.innerWidth / 2;
        const Cy = window.innerHeight / 2;
        const factor = scale / prevScale;
        translateX = (cursorX - Cx) - factor * (cursorX - Cx - translateX);
        translateY = (cursorY - Cy) - factor * (cursorY - Cy - translateY);
      }
      
      updateTransform();
      lastScale = scale;
      lastTranslateX = translateX;
      lastTranslateY = translateY;
    }, { passive: false });

    // Single click handler for laptop/desktop click-to-zoom toggle
    newImg.addEventListener('click', (e) => {
      // If we just finished a mouse drag/pan, do not toggle zoom!
      if (Math.abs(translateX - lastTranslateX) > 3 || Math.abs(translateY - lastTranslateY) > 3) {
        return;
      }
      
      newImg.style.transition = 'transform 0.25s ease-out';
      if (scale > 1) {
        scale = 1;
        translateX = 0;
        translateY = 0;
      } else {
        scale = 2.5;
        // Center the zoom on click focus coordinates
        const clickX = e.clientX;
        const clickY = e.clientY;
        const Cx = window.innerWidth / 2;
        const Cy = window.innerHeight / 2;
        translateX = (clickX - Cx) * (1 - scale);
        translateY = (clickY - Cy) * (1 - scale);
      }
      lastScale = scale;
      lastTranslateX = translateX;
      lastTranslateY = translateY;
      updateTransform();
    });

    // Close logic
    const closeBtn = document.getElementById('closeZoomModal');
    const closeModal = () => {
      modal.style.display = 'none';
      document.body.style.overflow = '';
      newImg.src = '';
    };
    
    closeBtn.onclick = closeModal;
    modal.onclick = (e) => {
      if (e.target === modal || e.target === modal.querySelector('.zoom-modal-content')) {
        closeModal();
      }
    };
  },

  // ── Navigation ────────────────────────────────────────────
  async loadNav() {
    try {
      const links = await API.getNav();
      
      // 1. Populate desktop rows
      [1, 2, 3].forEach(row => {
        const el = document.getElementById(`navRow${row}`);
        if (!el) return;
        el.innerHTML = links
          .filter(l => l.row === row)
          .map(l => `<button class="nav-link ${l.featured ? 'featured' : ''}" data-cat="${l.label}">${l.label}</button>`)
          .join('');
      });

      // 2. Populate mobile drawer
      const mobileEl = document.getElementById('mobileNavItems');
      if (mobileEl) {
        let mobileHTML = '';
        const row1Links = links.filter(l => l.row === 1);
        const row2Links = links.filter(l => l.row === 2);
        const row3Links = links.filter(l => l.row === 3);

        mobileHTML += `
          <div class="mobile-nav-section">
            <h4 class="mn-section-title">✨ Featured Categories</h4>
            <div class="mn-links-grid">
              ${row1Links.map(l => `<button class="mn-link ${l.featured ? 'featured' : ''}" data-cat="${l.label}">${l.label}</button>`).join('')}
            </div>
          </div>
          <div class="mobile-nav-section" style="margin-top: 20px;">
            <h4 class="mn-section-title">🎨 Premium Supplies</h4>
            <div class="mn-links-grid">
              ${row2Links.map(l => `<button class="mn-link ${l.featured ? 'featured' : ''}" data-cat="${l.label}">${l.label}</button>`).join('')}
            </div>
          </div>
          <div class="mobile-nav-section" style="margin-top: 20px;">
            <h4 class="mn-section-title">💬 Connect & Support</h4>
            <div class="mn-links-grid">
              ${row3Links.map(l => `<button class="mn-link ${l.featured ? 'featured' : ''}" data-cat="${l.label}">${l.label}</button>`).join('')}
            </div>
          </div>
          <div class="mobile-nav-section" style="margin-top: 25px; border-top: 1.5px dashed var(--border); padding-top: 15px;">
            <button class="mn-admin-btn" id="mobileOpenAdminBtn">
              ⚙️ Admin Control Panel
            </button>
          </div>
        `;
        mobileEl.innerHTML = mobileHTML;
      }

      // 3. Attach click handlers for all links (desktop + mobile)
      const allNavLinks = document.querySelectorAll('.site-nav .nav-link, .mobile-nav-drawer .mn-link');
      allNavLinks.forEach(a => {
        a.onclick = (e) => {
          e.preventDefault();
          const label = a.dataset.cat;
          
          // Close mobile menu drawer automatically on link click
          const drawer = document.getElementById('mobileNavDrawer');
          const overlay = document.getElementById('drawerOverlay');
          if (drawer) drawer.classList.remove('open');
          const cartOpen = document.getElementById('cartDrawer') && document.getElementById('cartDrawer').classList.contains('open');
          const wlOpen = document.getElementById('wishlistDrawer') && document.getElementById('wishlistDrawer').classList.contains('open');
          if (!cartOpen && !wlOpen && overlay) overlay.classList.remove('open');

          if (label === 'WhatsApp Community') {
            window.open('https://wa.me/918141994995', '_blank');
            return;
          }
          if (label === 'Contact Us') {
            const footer = document.querySelector('.site-footer');
            if (footer) footer.scrollIntoView({ behavior: 'smooth' });
            return;
          }
          const resolved = this.resolveCategoryName(label);
          this.filterByCategory(resolved);
        };
      });

      // 4. Attach click event for mobile admin button
      const mobAdminBtn = document.getElementById('mobileOpenAdminBtn');
      if (mobAdminBtn) {
        mobAdminBtn.onclick = () => {
          const drawer = document.getElementById('mobileNavDrawer');
          const overlay = document.getElementById('drawerOverlay');
          if (drawer) drawer.classList.remove('open');
          const cartOpen = document.getElementById('cartDrawer') && document.getElementById('cartDrawer').classList.contains('open');
          const wlOpen = document.getElementById('wishlistDrawer') && document.getElementById('wishlistDrawer').classList.contains('open');
          if (!cartOpen && !wlOpen && overlay) overlay.classList.remove('open');
          
          document.getElementById('adminOverlay').classList.add('open');
        };
      }

      this.syncNavbarActiveState();
    } catch {}
  },

  resolveCategoryName(label) {
    if (!label) return 'All';
    const lbl = label.trim().toLowerCase();
    if (lbl === 'home' || lbl === 'all products') return 'All';
    if (lbl === 'new arrival') return 'New Arrival';
    for (const cat of this.state.categories) {
      const catName = cat.name.toLowerCase();
      if (catName === lbl || catName === lbl + 's' || lbl === catName + 's' ||
          catName.includes(lbl) || lbl.includes(catName)) {
        return cat.name;
      }
    }
    if (lbl === 'resin') return 'Resins';
    if (lbl === 'candle material') return 'Candle';
    return label;
  },

  syncNavbarActiveState() {
    const activeCat = this.state.activeCategory;
    document.querySelectorAll('.site-nav .nav-link, .mobile-nav-drawer .mn-link').forEach(a => {
      const label = a.dataset.cat;
      const linkCat = this.resolveCategoryName(label);
      a.classList.toggle('active', linkCat === activeCat);
    });
  },

  // ── Categories ────────────────────────────────────────────
  async loadCategories() {
    try {
      const cats = await API.getCategories();
      this.state.categories = cats;
      this.renderCatFilters(cats);
      this.renderCollections(cats); // render collections grid
    } catch {}
  },

  renderCatFilters(cats) {
    const row = document.getElementById('catFilterRow');
    if (!row) return;
    const all = [{ id: 0, name: 'All', emoji: '🛍', color: '#f0eef8' }, ...cats];
    row.innerHTML = all.map(c =>
      `<button class="cat-pill ${this.state.activeCategory === c.name ? 'active' : ''}" data-name="${c.name}">
        ${c.emoji} ${c.name}
       </button>`
    ).join('');
    row.querySelectorAll('.cat-pill').forEach(btn => {
      btn.onclick = () => this.filterByCategory(btn.dataset.name);
    });
  },

  async renderCollections(cats) {
    const grid = document.getElementById('collectionsGrid');
    if (!grid || !cats.length) return;

    const MAX_VISIBLE = 8;

    // Fetch one product per category to get a cover image, in parallel
    const entries = await Promise.all(cats.map(async cat => {
      try {
        const res = await API.getProducts({ category: cat.name, limit: 1, page: 1 });
        const img = res.products && res.products[0] && res.products[0].imageUrl ? res.products[0].imageUrl : null;
        return { cat, img };
      } catch {
        return { cat, img: null };
      }
    }));

    const buildCard = ({ cat, img }, hidden) => {
      const thumb = img
        ? `<img src="${img}" alt="${cat.name}" loading="lazy">`
        : `<div class="coll-emoji-fallback" style="background:${cat.color || '#f0eef8'}">${cat.emoji || '📦'}</div>`;
      return `
        <div class="collection-card${hidden ? ' coll-hidden' : ''}" data-coll="${cat.name}" title="Browse ${cat.name}" role="button" tabindex="0" aria-label="Browse ${cat.name} collection">
          <div class="collection-img-wrap">${thumb}</div>
          <div class="collection-label">
            <span>${cat.name}</span>
            <span class="coll-arrow">→</span>
          </div>
        </div>`;
    };

    const hasMore = entries.length > MAX_VISIBLE;
    grid.innerHTML = entries.map((e, i) => buildCard(e, i >= MAX_VISIBLE)).join('');

    // "View all" button below the grid
    const section = document.getElementById('collectionsSection');
    const existing = section.querySelector('.coll-view-all-wrap');
    if (existing) existing.remove();

    if (hasMore) {
      const wrap = document.createElement('div');
      wrap.className = 'coll-view-all-wrap';
      let expanded = false;
      wrap.innerHTML = `<button class="coll-view-all-btn" id="collViewAllBtn">View all</button>`;
      section.querySelector('.collections-inner').appendChild(wrap);

      wrap.querySelector('#collViewAllBtn').onclick = () => {
        expanded = !expanded;
        grid.querySelectorAll('.coll-hidden').forEach(c => {
          c.style.display = expanded ? '' : 'none';
        });
        // Remove display:none initially set by CSS
        if (expanded) {
          grid.querySelectorAll('.coll-hidden').forEach(c => c.classList.remove('coll-hidden'));
          wrap.querySelector('#collViewAllBtn').textContent = 'Show less';
        } else {
          wrap.querySelector('#collViewAllBtn').textContent = 'View all';
        }
      };
    }

    // Click: navigate to dedicated collection page via hash
    grid.querySelectorAll('.collection-card').forEach(card => {
      const handler = () => {
        window.location.hash = `#collection/${encodeURIComponent(card.dataset.coll)}`;
      };
      card.onclick = handler;
      card.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') handler(); };
    });
  },

  filterByCategory(name) {
    this.state.activeCategory = name;
    this.state.searchQuery = '';
    this.state.page = 1;
    document.getElementById('searchInput').value = '';

    const heading = document.getElementById('shopHeading');
    if (name === 'All') heading.textContent = 'All Products';
    else if (name === 'New Arrival') heading.textContent = 'New Arrivals';
    else heading.textContent = name;

    this.renderCatFilters(this.state.categories);
    this.syncNavbarActiveState();
    this.loadProducts();

    const shopMain = document.getElementById('shopMain');
    if (shopMain) shopMain.scrollIntoView({ behavior: 'smooth' });
  },

  // ── Products ──────────────────────────────────────────────
  async loadProducts() {
    const grid = document.getElementById('prodGrid');
    grid.innerHTML = '<div class="loading-state"><div class="spinner"></div><p>Loading products...</p></div>';

    try {
      const params = { page: this.state.page, limit: 20 };
      if (this.state.activeCategory !== 'All') {
        if (this.state.activeCategory === 'New Arrival') params.badge = 'New';
        else params.category = this.state.activeCategory;
      }
      if (this.state.searchQuery) params.search = this.state.searchQuery;

      const [res, allReviews] = await Promise.all([
        API.getProducts(params),
        API.get('/api/reviews/summary').catch(() => [])
      ]);

      // Inject rating data into each product
      const reviewMap = {};
      (allReviews || []).forEach(r => {
        if (!reviewMap[r.productId]) reviewMap[r.productId] = { total: 0, count: 0 };
        reviewMap[r.productId].total += r.rating;
        reviewMap[r.productId].count += 1;
      });
      res.products = res.products.map(p => {
        const rm = reviewMap[p.id];
        if (rm && rm.count > 0) {
          p._avgRating = Math.round((rm.total / rm.count) * 10) / 10;
          p._ratingCount = rm.count;
        }
        return p;
      });

      this.renderProducts(res);
    } catch (e) {
      grid.innerHTML = `<div class="no-results"><div class="nr-icon">😕</div><p>Failed to load products</p><small>${e.message}</small></div>`;
    }
  },

  renderProducts({ products, total, page, pages }) {
    const grid = document.getElementById('prodGrid');
    const meta = document.getElementById('shopMeta');

    meta.textContent = `${total} product${total !== 1 ? 's' : ''} found`;

    if (!products.length) {
      grid.innerHTML = `<div class="no-results"><div class="nr-icon">🔍</div><p>No products found</p><small>Try a different category or search term</small></div>`;
      document.getElementById('pagination').innerHTML = '';
      return;
    }

    const catMap = {};
    this.state.categories.forEach(c => catMap[c.name] = c);

    grid.innerHTML = products.map(p => {
      const cat = catMap[p.category] || {};
      const badgeHTML = p.badge ? `<div class="prod-badge badge-${p.badge.toLowerCase()}">${p.badge}</div>` : '';
      const origHTML = p.originalPrice ? `<s>₹${p.originalPrice}</s>` : '';
      const stockHTML = p.stock > 0 && p.stock <= 10 ? `<div class="stock-low">⚡ Only ${p.stock} left!</div>` : '';
      const avgRating = p._avgRating || 0;
      const ratingCount = p._ratingCount || 0;
      const starsHTML = avgRating > 0
        ? `<div class="prod-rating"><span class="stars">${'★'.repeat(Math.round(avgRating))}${'☆'.repeat(5 - Math.round(avgRating))}</span><span class="rating-count">(${ratingCount})</span></div>`
        : '';

      const isWishlisted = typeof Wishlist !== 'undefined' && Wishlist.has(p.id);
      const heartIcon = isWishlisted
        ? `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" style="color: var(--red);"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>`
        : `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>`;
      const wishlistCardBtnHTML = `<button class="wishlist-card-btn ${isWishlisted ? 'active' : ''}" data-pid="${p.id}" title="${isWishlisted ? 'Remove from Wishlist' : 'Add to Wishlist'}">${heartIcon}</button>`;

      return `
        <div class="prod-card" data-pid="${p.id}">
          <div class="prod-thumb" style="background:${cat.color || '#f0eef8'}">
            ${this.productMedia(p, cat.color || '#f0eef8')}
            ${wishlistCardBtnHTML}
            ${badgeHTML}
          </div>
          <div class="prod-body">
            <div class="prod-body-header">
              <div class="prod-cat">${p.category}</div>
            </div>
            <div class="prod-name">${p.name}</div>
            ${starsHTML}
            <div class="prod-price">₹${p.price} ${origHTML}</div>
            ${stockHTML}
            <div class="prod-card-btns">
              <button class="add-to-cart-btn" data-pid="${p.id}">Add to Cart</button>
              <button class="buy-now-btn" data-pid="${p.id}">Buy Now</button>
            </div>
          </div>
        </div>`;
    }).join('');

    // Click handlers — open modal on card click (but not on buttons or card heart)
    grid.querySelectorAll('.prod-card').forEach(card => {
      card.onclick = (e) => {
        if (!e.target.classList.contains('add-to-cart-btn') && 
            !e.target.classList.contains('buy-now-btn') && 
            !e.target.closest('.wishlist-card-btn')) {
          this.openProductModal(Number(card.dataset.pid), products);
        }
      };
    });

    // Toggle Wishlist on card heart click
    grid.querySelectorAll('.wishlist-card-btn').forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        const prod = products.find(p => p.id === Number(btn.dataset.pid));
        if (prod) {
          const cat = catMap[prod.category] || {};
          if (typeof Wishlist !== 'undefined') {
            Wishlist.toggle({ ...prod, thumbBg: cat.color || '#f0eef8' });
          }
        }
      };
    });

    // Add to Cart
    grid.querySelectorAll('.add-to-cart-btn').forEach(btn => {
      btn.onclick = async (e) => {
        e.stopPropagation();
        const prod = products.find(p => p.id === Number(btn.dataset.pid));
        if (prod) {
          const cat = catMap[prod.category] || {};
          Cart.add({ ...prod, thumbBg: cat.color || '#f0eef8' });
          btn.textContent = '✓ Added!';
          btn.classList.add('added');
          setTimeout(() => { btn.textContent = 'Add to Cart'; btn.classList.remove('added'); }, 1500);
        }
      };
    });

    // Buy Now — skip cart, go directly to checkout
    grid.querySelectorAll('.buy-now-btn').forEach(btn => {
      btn.onclick = async (e) => {
        e.stopPropagation();
        const prod = products.find(p => p.id === Number(btn.dataset.pid));
        if (prod) {
          const cat = catMap[prod.category] || {};
          this.openBuyNowCheckout(prod, cat);
        }
      };
    });

    this.renderPagination(page, pages);
  },

  // ── Buy Now (direct checkout) ─────────────────────────────
  openBuyNowCheckout(prod, cat = {}) {
    // Temporarily override cart with just this product
    const buyNowItems = [{ ...prod, thumbBg: cat.color || '#f0eef8', qty: 1 }];

    Auth.fillCheckout();

    document.getElementById('checkoutTitle').textContent = 'Buy Now — Quick Checkout';
    document.getElementById('invoiceDownloadBtn').style.display = 'none';
    document.getElementById('checkoutModalOverlay').classList.add('open');

    // Reset payment selector to default (Online)
    this.state.paymentMethod = 'online';
    const onlineOpt = document.getElementById('payOnlineOpt');
    const codOpt = document.getElementById('payCodOpt');
    if (onlineOpt && codOpt) {
      onlineOpt.classList.add('active');
      codOpt.classList.remove('active');
    }

    // Override placeOrderBtn for this buy-now flow
    const btn = document.getElementById('placeOrderBtn');
    btn.textContent = 'Pay securely with Razorpay';
    btn._buyNowItems = buyNowItems;
    btn._isBuyNow = true;

    // Reset coupon state
    App.state.appliedCoupon = null;
    const promoInput = document.getElementById('ckPromoCode');
    if (promoInput) promoInput.value = '';
    const promoMsg = document.getElementById('promoMsg');
    if (promoMsg) { promoMsg.style.display = 'none'; promoMsg.textContent = ''; }

    App.recalculateCheckout();
  },

  renderPagination(page, pages) {
    const wrap = document.getElementById('pagination');
    if (pages <= 1) { wrap.innerHTML = ''; return; }
    let html = '';
    for (let i = 1; i <= pages; i++) {
      html += `<button class="page-btn ${i === page ? 'active' : ''}" data-page="${i}">${i}</button>`;
    }
    wrap.innerHTML = html;
    wrap.querySelectorAll('.page-btn').forEach(btn => {
      btn.onclick = () => {
        this.state.page = Number(btn.dataset.page);
        this.loadProducts();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      };
    });
  },

  // ── Product Modal ─────────────────────────────────────────
  async openProductModal(id, products) {
    const prod = products.find(p => p.id === id);
    if (!prod) return;
    const cat = this.state.categories.find(c => c.name === prod.category) || {};
    const origHTML = prod.originalPrice ? `<s>₹${prod.originalPrice}</s>` : '';
    const badgeHTML = prod.badge ? `<div class="prod-badge badge-${prod.badge.toLowerCase()}" style="display:inline-block;margin-bottom:10px">${prod.badge}</div>` : '';

    const isWl = typeof Wishlist !== 'undefined' && Wishlist.has(prod.id);
    const wlIcon = isWl
      ? `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" style="color: var(--red);"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>`
      : `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>`;

    // Build variants HTML
    const hasVariants = prod.variants && prod.variants.length > 0;
    const variantLabel = prod.variantLabel || 'Variant';
    const variantsHTML = hasVariants ? `
      <div class="modal-variants-block">
        <div class="modal-variants-title">${variantLabel}</div>
        <div class="modal-variants-chips">
          ${prod.variants.map((v, i) => `
            <button class="variant-chip${i === 0 ? ' selected' : ''}" data-vi="${i}" data-label="${v.label}" data-price="${v.price}" type="button">
              ${v.label}
              ${v.price !== prod.price ? `<span class="chip-price">₹${v.price}</span>` : ''}
            </button>`).join('')}
        </div>
      </div>` : '';

    const initPrice = hasVariants ? prod.variants[0].price : prod.price;

    document.getElementById('modalBody').innerHTML = `
      <div class="modal-prod-thumb" style="background:${cat.color || '#f0eef8'}">
        ${this.productMedia(prod, cat.color || '#f0eef8', 'modal')}
      </div>
      <div class="modal-prod-cat">${prod.category}</div>
      ${badgeHTML}
      <h2 class="modal-prod-name">${prod.name}</h2>
      <div class="modal-prod-price" id="modalPriceDisplay">₹${initPrice} ${origHTML}</div>
      ${variantsHTML}

      <!-- Modal Tabs -->
      <div class="modal-tabs">
        <button class="modal-tab active" id="modalTabInfo">📦 Product Info</button>
        <button class="modal-tab" id="modalTabReviews">⭐ Reviews &amp; Ratings</button>
      </div>

      <!-- Info Pane -->
      <div class="modal-pane" id="modalPaneInfo">
        <p class="modal-prod-desc">${prod.description || ''}</p>
        <div class="modal-prod-stock">${prod.stock > 0 ? `✅ In Stock (${prod.stock} units)` : '❌ Out of Stock'}</div>
        <div class="modal-btns">
          <button class="modal-add-btn" id="modalAddBtn" ${prod.stock === 0 ? 'disabled' : ''}>
            🛒 Add to Cart
          </button>
          <button class="modal-buy-now-btn" id="modalBuyNowBtn" ${prod.stock === 0 ? 'disabled' : ''}>
            ⚡ Buy Now
          </button>
          <button class="modal-wishlist-btn ${isWl ? 'active' : ''}" id="modalWishlistBtn" data-pid="${prod.id}" title="${isWl ? 'Remove from Wishlist' : 'Add to Wishlist'}">
            ${wlIcon}
          </button>
        </div>
      </div>

      <!-- Reviews Pane -->
      <div class="modal-pane" id="modalPaneReviews" style="display:none">
        <div id="reviewsContent"><div class="reviews-empty">Loading reviews...</div></div>
      </div>`;

    // Track currently selected variant
    let selectedVariant = hasVariants ? prod.variants[0] : null;

    // Variant chip selection
    if (hasVariants) {
      document.querySelectorAll('.variant-chip').forEach(chip => {
        chip.onclick = () => {
          document.querySelectorAll('.variant-chip').forEach(c => c.classList.remove('selected'));
          chip.classList.add('selected');
          const vi = parseInt(chip.dataset.vi);
          selectedVariant = prod.variants[vi];
          const priceEl = document.getElementById('modalPriceDisplay');
          if (priceEl) priceEl.innerHTML = `₹${selectedVariant.price} ${origHTML}`;
        };
      });
    }

    const getCartItem = () => {
      const base = { ...prod, thumbBg: cat.color || '#f0eef8' };
      if (selectedVariant) {
        base.price = selectedVariant.price;
        base.selectedVariant = selectedVariant.label;
        base.name = `${prod.name} (${variantLabel}: ${selectedVariant.label})`;
      }
      return base;
    };

    document.getElementById('modalAddBtn').onclick = () => {
      if (hasVariants && !selectedVariant) {
        showToast(`Please select a ${variantLabel} first`, 'error'); return;
      }
      Cart.add(getCartItem());
      document.getElementById('productModalOverlay').classList.remove('open');
    };

    document.getElementById('modalBuyNowBtn').onclick = () => {
      if (hasVariants && !selectedVariant) {
        showToast(`Please select a ${variantLabel} first`, 'error'); return;
      }
      document.getElementById('productModalOverlay').classList.remove('open');
      this.openBuyNowCheckout(getCartItem(), cat);
    };

    document.getElementById('modalWishlistBtn').onclick = () => {
      if (typeof Wishlist !== 'undefined') {
        Wishlist.toggle({ ...prod, thumbBg: cat.color || '#f0eef8' });
      }
    };

    // Tab switching
    document.getElementById('modalTabInfo').onclick = () => {
      document.getElementById('modalTabInfo').classList.add('active');
      document.getElementById('modalTabReviews').classList.remove('active');
      document.getElementById('modalPaneInfo').style.display = '';
      document.getElementById('modalPaneReviews').style.display = 'none';
    };
    document.getElementById('modalTabReviews').onclick = () => {
      document.getElementById('modalTabReviews').classList.add('active');
      document.getElementById('modalTabInfo').classList.remove('active');
      document.getElementById('modalPaneReviews').style.display = '';
      document.getElementById('modalPaneInfo').style.display = 'none';
    };

    document.getElementById('productModalOverlay').classList.add('open');

    // Load reviews asynchronously (preload in background)
    this.loadReviewsForModal(prod.id);
  },

  async loadReviewsForModal(productId) {
    const container = document.getElementById('reviewsContent');
    if (!container) return;
    try {
      const reviews = await API.getProductReviews(productId);
      const user = API.getCurrentUser();
      const token = localStorage.getItem('rk_user_token'); // ✅ correct token key

      // Compute average
      let avgHTML = '';
      if (reviews.length > 0) {
        const avg = reviews.reduce((s, r) => s + r.rating, 0) / reviews.length;
        const rounded = Math.round(avg * 10) / 10;
        avgHTML = `
          <div class="reviews-avg">
            <div class="avg-score">${rounded}</div>
            <div>
              <span class="avg-stars">${'★'.repeat(Math.round(avg))}${'☆'.repeat(5 - Math.round(avg))}</span>
              <span class="avg-label">${reviews.length} review${reviews.length !== 1 ? 's' : ''}</span>
            </div>
          </div>`;
      }

      // Review cards list
      const cardsHTML = reviews.length > 0
        ? `<div class="review-list">${reviews.map(r => `
            <div class="review-card">
              <div class="review-card-header">
                <span class="review-card-user">👤 ${r.userName}</span>
                <span class="review-card-stars">${'★'.repeat(r.rating)}${'☆'.repeat(5 - r.rating)}</span>
              </div>
              <div class="review-card-date">${new Date(r.createdAt).toLocaleDateString('en-IN', {day:'2-digit',month:'short',year:'numeric'})}</div>
              <div class="review-card-comment">${r.comment}</div>
            </div>`).join('')}</div>`
        : '<p class="reviews-empty">No reviews yet — be the first! 👇</p>';

      // Review write form
      let formHTML = '';
      if (!user || !token) {
        formHTML = `
          <div class="review-login-note">
            🔒 <a id="reviewLoginLink">Login to your account</a> to write a review
          </div>`;
      } else {
        const alreadyReviewed = reviews.some(r => r.userId === user.id);
        if (alreadyReviewed) {
          formHTML = `<div class="review-purchased-note">✅ You have already reviewed this product. Thank you!</div>`;
        } else {
          formHTML = `
            <div class="review-form" id="reviewForm">
              <h4>✍️ Write Your Review</h4>
              <p style="font-size:0.8rem;color:var(--muted);margin-bottom:10px">Tap the stars to rate, then write your experience below</p>
              <div class="star-picker" id="starPicker">
                <button type="button" data-star="1" title="1 star">★</button>
                <button type="button" data-star="2" title="2 stars">★</button>
                <button type="button" data-star="3" title="3 stars">★</button>
                <button type="button" data-star="4" title="4 stars">★</button>
                <button type="button" data-star="5" title="5 stars">★</button>
              </div>
              <div id="starLabel" style="font-size:0.8rem;color:var(--muted);margin-bottom:10px;min-height:18px"></div>
              <textarea id="reviewComment" placeholder="e.g. Great quality, fast delivery! Highly recommend 👍" rows="4"></textarea>
              <button class="review-submit-btn" id="reviewSubmitBtn">🚀 Submit Review</button>
            </div>`;
        }
      }

      container.innerHTML = avgHTML + cardsHTML + formHTML;

      // Bind login link
      const loginLink = document.getElementById('reviewLoginLink');
      if (loginLink) loginLink.onclick = () => {
        document.getElementById('productModalOverlay').classList.remove('open');
        Auth.open();
      };

      // Star labels for user feedback
      const starLabels = ['', 'Poor 😞', 'Fair 😐', 'Good 👍', 'Very Good 😊', 'Excellent! 🌟'];

      // Bind star picker
      let selectedRating = 0;
      const starBtns = document.querySelectorAll('#starPicker button');
      const starLabel = document.getElementById('starLabel');
      starBtns.forEach(btn => {
        btn.onclick = () => {
          selectedRating = Number(btn.dataset.star);
          starBtns.forEach(b => b.classList.toggle('active', Number(b.dataset.star) <= selectedRating));
          if (starLabel) starLabel.textContent = starLabels[selectedRating] || '';
        };
      });

      // Bind submit button
      const submitBtn = document.getElementById('reviewSubmitBtn');
      if (submitBtn) {
        submitBtn.onclick = async () => {
          const comment = document.getElementById('reviewComment').value.trim();
          if (!selectedRating) { showToast('⭐ Please tap a star to rate first!', 'error'); return; }
          if (!comment) { showToast('📝 Please write something about the product', 'error'); return; }
          submitBtn.disabled = true;
          submitBtn.textContent = 'Submitting...';
          try {
            await API.submitReview(productId, { rating: selectedRating, comment });
            showToast('Review submitted! Thank you 🎉', 'success');
            this.loadReviewsForModal(productId);
            // Refresh product cards to update rating
            this.loadProducts();
          } catch (e) {
            showToast(e.message || 'Could not submit review', 'error');
            submitBtn.disabled = false;
            submitBtn.textContent = 'Submit Review';
          }
        };
      }

    } catch {
      container.innerHTML = '<div class="reviews-empty">Could not load reviews.</div>';
    }
  },

  // ── Search ────────────────────────────────────────────────
  bindSearch() {
    const doSearch = () => {
      this.state.searchQuery = document.getElementById('searchInput').value.trim();
      this.state.activeCategory = 'All';
      this.state.page = 1;
      const q = this.state.searchQuery;
      document.getElementById('shopHeading').textContent = q ? `Results for "${q}"` : 'All Products';
      this.renderCatFilters(this.state.categories);
      this.loadProducts();
    };
    document.getElementById('searchBtn').onclick = doSearch;
    document.getElementById('searchInput').onkeydown = e => { if (e.key === 'Enter') doSearch(); };
  },

  bindFooter() {
    document.querySelectorAll('[data-footer-cat]').forEach(btn => {
      btn.onclick = () => {
        this.filterByCategory(btn.dataset.footerCat);
        document.getElementById('shopMain').scrollIntoView({ behavior: 'smooth' });
      };
    });
    document.getElementById('footerCartBtn').onclick = () => Cart.openDrawer();
    document.getElementById('footerAccountBtn').onclick = () => Auth.open();
  },

  bindMobileNav() {
    const openMobileNav = () => {
      document.getElementById('mobileNavDrawer').classList.add('open');
      document.getElementById('drawerOverlay').classList.add('open');
    };

    const closeMobileNav = () => {
      document.getElementById('mobileNavDrawer').classList.remove('open');
      // Only close overlay if both cart and wishlist are also closed
      const cartOpen = document.getElementById('cartDrawer') && document.getElementById('cartDrawer').classList.contains('open');
      const wlOpen = document.getElementById('wishlistDrawer') && document.getElementById('wishlistDrawer').classList.contains('open');
      if (!cartOpen && !wlOpen) {
        document.getElementById('drawerOverlay').classList.remove('open');
      }
    };

    const toggleBtn = document.getElementById('mobileNavBtn');
    if (toggleBtn) toggleBtn.onclick = openMobileNav;

    const closeBtn = document.getElementById('closeMobileNav');
    if (closeBtn) closeBtn.onclick = closeMobileNav;

    // Shared backdrop overlay click logic
    const overlay = document.getElementById('drawerOverlay');
    if (overlay) {
      const originalClick = overlay.onclick;
      overlay.onclick = (e) => {
        if (originalClick) originalClick(e);
        closeMobileNav();
      };
    }
  }
};

// ── Theme Manager (Dark / Light Mode) ────────────────────────
const ThemeManager = {
  init() {
    const saved = localStorage.getItem('rk_theme') || 'light';
    this.apply(saved);
    document.getElementById('themeToggleBtn').onclick = () => this.toggle();
  },
  apply(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    const btn = document.getElementById('themeToggleBtn');
    if (btn) btn.textContent = theme === 'dark' ? '☀️' : '🌙';
    localStorage.setItem('rk_theme', theme);
  },
  toggle() {
    const current = document.documentElement.getAttribute('data-theme') || 'light';
    this.apply(current === 'dark' ? 'light' : 'dark');
  }
};

// ── Auth ──────────────────────────────────────────────────────
const Auth = {
  user: API.getCurrentUser(),

  init() {
    this.render();
    document.getElementById('accountBtn').onclick = () => this.open();
    document.getElementById('closeAccount').onclick = () => this.close();
    document.getElementById('accountModalOverlay').onclick = (e) => {
      if (e.target === document.getElementById('accountModalOverlay')) this.close();
    };

    // Login/Register tabs
    document.querySelectorAll('.account-tab[data-account-tab]').forEach(btn => {
      btn.onclick = () => this.switchTab(btn.dataset.accountTab);
    });

    // Profile inner tabs (Profile / My Orders)
    document.querySelectorAll('.account-tab[data-profile-tab]').forEach(btn => {
      btn.onclick = () => this.switchProfileTab(btn.dataset.profileTab);
    });

    document.getElementById('loginBtn').onclick = () => this.login();
    document.getElementById('registerBtn').onclick = () => this.register();
    document.getElementById('logoutBtn').onclick = () => this.logout();
    document.getElementById('accountCheckoutBtn').onclick = () => this.close();

    // Edit profile toggle
    document.getElementById('editProfileToggleBtn').onclick = () => {
      const form = document.getElementById('profileEditForm');
      const isHidden = form.style.display === 'none';
      form.style.display = isHidden ? 'block' : 'none';
      document.getElementById('editProfileToggleBtn').textContent = isHidden ? '✕ Cancel Edit' : '✏️ Edit Profile';
      if (isHidden && this.user) {
        document.getElementById('editName').value = this.user.name || '';
        document.getElementById('editPhone').value = this.user.phone || '';
        document.getElementById('editAddress').value = this.user.address || '';
        document.getElementById('editCity').value = this.user.city || '';
        document.getElementById('editPin').value = this.user.pin || '';
      }
    };

    document.getElementById('saveProfileBtn').onclick = () => this.saveProfile();
  },

  open() {
    this.render();
    document.getElementById('accountModalOverlay').classList.add('open');
  },

  close() {
    document.getElementById('accountModalOverlay').classList.remove('open');
    // Reset profile edit form
    const form = document.getElementById('profileEditForm');
    if (form) form.style.display = 'none';
    const editBtn = document.getElementById('editProfileToggleBtn');
    if (editBtn) editBtn.textContent = '✏️ Edit Profile';
  },

  switchTab(tab) {
    document.querySelectorAll('.account-tab[data-account-tab]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.accountTab === tab);
    });
    document.querySelectorAll('.account-pane[id^="account-"]').forEach(pane => {
      pane.classList.toggle('active', pane.id === `account-${tab}`);
    });
    this.message('');
  },

  switchProfileTab(tab) {
    document.querySelectorAll('.account-tab[data-profile-tab]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.profileTab === tab);
    });
    document.querySelectorAll('.account-pane[id^="profile-tab-"]').forEach(pane => {
      pane.classList.toggle('active', pane.id === `profile-tab-${tab}`);
    });
    if (tab === 'orders') this.loadMyOrders();
  },

  message(text, type = '') {
    const el = document.getElementById('accountMessage');
    el.textContent = text;
    el.className = `account-message ${type}`;
  },

  render() {
    this.user = API.getCurrentUser();
    const loggedIn = !!this.user;
    document.getElementById('accountLoggedOut').style.display = loggedIn ? 'none' : '';
    document.getElementById('accountLoggedIn').style.display = loggedIn ? '' : 'none';
    document.getElementById('accountSubText').textContent = loggedIn
      ? `Welcome back, ${this.user.name || 'Customer'}!`
      : 'Login or register to save your checkout details.';

    // Update header account button — show avatar if logged in
    const accountBtn = document.getElementById('accountBtn');
    if (loggedIn && this.user) {
      const initial = (this.user.name || 'R').charAt(0).toUpperCase();
      accountBtn.className = 'user-avatar-btn';
      accountBtn.style = ''; // clear any inline styling
      accountBtn.textContent = initial;
    } else {
      accountBtn.className = 'icon-action';
      accountBtn.style = ''; // clear any inline styling
      accountBtn.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`;
    }

    if (!loggedIn) return;

    document.getElementById('accountAvatar').textContent = (this.user.name || 'R').charAt(0).toUpperCase();
    document.getElementById('accountName').textContent = this.user.name || 'Customer';
    document.getElementById('accountEmail').textContent = this.user.email || '';
    document.getElementById('accountPhone').textContent = this.user.phone ? `📞 ${this.user.phone}` : '';
    document.getElementById('accountAddress').textContent = [this.user.address, this.user.city, this.user.pin]
      .filter(Boolean).join(', ') || 'No saved address yet.';
  },

  async loadMyOrders() {
    const list = document.getElementById('myOrdersList');
    const loading = document.getElementById('ordersLoadingState');
    if (!API.isUserLoggedIn()) {
      if (loading) loading.textContent = 'Please login to see your orders.';
      return;
    }
    if (loading) loading.style.display = 'block';
    if (list) list.innerHTML = '';

    try {
      const orders = await API.getUserOrders();
      if (loading) loading.style.display = 'none';
      if (!orders.length) {
        list.innerHTML = '<div class="orders-loading">No orders yet. Start shopping! 🛍</div>';
        return;
      }
      list.innerHTML = orders.map(o => {
        const date = new Date(o.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
        const itemsSummary = (o.items || []).map(i => `${i.name} ×${i.qty}`).join(', ');
        const statusClass = `status-${(o.status || 'pending').toLowerCase()}`;
        return `
          <div class="my-order-card">
            <div class="my-order-head">
              <span class="my-order-id">Order #${o.id}</span>
              <span class="my-order-date">${date}</span>
            </div>
            <div class="my-order-items">${itemsSummary}</div>
            <div class="my-order-footer">
              <span class="my-order-total">₹${Number(o.grandTotal).toLocaleString('en-IN')}</span>
              <span class="my-order-status ${statusClass}">${(o.status || 'Pending').charAt(0).toUpperCase() + (o.status || 'pending').slice(1)}</span>
              <button class="my-order-invoice-btn" data-order-id="${o.id}" data-order='${JSON.stringify(o)}'>📄 Invoice</button>
            </div>
          </div>`;
      }).join('');

      // Bind invoice buttons
      list.querySelectorAll('.my-order-invoice-btn').forEach(btn => {
        btn.onclick = () => {
          const order = JSON.parse(btn.dataset.order);
          Invoice.generate(order);
        };
      });
    } catch (e) {
      if (loading) loading.style.display = 'none';
      list.innerHTML = `<div class="orders-loading">Could not load orders: ${e.message}</div>`;
    }
  },

  fillCheckout() {
    const user = API.getCurrentUser();
    if (!user) return;
    const names = (user.name || '').split(' ');
    document.getElementById('ckFirstName').value = names[0] || '';
    document.getElementById('ckLastName').value = names.slice(1).join(' ');
    document.getElementById('ckPhone').value = user.phone || '';
    document.getElementById('ckEmail').value = user.email || '';
    document.getElementById('ckAddress').value = user.address || '';
    document.getElementById('ckCity').value = user.city || '';
    document.getElementById('ckPin').value = user.pin || '';
  },

  async saveProfile() {
    const payload = {
      name: document.getElementById('editName').value.trim(),
      phone: document.getElementById('editPhone').value.trim(),
      address: document.getElementById('editAddress').value.trim(),
      city: document.getElementById('editCity').value.trim(),
      pin: document.getElementById('editPin').value.trim(),
    };
    try {
      const res = await API.updateProfile(payload);
      this.user = res.user;
      localStorage.setItem('rk_user', JSON.stringify(res.user));
      this.render();
      document.getElementById('profileEditForm').style.display = 'none';
      document.getElementById('editProfileToggleBtn').textContent = '✏️ Edit Profile';
      this.message('Profile updated successfully!', 'success');
      showToast('Profile saved ✓', 'success');
    } catch (e) {
      this.message('Could not save profile: ' + e.message, 'error');
    }
  },

  async login() {
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;
    if (!email || !password) return this.message('Email and password are required.', 'error');
    try {
      const res = await API.login({ email, password });
      this.user = res.user;
      this.render();
      this.message('Login successful!', 'success');
      showToast('Logged in ✓', 'success');
      if (typeof Wishlist !== 'undefined') {
        Wishlist.syncAllSubscriptions();
      }
    } catch {
      this.message('Invalid email or password.', 'error');
    }
  },

  async register() {
    const payload = {
      name: document.getElementById('regName').value.trim(),
      email: document.getElementById('regEmail').value.trim(),
      phone: document.getElementById('regPhone').value.trim(),
      password: document.getElementById('regPassword').value,
      address: document.getElementById('regAddress').value.trim(),
      city: document.getElementById('regCity').value.trim(),
      pin: document.getElementById('regPin').value.trim()
    };
    if (!payload.name || !payload.email || !payload.phone || payload.password.length < 6) {
      return this.message('Name, email, phone and 6+ character password are required.', 'error');
    }
    try {
      const res = await API.register(payload);
      this.user = res.user;
      this.render();
      this.message('Account created successfully!', 'success');
      showToast('Welcome to RK Creation! 🎉', 'success');
      if (typeof Wishlist !== 'undefined') {
        Wishlist.syncAllSubscriptions();
      }
    } catch (e) {
      this.message(e.message || 'Could not create account.', 'error');
    }
  },

  logout() {
    API.logout();
    this.user = null;
    this.render();
    this.message('Logged out.', 'success');
    showToast('Logged out', 'success');
  }
};

// ── Invoice PDF Generator ─────────────────────────────────────
const Invoice = {
  generate(order) {
    try {
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF({ unit: 'mm', format: 'a4' });

      // Colors
      const brandColor = [15, 118, 110]; // teal
      const darkColor = [31, 41, 51];
      const mutedColor = [105, 117, 134];

      // Header bg
      doc.setFillColor(...brandColor);
      doc.rect(0, 0, 210, 40, 'F');

      // Brand name
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(22);
      doc.setTextColor(255, 255, 255);
      doc.text('RK Creation', 15, 18);

      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(200, 240, 235);
      doc.text('Premium Craft Supplies', 15, 25);
      doc.text('Phone: +91 81419 94995', 15, 31);
      doc.text('WhatsApp: wa.me/918141994995', 15, 37);

      // INVOICE label on right
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(26);
      doc.setTextColor(255, 255, 255);
      doc.text('INVOICE', 195, 22, { align: 'right' });
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.text(`#${order.id}`, 195, 30, { align: 'right' });

      // Date & status
      doc.setTextColor(...darkColor);
      doc.setFontSize(9);
      const date = new Date(order.createdAt).toLocaleDateString('en-IN', {
        day: '2-digit', month: 'long', year: 'numeric'
      });
      doc.text(`Date: ${date}`, 15, 50);
      doc.text(`Status: ${(order.status || 'Pending').toUpperCase()}`, 15, 56);

      // Customer details box
      doc.setFillColor(247, 245, 240);
      doc.roundedRect(15, 62, 85, 38, 3, 3, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(...brandColor);
      doc.text('BILL TO', 20, 69);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...darkColor);
      const c = order.customer || {};
      const fullName = `${c.firstName || ''} ${c.lastName || ''}`.trim() || 'Customer';
      doc.text(fullName, 20, 76);
      if (c.phone) doc.text(`Phone: ${c.phone}`, 20, 82);
      if (c.email) doc.text(`Email: ${c.email}`, 20, 88);
      const addr = [c.address, c.city, c.pin].filter(Boolean).join(', ');
      if (addr) {
        const addrLines = doc.splitTextToSize(addr, 75);
        doc.text(addrLines, 20, 94);
      }

      // Order info box
      doc.setFillColor(247, 245, 240);
      doc.roundedRect(110, 62, 85, 38, 3, 3, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(...brandColor);
      doc.text('ORDER DETAILS', 115, 69);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...darkColor);
      doc.text(`Order ID: #${order.id}`, 115, 76);
      doc.text(`Order Date: ${date}`, 115, 82);
      doc.text(`Payment: WhatsApp COD`, 115, 88);

      // Table header
      const tableTop = 108;
      doc.setFillColor(...brandColor);
      doc.rect(15, tableTop, 180, 8, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(255, 255, 255);
      doc.text('#', 19, tableTop + 5.5);
      doc.text('Product', 27, tableTop + 5.5);
      doc.text('Category', 110, tableTop + 5.5);
      doc.text('Qty', 148, tableTop + 5.5);
      doc.text('Price', 162, tableTop + 5.5);
      doc.text('Amount', 185, tableTop + 5.5, { align: 'right' });

      // Table rows
      let y = tableTop + 8;
      (order.items || []).forEach((item, idx) => {
        const rowBg = idx % 2 === 0 ? [255, 253, 248] : [247, 245, 240];
        doc.setFillColor(...rowBg);
        doc.rect(15, y, 180, 9, 'F');
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(...darkColor);
        doc.text(`${idx + 1}`, 19, y + 6);
        const nameLines = doc.splitTextToSize(item.name, 78);
        doc.text(nameLines[0], 27, y + 6);
        doc.text(item.category || '-', 110, y + 6);
        doc.text(`${item.qty}`, 150, y + 6, { align: 'center' });
        doc.text(`Rs. ${Number(item.price).toLocaleString('en-IN')}`, 162, y + 6);
        doc.text(`Rs. ${Number(item.price * item.qty).toLocaleString('en-IN')}`, 193, y + 6, { align: 'right' });
        y += 9;
      });

      // Totals
      y += 6;
      const hasDiscount = order.discount && order.discount > 0;
      const boxHeight = hasDiscount ? 35 : 28;
      const grandTotalOffset = hasDiscount ? 25 : 18;

      doc.setFillColor(247, 245, 240);
      doc.rect(120, y, 75, boxHeight, 'F');
      
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(...mutedColor);
      
      // Subtotal
      doc.text('Subtotal:', 125, y + 7);
      doc.text(`Rs. ${Number(order.total).toLocaleString('en-IN')}`, 193, y + 7, { align: 'right' });
      
      // Discount
      if (hasDiscount) {
        doc.setTextColor(185, 28, 28); // red
        doc.setFont('helvetica', 'bold');
        doc.text(`Discount (${order.couponCode}):`, 125, y + 14);
        doc.text(`-Rs. ${Number(order.discount).toLocaleString('en-IN')}`, 193, y + 14, { align: 'right' });
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...mutedColor);
      }
      
      // Shipping
      const shippingY = hasDiscount ? y + 21 : y + 14;
      doc.text('Shipping:', 125, shippingY);
      doc.text(order.shipping === 0 ? 'FREE' : `Rs. ${order.shipping}`, 193, shippingY, { align: 'right' });

      // Grand total
      doc.setFillColor(...brandColor);
      doc.rect(120, y + grandTotalOffset, 75, 10, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(255, 255, 255);
      doc.text('GRAND TOTAL:', 125, y + grandTotalOffset + 6.5);
      doc.text(`Rs. ${Number(order.grandTotal).toLocaleString('en-IN')}`, 193, y + grandTotalOffset + 6.5, { align: 'right' });

      // Thank you note
      y += 42;
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(9);
      doc.setTextColor(...mutedColor);
      doc.text('Thank you for shopping with RK Creation!', 105, y, { align: 'center' });
      doc.text('For any queries, contact us on WhatsApp: +91 81419 94995', 105, y + 6, { align: 'center' });

      // Footer line
      doc.setDrawColor(...brandColor);
      doc.setLineWidth(0.5);
      doc.line(15, 275, 195, 275);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(...mutedColor);
      doc.text('RK Creation — Premium Craft Supplies | This is a computer generated invoice.', 105, 280, { align: 'center' });

      doc.save(`RKCreation_Invoice_Order${order.id}.pdf`);
      showToast('Invoice downloaded! 📄', 'success');
    } catch (e) {
      showToast('Could not generate invoice: ' + e.message, 'error');
    }
  }
};

// ── Product Modal Close ───────────────────────────────────────
document.getElementById('closeModal').onclick = () => {
  document.getElementById('productModalOverlay').classList.remove('open');
};
document.getElementById('productModalOverlay').onclick = (e) => {
  if (e.target === document.getElementById('productModalOverlay'))
    document.getElementById('productModalOverlay').classList.remove('open');
};

// ── Checkout Modal ────────────────────────────────────────────
function openCheckoutModal() {
  if (!Cart.items.length) { showToast('Your cart is empty!', 'error'); return; }
  Auth.fillCheckout();

  document.getElementById('checkoutTitle').textContent = 'Checkout';
  document.getElementById('invoiceDownloadBtn').style.display = 'none';

  // Reset payment selector to default (Online)
  App.state.paymentMethod = 'online';
  const onlineOpt = document.getElementById('payOnlineOpt');
  const codOpt = document.getElementById('payCodOpt');
  if (onlineOpt && codOpt) {
    onlineOpt.classList.add('active');
    codOpt.classList.remove('active');
  }

  const btn = document.getElementById('placeOrderBtn');
  btn.textContent = 'Pay securely with Razorpay';
  btn._isBuyNow = false;
  btn._buyNowItems = null;

  // Reset coupon state
  App.state.appliedCoupon = null;
  const promoInput = document.getElementById('ckPromoCode');
  if (promoInput) promoInput.value = '';
  const promoMsg = document.getElementById('promoMsg');
  if (promoMsg) { promoMsg.style.display = 'none'; promoMsg.textContent = ''; }

  App.recalculateCheckout();
  document.getElementById('checkoutModalOverlay').classList.add('open');
}

// Recalculate checkout summary items
App.recalculateCheckout = function() {
  const btn = document.getElementById('placeOrderBtn');
  const isBuyNow = btn && btn._isBuyNow;
  const items = isBuyNow ? btn._buyNowItems : Cart.items;

  const subtotal = items.reduce((s, i) => s + i.price * i.qty, 0);
  const shipping = subtotal >= 999 ? 0 : 60;

  let discount = 0;
  let promoHTML = '';

  if (App.state.appliedCoupon) {
    const c = App.state.appliedCoupon;
    if (c.type === 'percentage') {
      discount = Math.round((subtotal * Number(c.value)) / 100);
    } else {
      discount = Number(c.value);
    }
    discount = Math.min(discount, subtotal);

    promoHTML = `
      <div class="ck-order-item" style="color: var(--red); font-weight: bold; border-bottom: 1px dashed var(--red);">
        <span class="ck-order-item-name">Discount (${c.code})</span>
        <span class="ck-order-item-price">-₹${discount.toLocaleString('en-IN')}</span>
      </div>
    `;
  }

  // Draw checkout summary lists
  document.getElementById('ckOrderItems').innerHTML = items.map(i =>
    `<div class="ck-order-item">
      <span class="ck-order-item-name">${i.name} ×${i.qty}</span>
      <span class="ck-order-item-price">₹${(i.price * i.qty).toLocaleString('en-IN')}</span>
    </div>`
  ).join('') + promoHTML;

  document.getElementById('ckSubtotal').textContent = `₹${subtotal.toLocaleString('en-IN')}`;
  document.getElementById('ckShipping').textContent = shipping === 0 ? 'FREE' : `₹${shipping}`;
  document.getElementById('ckTotal').textContent = `₹${Math.max(0, subtotal - discount + shipping).toLocaleString('en-IN')}`;
};

document.getElementById('closeCheckout').onclick = () => {
  document.getElementById('checkoutModalOverlay').classList.remove('open');
};
document.getElementById('checkoutModalOverlay').onclick = (e) => {
  if (e.target === document.getElementById('checkoutModalOverlay'))
    document.getElementById('checkoutModalOverlay').classList.remove('open');
};

// ── Place Order ───────────────────────────────────────────────
document.getElementById('placeOrderBtn').onclick = async () => {
  const btn = document.getElementById('placeOrderBtn');
  const firstName = document.getElementById('ckFirstName').value.trim();
  const phone = document.getElementById('ckPhone').value.trim();
  const address = document.getElementById('ckAddress').value.trim();
  if (!firstName || !phone || !address) {
    showToast('Please fill Name, Phone & Address', 'error'); return;
  }

  const customer = {
    firstName, lastName: document.getElementById('ckLastName').value.trim(),
    phone, email: document.getElementById('ckEmail').value.trim(),
    address, city: document.getElementById('ckCity').value.trim(),
    pin: document.getElementById('ckPin').value.trim()
  };

  // Determine which items to order
  const isBuyNow = btn._isBuyNow;
  const cartItems = isBuyNow
    ? btn._buyNowItems
    : Cart.items.map(item => ({ ...item }));

  const cartSubtotal = cartItems.reduce((s, i) => s + i.price * i.qty, 0);
  const shipping = cartSubtotal >= 999 ? 0 : 60;
  const grandTotal = cartSubtotal + shipping;

  const isOnline = App.state.paymentMethod === 'online';
  const WHATSAPP_NUMBER = '918141994995';

  if (isOnline) {
    try {
      btn.textContent = 'Preparing Payment...';
      btn.disabled = true;

      // 1. Create Razorpay order on the server
      const reqPayload = { items: cartItems };
      if (App.state.appliedCoupon) {
        reqPayload.couponCode = App.state.appliedCoupon.code;
      }
      const resOrder = await API.createPaymentOrder(reqPayload);
      const { keyId, order: razorpayOrder } = resOrder;

      // 2. Open Razorpay checkout modal
      const options = {
        key: keyId,
        amount: razorpayOrder.amount,
        currency: razorpayOrder.currency,
        name: 'RK Creation',
        description: 'Premium Craft Supplies Order',
        order_id: razorpayOrder.id,
        prefill: {
          name: `${firstName} ${customer.lastName}`.trim(),
          email: customer.email || '',
          contact: phone
        },
        theme: { color: '#0f766e' },
        handler: async function (response) {
          try {
            btn.textContent = 'Verifying Payment...';
            
            // 3. Cryptographically verify signature & place order
            const verifyPayload = {
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_order_id: response.razorpay_order_id,
              razorpay_signature: response.razorpay_signature,
              items: cartItems,
              customer
            };
            if (App.state.appliedCoupon) {
              verifyPayload.couponCode = App.state.appliedCoupon.code;
            }
            const verifyRes = await API.verifyPayment(verifyPayload);

            if (!isBuyNow) Cart.clear();

            btn.textContent = 'Pay securely with Razorpay';
            btn.disabled = false;
            btn._isBuyNow = false;
            btn._buyNowItems = null;

            // Invoice download button
            const invoiceBtn = document.getElementById('invoiceDownloadBtn');
            invoiceBtn.style.display = 'flex';
            invoiceBtn.onclick = () => Invoice.generate(verifyRes.order);

            showToast(`Order #${verifyRes.orderId} placed & paid successfully! 🎉`, 'success');

            // WhatsApp message to admin
            const orderLines = cartItems.map((i, index) =>
              `${index + 1}. ${i.name}\n` +
              `   Category: ${i.category || 'Product'}\n` +
              `   Qty: ${i.qty}\n` +
              `   Rate: ₹${Number(i.price).toLocaleString('en-IN')}\n` +
              `   Amount: ₹${(i.price * i.qty).toLocaleString('en-IN')}`
            ).join('\n\n');
            const fullName = `${firstName} ${customer.lastName}`.trim();
            const fullAddress = [address, customer.city, customer.pin].filter(Boolean).join(', ');
            
            const discountAmount = verifyRes.order.discount || 0;
            const discountLine = discountAmount > 0 ? `Discount (${verifyRes.order.couponCode}): -₹${discountAmount.toLocaleString('en-IN')}\n` : '';

            const msg = encodeURIComponent(
              `🛍 New ONLINE Order from RK Creation Website!\n\n` +
              `Order ID: #${verifyRes.orderId}\n` +
              `Payment Status: Paid online via Razorpay\n` +
              `Payment ID: ${response.razorpay_payment_id}\n` +
              `Date: ${new Date().toLocaleDateString('en-IN')}\n\n` +
              `📦 ORDER DETAILS\n${orderLines}\n\n` +
              `💰 PAYMENT SUMMARY\n` +
              `Subtotal: ₹${cartSubtotal.toLocaleString('en-IN')}\n` +
              discountLine +
              `Shipping: ${shipping === 0 ? 'FREE' : `₹${shipping.toLocaleString('en-IN')}`}\n` +
              `Grand Total: ₹${Number(verifyRes.grandTotal || grandTotal).toLocaleString('en-IN')}\n\n` +
              `👤 CUSTOMER DETAILS\n` +
              `Name: ${fullName}\n` +
              `Phone: ${phone}\n` +
              `Email: ${customer.email || '-'}\n` +
              `Address: ${fullAddress}`
            );
            window.location.href = `https://wa.me/${WHATSAPP_NUMBER}?text=${msg}`;
            App.loadProducts();
            document.getElementById('checkoutModalOverlay').classList.remove('open');
          } catch (e) {
            btn.textContent = 'Pay securely with Razorpay';
            btn.disabled = false;
            showToast(e.message || 'Payment verification failed', 'error');
          }
        },
        modal: {
          ondismiss: function () {
            btn.textContent = 'Pay securely with Razorpay';
            btn.disabled = false;
            showToast('Payment cancelled by user', 'error');
          }
        }
      };

      const rzp = new Razorpay(options);
      rzp.open();
    } catch (e) {
      btn.textContent = 'Pay securely with Razorpay';
      btn.disabled = false;
      showToast(e.message || 'Failed to initiate payment', 'error');
    }
  } else {
    // WhatsApp Inquiry flow
    try {
      btn.textContent = 'Sending Inquiry...';
      btn.disabled = true;

      const orderPayload = { items: cartItems, customer };
      if (App.state.appliedCoupon) {
        orderPayload.couponCode = App.state.appliedCoupon.code;
      }
      const res = await API.placeOrder(orderPayload);

      if (!isBuyNow) Cart.clear();

      btn.textContent = 'Send Inquiry on WhatsApp';
      btn.disabled = false;
      btn._isBuyNow = false;
      btn._buyNowItems = null;

      // Invoice download button
      const invoiceBtn = document.getElementById('invoiceDownloadBtn');
      invoiceBtn.style.display = 'flex';
      invoiceBtn.onclick = () => Invoice.generate(res.order);

      showToast(`Order #${res.orderId} inquiry sent! We'll contact you on WhatsApp 🎉`, 'success');

      // Build WhatsApp inquiry message to admin
      const orderLines = cartItems.map((i, index) =>
        `${index + 1}. ${i.name}\n` +
        `   Category: ${i.category || 'Product'}\n` +
        `   Qty: ${i.qty}\n` +
        `   Rate: ₹${Number(i.price).toLocaleString('en-IN')}\n` +
        `   Amount: ₹${(i.price * i.qty).toLocaleString('en-IN')}`
      ).join('\n\n');
      const fullName = `${firstName} ${customer.lastName}`.trim();
      const fullAddress = [address, customer.city, customer.pin].filter(Boolean).join(', ');
      
      const discountAmount = res.order.discount || 0;
      const discountLine = discountAmount > 0 ? `Discount (${res.order.couponCode}): -₹${discountAmount.toLocaleString('en-IN')}\n` : '';

      const msg = encodeURIComponent(
        `🛍️ *New Order Inquiry from RK Creation Website!*\n\n` +
        `📋 *Order ID:* #${res.orderId}\n` +
        `📅 *Date:* ${new Date().toLocaleDateString('en-IN')}\n\n` +
        `📦 *ORDER DETAILS*\n${orderLines}\n\n` +
        `💰 *PAYMENT SUMMARY*\n` +
        `Subtotal: ₹${cartSubtotal.toLocaleString('en-IN')}\n` +
        discountLine +
        `Shipping: ${shipping === 0 ? 'FREE' : `₹${shipping.toLocaleString('en-IN')}`}\n` +
        `*Grand Total: ₹${Math.max(0, cartSubtotal - discountAmount + shipping).toLocaleString('en-IN')}*\n\n` +
        `👤 *CUSTOMER DETAILS*\n` +
        `Name: ${fullName}\n` +
        `Phone: ${phone}\n` +
        `Email: ${customer.email || '-'}\n` +
        `Address: ${fullAddress}\n\n` +
        `Please confirm this order and arrange delivery. Thank you! 🙏`
      );
      window.open(`https://wa.me/918141994995?text=${msg}`, '_blank');

      App.loadProducts();
      document.getElementById('checkoutModalOverlay').classList.remove('open');
    } catch (e) {
      btn.textContent = 'Send Inquiry on WhatsApp';
      btn.disabled = false;
      showToast(e.message || 'Error placing order. Please try again.', 'error');
    }
  }
};

// Invoice download button (also bound after order)
document.getElementById('invoiceDownloadBtn').onclick = () => {
  if (App.state.lastOrderData) Invoice.generate(App.state.lastOrderData);
};

// ── Toast helper ──────────────────────────────────────────────
function showToast(msg, type = '') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = `toast ${type} show`;
  setTimeout(() => t.classList.remove('show'), 3000);
}

// ── Admin ok helper ───────────────────────────────────────────
function showOk(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 2500);
}

// ── Boot ──────────────────────────────────────────────────────
App.init();
