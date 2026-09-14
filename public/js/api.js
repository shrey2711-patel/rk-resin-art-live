// ── API Base ────────────────────────────────────────────────
const BASE = '';  // same origin; change to http://localhost:3000 if separate

const API = {
  token: sessionStorage.getItem('rk_admin_token') || null,
  userToken: localStorage.getItem('rk_user_token') || null,

  headers(auth = false) {
    const h = { 'Content-Type': 'application/json' };
    const token = this.token || sessionStorage.getItem('rk_admin_token');
    if (auth && token) h['Authorization'] = `Bearer ${token}`;
    return h;
  },

  userHeaders() {
    const h = { 'Content-Type': 'application/json' };
    if (this.userToken) h.Authorization = `Bearer ${this.userToken}`;
    return h;
  },

  async handleResponse(res, adminAuth = true) {
    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        if (adminAuth) {
          API.adminLogout();
        } else {
          API.logout();
          if (typeof Auth !== 'undefined' && Auth.render) {
            Auth.render();
          }
        }
      }
      let text = await res.text();
      try {
        const json = JSON.parse(text);
        throw new Error(json.error || text || 'Error');
      } catch(e) {
        if (e.message && e.message !== text) throw e;
        throw new Error(text || 'Error');
      }
    }
    return res.json();
  },

  async get(path, auth = false) {
    const res = await fetch(BASE + path, {
      method: 'GET',
      headers: this.headers(auth)
    });
    return API.handleResponse(res, auth);
  },

  async post(path, data, auth = false) {
    const res = await fetch(BASE + path, {
      method: 'POST',
      headers: this.headers(auth),
      body: JSON.stringify(data)
    });
    return API.handleResponse(res, auth);
  },

  async userGet(path) {
    const res = await fetch(BASE + path, {
      method: 'GET',
      headers: this.userHeaders()
    });
    return API.handleResponse(res, false);
  },

  async userPost(path, data) {
    const res = await fetch(BASE + path, {
      method: 'POST',
      headers: this.userHeaders(),
      body: JSON.stringify(data)
    });
    return API.handleResponse(res, false);
  },

  async userPut(path, data) {
    const res = await fetch(BASE + path, {
      method: 'PUT',
      headers: this.userHeaders(),
      body: JSON.stringify(data)
    });
    return API.handleResponse(res, false);
  },

  async put(path, data, auth = false) {
    const res = await fetch(BASE + path, {
      method: 'PUT',
      headers: this.headers(auth),
      body: JSON.stringify(data)
    });
    return API.handleResponse(res, auth);
  },

  async delete(path, auth = false) {
    const res = await fetch(BASE + path, {
      method: 'DELETE',
      headers: this.headers(auth)
    });
    return API.handleResponse(res, auth);
  },

  async uploadImage(file) {
    if (!file) throw new Error('No image file provided for upload');
    const token = this.token || sessionStorage.getItem('rk_admin_token');
    const headers = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    const ext = (file.name || '').split('.').pop().toLowerCase();
    const isHeic = ['heic', 'heif'].includes(ext) || ['image/heic', 'image/heif'].includes((file.type || '').toLowerCase());

    try {
      // 1. Fetch ImgBB key securely from the server if admin is logged in
      if (token) {
        const keyData = await API.get('/api/admin/imgbb-key', true).catch(() => null);
        
        if (!isHeic && keyData && keyData.key) {
          // Convert optimized file to base64 for direct ImgBB POST request
          const reader = new FileReader();
          const base64Promise = new Promise((resolve, reject) => {
            reader.onload = () => resolve(reader.result.split(',')[1]);
            reader.onerror = reject;
          });
          reader.readAsDataURL(file);
          const base64Image = await base64Promise;

          const imgbbFormData = new URLSearchParams();
          imgbbFormData.append('image', base64Image);

          // 2. Direct upload using the admin's residential IP (bypasses Render cloud server IP ban!)
          const imgbbRes = await fetch(`https://api.imgbb.com/1/upload?key=${keyData.key}`, {
            method: 'POST',
            body: imgbbFormData,
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded'
            }
          });

          if (imgbbRes.ok) {
            const imgbbData = await imgbbRes.json();
            if (imgbbData && imgbbData.data && imgbbData.data.url) {
              return {
                success: true,
                url: imgbbData.data.url,
                filename: file.name
              };
            }
          }
          console.warn('Direct client-side ImgBB upload failed, falling back to server-side upload.');
        }
      }
    } catch (err) {
      console.warn('Direct upload setup failed, falling back to server-side upload:', err);
    }

    // 3. Fallback: Upload through the server (saves locally if server fails to connect to ImgBB/R2)
    const formData = new FormData();
    formData.append('image', file);

    const res = await fetch(BASE + '/api/admin/upload', {
      method: 'POST',
      headers,
      body: formData
    });
    return API.handleResponse(res, true);
  },

  // ── Public endpoints ──────────────────────────────────────
  getSettings: () => API.get('/api/settings'),
  getBanners: () => API.get('/api/banners'),
  getNav: () => API.get('/api/nav'),
  getCategories: () => API.get('/api/categories'),
  getProducts: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return API.get(`/api/products?${qs}`);
  },
  getProduct: (id) => API.get(`/api/products/${id}`),
  placeOrder: (data) => API.userPost('/api/orders', data),
  createPaymentOrder: (data) => API.userPost('/api/payment/create-order', data),
  verifyPayment: (data) => API.userPost('/api/payment/verify', data),
  uploadPaymentProof: async (file) => {
    const formData = new FormData();
    formData.append('image', file);
    const res = await fetch(BASE + '/api/upload/payment-proof', {
      method: 'POST',
      body: formData
    });
    return API.handleResponse(res, false);
  },

  // ── Customer auth ─────────────────────────────────────────
  register: async (data) => {
    const res = await API.post('/api/auth/register', data);
    API.userToken = res.token;
    localStorage.setItem('rk_user_token', res.token);
    localStorage.setItem('rk_user', JSON.stringify(res.user));
    return res;
  },
  login: async (data) => {
    const res = await API.post('/api/auth/login', data);
    API.userToken = res.token;
    localStorage.setItem('rk_user_token', res.token);
    localStorage.setItem('rk_user', JSON.stringify(res.user));
    return res;
  },
  logout: () => {
    API.userToken = null;
    localStorage.removeItem('rk_user_token');
    localStorage.removeItem('rk_user');
  },
  getCurrentUser: () => JSON.parse(localStorage.getItem('rk_user') || 'null'),
  isUserLoggedIn: () => !!API.userToken,
  getProfile: () => API.userGet('/api/auth/me'),
  updateProfile: (data) => API.userPut('/api/auth/profile', data),
  getUserOrders: () => API.userGet('/api/auth/orders'),
  getCart: () => API.userGet('/api/auth/cart'),
  updateCart: (cart) => API.userPut('/api/auth/cart', { cart }),

  // ── Admin auth ────────────────────────────────────────────
  adminLogin: async (password) => {
    const res = await API.post('/api/admin/login', { password });
    API.token = res.token;
    sessionStorage.setItem('rk_admin_token', res.token);
    return res;
  },
  adminLogout: () => {
    API.token = null;
    sessionStorage.removeItem('rk_admin_token');
  },
  isAdminLoggedIn: () => !!(API.token || sessionStorage.getItem('rk_admin_token')),

  // ── Admin settings ────────────────────────────────────────
  getAdminSettings: () => API.get('/api/admin/settings', true),
  updateSettings: (data) => API.put('/api/admin/settings', data, true),

  // ── Admin banners ─────────────────────────────────────────
  addBanner: (data) => API.post('/api/admin/banners', data, true),
  updateBanner: (id, data) => API.put(`/api/admin/banners/${id}`, data, true),
  deleteBanner: (id) => API.delete(`/api/admin/banners/${id}`, true),

  // ── Admin nav ─────────────────────────────────────────────
  addNav: (data) => API.post('/api/admin/nav', data, true),
  updateNav: (id, data) => API.put(`/api/admin/nav/${id}`, data, true),
  deleteNav: (id) => API.delete(`/api/admin/nav/${id}`, true),
  reorderNav: (orderedIds) => API.put('/api/admin/nav/reorder', { orderedIds }, true),

  // ── Admin categories ──────────────────────────────────────
  addCategory: (data) => API.post('/api/admin/categories', data, true),
  updateCategory: (id, data) => API.put(`/api/admin/categories/${id}`, data, true),
  deleteCategory: (id) => API.delete(`/api/admin/categories/${id}`, true),
  reorderCategories: (orderedIds) => API.put('/api/admin/categories/reorder', { orderedIds }, true),
  // ── Admin products ────────────────────────────────────────
  addProduct: (data) => API.post('/api/admin/products', data, true),
  updateProduct: (id, data) => API.put(`/api/admin/products/${id}`, data, true),
  deleteProduct: (id) => API.delete(`/api/admin/products/${id}`, true),

  // ── Admin orders ──────────────────────────────────────────
  getOrders: () => API.get('/api/admin/orders', true),
  updateOrder: (id, data) => API.put(`/api/admin/orders/${id}`, data, true),
  notifyShipping: (id) => API.post(`/api/admin/orders/${id}/notify-shipping`, {}, true),

  // ── Reviews (customer) ─────────────────────────────────
  getProductReviews: (productId) => API.get(`/api/products/${productId}/reviews`),
  submitReview: async (productId, data) => {
    const res = await fetch(`${BASE}/api/products/${productId}/reviews`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('rk_user_token')}` },
      body: JSON.stringify(data)
    });
    return API.handleResponse(res, false);
  },

  // ── Reviews (admin) ───────────────────────────────────
  getAllReviews: () => API.get('/api/admin/reviews', true),
  deleteReview: (id) => API.delete(`/api/admin/reviews/${id}`, true),

  // ── Promo Codes / Coupons ────────────────────────────
  validateCoupon: (code, subtotal) => API.post('/api/payment/validate-coupon', { code, subtotal }),
  getCoupons: () => API.get('/api/admin/coupons', true),
  createCoupon: (data) => API.post('/api/admin/coupons', data, true),
  deleteCoupon: (id) => API.delete(`/api/admin/coupons/${id}`, true),

  // ── Admin user management ──────────────────────────
  getAdminUsers: () => API.get('/api/admin/users', true),
  updateAdminUser: (id, data) => API.put(`/api/admin/users/${id}`, data, true),
  deleteAdminUser: (id) => API.delete(`/api/admin/users/${id}`, true),

  // ── User OTP password change & Forgot Password ─────
  requestPasswordOtp: (newPassword) => API.userPost('/api/auth/request-password-otp', { newPassword }),
  changePassword: (otp, newPassword) => API.userPost('/api/auth/change-password', { otp, newPassword }),
  forgotPasswordOtp: (email) => API.post('/api/auth/forgot-password-otp', { email }),
  resetPasswordOtp: async (email, otp, newPassword) => {
    const res = await API.post('/api/auth/reset-password-otp', { email, otp, newPassword });
    API.userToken = res.token;
    localStorage.setItem('rk_user_token', res.token);
    localStorage.setItem('rk_user', JSON.stringify(res.user));
    return res;
  },

  // ── Admin password change ──────────────────────────
  changeAdminPassword: (currentPassword, newPassword) => API.post('/api/admin/change-password', { currentPassword, newPassword }, true),
};

// ── Global Standard Terms & Conditions Criteria Catalog (50 Criteria) ──
window.DEFAULT_TERMS_CRITERIA = [
  // ── 1. Custom Commissions, Botanicals & Crafting Disclosures ───────────
  {
    id: 'crit_unboxing_video',
    category: 'Custom Art & Claims',
    badge: 'Mandatory',
    badgeBg: '#fee2e2',
    badgeColor: '#dc2626',
    title: '48-Hour Unboxing Video Mandate for Claims',
    desc: 'Customer must record a single continuous, unedited video opening sealed parcel within 48h of delivery for damage/missing claims.',
    defaultChecked: true
  },
  {
    id: 'crit_curing_window',
    category: 'Custom Art & Claims',
    badge: 'Artisanal',
    badgeBg: '#ede9fe',
    badgeColor: '#7c3aed',
    title: '4–7 Days Chemical Resin Curing Window',
    desc: 'Discloses that custom resin pieces (Name Plates, Clocks, Frames) need 4-7 business days of chemical curing before dispatch for crystal hardness.',
    defaultChecked: true
  },
  {
    id: 'crit_handcrafted_variations',
    category: 'Custom Art & Claims',
    badge: 'Handmade',
    badgeBg: '#fef3c7',
    badgeColor: '#d97706',
    title: 'Artisanal Handcrafted & Botanical Disclosures',
    desc: 'Natural floral variations, organic pigment swirls, and micro-bubbles naturally occur and highlight authentic resin craft.',
    defaultChecked: true
  },
  {
    id: 'crit_flower_drying',
    category: 'Custom Art & Claims',
    badge: 'Preservation',
    badgeBg: '#fdf2f8',
    badgeColor: '#db2777',
    title: 'Botanical Color Shifts & Natural Flower Preservation',
    desc: 'Organic flowers may naturally darken or shift shade during dehydration and resin encapsulation, reflecting true botanical nature.',
    defaultChecked: true
  },
  {
    id: 'crit_custom_approval',
    category: 'Custom Art & Claims',
    badge: 'Proof Sign-off',
    badgeBg: '#e0e7ff',
    badgeColor: '#4338ca',
    title: 'Digital Artwork Proof & Layout Approval',
    desc: 'For personalized frames and nameplates, customer digital layout approval over WhatsApp/Email is final prior to permanent resin pouring.',
    defaultChecked: true
  },
  {
    id: 'crit_custom_photo_quality',
    category: 'Custom Art & Claims',
    badge: 'Photo Print',
    badgeBg: '#f0fdf4',
    badgeColor: '#15803d',
    title: 'Client Photo Resolution & Print Clarity Disclaimer',
    desc: 'Print clarity in photo preservation frames depends directly on the quality of image file uploaded by customer.',
    defaultChecked: true
  },
  {
    id: 'crit_custom_names_spell',
    category: 'Custom Art & Claims',
    badge: 'Verification',
    badgeBg: '#fef2f2',
    badgeColor: '#b91c1c',
    title: 'Name & Mantra Spelling Liability Submission',
    desc: 'Customer is solely responsible for verifying text, mantras, and dates submitted in custom design fields.',
    defaultChecked: true
  },
  {
    id: 'crit_uv_yellowing',
    category: 'Custom Art & Claims',
    badge: 'UV Stable',
    badgeBg: '#eff6ff',
    badgeColor: '#1d4ed8',
    title: 'UV-Stabilized Resin & Sunlight Care Guidance',
    desc: 'Formulated with premium HALS UV stabilizers; prolonged continuous exposure to direct outdoor harsh sunlight should be avoided to prevent yellowing.',
    defaultChecked: true
  },

  // ── 2. Orders, Modifications & Cancellations ───────────────────────────
  {
    id: 'crit_custom_cancel',
    category: 'Orders & Cancellations',
    badge: 'Time-Sensitive',
    badgeBg: '#fce7f3',
    badgeColor: '#db2777',
    title: '12-Hour Custom Order Cancellation Window',
    desc: 'Customized artwork with names/photos can be canceled only within 12 hours of order placement before raw resin pour begins.',
    defaultChecked: true
  },
  {
    id: 'crit_catalog_cancel',
    category: 'Orders & Cancellations',
    badge: 'Standard Items',
    badgeBg: '#dbeafe',
    badgeColor: '#2563eb',
    title: 'Pre-Dispatch Full Refund on Standard Supplies',
    desc: 'Standard catalog supplies (molds, raw resin, mica powder) can be canceled at any time before dispatch for 100% instant refund.',
    defaultChecked: true
  },
  {
    id: 'crit_address_change',
    category: 'Orders & Cancellations',
    badge: 'Logistics Cutoff',
    badgeBg: '#e0f2fe',
    badgeColor: '#0369a1',
    title: '6-Hour Shipping Address Modification Window',
    desc: 'Shipping address and phone corrections must be submitted within 6 hours of purchase before AWB logistics manifesting.',
    defaultChecked: true
  },
  {
    id: 'crit_bulk_orders',
    category: 'Orders & Cancellations',
    badge: 'B2B Wholesale',
    badgeBg: '#f3e8ff',
    badgeColor: '#7e22ce',
    title: 'Wholesale & Bulk Commission Booking Protocol',
    desc: 'Bulk orders (10+ units) require a 50% advance production deposit and custom production scheduling.',
    defaultChecked: true
  },
  {
    id: 'crit_order_rejection',
    category: 'Orders & Cancellations',
    badge: 'Merchant Right',
    badgeBg: '#fef2f2',
    badgeColor: '#991b1b',
    title: 'Merchant Prerogative to Decline Abusive Orders',
    desc: 'We reserve the right to cancel orders originating from known fraudulent IPs, chargeback abusers, or hostile communications.',
    defaultChecked: true
  },
  {
    id: 'crit_stock_reservation',
    category: 'Orders & Cancellations',
    badge: 'Cart Hold',
    badgeBg: '#ecfdf5',
    badgeColor: '#047857',
    title: '15-Minute Checkout Inventory Hold Limit',
    desc: 'Items in shopping cart are temporarily reserved for 15 minutes during active checkout session before re-entering public stock.',
    defaultChecked: true
  },

  // ── 3. Shipping, Delivery & Packaging ─────────────────────────────────
  {
    id: 'crit_express_shipping',
    category: 'Shipping & Logistics',
    badge: 'Pan-India',
    badgeBg: '#e0e7ff',
    badgeColor: '#4f46e5',
    title: 'Pan-India Express Logistics with Live AWB Tracking',
    desc: 'Dispatched via premium express logistics partners (Delhivery, BlueDart, DTDC, India Post) with 3–7 business days transit.',
    defaultChecked: true
  },
  {
    id: 'crit_transit_guarantee',
    category: 'Shipping & Logistics',
    badge: '100% Covered',
    badgeBg: '#d1fae5',
    badgeColor: '#059669',
    title: '100% Free Replacement on Transit Damage',
    desc: 'RK Resin Art provides 100% free expedited replacement or full monetary refund for transit damage verified via unboxing video.',
    defaultChecked: true
  },
  {
    id: 'crit_delivery_attempts',
    category: 'Shipping & Logistics',
    badge: '3 Re-attempts',
    badgeBg: '#ffedd5',
    badgeColor: '#c2410c',
    title: '3 Courier Delivery Attempts & RTO Procedure',
    desc: 'Couriers attempt delivery 3 times. Parcels returned due to unreachable buyer or incorrect phone number incur reshipment costs.',
    defaultChecked: true
  },
  {
    id: 'crit_pin_verification',
    category: 'Shipping & Logistics',
    badge: 'Pincode Validated',
    badgeBg: '#f0fdfa',
    badgeColor: '#0f766e',
    title: 'Serviceable Pincode & Remote Area Transit Notice',
    desc: 'Tier-1 & metro cities deliver within 2-4 days; remote northeast / J&K pincodes may require 7-10 business days.',
    defaultChecked: true
  },
  {
    id: 'crit_force_majeure',
    category: 'Shipping & Logistics',
    badge: 'Force Majeure',
    badgeBg: '#f1f5f9',
    badgeColor: '#475569',
    title: 'Force Majeure & Weather Delay Exemption',
    desc: 'Logistics delays resulting from severe cyclones, floods, state holidays, or transport strikes are beyond operational control.',
    defaultChecked: true
  },
  {
    id: 'crit_liquid_packaging',
    category: 'Shipping & Logistics',
    badge: 'Leak-Proof',
    badgeBg: '#ccfbf1',
    badgeColor: '#0f766e',
    title: 'Heavy Industrial Leak-Proof Chemical Packaging',
    desc: 'Liquid epoxy and hardener containers feature induction heat seals and triple bubble-wrap shielding to prevent transit leaks.',
    defaultChecked: true
  },
  {
    id: 'crit_tamper_seal',
    category: 'Shipping & Logistics',
    badge: 'Tamper-Evident',
    badgeBg: '#fee2e2',
    badgeColor: '#dc2626',
    title: 'Courier Tamper Seal Inspection Mandate',
    desc: 'Customers must refuse delivery if outer security tape is visibly ripped, opened, or resealed by unauthorized parties.',
    defaultChecked: true
  },

  // ── 4. Returns, Replacements & Warranties ─────────────────────────────
  {
    id: 'crit_7day_replacement',
    category: 'Returns & Refunds',
    badge: '7-Day Guarantee',
    badgeBg: '#dcfce7',
    badgeColor: '#16a34a',
    title: '7-Day Replacement for Manufacturing Defects',
    desc: 'Unused DIY supplies (clocks, pigments, tools) with manufacturing flaws qualify for instant replacement within 7 days.',
    defaultChecked: true
  },
  {
    id: 'crit_non_returnable_custom',
    category: 'Returns & Refunds',
    badge: 'Non-Returnable',
    badgeBg: '#fee2e2',
    badgeColor: '#b91c1c',
    title: 'Non-Returnable Custom Artwork Policy',
    desc: 'Personalized items cannot be returned for buyer regret, as they are custom-manufactured to specific customer specifications.',
    defaultChecked: true
  },
  {
    id: 'crit_seal_broken_chemical',
    category: 'Returns & Refunds',
    badge: 'Safety Seal',
    badgeBg: '#ffedd5',
    badgeColor: '#c2410c',
    title: 'Opened Chemical Bottle Return Exclusion',
    desc: 'Opened liquid resin, hardener, or alcohol ink bottles with broken safety induction seals cannot be returned due to contamination risks.',
    defaultChecked: true
  },
  {
    id: 'crit_return_pickup',
    category: 'Returns & Refunds',
    badge: 'Reverse Logistics',
    badgeBg: '#e0e7ff',
    badgeColor: '#4338ca',
    title: 'Reverse Courier Pickup & Self-Ship Reimbursement',
    desc: 'Where reverse pickup is unavailable, customers are reimbursed up to ₹100 for shipping verified defective items via India Post.',
    defaultChecked: true
  },
  {
    id: 'crit_refund_speed',
    category: 'Returns & Refunds',
    badge: '3–5 Days',
    badgeBg: '#d1fae5',
    badgeColor: '#047857',
    title: '3–5 Business Days UPI / Bank Refund Speed',
    desc: 'Approved monetary refunds are processed directly back to original UPI / Bank account within 3 to 5 business days.',
    defaultChecked: true
  },
  {
    id: 'crit_damaged_moulds',
    category: 'Returns & Refunds',
    badge: 'First-Use Cover',
    badgeBg: '#ede9fe',
    badgeColor: '#6d28d9',
    title: 'Tear-Free Guarantee on First-Use Silicone Moulds',
    desc: 'Silicone moulds with inherent material tears on first demolding qualify for immediate zero-cost replacement.',
    defaultChecked: true
  },

  // ── 5. Payments, Security & Billing ───────────────────────────────────
  {
    id: 'crit_digital_payments',
    category: 'Payments & Billing',
    badge: 'Encrypted',
    badgeBg: '#ccfbf1',
    badgeColor: '#0d9488',
    title: 'Direct UPI & RBI-Approved 256-Bit SSL Payments',
    desc: 'Zero payment processing surcharge; all transactions processed via RBI-approved encrypted gateways or direct UPI QR verification.',
    defaultChecked: true
  },
  {
    id: 'crit_zero_surcharge',
    category: 'Payments & Billing',
    badge: '0% Surcharge',
    badgeBg: '#dcfce7',
    badgeColor: '#15803d',
    title: 'Zero Gateway Convenience Fee for Customers',
    desc: 'Customers pay exact catalog prices with zero hidden checkout surcharges on credit cards, debit cards, NetBanking, or UPI.',
    defaultChecked: true
  },
  {
    id: 'crit_gst_invoicing',
    category: 'Payments & Billing',
    badge: 'Statutory',
    badgeBg: '#f1f5f9',
    badgeColor: '#475569',
    title: 'Statutory GST Tax Invoicing in INR (₹)',
    desc: 'All product prices displayed on store are inclusive of statutory GST and all transactions are settled in Indian Rupees (INR ₹).',
    defaultChecked: true
  },
  {
    id: 'crit_pricing_errors',
    category: 'Payments & Billing',
    badge: 'Fair Trade',
    badgeBg: '#f8fafc',
    badgeColor: '#64748b',
    title: 'Pricing Discrepancy & Clerical Error Reservation',
    desc: 'In the rare case of a server or typographical pricing glitch, the store reserves the right to cancel orders with an immediate 100% full refund.',
    defaultChecked: true
  },
  {
    id: 'crit_payment_failures',
    category: 'Payments & Billing',
    badge: 'Auto-Reversal',
    badgeBg: '#e0f2fe',
    badgeColor: '#0284c7',
    title: 'Payment Drop & Auto-Reversal Protection',
    desc: 'If amount is debited from buyer bank but order is not generated, payment gateway auto-settles refund within 24-48 hours.',
    defaultChecked: true
  },
  {
    id: 'crit_fraud_prevention',
    category: 'Payments & Billing',
    badge: 'Anti-Fraud',
    badgeBg: '#fee2e2',
    badgeColor: '#b91c1c',
    title: 'Anti-Fraud Screening & Suspicious Velocity Checks',
    desc: 'Transactions flagged by automated banking fraud filters undergo manual verification before fulfillment.',
    defaultChecked: true
  },

  // ── 6. Product Safety, Chemical Care & Usage ──────────────────────────
  {
    id: 'crit_safety_handling',
    category: 'Safety & Product Care',
    badge: 'Safety First',
    badgeBg: '#ffedd5',
    badgeColor: '#ea580c',
    title: 'Epoxy Chemical Safety & Handling Guidelines',
    desc: 'Customer safety advisories for raw resin use (adequate ventilation, nitrile gloves) and heat limit warnings (do not microwave).',
    defaultChecked: true
  },
  {
    id: 'crit_child_safety',
    category: 'Safety & Product Care',
    badge: 'Keep Away Kids',
    badgeBg: '#fee2e2',
    badgeColor: '#dc2626',
    title: 'Child & Pet Chemical Ingestion Advisory',
    desc: 'Raw liquid resin compounds and mica powders are non-edible chemicals; keep strictly out of reach of children and pets.',
    defaultChecked: true
  },
  {
    id: 'crit_heat_resistance',
    category: 'Safety & Product Care',
    badge: '75°C Max',
    badgeBg: '#fef3c7',
    badgeColor: '#b45309',
    title: '75°C Heat Resistance & Hot Object Warning',
    desc: 'Fully cured resin withstands up to 75°C. Direct placement of boiling pans or open candle flames will cause thermal warping.',
    defaultChecked: true
  },
  {
    id: 'crit_cleaning_care',
    category: 'Safety & Product Care',
    badge: 'Microfiber Only',
    badgeBg: '#e0f2fe',
    badgeColor: '#0369a1',
    title: 'Soft Microfiber Cloth Cleaning Instructions',
    desc: 'Clean glossy resin art using soft microfiber towels and mild soapy water; never use abrasive scouring pads or harsh acetone solvents.',
    defaultChecked: true
  },
  {
    id: 'crit_skin_allergy',
    category: 'Safety & Product Care',
    badge: 'First Aid',
    badgeBg: '#ffedd5',
    badgeColor: '#c2410c',
    title: 'Nitrile Gloves Mandate & Skin Contact Protocol',
    desc: 'Always wear nitrile gloves during chemical mixing. In case of skin contact, wash immediately with soap and water (avoid alcohol).',
    defaultChecked: true
  },
  {
    id: 'crit_food_contact',
    category: 'Safety & Product Care',
    badge: 'Dry Food Only',
    badgeBg: '#ecfdf5',
    badgeColor: '#047857',
    title: 'Serving Tray Food-Contact Guidelines',
    desc: 'Cured resin platters and coasters are suitable for dry food service; do not use as cutting boards or microwave containers.',
    defaultChecked: true
  },

  // ── 7. Privacy, User Accounts & DPDP Compliance ───────────────────────
  {
    id: 'crit_dpdp_privacy',
    category: 'Privacy & Accounts',
    badge: 'DPDP 2023',
    badgeBg: '#e0f2fe',
    badgeColor: '#0284c7',
    title: 'DPDP Act 2023 Compliance & Zero Data Sale',
    desc: 'Customer shipping address, phone number, and custom photos are strictly protected and never sold or shared with 3rd parties.',
    defaultChecked: true
  },
  {
    id: 'crit_account_security',
    category: 'Privacy & Accounts',
    badge: 'Bcrypt Hash',
    badgeBg: '#f3e8ff',
    badgeColor: '#7e22ce',
    title: 'Password Security & End-to-End Session Integrity',
    desc: 'User passwords are cryptographically hashed using industry-standard bcrypt algorithms with salted rounds.',
    defaultChecked: true
  },
  {
    id: 'crit_cookie_consent',
    category: 'Privacy & Accounts',
    badge: 'Strictly Functional',
    badgeBg: '#f1f5f9',
    badgeColor: '#334155',
    title: 'Strictly Functional Session & Cart Cookies',
    desc: 'Cookies are utilized solely for essential authentication and cart memory; no intrusive tracking cookies are deployed.',
    defaultChecked: true
  },
  {
    id: 'crit_whatsapp_optin',
    category: 'Privacy & Accounts',
    badge: 'Transactional Only',
    badgeBg: '#dcfce7',
    badgeColor: '#15803d',
    title: 'WhatsApp Transactional Order Updates Only',
    desc: 'WhatsApp messaging is reserved strictly for tracking numbers, design approvals, and order status notifications without spam.',
    defaultChecked: true
  },
  {
    id: 'crit_data_deletion',
    category: 'Privacy & Accounts',
    badge: 'Right to Forget',
    badgeBg: '#fee2e2',
    badgeColor: '#991b1b',
    title: 'Right to Data Erasure & Account Deletion',
    desc: 'Customers can request complete account and data removal by contacting our Data Protection Officer at rinkupatel3495@gmail.com.',
    defaultChecked: true
  },

  // ── 8. Intellectual Property, Fair Use & Legal Jurisdiction ───────────
  {
    id: 'crit_ip_rights',
    category: 'Legal & Jurisdiction',
    badge: 'Copyright',
    badgeBg: '#f3e8ff',
    badgeColor: '#9333ea',
    title: 'Proprietary Designs & Intellectual Property Protection',
    desc: 'All custom molds, catalog photography, brand logos, and artwork styles are proprietary intellectual property of RK Creation under Copyright Act 1957.',
    defaultChecked: true
  },
  {
    id: 'crit_customer_photos_license',
    category: 'Legal & Jurisdiction',
    badge: 'Review Showcase',
    badgeBg: '#eff6ff',
    badgeColor: '#1d4ed8',
    title: 'Customer Review Photo Social Showcase Permission',
    desc: 'Photos voluntarily uploaded with public product reviews may be featured on our official Instagram and gallery with maker credits.',
    defaultChecked: true
  },
  {
    id: 'crit_coupon_fair_use',
    category: 'Legal & Jurisdiction',
    badge: 'Fair Use',
    badgeBg: '#fef3c7',
    badgeColor: '#b45309',
    title: 'Promotional Coupon Fair-Use & Anti-Abuse Clause',
    desc: 'Coupons are restricted to 1 per order. Bulk automated bot generation or coupon stacking results in immediate discount forfeiture.',
    defaultChecked: true
  },
  {
    id: 'crit_jurisdiction',
    category: 'Legal & Jurisdiction',
    badge: 'Legal Venue',
    badgeBg: '#f1f5f9',
    badgeColor: '#334155',
    title: 'Surendranagar, Gujarat Civil Dispute Jurisdiction',
    desc: 'Any civil legal claims or disputes shall be exclusively governed under Indian law and subject to the competent courts of Surendranagar, Gujarat.',
    defaultChecked: true
  },
  {
    id: 'crit_severability',
    category: 'Legal & Jurisdiction',
    badge: 'Severability',
    badgeBg: '#f8fafc',
    badgeColor: '#64748b',
    title: 'Clause Severability & Enforceability Protection',
    desc: 'If any individual clause in these terms is found unenforceable by a court, all remaining provisions remain in full legal force.',
    defaultChecked: true
  },
  {
    id: 'crit_arbitration',
    category: 'Legal & Jurisdiction',
    badge: 'Amicable Settlement',
    badgeBg: '#ecfdf5',
    badgeColor: '#065f46',
    title: 'Amicable Customer Mediation & Dispute Resolution',
    desc: 'All customer concerns are prioritized for friendly resolution within 14 days via support channels before formal arbitration.',
    defaultChecked: true
  }
];



