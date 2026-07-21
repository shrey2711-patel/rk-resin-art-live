// ── API Base ────────────────────────────────────────────────
const BASE = '';  // same origin; change to http://localhost:3000 if separate

const API = {
  token: null, // Admin token is in-memory only so page refresh automatically logs out for security
  userToken: localStorage.getItem('rk_user_token') || null,

  headers(auth = false) {
    const h = { 'Content-Type': 'application/json' };
    if (auth && this.token) h['Authorization'] = `Bearer ${this.token}`;
    return h;
  },

  userHeaders() {
    const h = { 'Content-Type': 'application/json' };
    if (this.userToken) h.Authorization = `Bearer ${this.userToken}`;
    return h;
  },

  async handleResponse(res, adminAuth = true) {
    if (!res.ok) {
      if (adminAuth && (res.status === 401 || res.status === 403)) {
        API.adminLogout();
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
    return API.handleResponse(res);
  },

  async post(path, data, auth = false) {
    const res = await fetch(BASE + path, {
      method: 'POST',
      headers: this.headers(auth),
      body: JSON.stringify(data)
    });
    return API.handleResponse(res);
  },

  async userGet(path) {
    const res = await fetch(BASE + path, {
      method: 'GET',
      headers: this.userHeaders()
    });
    return API.handleResponse(res);
  },

  async userPost(path, data) {
    const res = await fetch(BASE + path, {
      method: 'POST',
      headers: this.userHeaders(),
      body: JSON.stringify(data)
    });
    return API.handleResponse(res);
  },

  async userPut(path, data) {
    const res = await fetch(BASE + path, {
      method: 'PUT',
      headers: this.userHeaders(),
      body: JSON.stringify(data)
    });
    return API.handleResponse(res);
  },

  async put(path, data, auth = false) {
    const res = await fetch(BASE + path, {
      method: 'PUT',
      headers: this.headers(auth),
      body: JSON.stringify(data)
    });
    return API.handleResponse(res);
  },

  async delete(path, auth = false) {
    const res = await fetch(BASE + path, {
      method: 'DELETE',
      headers: this.headers(auth)
    });
    return API.handleResponse(res);
  },

  async uploadImage(file) {
    const headers = {};
    if (this.token) headers.Authorization = `Bearer ${this.token}`;

    try {
      // 1. Fetch ImgBB key securely from the server
      const keyData = await API.get('/api/admin/imgbb-key', true);
      
      if (keyData && keyData.key) {
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
    } catch (err) {
      console.warn('Direct upload setup failed, falling back to server-side upload:', err);
    }

    // 3. Fallback: Upload through the server (saves locally if server fails to connect to ImgBB)
    const formData = new FormData();
    formData.append('image', file);

    const res = await fetch(BASE + '/api/admin/upload', {
      method: 'POST',
      headers,
      body: formData
    });
    return API.handleResponse(res);
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
    return res;
  },
  adminLogout: () => {
    API.token = null;
  },
  isAdminLoggedIn: () => !!API.token,

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

  // ── Admin categories ──────────────────────────────────────
  addCategory: (data) => API.post('/api/admin/categories', data, true),
  updateCategory: (id, data) => API.put(`/api/admin/categories/${id}`, data, true),
  deleteCategory: (id) => API.delete(`/api/admin/categories/${id}`, true),

  // ── Admin subcategories ───────────────────────────────────
  getSubcategories: () => API.get('/api/subcategories'),
  addSubcategory: (data) => API.post('/api/admin/subcategories', data, true),
  updateSubcategory: (id, data) => API.put(`/api/admin/subcategories/${id}`, data, true),
  deleteSubcategory: (id) => API.delete(`/api/admin/subcategories/${id}`, true),

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
};
