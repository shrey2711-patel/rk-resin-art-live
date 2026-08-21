// ── Admin Panel ──────────────────────────────────────────────
const Admin = {
  data: { banners: [], nav: [], categories: [], products: [], orders: [], reviews: [], coupons: [] },
  editState: { section: null, id: null },
  maxUploadWidth: 3840,

  setUploadStatus(message, type = '') {
    const el = document.getElementById('productUploadStatus');
    if (!el) return;
    el.textContent = message;
    el.className = `upload-status ${type}`;

    const saveBtn = document.getElementById('addProdBtn');
    if (saveBtn) {
      if (type === 'loading') {
        saveBtn.disabled = true;
        saveBtn.style.opacity = '0.6';
        saveBtn.style.cursor = 'not-allowed';
        saveBtn.textContent = 'Uploading...';
      } else {
        saveBtn.disabled = false;
        saveBtn.style.opacity = '';
        saveBtn.style.cursor = '';
        saveBtn.textContent = this.editState.section === 'product' ? 'Update Product' : '+ Add Product';
      }
    }
  },

  updateStockFieldsVisibility() {
    const isTracking = this.data.settings && this.data.settings.trackStock !== false;
    const pfStock = document.getElementById('pfStock');
    const pfStockToggleContainer = document.getElementById('pfStockStatusToggleContainer');
    const pfStockLabel = document.getElementById('pfStockLabel');
    
    if (isTracking) {
      if (pfStock) pfStock.style.display = '';
      if (pfStockToggleContainer) pfStockToggleContainer.style.display = 'none';
      if (pfStockLabel) pfStockLabel.textContent = 'Stock';
    } else {
      if (pfStock) pfStock.style.display = 'none';
      if (pfStockToggleContainer) pfStockToggleContainer.style.display = '';
      if (pfStockLabel) pfStockLabel.textContent = 'Stock Status';
    }
  },

  setStockStatusButtonState(val) {
    const btn = document.getElementById('pfStockStatusBtn');
    const input = document.getElementById('pfStockStatus');
    if (!btn || !input) return;
    
    input.value = val;
    const dot = btn.querySelector('.toggle-dot');
    const text = btn.querySelector('.toggle-text');
    
    if (val === '1' || val === 1) {
      btn.style.background = '#25D366'; // Green for active In Stock
      btn.style.color = '#ffffff';
      btn.style.borderColor = '#25D366';
      if (dot) dot.style.background = '#ffffff';
      if (text) text.textContent = 'In Stock';
    } else {
      btn.style.background = '#e5e7eb'; // Grey for Out of Stock
      btn.style.color = '#555555';
      btn.style.borderColor = '#e5e7eb';
      if (dot) dot.style.background = '#888888';
      if (text) text.textContent = 'Out of Stock';
    }
  },

  setBannerUploadStatus(message, type = '', target = 'desktop') {
    const elId = target === 'mobile' ? 'bannerMobileUploadStatus' : 'bannerUploadStatus';
    const el = document.getElementById(elId);
    if (el) {
      el.textContent = message;
      el.className = `upload-status ${type}`;
    }

    const saveBtn = document.getElementById('addBannerBtn');
    if (saveBtn) {
      if (type === 'loading') {
        saveBtn.disabled = true;
        saveBtn.style.opacity = '0.6';
        saveBtn.style.cursor = 'not-allowed';
        saveBtn.textContent = 'Uploading...';
      } else {
        const atLimit = (this.data?.banners?.length >= 3) && (this.editState?.section !== 'banner');
        saveBtn.disabled = atLimit;
        saveBtn.style.opacity = atLimit ? '0.6' : '';
        saveBtn.style.cursor = atLimit ? 'not-allowed' : '';
        saveBtn.textContent = this.editState.section === 'banner' ? 'Update Banner' : '+ Add Banner';
      }
    }
  },

  updateBannerImagePreview(url, target = 'desktop') {
    const hiddenId = target === 'mobile' ? 'bfMobileImageUrl' : 'bfImageUrl';
    const wrapId = target === 'mobile' ? 'bannerMobileImagePreview' : 'bannerImagePreview';
    const imgId = target === 'mobile' ? 'bfMobilePreviewImg' : 'bfImagePreviewImg';

    const hidden = document.getElementById(hiddenId);
    const wrap = document.getElementById(wrapId);
    const img = document.getElementById(imgId);
    if (hidden) hidden.value = url || '';
    if (!wrap || !img) return;

    if (url) {
      img.src = url;
      wrap.style.display = 'block';
    } else {
      img.removeAttribute('src');
      wrap.style.display = 'none';
    }
  },

  isValidImageType(file) {
    if (!file) return false;
    const type = (file.type || '').toLowerCase();
    if (['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'].includes(type)) return true;
    
    // Fallback check on extension in case MIME type is missing or generic (e.g. on mobile/external folders)
    const ext = (file.name || '').split('.').pop().toLowerCase();
    if (['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif'].includes(ext)) return true;
    
    return false;
  },

  isHeicImage(file) {
    if (!file) return false;
    const type = (file.type || '').toLowerCase();
    if (type.includes('heic') || type.includes('heif')) return true;
    const ext = (file.name || '').split('.').pop().toLowerCase();
    if (['heic', 'heif'].includes(ext)) return true;
    return false;
  },

  async uploadBannerImage(file, target = 'desktop') {
    if (!file) return;

    if (!this.isValidImageType(file)) {
      showToast('Please choose a JPG, PNG, WEBP or HEIC image', 'error');
      return;
    }

    this.updateBannerImagePreview(URL.createObjectURL(file), target);
    this.setBannerUploadStatus('Uploading image...', 'loading', target);
    try {
      const optimizedFile = await this.resizeImageForUpload(file);
      const result = await API.uploadImage(optimizedFile);
      this.updateBannerImagePreview(result.url, target);
      this.setBannerUploadStatus(`${target === 'mobile' ? 'Mobile (3:4)' : 'Desktop (16:9)'} poster uploaded & ready to save.`, 'success', target);
    } catch (e) {
      this.updateBannerImagePreview('', target);
      this.setBannerUploadStatus(`Upload failed: ${e.message}`, 'error', target);
      showToast(`Upload failed: ${e.message}`, 'error');
    }
  },

  updateProductSlotPreview(slotIndex, url) {
    const hiddenId = slotIndex === 1 ? 'pfImageUrl' : `pfImageUrl${slotIndex}`;
    const hidden = document.getElementById(hiddenId);
    const previewBox = document.getElementById(`pfSlotPreview${slotIndex}`);
    const img = document.getElementById(`pfSlotImg${slotIndex}`);
    const uploadBox = document.getElementById(`pfSlotBox${slotIndex}`);
    if (hidden) hidden.value = url || '';
    if (url) {
      if (img) img.src = url;
      if (previewBox) previewBox.style.display = 'block';
      if (uploadBox) uploadBox.style.display = 'none';
    } else {
      if (img) img.removeAttribute('src');
      if (previewBox) previewBox.style.display = 'none';
      if (uploadBox) uploadBox.style.display = 'block';
    }
  },

  async uploadProductSlotFile(slotIndex, file) {
    if (!file) return;
    if (!this.isValidImageType(file)) {
      showToast('Please choose a JPG, PNG, WEBP or HEIC image', 'error');
      return;
    }
    this.setUploadStatus(`Uploading Photo ${slotIndex}...`, 'loading');
    try {
      const optimizedFile = await this.resizeImageForUpload(file);
      const result = await API.uploadImage(optimizedFile);
      this.updateProductSlotPreview(slotIndex, result.url);
      this.setUploadStatus(`Photo ${slotIndex} uploaded successfully!`, 'success');
    } catch (e) {
      showToast(`Upload failed: ${e.message}`, 'error');
      this.setUploadStatus(`Upload failed: ${e.message}`, 'error');
    }
  },

  updateImagePreview(url) {
    this.updateProductSlotPreview(1, url);
  },

  updateConversionStatus(msg) {
    const ids = ['categoryUploadStatus', 'bannerUploadStatus'];
    ids.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.textContent = msg;
    });
    // For products, update both elements
    const prodStatus = document.getElementById('productUploadStatus');
    if (prodStatus) prodStatus.textContent = msg;
    const uploadStatus = document.querySelector('.upload-status');
    if (uploadStatus) uploadStatus.textContent = msg;
  },

  async resizeImageForUpload(file) {
    // ── HEIC/HEIF: send raw to server — sharp converts it reliably on all platforms ──
    if (this.isHeicImage(file)) {
      this.updateConversionStatus('📷 HEIC detected — sending to server for conversion & compression...');
      return file;
    }

    // ── Standard images: resize + progressive compress to ≤1MB in browser ──
    try {
      const imageUrl = URL.createObjectURL(file);
      const img = new Image();

      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = () => reject(new Error('Failed to load image for resize'));
        img.src = imageUrl;
      });

      // Max 1920px wide — keeps quality high while limiting raw pixel count
      const maxW = 1920;
      const scale = Math.min(1, maxW / img.width);

      const canvas = document.createElement('canvas');
      canvas.width  = Math.round(img.width  * scale);
      canvas.height = Math.round(img.height * scale);

      const ctx = canvas.getContext('2d');
      if (!ctx) { URL.revokeObjectURL(imageUrl); return file; }

      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(imageUrl);

      // Progressive quality loop — keep reducing until ≤ 1 MB or quality floor
      const TARGET_BYTES = 1 * 1024 * 1024; // 1 MB
      const MIN_QUALITY  = 0.15;
      let quality = 0.85;
      let blob    = null;

      this.updateConversionStatus('🗜️ Compressing image...');

      do {
        blob = await new Promise(resolve =>
          canvas.toBlob(resolve, 'image/webp', quality)
        );
        if (!blob || blob.size <= TARGET_BYTES) break;
        quality = Math.max(MIN_QUALITY, quality - 0.07);
      } while (quality >= MIN_QUALITY);

      if (!blob) return file;

      const finalKB = Math.round(blob.size / 1024);
      const usedQ   = Math.round((quality + 0.07) * 100); // quality before last decrement
      this.updateConversionStatus(`✅ Compressed to ${finalKB} KB (quality ${Math.min(85, usedQ)}%)`);

      const baseName = (file.name || 'image').replace(/\.[^/.]+$/, '');
      return new File([blob], `${baseName}.webp`, { type: 'image/webp', lastModified: Date.now() });
    } catch (e) {
      console.error('Image compression failed, using original file:', e);
      return file;
    }
  },

  async uploadProductImage(file) {
    if (!file) return;

    if (!this.isValidImageType(file)) {
      showToast('Please choose a JPG, PNG, WEBP or HEIC image', 'error');
      return;
    }

    this.updateImagePreview(URL.createObjectURL(file));
    this.setUploadStatus('Uploading image...', 'loading');
    try {
      const optimizedFile = await this.resizeImageForUpload(file);
      const result = await API.uploadImage(optimizedFile);
      this.updateImagePreview(result.url);
      this.setUploadStatus('Image uploaded and ready to save.', 'success');
    } catch (err) {
      this.updateImagePreview('');
      this.setUploadStatus(`Upload failed: ${err.message}`, 'error');
      showToast(`Upload failed: ${err.message}`, 'error');
    }
  },

  updateCategoryImagePreview(url) {
    const hidden = document.getElementById('cfImageUrl');
    const wrap = document.getElementById('categoryImagePreview');
    const img = document.getElementById('cfImagePreviewImg');
    if (hidden) hidden.value = url || '';
    if (!wrap || !img) return;

    if (url) {
      img.src = url;
      wrap.style.display = '';
    } else {
      img.removeAttribute('src');
      wrap.style.display = 'none';
    }
  },

  setCategoryUploadStatus(message, type = '') {
    const el = document.getElementById('categoryUploadStatus');
    if (!el) return;
    el.textContent = message;
    el.className = `upload-status ${type}`;

    const saveBtn = document.getElementById('addCatBtn');
    if (saveBtn) {
      if (type === 'loading') {
        saveBtn.disabled = true;
        saveBtn.style.opacity = '0.6';
        saveBtn.style.cursor = 'not-allowed';
        saveBtn.textContent = 'Uploading...';
      } else {
        saveBtn.disabled = false;
        saveBtn.style.opacity = '';
        saveBtn.style.cursor = '';
        saveBtn.textContent = this.editState.section === 'category' ? 'Update Category' : '+ Add Category';
      }
    }
  },

  async uploadCategoryImage(file) {
    if (!file) return;

    if (!this.isValidImageType(file)) {
      showToast('Please choose a JPG, PNG, WEBP or HEIC image', 'error');
      return;
    }

    this.updateCategoryImagePreview(URL.createObjectURL(file));
    this.setCategoryUploadStatus('Uploading image...', 'loading');
    try {
      const optimizedFile = await this.resizeImageForUpload(file);
      const result = await API.uploadImage(optimizedFile);
      this.updateCategoryImagePreview(result.url);
      this.setCategoryUploadStatus('Image uploaded and ready to save.', 'success');
    } catch (err) {
      this.updateCategoryImagePreview('');
      this.setCategoryUploadStatus(`Upload failed: ${err.message}`, 'error');
      showToast(`Upload failed: ${err.message}`, 'error');
    }
  },

  resetBannerForm() {
    const fileDesktop = document.getElementById('bfImageFile');
    const fileMobile = document.getElementById('bfMobileImageFile');
    if (fileDesktop) fileDesktop.value = '';
    if (fileMobile) fileMobile.value = '';

    this.updateBannerImagePreview('', 'desktop');
    this.updateBannerImagePreview('', 'mobile');
    this.setBannerUploadStatus('', '', 'desktop');
    this.setBannerUploadStatus('', '', 'mobile');

    const formTitle = document.getElementById('bannerFormTitle');
    if (formTitle) formTitle.textContent = 'Add New Banner (Desktop 16:9 & Mobile 3:4)';

    const btn = document.getElementById('addBannerBtn');
    const cancel = document.getElementById('cancelBannerBtn');
    const limitNotice = document.getElementById('bannerLimitNotice');
    const atLimit = (this.data?.banners?.length >= 3);

    if (btn) {
      btn.textContent = '+ Add Banner';
      btn.disabled = atLimit;
      btn.style.opacity = atLimit ? '0.6' : '';
      btn.style.cursor = atLimit ? 'not-allowed' : '';
    }
    if (cancel) cancel.style.display = 'none';
    if (limitNotice) limitNotice.style.display = atLimit ? 'block' : 'none';

    this.editState = { section: null, id: null };
  },

  setBannerEdit(banner) {
    const fileDesktop = document.getElementById('bfImageFile');
    const fileMobile = document.getElementById('bfMobileImageFile');
    if (fileDesktop) fileDesktop.value = '';
    if (fileMobile) fileMobile.value = '';

    const desktopUrl = banner.imageUrl || banner.desktopImageUrl || '';
    const mobileUrl = banner.mobileImageUrl || '';

    this.updateBannerImagePreview(desktopUrl, 'desktop');
    this.updateBannerImagePreview(mobileUrl, 'mobile');

    this.setBannerUploadStatus(desktopUrl ? 'Current 16:9 desktop poster loaded.' : '', '', 'desktop');
    this.setBannerUploadStatus(mobileUrl ? 'Current 3:4 mobile poster loaded.' : 'No mobile poster uploaded (will use 16:9 fallback)', '', 'mobile');

    const formTitle = document.getElementById('bannerFormTitle');
    if (formTitle) formTitle.textContent = `Edit Banner #${banner.id} (Desktop 16:9 & Mobile 3:4)`;

    const btn = document.getElementById('addBannerBtn');
    const cancel = document.getElementById('cancelBannerBtn');
    const limitNotice = document.getElementById('bannerLimitNotice');

    if (btn) {
      btn.textContent = 'Update Banner';
      btn.disabled = false;
      btn.style.opacity = '';
      btn.style.cursor = '';
    }
    if (cancel) cancel.style.display = 'inline-block';
    if (limitNotice) limitNotice.style.display = 'none';

    this.editState = { section: 'banner', id: banner.id };

    const card = document.getElementById('bannerFormCard');
    if (card) card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  },

  async saveBannerForm() {
    const imageUrl = document.getElementById('bfImageUrl')?.value.trim();
    const mobileImageUrl = document.getElementById('bfMobileImageUrl')?.value.trim() || null;

    if (!imageUrl) {
      showToast('Please upload the 16:9 Desktop / Tablet banner image first', 'error');
      return;
    }

    if (this.editState.section !== 'banner' && this.data.banners.length >= 3) {
      showToast('Maximum limit of 3 banners reached. Please delete or edit an existing banner.', 'error');
      return;
    }

    const payload = {
      imageUrl,
      desktopImageUrl: imageUrl,
      mobileImageUrl
    };

    try {
      const btn = document.getElementById('addBannerBtn');
      if (btn) { btn.disabled = true; btn.textContent = 'Saving...'; }

      if (this.editState.section === 'banner' && this.editState.id) {
        await API.updateBanner(this.editState.id, payload);
        showToast('Banner updated successfully!', 'success');
      } else {
        await API.addBanner(payload);
        showToast('Banner added successfully!', 'success');
      }

      showOk('bannerOk');
      await this.loadAll();
      this.renderBanners();
      this.resetBannerForm();
      if (typeof App !== 'undefined' && typeof App.loadBanners === 'function') {
        await App.loadBanners();
      }
    } catch (err) {
      showToast('Save failed: ' + err.message, 'error');
      const btn = document.getElementById('addBannerBtn');
      if (btn) {
        btn.disabled = false;
        btn.textContent = this.editState.section === 'banner' ? 'Update Banner' : '+ Add Banner';
      }
    }
  },

  resetNavForm() {
    document.getElementById('nfLabel').value = '';
    document.getElementById('nfRow').value = '1';
    document.getElementById('nfFeat').value = 'false';
    const btn = document.getElementById('addNavBtn');
    const cancel = document.getElementById('cancelNavBtn');
    if (btn) btn.textContent = '+ Add Link';
    if (cancel) cancel.style.display = 'none';
    this.editState = { section: null, id: null };
  },

  setNavEdit(item) {
    document.getElementById('nfLabel').value = item.label || '';
    document.getElementById('nfRow').value = String(item.row || 1);
    document.getElementById('nfFeat').value = item.featured ? 'true' : 'false';
    const btn = document.getElementById('addNavBtn');
    const cancel = document.getElementById('cancelNavBtn');
    if (btn) btn.textContent = 'Update Link';
    if (cancel) cancel.style.display = '';
    this.editState = { section: 'nav', id: item.id };
  },

  resetCategoryForm() {
    document.getElementById('cfName').value = '';
    document.getElementById('cfEmoji').value = '';
    document.getElementById('cfColor').value = '#EDE8FF';
    document.getElementById('cfImageFile').value = '';
    this.updateCategoryImagePreview('');
    this.setCategoryUploadStatus('');
    const btn = document.getElementById('addCatBtn');
    const cancel = document.getElementById('cancelCatBtn');
    if (btn) btn.textContent = '+ Add Category';
    if (cancel) cancel.style.display = 'none';
    this.editState = { section: null, id: null };
  },

  setCategoryEdit(category) {
    document.getElementById('cfName').value = category.name || '';
    document.getElementById('cfEmoji').value = category.emoji || '';
    document.getElementById('cfColor').value = category.color || '#EDE8FF';
    document.getElementById('cfImageFile').value = '';
    this.updateCategoryImagePreview(category.imageUrl || '');
    this.setCategoryUploadStatus(category.imageUrl ? 'Current category image loaded.' : '');
    const btn = document.getElementById('addCatBtn');
    const cancel = document.getElementById('cancelCatBtn');
    if (btn) btn.textContent = 'Update Category';
    if (cancel) cancel.style.display = '';
    this.editState = { section: 'category', id: category.id };
  },

  async saveCategoryForm() {
    const name = document.getElementById('cfName')?.value.trim();
    if (!name) { showToast('Category name is required', 'error'); return; }

    const emoji = document.getElementById('cfEmoji')?.value.trim() || '';
    const color = document.getElementById('cfColor')?.value || '#EDE8FF';
    const imageUrl = document.getElementById('cfImageUrl')?.value.trim() || '';

    const payload = { name, emoji, color, imageUrl };

    try {
      const btn = document.getElementById('addCatBtn');
      if (btn) { btn.disabled = true; btn.textContent = 'Saving...'; }

      if (this.editState.section === 'category' && this.editState.id) {
        await API.updateCategory(this.editState.id, payload);
        showToast('Category updated!', 'success');
      } else {
        await API.addCategory(payload);
        showToast('Category added!', 'success');
      }

      this.resetCategoryForm();
      await this.loadAll();
      this.renderCategories();
    } catch (err) {
      showToast('Save failed: ' + err.message, 'error');
      const btn = document.getElementById('addCatBtn');
      if (btn) {
        btn.disabled = false;
        btn.textContent = this.editState.section === 'category' ? 'Update Category' : '+ Add Category';
      }
    }
  },



  resetProductForm() {
    ['pfName', 'pfPrice', 'pfOrig', 'pfStock', 'pfEmoji', 'pfBadge', 'pfDesc', 'pfImageUrl', 'pfImageUrl2', 'pfImageUrl3', 'pfUnit'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    [1, 2, 3].forEach(idx => this.updateProductSlotPreview(idx, ''));
    const ratioEl = document.getElementById('pfImgRatio');
    if (ratioEl) ratioEl.value = '4:3';
    document.getElementById('pfCat').value = this.data.categories[0]?.name || '';
    this.setUploadStatus('');
    const btn = document.getElementById('addProdBtn');
    const cancel = document.getElementById('cancelProdBtn');
    if (btn) btn.textContent = '+ Add Product';
    if (cancel) cancel.style.display = 'none';
    this.editState = { section: null, id: null };
    
    // Show base inputs for simple product by default
    const basePriceStockContainer = document.getElementById('pfBasePriceStockContainer');
    if (basePriceStockContainer) basePriceStockContainer.style.display = '';
    const baseImageContainer = document.getElementById('pfBaseImageContainer');
    if (baseImageContainer) baseImageContainer.style.display = '';

    // Reset multi variant checkbox and hide variant section
    const multiVariantChk = document.getElementById('pfMultiVariant');
    if (multiVariantChk) multiVariantChk.checked = false;
    const adminVariantsSection = document.getElementById('adminVariantsSection');
    if (adminVariantsSection) adminVariantsSection.style.display = 'none';

    // Reset variants
    const vlSel = document.getElementById('pfVariantLabel');
    if (vlSel) vlSel.value = '';
    const customInp = document.getElementById('pfVariantLabelCustom');
    if (customInp) { customInp.value = ''; customInp.style.display = 'none'; }
    const addBtn = document.getElementById('addVariantRowBtn');
    if (addBtn) addBtn.style.display = 'none';
    const rows = document.getElementById('pfVariantRows');
    if (rows) rows.innerHTML = '';

    this.setStockStatusButtonState('1');
    this.updateStockFieldsVisibility();
  },

  setProductEdit(product) {
    document.getElementById('pfName').value = product.name || '';
    document.getElementById('pfCat').value = product.category || this.data.categories[0]?.name || '';
    const ratioEl = document.getElementById('pfImgRatio');
    if (ratioEl) ratioEl.value = product.imgRatio || '4:3';
    document.getElementById('pfEmoji').value = product.emoji || '';
    document.getElementById('pfBadge').value = product.badge || '';
    document.getElementById('pfDesc').value = product.description || '';
    const unitEl = document.getElementById('pfUnit');
    if (unitEl) unitEl.value = product.unit || '';

    const btn = document.getElementById('addProdBtn');
    const cancel = document.getElementById('cancelProdBtn');
    if (btn) btn.textContent = 'Update Product';
    if (cancel) cancel.style.display = '';
    this.editState = { section: 'product', id: product.id };

    const basePriceStockContainer = document.getElementById('pfBasePriceStockContainer');
    const baseImageContainer = document.getElementById('pfBaseImageContainer');
    const adminVariantsSection = document.getElementById('adminVariantsSection');
    const multiVariantChk = document.getElementById('pfMultiVariant');

    const vl = product.variantLabel || '';
    if (!vl) {
      // Simple Product Mode
      if (multiVariantChk) multiVariantChk.checked = false;
      if (basePriceStockContainer) basePriceStockContainer.style.display = '';
      if (baseImageContainer) baseImageContainer.style.display = '';
      if (adminVariantsSection) adminVariantsSection.style.display = 'none';

      document.getElementById('pfPrice').value = product.price || '';
      document.getElementById('pfOrig').value = product.originalPrice || '';
      document.getElementById('pfStock').value = product.stock !== undefined ? product.stock : '';
      const isOut = Number(product.stock) === 0;
      this.setStockStatusButtonState(isOut ? '0' : '1');
      this.updateStockFieldsVisibility();

      const prodImages = (product.images && Array.isArray(product.images) && product.images.length > 0)
        ? product.images
        : (product.imageUrl ? [product.imageUrl] : []);

      this.updateProductSlotPreview(1, prodImages[0] || '');
      this.updateProductSlotPreview(2, prodImages[1] || '');
      this.updateProductSlotPreview(3, prodImages[2] || '');
      this.setUploadStatus(prodImages.length ? `${prodImages.length} product image(s) loaded.` : '');

      // Reset variants
      const vlSel = document.getElementById('pfVariantLabel');
      if (vlSel) vlSel.value = '';
      const customInp = document.getElementById('pfVariantLabelCustom');
      if (customInp) { customInp.value = ''; customInp.style.display = 'none'; }
      const rowsEl = document.getElementById('pfVariantRows');
      if (rowsEl) rowsEl.innerHTML = '';
    } else {
      // Variable Product Mode
      if (multiVariantChk) multiVariantChk.checked = true;
      if (basePriceStockContainer) basePriceStockContainer.style.display = 'none';
      if (baseImageContainer) baseImageContainer.style.display = 'none';
      if (adminVariantsSection) adminVariantsSection.style.display = '';

      document.getElementById('pfPrice').value = '';
      document.getElementById('pfOrig').value = '';
      document.getElementById('pfStock').value = '';
      [1, 2, 3].forEach(idx => this.updateProductSlotPreview(idx, ''));
      this.setUploadStatus('');

      const vlSel = document.getElementById('pfVariantLabel');
      const customInp = document.getElementById('pfVariantLabelCustom');
      const addBtn = document.getElementById('addVariantRowBtn');
      const rowsEl = document.getElementById('pfVariantRows');
      if (vlSel && rowsEl) {
        rowsEl.innerHTML = '';
        const knownLabels = ['Size','Weight','Grams','Litre','Volume','Pack','Colour','Color'];
        if (knownLabels.includes(vl)) {
          vlSel.value = vl;
          if (customInp) customInp.style.display = 'none';
          if (addBtn) addBtn.style.display = '';
          (product.variants || []).forEach(v => {
            const vImgs = (v.images && Array.isArray(v.images) && v.images.length > 0)
              ? v.images
              : (v.imageUrl ? [v.imageUrl] : []);
            this.addVariantRow(v.label, v.price, v.stock, v.imageUrl || '', vImgs);
          });
        } else {
          vlSel.value = 'Custom';
          if (customInp) { customInp.value = vl; customInp.style.display = ''; }
          if (addBtn) addBtn.style.display = '';
          (product.variants || []).forEach(v => {
            const vImgs = (v.images && Array.isArray(v.images) && v.images.length > 0)
              ? v.images
              : (v.imageUrl ? [v.imageUrl] : []);
            this.addVariantRow(v.label, v.price, v.stock, v.imageUrl || '', vImgs);
          });
        }
      }
    }
  },

  async saveProductForm() {
    const name = document.getElementById('pfName').value.trim();
    if (!name) { showToast('Product name is required', 'error'); return; }

    const isMulti = document.getElementById('pfMultiVariant')?.checked;
    const isTracking = this.data.settings && this.data.settings.trackStock !== false;

    let price = 0;
    let originalPrice = null;
    let stock = 0;
    let imageUrl = '';
    let images = [];
    let variantLabel = null;
    let variants = null;

    if (!isMulti) {
      // Simple Product Mode
      const prcVal = parseFloat(document.getElementById('pfPrice').value);
      if (isNaN(prcVal)) {
        showToast('Please specify a valid price!', 'error');
        return;
      }
      price = prcVal;
      originalPrice = parseFloat(document.getElementById('pfOrig').value) || null;
      if (isTracking) {
        stock = parseInt(document.getElementById('pfStock').value) || 0;
      } else {
        stock = parseInt(document.getElementById('pfStockStatus').value) || 1;
      }

      const pImg1 = document.getElementById('pfImageUrl')?.value.trim() || '';
      const pImg2 = document.getElementById('pfImageUrl2')?.value.trim() || '';
      const pImg3 = document.getElementById('pfImageUrl3')?.value.trim() || '';
      images = [pImg1, pImg2, pImg3].filter(Boolean);
      imageUrl = images[0] || '';

      if (images.some(url => url.startsWith('blob:'))) {
        showToast('Please wait for product images to finish uploading!', 'error');
        return;
      }
    } else {
      // Variable Product Mode
      const vlSel = document.getElementById('pfVariantLabel');
      const customInp = document.getElementById('pfVariantLabelCustom');
      variantLabel = vlSel ? vlSel.value : '';
      if (variantLabel === 'Custom') variantLabel = (customInp ? customInp.value.trim() : '') || '';
      if (!variantLabel) {
        showToast('Please select a variant type (e.g. Size, Color)!', 'error');
        return;
      }

      const variantRows = document.querySelectorAll('.admin-variant-row');
      const vrList = [];
      variantRows.forEach(row => {
        const lbl = row.querySelector('.vr-label')?.value.trim();
        const prc = parseFloat(row.querySelector('.vr-price')?.value);
        let stk;
        if (isTracking) {
          stk = parseInt(row.querySelector('.vr-stock')?.value);
        } else {
          stk = parseInt(row.querySelector('.vr-stock-value')?.value || '1');
        }

        const vImg1 = row.querySelector('.vr-image-1')?.value.trim() || '';
        const vImg2 = row.querySelector('.vr-image-2')?.value.trim() || '';
        const vImg3 = row.querySelector('.vr-image-3')?.value.trim() || '';
        const vImages = [vImg1, vImg2, vImg3].filter(Boolean);

        if (lbl) {
          vrList.push({
            label: lbl,
            price: isNaN(prc) ? null : prc,
            stock: isNaN(stk) ? 0 : stk,
            imageUrl: vImages[0] || null,
            images: vImages
          });
        }
      });

      if (vrList.length === 0) {
        showToast('Please add at least one variant option row!', 'error');
        return;
      }

      // Check if any variant image is still uploading (blob:)
      const stillUploading = vrList.some(v => (v.images || []).some(url => url && url.startsWith('blob:')));
      if (stillUploading) {
        showToast('Please wait for all variant images to finish uploading!', 'error');
        return;
      }

      const firstPrice = vrList[0].price;
      if (firstPrice === null || isNaN(firstPrice)) {
        showToast('Please specify a price for the first variant!', 'error');
        return;
      }
      price = firstPrice;
      // Populate price for other options if left blank
      vrList.forEach(v => {
        if (v.price === null) v.price = price;
      });
      originalPrice = null;
      stock = vrList.reduce((sum, v) => sum + (v.stock || 0), 0);
      imageUrl = vrList[0].imageUrl || '';
      images = vrList[0].images || [];
      variants = vrList;
    }

    const imgRatio = document.getElementById('pfImgRatio')?.value || '4:3';

    const payload = {
      name,
      price,
      originalPrice,
      category: document.getElementById('pfCat').value,
      stock,
      emoji: document.getElementById('pfEmoji').value.trim() || '📦',
      badge: document.getElementById('pfBadge').value,
      description: document.getElementById('pfDesc').value.trim(),
      imageUrl,
      images,
      imgRatio,
      variantLabel,
      variants,
      unit: document.getElementById('pfUnit')?.value.trim() || '',
    };

    if (this.editState.section === 'product' && this.editState.id) {
      await API.updateProduct(this.editState.id, payload);
      showToast('Product updated', 'success');
    } else {
      await API.addProduct(payload);
      showOk('prodOk');
    }
    this.resetProductForm();
    await this.loadAll();
    this.renderProducts();
    App.loadProducts();
  },

  cancelBannerEdit() {
    this.resetBannerForm();
  },

  cancelNavEdit() {
    this.resetNavForm();
  },

  cancelCategoryEdit() {
    this.resetCategoryForm();
  },

  cancelProductEdit() {
    this.resetProductForm();
  },

  initVariantBuilder() {
    const vlSel = document.getElementById('pfVariantLabel');
    const customInp = document.getElementById('pfVariantLabelCustom');
    const addBtn = document.getElementById('addVariantRowBtn');
    if (!vlSel) return;

    vlSel.onchange = () => {
      const val = vlSel.value;
      if (!val) {
        if (customInp) { customInp.style.display = 'none'; customInp.value = ''; }
        if (addBtn) addBtn.style.display = 'none';
        const rowsEl = document.getElementById('pfVariantRows');
        if (rowsEl) rowsEl.innerHTML = '';
      } else {
        if (val === 'Custom') {
          if (customInp) customInp.style.display = '';
        } else {
          if (customInp) { customInp.style.display = 'none'; customInp.value = ''; }
        }
        if (addBtn) addBtn.style.display = '';
        const rowsEl = document.getElementById('pfVariantRows');
        if (rowsEl) {
          rowsEl.innerHTML = '';
          this.addVariantRow('', '', '');
        }
      }
    };

    if (addBtn) {
      addBtn.onclick = () => this.addVariantRow('', '');
    }

    const multiVariantChk = document.getElementById('pfMultiVariant');
    if (multiVariantChk) {
      multiVariantChk.onchange = () => this.toggleMultiVariant();
    }
  },

  toggleMultiVariant() {
    const isMulti = document.getElementById('pfMultiVariant').checked;
    const basePriceStockContainer = document.getElementById('pfBasePriceStockContainer');
    const baseImageContainer = document.getElementById('pfBaseImageContainer');
    const adminVariantsSection = document.getElementById('adminVariantsSection');
    
    if (isMulti) {
      if (basePriceStockContainer) basePriceStockContainer.style.display = 'none';
      if (baseImageContainer) baseImageContainer.style.display = 'none';
      if (adminVariantsSection) adminVariantsSection.style.display = '';
      
      const vlSel = document.getElementById('pfVariantLabel');
      if (vlSel) {
        vlSel.value = 'Size';
        vlSel.dispatchEvent(new Event('change'));
      }
    } else {
      if (basePriceStockContainer) basePriceStockContainer.style.display = '';
      if (baseImageContainer) baseImageContainer.style.display = '';
      if (adminVariantsSection) adminVariantsSection.style.display = 'none';
      
      const rowsEl = document.getElementById('pfVariantRows');
      if (rowsEl) rowsEl.innerHTML = '';
    }
  },

  addVariantRow(label = '', price = '', stock = '', imageUrl = '', images = []) {
    const rowsEl = document.getElementById('pfVariantRows');
    if (!rowsEl) return;
    const row = document.createElement('div');
    row.className = 'admin-variant-row';
    row.style.cssText = 'display:flex; flex-direction:column; gap:8px; padding:10px; border:1px solid var(--border); border-radius:8px; margin-bottom:10px; background:var(--card);';
    
    const vlSel = document.getElementById('pfVariantLabel');
    const hasLabel = vlSel && vlSel.value;
    const labelStyle = hasLabel ? '' : 'display:none;';
    const labelVal = hasLabel ? label : 'Standard';
    const removeBtnStyle = hasLabel ? '' : 'display:none;';

    // Parse images array (up to 3 photos per variant)
    let imgList = Array.isArray(images) ? [...images] : [];
    if (!imgList.length && imageUrl) imgList = [imageUrl];
    while (imgList.length < 3) imgList.push('');

    const isTracking = this.data.settings && this.data.settings.trackStock !== false;
    let stockFieldHtml = '';
    if (isTracking) {
      stockFieldHtml = `
        <span class="admin-variant-row-label">Stock:</span>
        <input class="vr-stock" type="number" placeholder="Stock" value="${stock}" min="0" style="max-width:70px">
      `;
    } else {
      const isOut = Number(stock) === 0;
      stockFieldHtml = `
        <span class="admin-variant-row-label">Status:</span>
        <button type="button" class="vr-stock-btn" style="min-height: 32px; min-width: 100px; border: 1px solid var(--border); border-radius: 4px; padding: 2px 8px; font-weight: 800; cursor: pointer; font-size: 0.76rem; display: inline-flex; align-items: center; gap: 4px; justify-content: center; outline: none; transition: all 0.2s;">
          <span class="toggle-dot" style="width: 6px; height: 6px; border-radius: 50%; display: inline-block;"></span>
          <span class="toggle-text">In Stock</span>
        </button>
        <input type="hidden" class="vr-stock-value" value="${isOut ? '0' : '1'}">
      `;
    }

    const renderSlotsHtml = [1, 2, 3].map(slotNum => {
      const url = imgList[slotNum - 1] || '';
      const thumb = url
        ? `<img class="vr-thumb-img-${slotNum}" src="${url}" style="width:34px; height:34px; object-fit:cover; border-radius:4px; border:1px solid var(--border);">`
        : `<span style="font-size:0.72rem; color:var(--muted)">📷 Angle ${slotNum}</span>`;
      return `
        <div class="vr-slot-box" data-slot="${slotNum}" style="display:inline-flex; align-items:center; gap:4px; background:var(--bg); border:1px dashed var(--border); border-radius:6px; padding:3px 6px;">
          <div class="vr-thumb-wrap-${slotNum}" style="display:flex; align-items:center; justify-content:center; cursor:pointer;" title="Click to upload Angle ${slotNum}">
            ${thumb}
          </div>
          <input class="vr-image-${slotNum}" type="hidden" value="${url}">
          <button type="button" class="vr-upload-btn-${slotNum}" style="padding:2px 6px; font-size:0.7rem; border-radius:4px; background:var(--pl); border:1px solid var(--border); color:var(--ink); cursor:pointer;">${url ? 'Change' : '+Upload'}</button>
          ${url ? `<button type="button" class="vr-remove-btn-${slotNum}" style="padding:2px 5px; font-size:0.68rem; border-radius:3px; background:var(--red); color:#fff; border:none; cursor:pointer;" title="Remove Photo ${slotNum}">✕</button>` : ''}
          <input class="vr-file-${slotNum}" type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif,application/octet-stream" style="display:none">
        </div>
      `;
    }).join('');

    row.innerHTML = `
      <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap; width:100%;">
        <span class="admin-variant-row-label" style="${labelStyle}">Option Name:</span>
        <input class="vr-label" placeholder="e.g. Black / Size M" value="${labelVal}" maxlength="50" style="${labelStyle}; max-width:140px;">
        <span class="admin-variant-row-label">Price ₹:</span>
        <input class="vr-price" type="number" placeholder="Price" value="${price}" min="0" style="max-width:85px">
        ${stockFieldHtml}
        <button type="button" class="admin-remove-variant-btn" title="Remove Option" style="${removeBtnStyle}; margin-left:auto; background:var(--red); color:#fff; border:none; border-radius:4px; padding:4px 8px; font-size:0.75rem; cursor:pointer;">✕ Remove Option</button>
      </div>

      <!-- Variant Angles (Up to 3 Photos) -->
      <div style="display:flex; align-items:center; gap:8px; margin-top:4px; width:100%; font-size:0.75rem; color:var(--muted); flex-wrap:wrap;">
        <span style="font-weight:700; color:var(--ink);">Angle Photos (max 3):</span>
        <div class="vr-images-container" style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
          ${renderSlotsHtml}
        </div>
      </div>`;

    // Wire up events for the 3 angle slots
    [1, 2, 3].forEach(slotNum => {
      const uploadBtn = row.querySelector(`.vr-upload-btn-${slotNum}`);
      const thumbWrap = row.querySelector(`.vr-thumb-wrap-${slotNum}`);
      const fileInput = row.querySelector(`.vr-file-${slotNum}`);

      if (uploadBtn && fileInput) uploadBtn.onclick = () => fileInput.click();
      if (thumbWrap && fileInput) thumbWrap.onclick = () => fileInput.click();

      if (fileInput) {
        fileInput.onchange = (e) => {
          const file = e.target.files[0];
          if (file) this.uploadVariantSlotImage(file, row, slotNum);
        };
      }

      this.bindVariantSlotRemove(row, slotNum);
    });

    // Wire up variant toggle button if present
    const vrBtn = row.querySelector('.vr-stock-btn');
    const vrInput = row.querySelector('.vr-stock-value');
    if (vrBtn && vrInput) {
      const updateVrBtnState = (val) => {
        vrInput.value = val;
        const dot = vrBtn.querySelector('.toggle-dot');
        const text = vrBtn.querySelector('.toggle-text');
        if (val === '1' || val === 1) {
          vrBtn.style.background = '#25D366';
          vrBtn.style.color = '#ffffff';
          vrBtn.style.borderColor = '#25D366';
          if (dot) dot.style.background = '#ffffff';
          if (text) text.textContent = 'In Stock';
        } else {
          vrBtn.style.background = '#e5e7eb';
          vrBtn.style.color = '#555555';
          vrBtn.style.borderColor = '#e5e7eb';
          if (dot) dot.style.background = '#888888';
          if (text) text.textContent = 'Out of Stock';
        }
      };
      updateVrBtnState(vrInput.value);
      vrBtn.onclick = () => {
        const newVal = vrInput.value === '1' ? '0' : '1';
        updateVrBtnState(newVal);
      };
    }

    const removeOptBtn = row.querySelector('.admin-remove-variant-btn');
    if (removeOptBtn) removeOptBtn.onclick = () => row.remove();
    rowsEl.appendChild(row);
  },

  bindVariantSlotRemove(row, slotNum) {
    const removeBtn = row.querySelector(`.vr-remove-btn-${slotNum}`);
    if (removeBtn) {
      removeBtn.onclick = () => {
        row.querySelector(`.vr-image-${slotNum}`).value = '';
        this.refreshVariantSlotHtml(row, slotNum, '');
      };
    }
  },

  refreshVariantSlotHtml(row, slotNum, url) {
    const slotBox = row.querySelector(`.vr-slot-box[data-slot="${slotNum}"]`);
    if (!slotBox) return;
    const thumbWrap = slotBox.querySelector(`.vr-thumb-wrap-${slotNum}`);
    const uploadBtn = slotBox.querySelector(`.vr-upload-btn-${slotNum}`);
    const hiddenInput = slotBox.querySelector(`.vr-image-${slotNum}`);

    if (hiddenInput) hiddenInput.value = url || '';
    if (thumbWrap) {
      thumbWrap.innerHTML = url
        ? `<img class="vr-thumb-img-${slotNum}" src="${url}" style="width:34px; height:34px; object-fit:cover; border-radius:4px; border:1px solid var(--border);">`
        : `<span style="font-size:0.72rem; color:var(--muted)">📷 Angle ${slotNum}</span>`;
    }
    if (uploadBtn) uploadBtn.textContent = url ? 'Change' : '+Upload';

    let removeBtn = slotBox.querySelector(`.vr-remove-btn-${slotNum}`);
    if (url) {
      if (!removeBtn) {
        removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.className = `vr-remove-btn-${slotNum}`;
        removeBtn.style.cssText = 'padding:2px 5px; font-size:0.68rem; border-radius:3px; background:var(--red); color:#fff; border:none; cursor:pointer;';
        removeBtn.title = `Remove Photo ${slotNum}`;
        removeBtn.textContent = '✕';
        slotBox.appendChild(removeBtn);
      }
      this.bindVariantSlotRemove(row, slotNum);
    } else if (removeBtn) {
      removeBtn.remove();
    }
  },

  async uploadVariantSlotImage(file, row, slotNum) {
    if (!file) return;

    if (this.isHeicImage(file)) {
      showToast('iPhone HEIC files are not supported natively. Please convert to JPG/PNG or select a different photo!', 'error');
      return;
    }

    if (!this.isValidImageType(file)) {
      showToast('Please choose a JPG, PNG or WEBP image', 'error');
      return;
    }

    const uploadBtn = row.querySelector(`.vr-upload-btn-${slotNum}`);
    if (uploadBtn) {
      uploadBtn.disabled = true;
      uploadBtn.textContent = '...';
    }

    try {
      const optimizedFile = await this.resizeImageForUpload(file);
      const result = await API.uploadImage(optimizedFile);
      this.refreshVariantSlotHtml(row, slotNum, result.url);
      showToast(`Angle ${slotNum} photo uploaded!`, 'success');
    } catch (e) {
      showToast(`Upload failed: ${e.message}`, 'error');
    } finally {
      if (uploadBtn) uploadBtn.disabled = false;
    }
  },

  async open() {
    document.getElementById('adminOverlay').classList.add('open');
    
    // Load settings for the admin fields
    try {
      const s = await API.getSettings();
      const el = document.getElementById('afAnnounce');
      if (el) el.value = s.announce || '';
      const cartEl = document.getElementById('afCartEnabled');
      if (cartEl) cartEl.checked = s.cartEnabled !== false;
      const trackStockEl = document.getElementById('afTrackStock');
      if (trackStockEl) trackStockEl.checked = s.trackStock !== false;
      const rzEl = document.getElementById('afRazorpayEnabled');
      if (rzEl) rzEl.checked = s.razorpayEnabled !== false;

      const rateEl = document.getElementById('afShippingRate');
      if (rateEl) rateEl.value = s.shippingRate !== undefined ? s.shippingRate : 60;
      const threshEl = document.getElementById('afShippingThreshold');
      if (threshEl) threshEl.value = s.shippingThreshold !== undefined ? s.shippingThreshold : 999;
      const otherEl = document.getElementById('afOtherCharges');
      if (otherEl) otherEl.value = s.otherCharges !== undefined ? s.otherCharges : 0;
      const typeEl = document.getElementById('afOtherChargesType');
      if (typeEl) typeEl.value = s.otherChargesType || 'flat';
    } catch {}

    if (API.isAdminLoggedIn()) {
      this.showDashboard();
    } else {
      this.showLogin();
    }
  },

  close() {
    document.getElementById('adminOverlay').classList.remove('open');
  },

  showLogin() {
    document.getElementById('adminLoginScreen').style.display = '';
    document.getElementById('adminDashboard').style.display = 'none';
  },

  async showDashboard() {
    document.getElementById('adminLoginScreen').style.display = 'none';
    document.getElementById('adminDashboard').style.display = '';
    await this.loadAll();
    this.renderBanners();
    this.renderNav();
    this.renderCategories();
    this.renderProducts();
    this.renderOrders();
    if (this.renderReviews) this.renderReviews();
    if (this.renderCoupons) this.renderCoupons();

    // Populate settings from loadAll
    if (this.data.settings) {
      const s = this.data.settings;
      const announceEl = document.getElementById('afAnnounce');
      if (announceEl) announceEl.value = s.announce || '';
      const cartEl = document.getElementById('afCartEnabled');
      if (cartEl) cartEl.checked = s.cartEnabled !== false;
      const trackEl = document.getElementById('afTrackStock');
      if (trackEl) trackEl.checked = s.trackStock !== false;
      
      const rateEl = document.getElementById('afShippingRate');
      if (rateEl) rateEl.value = s.shippingRate !== undefined ? s.shippingRate : 60;
      const threshEl = document.getElementById('afShippingThreshold');
      if (threshEl) threshEl.value = s.shippingThreshold !== undefined ? s.shippingThreshold : 999;
      const otherEl = document.getElementById('afOtherCharges');
      if (otherEl) otherEl.value = s.otherCharges !== undefined ? s.otherCharges : 0;
      const typeEl = document.getElementById('afOtherChargesType');
      if (typeEl) typeEl.value = s.otherChargesType || 'flat';
      
      // Populate Payments settings
      const rzEl = document.getElementById('afRazorpayEnabled');
      if (rzEl) rzEl.checked = s.razorpayEnabled !== false;
    }

    this.initVariantBuilder();
    this.updateStockFieldsVisibility();
    this.resetProductForm();
  },


  async loadAll() {
    try {
      const [banners, nav, cats, prodRes, orders, coupons, settings] = await Promise.all([
        API.getBanners(),
        API.getNav(),
        API.getCategories(),
        API.getProducts({ limit: 200 }),
        API.getOrders(),
        API.getCoupons().catch(() => []),
        API.getAdminSettings().catch(() => null)
      ]);
      this.data.banners = banners;
      this.data.nav = nav;
      this.data.categories = cats;
      this.data.products = prodRes.products;
      this.data.orders = orders;
      this.data.coupons = coupons;
      this.data.settings = settings;
    } catch (e) {
      showToast('Error loading admin data', 'error');
    }
  },

  // ── Banners ───────────────────────────────────────────────
  renderBanners() {
    const list = document.getElementById('adminBannerList');
    const badge = document.getElementById('bannerCounterBadge');
    const count = Array.isArray(this.data?.banners) ? this.data.banners.length : 0;

    if (badge) {
      badge.textContent = `${count} / 3`;
      badge.style.color = count >= 3 ? '#b45309' : 'var(--ink)';
      badge.style.background = count >= 3 ? '#fef3c7' : 'var(--surface)';
      badge.style.borderColor = count >= 3 ? '#fde68a' : 'var(--border)';
    }

    const limitNotice = document.getElementById('bannerLimitNotice');
    const addBtn = document.getElementById('addBannerBtn');
    if (this.editState.section !== 'banner') {
      if (limitNotice) limitNotice.style.display = count >= 3 ? 'block' : 'none';
      if (addBtn) {
        addBtn.disabled = count >= 3;
        addBtn.style.opacity = count >= 3 ? '0.6' : '';
        addBtn.style.cursor = count >= 3 ? 'not-allowed' : '';
      }
    }

    if (!list) return;
    list.innerHTML = this.data.banners.map((b, idx) => `
      <div class="admin-list-item" style="display:flex; align-items:center; justify-content:space-between; gap:12px; padding:10px 14px;">
        <div style="display:flex; align-items:center; gap:12px;">
          <!-- 16:9 Desktop Thumbnail -->
          <div class="ali-thumb" style="width: 80px; height: 45px; aspect-ratio:16/9; border-radius: 4px; overflow: hidden; background: #eee; border: 1.5px solid var(--border); flex-shrink:0;">
            ${(b.imageUrl || b.desktopImageUrl) ? `<img src="${b.imageUrl || b.desktopImageUrl}" style="width:100%; height:100%; object-fit:cover;" alt="Desktop 16:9 Banner">` : '🖥️'}
          </div>
          <!-- 3:4 Mobile Thumbnail -->
          <div class="ali-thumb" style="width: 34px; height: 45px; aspect-ratio:3/4; border-radius: 4px; overflow: hidden; background: #eee; border: 1.5px solid var(--border); flex-shrink:0;">
            ${b.mobileImageUrl ? `<img src="${b.mobileImageUrl}" style="width:100%; height:100%; object-fit:cover;" alt="Mobile 3:4 Banner">` : `<div style="font-size:0.6rem; color:var(--muted); height:100%; display:flex; align-items:center; justify-content:center; text-align:center;">Auto</div>`}
          </div>
          <div class="ali-info">
            <div class="ali-name" style="font-weight:700;">Banner #${idx + 1} (ID: ${b.id})</div>
            <div class="ali-sub" style="font-size:0.75rem; color:var(--muted); display:flex; gap:6px; flex-wrap:wrap; margin-top:2px;">
              <span style="color:#0f766e; background:#ccfbf1; padding:1px 5px; border-radius:4px; font-weight:600;">16:9 Desktop</span>
              ${b.mobileImageUrl ? '<span style="color:#1d4ed8; background:#dbeafe; padding:1px 5px; border-radius:4px; font-weight:600;">3:4 Mobile Active</span>' : '<span style="color:#6b7280; background:#f3f4f6; padding:1px 5px; border-radius:4px;">Mobile: Auto Fallback</span>'}
            </div>
          </div>
        </div>
        <div class="ali-actions">
          <button class="ali-edit" data-edit-bid="${b.id}">Edit</button>
          <button class="ali-del" data-bid="${b.id}">Delete</button>
        </div>
      </div>`).join('') || '<div style="color:var(--muted);font-size:0.82rem;padding:8px">No banners uploaded yet. (Maximum 3)</div>';

    list.querySelectorAll('[data-edit-bid]').forEach(btn => {
      btn.onclick = () => {
        const banner = this.data.banners.find(item => item.id === Number(btn.dataset.editBid));
        if (banner) this.setBannerEdit(banner);
      };
    });

    list.querySelectorAll('[data-bid]').forEach(btn => {
      btn.onclick = async () => {
        if (!confirm('Are you sure you want to delete this banner?')) return;
        await API.deleteBanner(Number(btn.dataset.bid));
        showOk('bannerOk');
        await this.loadAll();
        this.renderBanners();
        this.resetBannerForm();
        if (typeof App !== 'undefined' && typeof App.loadBanners === 'function') {
          App.loadBanners();
        }
      };
    });
  },

  // ── Nav ───────────────────────────────────────────────────
  renderNav() {
    const list = document.getElementById('adminNavList');
    if (!list) return;
    list.innerHTML = this.data.nav.map(n => `
      <div class="admin-list-item">
        <div class="ali-dot" style="background:${n.featured ? 'var(--red)' : 'var(--pl)'}"></div>
        <div class="ali-info">
          <div class="ali-name">${n.label}</div>
          <div class="ali-sub">Row ${n.row}${n.featured ? ' · Featured' : ''}</div>
        </div>
        <div class="ali-actions">
          <button class="ali-edit" data-edit-nid="${n.id}">Edit</button>
          <button class="ali-del" data-nid="${n.id}">Delete</button>
        </div>
      </div>`).join('') || '<div style="color:var(--muted);font-size:0.82rem;padding:8px">No links yet.</div>';

    list.querySelectorAll('[data-edit-nid]').forEach(btn => {
      btn.onclick = () => {
        const item = this.data.nav.find(row => row.id === Number(btn.dataset.editNid));
        if (item) this.setNavEdit(item);
      };
    });

    list.querySelectorAll('[data-nid]').forEach(btn => {
      btn.onclick = async () => {
        await API.deleteNav(Number(btn.dataset.nid));
        await this.loadAll();
        this.renderNav();
        App.loadNav();
      };
    });
  },

  // ── Categories ────────────────────────────────────────────
  renderCategories() {
    const list = document.getElementById('adminCatList');
    if (!list) return;
    list.innerHTML = this.data.categories.map(c => `
      <div class="admin-list-item">
        <div class="ali-dot" style="background:${c.color}"></div>
        <div class="ali-info">
          <div class="ali-name">${c.emoji} ${c.name}</div>
        </div>
        <div class="ali-actions">
          <button class="ali-edit" data-edit-cid="${c.id}">Edit</button>
          <button class="ali-del" data-cid="${c.id}">Delete</button>
        </div>
      </div>`).join('') || '<div style="color:var(--muted);font-size:0.82rem;padding:8px">No categories.</div>';

    list.querySelectorAll('[data-edit-cid]').forEach(btn => {
      btn.onclick = () => {
        const category = this.data.categories.find(item => item.id === Number(btn.dataset.editCid));
        if (category) this.setCategoryEdit(category);
      };
    });

    list.querySelectorAll('[data-cid]').forEach(btn => {
      btn.onclick = async () => {
        await API.deleteCategory(Number(btn.dataset.cid));
        await this.loadAll();
        this.renderCategories();
        App.loadCategories();
      };
    });
    this.populateProdCatSelect();
  },

  populateProdCatSelect() {
    const sel = document.getElementById('pfCat');
    if (sel) {
      sel.innerHTML = this.data.categories.map(c => `<option value="${c.name}">${c.emoji} ${c.name}</option>`).join('');
    }
  },

  // ── Products ──────────────────────────────────────────────
  renderProducts() {
    const list = document.getElementById('adminProdList');
    if (!list) return;
    list.innerHTML = this.data.products.map(p => `
      <div class="admin-list-item">
        <div class="ali-thumb" style="background:var(--pl)">
          ${p.imageUrl ? `<img src="${p.imageUrl}" alt="${p.name}">` : (p.emoji || '📦')}
        </div>
        <div class="ali-info">
          <div class="ali-name">${p.emoji} ${p.name}</div>
          <div class="ali-sub">${p.category} · ₹${p.price} · Stock: ${p.stock}</div>
        </div>
        <div class="ali-actions">
          <button class="ali-edit" data-edit-pid="${p.id}">Edit</button>
          <button class="ali-del" data-pid="${p.id}">Delete</button>
        </div>
      </div>`).join('') || '<div style="color:var(--muted);font-size:0.82rem;padding:8px">No products.</div>';

    list.querySelectorAll('[data-edit-pid]').forEach(btn => {
      btn.onclick = () => {
        const product = this.data.products.find(item => item.id === Number(btn.dataset.editPid));
        if (product) this.setProductEdit(product);
      };
    });

    list.querySelectorAll('[data-pid]').forEach(btn => {
      btn.onclick = async () => {
        await API.deleteProduct(Number(btn.dataset.pid));
        await this.loadAll();
        this.renderProducts();
        App.loadProducts();
      };
    });
  },

  // ── Orders ────────────────────────────────────────────────
  renderOrders() {
    const list = document.getElementById('adminOrderList');
    if (!list) return;
    if (!this.data.orders.length) {
      list.innerHTML = '<div style="color:var(--muted);font-size:0.88rem;text-align:center;padding:2rem">No orders yet. Orders will appear here once customers place them.</div>';
      return;
    }

    const statusClass = s => ({
      pending: 'status-pending',
      confirmed: 'status-confirmed',
      shipped: 'status-shipped',
      delivered: 'status-delivered',
      cancelled: 'status-cancelled'
    })[s] || 'status-pending';

    list.innerHTML = this.data.orders.map(o => {
      const c = o.customer || {};
      const fullName = `${c.firstName || ''} ${c.lastName || ''}`.trim() || 'Guest';
      const itemsSummary = (o.items || []).map(i => `${i.name} ×${i.qty}`).join(', ');
      const date = new Date(o.createdAt).toLocaleString('en-IN');
      const hasPhone = c.phone && c.phone.trim();

      // Build WhatsApp notification message for customer
      const discountLine = o.discount && o.discount > 0 ? `🎟️ Discount (${o.couponCode}): -₹${Number(o.discount).toLocaleString('en-IN')}\n` : '';
      const waMsg = encodeURIComponent(
        `Hello ${fullName}! 👋\n\n` +
        `Your RK Resin Art order #${o.id} has been *${(o.status || 'confirmed').toUpperCase()}*! 🎉\n\n` +
        `📦 Order Summary:\n${(o.items || []).map(i => `• ${i.name} ×${i.qty} — ₹${Number(i.price * i.qty).toLocaleString('en-IN')}`).join('\n')}\n\n` +
        `💰 *PAYMENT SUMMARY*\n` +
        `Subtotal: ₹${Number(o.total || (o.grandTotal + (o.discount || 0) - o.shipping)).toLocaleString('en-IN')}\n` +
        discountLine +
        `🚚 Shipping: ${o.shipping === 0 ? 'FREE' : `₹${o.shipping}`}\n` +
        `*Grand Total: ₹${Number(o.grandTotal).toLocaleString('en-IN')}*\n\n` +
        `Thank you for shopping with RK Resin Art! 🙏\n` +
        `If you have any questions, just reply to this message.`
      );
      const cleanPhone = hasPhone ? c.phone.replace(/[^0-9]/g, '') : '';
      const waLink = hasPhone ? `https://wa.me/91${cleanPhone.slice(-10)}?text=${waMsg}` : '#';

      return `
      <div class="order-card" data-oid="${o.id}">
        <div class="order-head">
          <div>
            <span class="order-id">Order #${o.id}</span>
            <span class="order-status-badge ${statusClass(o.status)}" style="margin-left:8px">${(o.status || 'Pending').charAt(0).toUpperCase() + (o.status || 'pending').slice(1)}</span>
            <div class="order-date">${date}</div>
          </div>
        </div>
        <div class="order-customer">👤 <strong>${fullName}</strong> | 📞 ${c.phone || '—'} | ${c.city || ''}</div>
        ${c.address ? `<div style="font-size:0.75rem;color:var(--muted)">📍 ${[c.address, c.city, c.pin].filter(Boolean).join(', ')}</div>` : ''}
        <div class="order-items-list">${itemsSummary}</div>

        <!-- Courier & Tracking Info Panel -->
        <div class="order-shipping-details" style="margin: 10px 0; padding: 10px; background: rgba(0,0,0,0.02); border-radius: 8px; border: 1.5px solid var(--border);">
          <div style="display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 8px;">
            <div style="flex: 1; min-width: 130px;">
              <label style="font-size: 0.7rem; font-weight: bold; color: var(--muted); display: block; margin-bottom: 3px;">Courier Name</label>
              <input type="text" class="admin-input order-courier-name" data-oid="${o.id}" value="${o.courierName || ''}" placeholder="e.g. Delhivery, DTDC" style="padding: 6px 10px; font-size: 0.8rem; height: 32px; width: 100%; box-sizing: border-box;">
            </div>
            <div style="flex: 1; min-width: 150px;">
              <label style="font-size: 0.7rem; font-weight: bold; color: var(--muted); display: block; margin-bottom: 3px;">Tracking ID / URL</label>
              <input type="text" class="admin-input order-tracking-id" data-oid="${o.id}" value="${o.trackingId || ''}" placeholder="e.g. 1234567890" style="padding: 6px 10px; font-size: 0.8rem; height: 32px; width: 100%; box-sizing: border-box;">
            </div>
          </div>
          <div style="display: flex; gap: 8px; flex-wrap: wrap; justify-content: flex-end;">
            <button class="order-shipping-notify-btn" data-notify-oid="${o.id}" style="padding: 6px 12px; font-size: 0.75rem; font-weight: bold; border-radius: 6px; background: #0369a1; color: white; border: none; cursor: pointer; transition: all 0.2s; display: inline-flex; align-items: center; gap: 4px;">
              🚚 Email Courier Info
            </button>
            ${hasPhone
              ? `<button class="order-shipping-wa-btn" data-wa-oid="${o.id}" style="padding: 6px 12px; font-size: 0.75rem; font-weight: bold; border-radius: 6px; background: #15803d; color: white; border: none; cursor: pointer; transition: all 0.2s; display: inline-flex; align-items: center; gap: 4px;">📲 WhatsApp Courier Info</button>`
              : ''
            }
          </div>
        </div>

        <div class="order-footer">
          <span class="order-total">₹${Number(o.grandTotal).toLocaleString('en-IN')}</span>
          <div class="order-actions">
            <select class="order-status-select" data-oid="${o.id}">
              <option value="pending" ${o.status === 'pending' ? 'selected' : ''}>Pending</option>
              <option value="confirmed" ${o.status === 'confirmed' ? 'selected' : ''}>Confirmed</option>
              <option value="shipped" ${o.status === 'shipped' ? 'selected' : ''}>Shipped</option>
              <option value="delivered" ${o.status === 'delivered' ? 'selected' : ''}>Delivered</option>
              <option value="cancelled" ${o.status === 'cancelled' ? 'selected' : ''}>Cancelled</option>
            </select>
            <button class="order-save-btn" data-save-oid="${o.id}">💾 Save</button>
            ${hasPhone
              ? `<a class="order-notify-btn" href="${waLink}" target="_blank">📲 Notify Customer</a>`
              : `<button class="order-notify-btn" disabled style="opacity:0.4;cursor:default" title="No phone number">📲 No Phone</button>`
            }
          </div>
        </div>
      </div>`;
    }).join('');

    // Save status
    list.querySelectorAll('[data-save-oid]').forEach(btn => {
      btn.onclick = async () => {
        const oid = Number(btn.dataset.saveOid);
        const sel = list.querySelector(`.order-status-select[data-oid="${oid}"]`);
        if (!sel) return;

        // Read courier inputs
        const courierInput = list.querySelector(`.order-courier-name[data-oid="${oid}"]`);
        const trackingInput = list.querySelector(`.order-tracking-id[data-oid="${oid}"]`);
        const courierName = courierInput ? courierInput.value.trim() : '';
        const trackingId = trackingInput ? trackingInput.value.trim() : '';

        try {
          await API.updateOrder(oid, { 
            status: sel.value,
            courierName,
            trackingId
          });
          await this.loadAll();
          this.renderOrders();
          showToast('Order status updated ✓', 'success');
        } catch (e) {
          showToast('Failed to update: ' + e.message, 'error');
        }
      };
    });

    // Shipping Notify Email
    list.querySelectorAll('.order-shipping-notify-btn').forEach(btn => {
      btn.onclick = async () => {
        const oid = Number(btn.dataset.notifyOid);
        const courierInput = list.querySelector(`.order-courier-name[data-oid="${oid}"]`);
        const trackingInput = list.querySelector(`.order-tracking-id[data-oid="${oid}"]`);
        const courierName = courierInput ? courierInput.value.trim() : '';
        const trackingId = trackingInput ? trackingInput.value.trim() : '';

        if (!courierName || !trackingId) {
          showToast('Please enter Courier Name and Tracking ID first', 'error');
          return;
        }

        try {
          btn.disabled = true;
          const origText = btn.textContent;
          btn.textContent = '⏱ Sending...';
          // First, save the tracking info and status to shipped
          await API.updateOrder(oid, { courierName, trackingId, status: 'shipped' });
          // Second, send the shipping confirmation email
          await API.notifyShipping(oid);
          await this.loadAll();
          this.renderOrders();
          showToast('Shipping email confirmation sent successfully!', 'success');
        } catch (e) {
          showToast('Failed to notify customer: ' + e.message, 'error');
        } finally {
          btn.disabled = false;
        }
      };
    });

    // Shipping Notify WhatsApp
    list.querySelectorAll('.order-shipping-wa-btn').forEach(btn => {
      btn.onclick = async () => {
        const oid = Number(btn.dataset.waOid);
        const courierInput = list.querySelector(`.order-courier-name[data-oid="${oid}"]`);
        const trackingInput = list.querySelector(`.order-tracking-id[data-oid="${oid}"]`);
        const courierName = courierInput ? courierInput.value.trim() : '';
        const trackingId = trackingInput ? trackingInput.value.trim() : '';

        if (!courierName || !trackingId) {
          showToast('Please enter Courier Name and Tracking ID first', 'error');
          return;
        }

        // Get phone number from order data
        const order = this.data.orders.find(o => o.id === oid);
        if (!order) return;
        const c = order.customer || {};
        const hasPhone = c.phone && c.phone.trim();
        if (!hasPhone) {
          showToast('No customer phone number available', 'error');
          return;
        }

        const fullName = `${c.firstName || ''} ${c.lastName || ''}`.trim() || 'Customer';
        const trackingLink = trackingId.startsWith('http') ? trackingId : `https://www.google.com/search?q=${encodeURIComponent(courierName + ' tracking ' + trackingId)}`;

        // Build pre-filled shipping WhatsApp message
        const waMsg = encodeURIComponent(
          `Hello ${fullName}! 👋\n\n` +
          `Your RK Resin Art order #${oid} has been *SHIPPED*! 🚚✨\n\n` +
          `📦 *SHIPPING DETAILS*:\n` +
          `• Courier: ${courierName}\n` +
          `• Tracking Number: ${trackingId}\n\n` +
          `🔗 *TRACK HERE LIVE*:\n${trackingLink}\n\n` +
          `Thank you for shopping with RK Resin Art! 🙏`
        );
        const cleanPhone = c.phone.replace(/[^0-9]/g, '');
        const waUrl = `https://wa.me/91${cleanPhone.slice(-10)}?text=${waMsg}`;

        try {
          // Save the courier details first and status to shipped
          await API.updateOrder(oid, { courierName, trackingId, status: 'shipped' });
          await this.loadAll();
          this.renderOrders();
          
          // Open WhatsApp link
          window.open(waUrl, '_blank');
          showToast('Courier saved. Opening WhatsApp message...', 'success');
        } catch (e) {
          showToast('Failed to save courier: ' + e.message, 'error');
        }
      };
    });
  }
};

// ── Admin event wiring ────────────────────────────────────────
document.getElementById('openAdminBtn').onclick = (e) => {
  e.preventDefault();
  window.open('/admin', '_blank');
};
document.getElementById('closeAdminPanel').onclick = () => Admin.close();
document.getElementById('adminOverlay').onclick = (e) => {
  if (document.body.classList.contains('admin-page-active')) return;
  if (e.target === document.getElementById('adminOverlay')) Admin.close();
};

document.getElementById('adminLoginBtn').onclick = async () => {
  const pass = document.getElementById('adminPassInput').value;
  const errEl = document.getElementById('adminErr');
  try {
    await API.adminLogin(pass);
    errEl.textContent = '';
    Admin.showDashboard();
  } catch {
    errEl.textContent = 'Incorrect password. Please try again.';
  }
};
document.getElementById('adminPassInput').onkeydown = e => {
  if (e.key === 'Enter') document.getElementById('adminLoginBtn').click();
};

document.getElementById('adminLogoutBtn').onclick = () => {
  API.adminLogout();
  Admin.showLogin();
};

// Tab switching
document.querySelectorAll('.atab').forEach(btn => {
  btn.onclick = function () {
    document.querySelectorAll('.atab').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
    this.classList.add('active');
    document.getElementById(`atab-${this.dataset.tab}`).classList.add('active');
  };
});

// Add / Update Banner
document.getElementById('addBannerBtn').onclick = async () => {
  await Admin.saveBannerForm();
};
document.getElementById('cancelBannerBtn').onclick = () => {
  Admin.cancelBannerEdit();
};

// Save Announce & Settings
// Save General Settings (Announcement, Cart, Stock tracking, Razorpay)
document.getElementById('saveSettingsBtn').onclick = async () => {
  const text = document.getElementById('afAnnounce').value.trim();
  const cartEnabled = document.getElementById('afCartEnabled').checked;
  const trackStock = document.getElementById('afTrackStock').checked;
  const razorpayEnabled = document.getElementById('afRazorpayEnabled').checked;

  await API.updateSettings({ 
    announce: text, 
    cartEnabled: cartEnabled,
    trackStock: trackStock,
    razorpayEnabled: razorpayEnabled
  });

  // Update local settings cache
  if (!Admin.data.settings) Admin.data.settings = {};
  Admin.data.settings.announce = text;
  Admin.data.settings.cartEnabled = cartEnabled;
  Admin.data.settings.trackStock = trackStock;
  Admin.data.settings.razorpayEnabled = razorpayEnabled;

  // Instantly toggle the visibility of the stock inputs
  Admin.updateStockFieldsVisibility();

  const announceTextEl = document.getElementById('announceText');
  if (announceTextEl) announceTextEl.textContent = text;

  showOk('settingsOk');
  if (typeof App !== 'undefined' && typeof App.loadSettings === 'function') {
    await App.loadSettings();
  }
};

// Save Billing & Charges Settings
document.getElementById('saveBillingSettingsBtn').onclick = async () => {
  const shippingRate = parseFloat(document.getElementById('afShippingRate').value) || 0;
  const shippingThreshold = parseFloat(document.getElementById('afShippingThreshold').value) || 0;
  const otherCharges = parseFloat(document.getElementById('afOtherCharges').value) || 0;
  const otherChargesType = document.getElementById('afOtherChargesType').value;

  await API.updateSettings({
    shippingRate: shippingRate,
    shippingThreshold: shippingThreshold,
    otherCharges: otherCharges,
    otherChargesType: otherChargesType
  });

  if (!Admin.data.settings) Admin.data.settings = {};
  Admin.data.settings.shippingRate = shippingRate;
  Admin.data.settings.shippingThreshold = shippingThreshold;
  Admin.data.settings.otherCharges = otherCharges;
  Admin.data.settings.otherChargesType = otherChargesType;

  showOk('billingSettingsOk');
  if (typeof App !== 'undefined' && typeof App.loadSettings === 'function') {
    await App.loadSettings();
  }
};

// Add / Update Nav
document.getElementById('addNavBtn').onclick = async () => {
  await Admin.saveNavForm();
};
document.getElementById('cancelNavBtn').onclick = () => {
  Admin.cancelNavEdit();
};

// Add / Update Category
document.getElementById('addCatBtn').onclick = async () => {
  await Admin.saveCategoryForm();
};
document.getElementById('cancelCatBtn').onclick = () => {
  Admin.cancelCategoryEdit();
};

// Category Image upload events
document.getElementById('cfImageFile').onchange = async (e) => {
  await Admin.uploadCategoryImage(e.target.files[0]);
};

document.getElementById('removeCategoryImageBtn').onclick = () => {
  document.getElementById('cfImageFile').value = '';
  Admin.updateCategoryImagePreview('');
  Admin.setCategoryUploadStatus('Image removed. Save category to keep this change.', 'success');
};

const categoryUploadBox = document.getElementById('categoryUploadBox');
if (categoryUploadBox) {
  ['dragenter', 'dragover'].forEach(eventName => {
    categoryUploadBox.addEventListener(eventName, (e) => {
      e.preventDefault();
      categoryUploadBox.classList.add('dragging');
    });
  });
  ['dragleave', 'drop'].forEach(eventName => {
    categoryUploadBox.addEventListener(eventName, (e) => {
      e.preventDefault();
      categoryUploadBox.classList.remove('dragging');
    });
  });
  categoryUploadBox.addEventListener('drop', async (e) => {
    const file = e.dataTransfer.files[0];
    document.getElementById('cfImageFile').files = e.dataTransfer.files;
    await Admin.uploadCategoryImage(file);
  });
}

// Stock status toggle button
const pfStockStatusBtn = document.getElementById('pfStockStatusBtn');
if (pfStockStatusBtn) {
  pfStockStatusBtn.onclick = () => {
    const input = document.getElementById('pfStockStatus');
    const currentVal = input ? input.value : '1';
    const newVal = currentVal === '1' ? '0' : '1';
    Admin.setStockStatusButtonState(newVal);
  };
}

// Add / Update Product 3-Photo Slots
[1, 2, 3].forEach(slotIdx => {
  const fileEl = document.getElementById(`pfFile${slotIdx}`);
  if (fileEl) {
    fileEl.onchange = async (e) => {
      if (e.target.files[0]) {
        await Admin.uploadProductSlotFile(slotIdx, e.target.files[0]);
      }
    };
  }
  const removeEl = document.getElementById(`pfSlotRemove${slotIdx}`);
  if (removeEl) {
    removeEl.onclick = () => {
      if (fileEl) fileEl.value = '';
      Admin.updateProductSlotPreview(slotIdx, '');
      Admin.setUploadStatus(`Photo ${slotIdx} removed. Save product to keep this change.`, 'success');
    };
  }
});

// Banner Image upload events (Desktop 16:9 & Mobile 3:4)
const bfImageFileEl = document.getElementById('bfImageFile');
if (bfImageFileEl) {
  bfImageFileEl.onchange = async (e) => {
    if (e.target.files && e.target.files[0]) {
      await Admin.uploadBannerImage(e.target.files[0], 'desktop');
    }
  };
}

const bfMobileImageFileEl = document.getElementById('bfMobileImageFile');
if (bfMobileImageFileEl) {
  bfMobileImageFileEl.onchange = async (e) => {
    if (e.target.files && e.target.files[0]) {
      await Admin.uploadBannerImage(e.target.files[0], 'mobile');
    }
  };
}

const removeBannerImageBtnEl = document.getElementById('removeBannerImageBtn');
if (removeBannerImageBtnEl) {
  removeBannerImageBtnEl.onclick = () => {
    if (document.getElementById('bfImageFile')) document.getElementById('bfImageFile').value = '';
    Admin.updateBannerImagePreview('', 'desktop');
    Admin.setBannerUploadStatus('16:9 Desktop image removed.', 'success', 'desktop');
  };
}

const removeBannerMobileImageBtnEl = document.getElementById('removeBannerMobileImageBtn');
if (removeBannerMobileImageBtnEl) {
  removeBannerMobileImageBtnEl.onclick = () => {
    if (document.getElementById('bfMobileImageFile')) document.getElementById('bfMobileImageFile').value = '';
    Admin.updateBannerImagePreview('', 'mobile');
    Admin.setBannerUploadStatus('3:4 Mobile image removed.', 'success', 'mobile');
  };
}

// Drag & Drop for Desktop 16:9 Banner
const bannerUploadBox = document.getElementById('bannerUploadBox');
if (bannerUploadBox) {
  ['dragenter', 'dragover'].forEach(eventName => {
    bannerUploadBox.addEventListener(eventName, (e) => {
      e.preventDefault();
      bannerUploadBox.classList.add('dragging');
    });
  });
  ['dragleave', 'drop'].forEach(eventName => {
    bannerUploadBox.addEventListener(eventName, (e) => {
      e.preventDefault();
      bannerUploadBox.classList.remove('dragging');
    });
  });
  bannerUploadBox.addEventListener('drop', async (e) => {
    const file = e.dataTransfer.files[0];
    if (document.getElementById('bfImageFile')) document.getElementById('bfImageFile').files = e.dataTransfer.files;
    await Admin.uploadBannerImage(file, 'desktop');
  });
}

// Drag & Drop for Mobile 3:4 Banner
const bannerMobileUploadBox = document.getElementById('bannerMobileUploadBox');
if (bannerMobileUploadBox) {
  ['dragenter', 'dragover'].forEach(eventName => {
    bannerMobileUploadBox.addEventListener(eventName, (e) => {
      e.preventDefault();
      bannerMobileUploadBox.classList.add('dragging');
    });
  });
  ['dragleave', 'drop'].forEach(eventName => {
    bannerMobileUploadBox.addEventListener(eventName, (e) => {
      e.preventDefault();
      bannerMobileUploadBox.classList.remove('dragging');
    });
  });
  bannerMobileUploadBox.addEventListener('drop', async (e) => {
    const file = e.dataTransfer.files[0];
    if (document.getElementById('bfMobileImageFile')) document.getElementById('bfMobileImageFile').files = e.dataTransfer.files;
    await Admin.uploadBannerImage(file, 'mobile');
  });
}

document.getElementById('addProdBtn').onclick = async () => {
  await Admin.saveProductForm();
};
document.getElementById('cancelProdBtn').onclick = () => {
  Admin.cancelProductEdit();
};

// Seed sample products
document.getElementById('seedDemoProductsBtn').onclick = async () => {
  if (!confirm("Are you sure you want to add 10 beautiful sample products (one for each category) to your database?")) return;
  
  const demoProducts = [
    {
      name: "Premium Ultra-Clear Fast Cast Resin 1:1",
      price: 899,
      originalPrice: 1199,
      category: "Resin",
      emoji: "🧪",
      stock: 50,
      badge: "Hot",
      swatchColor: "#EDE8FF",
      description: "Super clear epoxy resin for tabletop and art coatings. Low odor, UV resistant, and bubbles pop easily."
    },
    {
      name: "Chameleon Color Shift Pigment Set",
      price: 450,
      originalPrice: 599,
      category: "Pigments",
      emoji: "✨",
      stock: 30,
      badge: "Sale",
      swatchColor: "#C8A96E",
      description: "5 premium shifting colors for stunning metallic art. Creates beautiful multi-tone resin cells."
    },
    {
      name: "Geode Coaster Silicone Mould (4-Pack)",
      price: 320,
      originalPrice: 399,
      category: "Moulds",
      emoji: "🟪",
      stock: 25,
      badge: "",
      swatchColor: "#FFE8F5",
      description: "High quality thick silicone moulds for making geode coasters. Durable and shiny finish."
    },
    {
      name: "Mixed Pressed Flower Hydrangeas Pack",
      price: 180,
      originalPrice: null,
      category: "Dry Flowers",
      emoji: "🌸",
      stock: 40,
      badge: "New",
      swatchColor: "#FBE8FF",
      description: "Premium selected real pressed hydrangea flowers in purple and blue. Perfect for bookmarks and jewelry."
    },
    {
      name: "Chunky Mermaid Hexagon Glitter 50g",
      price: 120,
      originalPrice: 150,
      category: "Glitters",
      emoji: "🌟",
      stock: 60,
      badge: "Sale",
      swatchColor: "#FFF8E8",
      description: "Beautiful reflective chunky hexagon glitter for ocean resin pours and jewelry crafts."
    },
    {
      name: "Resin Art Leveling Board 30x40cm",
      price: 699,
      originalPrice: 999,
      category: "Tools",
      emoji: "🔧",
      stock: 15,
      badge: "",
      swatchColor: "#E8F5EE",
      description: "Adjustable leveling board to get perfect flat surfaces for resin pours. Includes bubble level."
    },
    {
      name: "Sterling Silver Pendant Bezels (10pcs)",
      price: 249,
      originalPrice: null,
      category: "Jewellery",
      emoji: "💍",
      stock: 80,
      badge: "New",
      swatchColor: "#E8F0FF",
      description: "Open bezel blanks in geometric shapes for resin jewelry makers. Anti-tarnish plating."
    },
    {
      name: "Lavender Scented Oil for Candles 30ml",
      price: 180,
      originalPrice: 220,
      category: "Candle",
      emoji: "🕯",
      stock: 45,
      badge: "",
      swatchColor: "#FFF3E8",
      description: "Highly concentrated professional candle fragrance oil. Fills room with calming lavender."
    },
    {
      name: "Premium Round Teak Wood Platter 10-inch",
      price: 599,
      originalPrice: 799,
      category: "Teak Wood",
      emoji: "🪵",
      stock: 20,
      badge: "Hot",
      swatchColor: "#F5EBD4",
      description: "Fully seasoned round teak wood base ready for ocean-wave resin art and charcuterie boards."
    },
    {
      name: "Gold Metallic Inspirational Quotes Sheet",
      price: 99,
      originalPrice: 149,
      category: "Stickers",
      emoji: "🏷",
      stock: 100,
      badge: "",
      swatchColor: "#E8FFF0",
      description: "Transparent sticker sheet with metallic gold typography quotes for tray and coaster art."
    }
  ];
  
  showToast("Seeding sample products...", "info");
  let successCount = 0;
  for (const p of demoProducts) {
    try {
      await API.addProduct(p);
      successCount++;
    } catch (e) {
      console.error("Failed to seed:", p.name, e);
    }
  }
  
  showToast(`Successfully seeded ${successCount} sample products!`, "success");
  await Admin.loadAll();
  Admin.renderProducts();
  App.loadProducts();
};

// Refresh Orders
document.getElementById('refreshOrdersBtn').onclick = async () => {
  await Admin.loadAll();
  Admin.renderOrders();
  showToast('Orders refreshed', 'success');
};

// ── Admin Reviews ─────────────────────────────────────────────
Admin.renderReviews = async function() {
  const list = document.getElementById('adminReviewList');
  if (!list) return;
  list.innerHTML = '<div style="padding:16px;color:var(--muted)">Loading reviews...</div>';
  try {
    const reviews = await API.getAllReviews();
    this.data.reviews = reviews;
    if (!reviews.length) {
      list.innerHTML = '<div style="padding:20px;text-align:center;color:var(--muted)">No reviews yet.</div>';
      return;
    }
    // Get product names for display
    const db_products = this.data.products || [];
    list.innerHTML = reviews.map(r => {
      const prod = db_products.find(p => p.id === r.productId);
      const prodName = prod ? prod.name : `Product #${r.productId}`;
      return `
        <div class="admin-review-card">
          <div class="arc-header">
            <span class="arc-product">${prodName}</span>
            <button class="arc-delete" data-rid="${r.id}">🗑 Delete</button>
          </div>
          <div class="arc-stars">${'★'.repeat(r.rating)}${'☆'.repeat(5 - r.rating)} &nbsp;<span class="arc-meta">by ${r.userName} &nbsp;·&nbsp; ${new Date(r.createdAt).toLocaleDateString('en-IN', {day:'2-digit',month:'short',year:'numeric'})}</span></div>
          <div class="arc-comment">${r.comment}</div>
        </div>`;
    }).join('');

    // Bind delete buttons
    list.querySelectorAll('.arc-delete').forEach(btn => {
      btn.onclick = async () => {
        if (!confirm('Delete this review?')) return;
        try {
          await API.deleteReview(Number(btn.dataset.rid));
          showToast('Review deleted', 'success');
          Admin.renderReviews();
        } catch (e) {
          showToast(e.message || 'Could not delete review', 'error');
        }
      };
    });
  } catch (e) {
    list.innerHTML = `<div style="padding:16px;color:var(--red)">Error: ${e.message}</div>`;
  }
};

document.getElementById('refreshReviewsBtn').onclick = async () => {
  await Admin.renderReviews();
  showToast('Reviews refreshed', 'success');
};

// Auto-load reviews when Reviews tab is clicked
document.querySelectorAll('.atab[data-tab]').forEach(btn => {
  if (btn.dataset.tab === 'reviews') {
    const original = btn.onclick;
    btn.addEventListener('click', () => Admin.renderReviews());
  }
});

// ── Admin Coupons CRUD ─────────────────────────────────────────
Admin.renderCoupons = async function() {
  const list = document.getElementById('adminCouponList');
  if (!list) return;
  list.innerHTML = '<div style="padding:16px;color:var(--muted)">Loading coupons...</div>';
  try {
    const coupons = await API.getCoupons();
    this.data.coupons = coupons;
    if (!coupons.length) {
      list.innerHTML = '<div style="padding:20px;text-align:center;color:var(--muted)">No coupons created yet.</div>';
      return;
    }
    list.innerHTML = `
      <table class="admin-table" style="width:100%; border-collapse:collapse; font-size:0.84rem; margin-bottom:12px;">
        <thead>
          <tr style="background:rgba(0,0,0,0.03); border-bottom:1px solid var(--border); font-weight:bold; text-align:left;">
            <th style="padding:10px;">Code</th>
            <th style="padding:10px;">Type</th>
            <th style="padding:10px;">Value</th>
            <th style="padding:10px;">Min Purchase</th>
            <th style="padding:10px; text-align:right;">Actions</th>
          </tr>
        </thead>
        <tbody>
          ${coupons.map(c => `
            <tr style="border-bottom:1px solid var(--border);">
              <td style="padding:10px; font-weight:bold; color:var(--p);">${c.code}</td>
              <td style="padding:10px;">${c.type === 'percentage' ? 'Percentage (%)' : 'Fixed Amount (₹)'}</td>
              <td style="padding:10px; font-weight:bold;">${c.type === 'percentage' ? `${c.value}%` : `₹${c.value}`}</td>
              <td style="padding:10px;">₹${c.minPurchase || 0}</td>
              <td style="padding:10px; text-align:right;">
                <button class="arc-delete btn-delete-coupon" data-cid="${c.id}" style="padding:4px 8px; font-size:0.75rem; border-radius:6px; font-weight:bold; background:#fee2e2; color:#b91c1c; border:none; cursor:pointer; transition:all 0.2s;">Delete</button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;

    // Bind delete buttons
    list.querySelectorAll('.btn-delete-coupon').forEach(btn => {
      btn.onclick = async () => {
        if (!confirm('Delete this coupon code?')) return;
        try {
          await API.deleteCoupon(Number(btn.dataset.cid));
          showToast('Coupon deleted ✓', 'success');
          await Admin.loadAll();
          Admin.renderCoupons();
        } catch (e) {
          showToast(e.message || 'Could not delete coupon', 'error');
        }
      };
    });
  } catch (e) {
    list.innerHTML = `<div style="padding:16px;color:var(--red)">Error: ${e.message}</div>`;
  }
};

// Create Coupon Form Bindings
const addCouponBtn = document.getElementById('addCouponBtn');
if (addCouponBtn) {
  addCouponBtn.onclick = async () => {
    const codeInput = document.getElementById('cfCode');
    const typeInput = document.getElementById('cfType');
    const valueInput = document.getElementById('cfValue');
    const minInput = document.getElementById('cfMin');
    const err = document.getElementById('couponErr');
    const ok = document.getElementById('couponOk');

    if (err) err.style.display = 'none';
    if (ok) ok.style.display = 'none';

    const code = codeInput.value.trim().toUpperCase();
    const type = typeInput.value;
    const value = Number(valueInput.value);
    const minPurchase = Number(minInput.value) || 0;

    if (!code) {
      if (err) { err.textContent = 'Coupon code is required'; err.style.display = 'block'; }
      return;
    }
    if (isNaN(value) || value <= 0) {
      if (err) { err.textContent = 'Please enter a valid discount value'; err.style.display = 'block'; }
      return;
    }

    try {
      await API.createCoupon({ code, type, value, minPurchase });
      codeInput.value = '';
      valueInput.value = '';
      minInput.value = '';
      if (ok) ok.style.display = 'block';
      showToast('Coupon created ✓', 'success');
      await Admin.loadAll();
      Admin.renderCoupons();
    } catch (e) {
      if (err) { err.textContent = e.message || 'Could not create coupon'; err.style.display = 'block'; }
    }
  };
}

// Auto-load coupons when Coupons tab is clicked
document.querySelectorAll('.atab[data-tab]').forEach(btn => {
  if (btn.dataset.tab === 'coupons') {
    btn.addEventListener('click', () => Admin.renderCoupons());
  }
});

// Refresh coupons
const refreshCouponsBtn = document.getElementById('refreshCouponsBtn');
if (refreshCouponsBtn) {
  refreshCouponsBtn.onclick = async () => {
    await Admin.renderCoupons();
    showToast('Coupons refreshed', 'success');
  };
}

// ── Admin Analytics & Developer Logs ────────────────────────────
Admin.renderAnalytics = async function() {
  try {
    const data = await API.get('/api/admin/analytics', true);
    
    // Render financial statistics and charts
    const orderStats = data.orderStats || {
      totalRevenue: 0,
      orderCount: 0,
      salesHistory: [],
      topProducts: [],
      categoryDistribution: []
    };

    const revEl = document.getElementById('statTotalRevenue');
    if (revEl) revEl.textContent = `₹${orderStats.totalRevenue.toLocaleString('en-IN')}`;
    const ordEl = document.getElementById('statTotalOrders');
    if (ordEl) ordEl.textContent = orderStats.orderCount;

    // Render sales trend line chart
    Admin.renderSalesTrendChart(orderStats.salesHistory);

    // Render category donut chart
    Admin.renderCategoryDonutChart(orderStats.categoryDistribution);

    // Render top selling products progress bars
    Admin.renderTopProductsList(orderStats.topProducts);

    // Render Blocked IPs
    const blockedList = document.getElementById('blockedIpsList');
    if (blockedList) {
      const ips = data.blockedIps || [];
      if (!ips.length) {
        blockedList.innerHTML = '<tr><td colspan="2" style="padding: 12px; text-align: center; color: var(--muted);">No blocked visitors.</td></tr>';
      } else {
        blockedList.innerHTML = ips.map(ip => `
          <tr style="border-bottom: 1px solid var(--border);">
            <td style="padding: 8px 10px; font-family: monospace; font-weight: 700;">${ip}</td>
            <td style="padding: 8px 10px; text-align: right;">
              <button class="unblock-ip-btn" data-ip="${ip}" style="padding: 4px 10px; font-size: 0.75rem; border-radius: 6px; background: #ef4444; color: #fff; border: none; cursor: pointer; font-weight: 700;">Unblock</button>
            </td>
          </tr>
        `).join('');

        blockedList.querySelectorAll('.unblock-ip-btn').forEach(btn => {
          btn.onclick = async () => {
            try {
              await API.post('/api/admin/ip-unblock', { ip: btn.dataset.ip }, true);
              showToast(`IP ${btn.dataset.ip} unblocked`, 'success');
              Admin.renderAnalytics();
            } catch (e) {
              showToast('Unblock failed: ' + e.message, 'error');
            }
          };
        });
      }
    }

    // Render Security Logs
    const secList = document.getElementById('securityLogsList');
    if (secList) {
      const logs = data.securityLogs || [];
      if (!logs.length) {
        secList.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--muted); font-size: 0.85rem;">No risky activity found.</div>';
      } else {
        secList.innerHTML = logs.slice(0, 15).map(l => `
          <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px 10px; background: var(--surface); border-radius: 6px; font-size: 0.78rem; border: 1px solid var(--border);">
            <div>
              <span style="font-weight: 800; color: #ef4444;">${l.type || 'ALERT'}</span>
              <span style="color: var(--muted); margin-left: 6px;">${l.details || ''}</span>
            </div>
            <div style="font-family: monospace; font-size: 0.72rem; color: var(--muted);">${l.ip || ''} &nbsp;|&nbsp; ${l.timestamp ? new Date(l.timestamp).toLocaleTimeString() : ''}</div>
          </div>
        `).join('');
      }
    }

    // Render Login Activity
    const loginList = document.getElementById('analyticsLoginHistoryList');
    if (loginList) {
      const logins = data.loginLogs || [];
      if (!logins.length) {
        loginList.innerHTML = '<tr><td colspan="5" style="padding: 16px; text-align: center; color: var(--muted);">No login activity yet.</td></tr>';
      } else {
        loginList.innerHTML = logins.slice(0, 10).map(l => `
          <tr style="border-bottom: 1px solid var(--border);">
            <td style="padding: 8px 10px; font-size: 0.78rem; color: var(--muted);">${l.timestamp ? new Date(l.timestamp).toLocaleString('en-IN') : '—'}</td>
            <td style="padding: 8px 10px; font-weight: 700;">${l.email || 'Admin'}</td>
            <td style="padding: 8px 10px;"><span style="background: var(--pl); color: var(--p); padding: 2px 6px; border-radius: 4px; font-size: 0.72rem; font-weight: 700;">${l.role || 'Admin'}</span></td>
            <td style="padding: 8px 10px; font-family: monospace; font-size: 0.78rem;">${l.ip || '—'}</td>
            <td style="padding: 8px 10px; font-size: 0.78rem; color: var(--muted);">${l.location || '—'}</td>
          </tr>
        `).join('');
      }
    }

  } catch (err) {
    showToast('Failed to load analytics: ' + err.message, 'error');
  }
};

// Bind Block IP Button
const blockIpBtn = document.getElementById('blockIpBtn');
if (blockIpBtn) {
  blockIpBtn.onclick = async () => {
    const input = document.getElementById('blockIpInput');
    const ip = input ? input.value.trim() : '';
    if (!ip) {
      showToast('Please enter an IP address to block', 'error');
      return;
    }
    try {
      await API.post('/api/admin/ip-block', { ip }, true);
      if (input) input.value = '';
      showToast(`IP ${ip} blocked`, 'success');
      Admin.renderAnalytics();
    } catch (e) {
      showToast('Block failed: ' + e.message, 'error');
    }
  };
};

Admin.formatReadableLocation = function(location) {
  if (!location) return 'Location not available';
  if (typeof location === 'string') {
    const parts = location.split(',').map(part => part.trim()).filter(part => part && !/^unknown/i.test(part));
    return parts.length ? parts.join(', ') : 'Location not available';
  }
  const parts = [location.city, location.region, location.country]
    .map(part => String(part || '').trim())
    .filter(part => part && !/^unknown/i.test(part));
  return parts.length ? parts.join(', ') : 'Location not available';
};

Admin.readableStatus = function(status) {
  const code = Number(status);
  if (code >= 200 && code < 300) return 'Opened';
  if (code === 304) return 'Already loaded';
  if (code >= 400 && code < 500) return 'Not allowed';
  if (code >= 500) return 'Server issue';
  return status || 'Checked';
};

Admin.readableAction = function(method) {
  const m = String(method || '').toUpperCase();
  if (m === 'GET') return 'Viewed';
  if (m === 'POST') return 'Saved';
  if (m === 'PUT' || m === 'PATCH') return 'Updated';
  if (m === 'DELETE') return 'Deleted';
  return m || 'Opened';
};

Admin.renderAnalytics = async function() {
  try {
    const data = await API.get('/api/admin/analytics', true);
    
    // Render financial statistics and charts
    const orderStats = data.orderStats || {
      totalRevenue: 0,
      orderCount: 0,
      salesHistory: [],
      topProducts: [],
      categoryDistribution: []
    };

    document.getElementById('statTotalRevenue').textContent = `₹${orderStats.totalRevenue.toLocaleString('en-IN')}`;
    document.getElementById('statTotalOrders').textContent = orderStats.orderCount;

    // Render sales trend line chart
    Admin.renderSalesTrendChart(orderStats.salesHistory);

    // Render category donut chart
    Admin.renderCategoryDonutChart(orderStats.categoryDistribution);

    // Render top selling products progress bars
    Admin.renderTopProductsList(orderStats.topProducts);
    


  } catch (err) {
    showToast('Failed to load analytics: ' + err.message, 'error');
  }
};

// Auto-load analytics when Analytics tab is clicked
document.querySelectorAll('.atab[data-tab]').forEach(btn => {
  if (btn.dataset.tab === 'analytics') {
    btn.addEventListener('click', () => {
      Admin.renderAnalytics();
    });
  }
});

// Refresh analytics button
const refreshAnalyticsBtn = document.getElementById('refreshAnalyticsBtn');
if (refreshAnalyticsBtn) {
  refreshAnalyticsBtn.onclick = () => {
    Admin.renderAnalytics();
    showToast('Analytics refreshed', 'success');
  };
}

// ── SVG Chart Drawing Helpers ─────────────────────────────
Admin.renderSalesTrendChart = function(history) {
  const container = document.getElementById('salesTrendChartContainer');
  if (!container) return;

  if (!history || history.length === 0) {
    container.innerHTML = `<div style="color: var(--muted); font-size: 0.86rem;">No sales trend data yet.</div>`;
    return;
  }

  const width = 500;
  const height = 240;
  const paddingLeft = 40;
  const paddingRight = 20;
  const paddingTop = 20;
  const paddingBottom = 30;

  const chartWidth = width - paddingLeft - paddingRight;
  const chartHeight = height - paddingTop - paddingBottom;

  const revenues = history.map(h => h.revenue);
  const maxVal = Math.max(...revenues, 100);

  // Generate points
  const points = history.map((h, i) => {
    const x = paddingLeft + (i / (history.length - 1)) * chartWidth;
    const y = height - paddingBottom - (h.revenue / maxVal) * chartHeight;
    return { x, y, date: h.date, val: h.revenue };
  });

  // Build SVG path
  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  const areaPath = `${linePath} L ${points[points.length - 1].x} ${height - paddingBottom} L ${points[0].x} ${height - paddingBottom} Z`;

  // Gridlines
  let gridlinesHTML = '';
  for (let i = 0; i <= 4; i++) {
    const y = paddingTop + (i / 4) * chartHeight;
    const val = Math.round(maxVal - (i / 4) * maxVal);
    gridlinesHTML += `
      <line x1="${paddingLeft}" y1="${y}" x2="${width - paddingRight}" y2="${y}" stroke="var(--border)" stroke-dasharray="4" />
      <text x="${paddingLeft - 8}" y="${y + 4}" fill="var(--muted)" font-size="9" text-anchor="end" font-weight="700">₹${val}</text>
    `;
  }

  // Markers & X Labels
  let markersHTML = '';
  let xLabelsHTML = '';
  points.forEach((p, i) => {
    const d = new Date(p.date);
    const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    
    xLabelsHTML += `
      <text x="${p.x}" y="${height - 10}" fill="var(--muted)" font-size="9" text-anchor="middle" font-weight="700">${label}</text>
    `;

    markersHTML += `
      <circle cx="${p.x}" cy="${p.y}" r="5" fill="var(--p)" stroke="var(--white)" stroke-width="2" class="chart-point" data-date="${label}" data-val="₹${p.val.toLocaleString('en-IN')}" style="cursor: pointer; transition: r 0.2s;" />
      <circle cx="${p.x}" cy="${p.y}" r="12" fill="transparent" class="chart-point-target" data-idx="${i}" style="cursor: pointer;" />
    `;
  });

  container.innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" style="width: 100%; height: 100%; overflow: visible;">
      <defs>
        <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="var(--p)" stop-opacity="0.25" />
          <stop offset="100%" stop-color="var(--p)" stop-opacity="0.00" />
        </linearGradient>
      </defs>
      ${gridlinesHTML}
      <path d="${areaPath}" fill="url(#chartGradient)" />
      <path d="${linePath}" fill="none" stroke="var(--p)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
      ${markersHTML}
      ${xLabelsHTML}
    </svg>
    <div class="chart-tooltip" style="position: absolute; display: none; background: var(--ink); color: var(--white); padding: 6px 10px; border-radius: 6px; font-size: 0.72rem; font-weight: 800; box-shadow: 0 4px 12px rgba(0,0,0,0.15); pointer-events: none; transform: translate(-50%, -100%); margin-top: -12px; white-space: nowrap; z-index: 10;"></div>
  `;

  // Bind tooltip hover events
  const tooltip = container.querySelector('.chart-tooltip');
  const pointsList = container.querySelectorAll('.chart-point');
  container.querySelectorAll('.chart-point-target').forEach(target => {
    const idx = target.dataset.idx;
    const pt = pointsList[idx];
    
    target.onmouseenter = (e) => {
      pt.setAttribute('r', '7');
      tooltip.style.display = 'block';
      tooltip.innerHTML = `<span style="color:var(--muted);">${pt.dataset.date}</span><br/><strong>${pt.dataset.val}</strong>`;
      
      const rect = container.getBoundingClientRect();
      const ptRect = pt.getBoundingClientRect();
      const x = ptRect.left - rect.left + ptRect.width / 2;
      const y = ptRect.top - rect.top;
      
      tooltip.style.left = `${x}px`;
      tooltip.style.top = `${y}px`;
    };
    
    target.onmouseleave = () => {
      pt.setAttribute('r', '5');
      tooltip.style.display = 'none';
    };
  });
};

Admin.renderCategoryDonutChart = function(dist) {
  const container = document.getElementById('categoryChartContainer');
  if (!container) return;

  const activeDist = (dist || []).filter(c => c.quantity > 0);

  if (activeDist.length === 0) {
    container.innerHTML = `<div style="color: var(--muted); font-size: 0.86rem;">No category sales data yet.</div>`;
    return;
  }

  const total = activeDist.reduce((acc, c) => acc + c.quantity, 0);
  const colors = ['var(--p)', 'var(--green)', 'var(--gold)', 'var(--red)', '#06b6d4', '#ec4899'];

  let cumulativePercent = 0;
  const radius = 70;
  const strokeWidth = 18;
  const circumference = 2 * Math.PI * radius; // 439.8
  const center = 100;

  let circlesHTML = '';
  let legendHTML = '';

  activeDist.forEach((c, i) => {
    const pct = (c.quantity / total) * 100;
    const strokeDash = (pct / 100) * circumference;
    const strokeOffset = circumference - (cumulativePercent / 100) * circumference;
    const color = colors[i % colors.length];

    circlesHTML += `
      <circle cx="${center}" cy="${center}" r="${radius}" fill="transparent"
              stroke="${color}" stroke-width="${strokeWidth}"
              stroke-dasharray="${strokeDash} ${circumference - strokeDash}"
              stroke-dashoffset="${strokeOffset}"
              transform="rotate(-90 ${center} ${center})"
              class="donut-segment"
              data-name="${c.category}"
              data-val="${c.quantity} items (${Math.round(pct)}%)"
              style="transition: stroke-width 0.2s; cursor: pointer;" />
    `;

    legendHTML += `
      <div style="display: flex; align-items: center; gap: 8px; font-size: 0.76rem; color: var(--ink); margin-bottom: 6px;">
        <span style="width: 10px; height: 10px; border-radius: 50%; background: ${color}; flex-shrink: 0;"></span>
        <span style="font-weight: 700; max-width: 90px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${c.category}">${c.category}</span>
        <span style="margin-left: auto; color: var(--muted); font-weight: 800;">${c.quantity}</span>
      </div>
    `;

    cumulativePercent += pct;
  });

  container.innerHTML = `
    <div style="display: flex; align-items: center; justify-content: space-between; width: 100%; gap: 16px; padding: 0 10px;">
      <svg viewBox="0 0 200 200" style="width: 160px; height: 160px; overflow: visible; flex-shrink: 0;">
        ${circlesHTML}
        <circle cx="${center}" cy="${center}" r="${radius - strokeWidth/2 - 2}" fill="var(--card)" />
        <text x="${center}" y="${center + 4}" font-size="12" font-weight="900" fill="var(--ink)" text-anchor="middle">Sales</text>
        <text x="${center}" y="${center + 18}" font-size="9" font-weight="700" fill="var(--muted)" text-anchor="middle">${total} items</text>
      </svg>
      <div style="flex: 1; min-width: 120px; display: flex; flex-direction: column; justify-content: center; max-height: 180px; overflow-y: auto; padding-right: 4px;">
        ${legendHTML}
      </div>
    </div>
    <div class="donut-tooltip" style="position: absolute; display: none; background: var(--ink); color: var(--white); padding: 6px 10px; border-radius: 6px; font-size: 0.72rem; font-weight: 800; box-shadow: 0 4px 12px rgba(0,0,0,0.15); pointer-events: none; transform: translate(-50%, -100%); margin-top: -12px; white-space: nowrap; z-index: 10;"></div>
  `;

  // Bind tooltip hover events
  const tooltip = container.querySelector('.donut-tooltip');
  container.querySelectorAll('.donut-segment').forEach(seg => {
    seg.onmouseenter = (e) => {
      seg.setAttribute('stroke-width', `${strokeWidth + 4}`);
      tooltip.style.display = 'block';
      tooltip.innerHTML = `<span style="color:var(--muted);">${seg.dataset.name}</span><br/><strong>${seg.dataset.val}</strong>`;
      
      const rect = container.getBoundingClientRect();
      tooltip.style.left = `${e.clientX - rect.left}px`;
      tooltip.style.top = `${e.clientY - rect.top - 10}px`;
    };
    
    seg.onmousemove = (e) => {
      const rect = container.getBoundingClientRect();
      tooltip.style.left = `${e.clientX - rect.left}px`;
      tooltip.style.top = `${e.clientY - rect.top - 10}px`;
    };

    seg.onmouseleave = () => {
      seg.setAttribute('stroke-width', `${strokeWidth}`);
      tooltip.style.display = 'none';
    };
  });
};

Admin.renderTopProductsList = function(topProducts) {
  const container = document.getElementById('topProductsList');
  if (!container) return;

  if (!topProducts || topProducts.length === 0) {
    container.innerHTML = `<div style="text-align: center; color: var(--muted); padding: 20px; font-size: 0.86rem;">No products sold yet.</div>`;
    return;
  }

  // Limit to maximum of 5 products
  const listToRender = topProducts.slice(0, 5);

  const maxQty = Math.max(...listToRender.map(p => p.quantity), 1);
  const colors = ['var(--p)', 'var(--green)', 'var(--gold)', 'var(--red)', '#06b6d4'];

  container.innerHTML = listToRender.map((p, i) => {
    const pct = (p.quantity / maxQty) * 100;
    const color = colors[i % colors.length];
    return `
      <div style="margin-bottom: 14px; text-align: left;">
        <div style="display: flex; justify-content: space-between; font-size: 0.8rem; font-weight: 700; color: var(--ink); margin-bottom: 4px;">
          <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 80%;">${p.name}</span>
          <span style="font-weight: 900; color: ${color};">${p.quantity} sold</span>
        </div>
        <div style="width: 100%; height: 8px; background: var(--border); border-radius: 99px; overflow: hidden;">
          <div style="width: ${pct}%; height: 100%; background: ${color}; border-radius: 99px; transition: width 0.8s ease-out;"></div>
        </div>
      </div>
    `;
  }).join('');
};

// ── Users Tab ──────────────────────────────────────────────────
Admin._usersCache = [];
Admin._userToDelete = null;

Admin.renderUsers = async function () {
  const list = document.getElementById('adminUserList');
  const badge = document.getElementById('usersCountBadge');
  if (!list) return;
  list.innerHTML = `<div style="padding:24px;text-align:center;color:var(--muted)">⏳ Loading users...</div>`;
  try {
    const users = await API.getAdminUsers();
    Admin._usersCache = users;
    badge && (badge.textContent = `${users.length} user${users.length !== 1 ? 's' : ''}`);
    Admin._renderUserList(users);
  } catch (e) {
    list.innerHTML = `<div style="padding:20px;color:var(--red)">❌ Failed to load users: ${e.message}</div>`;
  }
};

Admin._renderUserList = function (users) {
  const list = document.getElementById('adminUserList');
  if (!list) return;
  if (!users.length) {
    list.innerHTML = `<div style="padding:32px;text-align:center;color:var(--muted);font-size:0.95rem">No registered users yet.</div>`;
    return;
  }
  list.innerHTML = users.map(u => {
    const initials = (u.name || 'U').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
    const joinDate = u.createdAt ? new Date(u.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
    const address = [u.address, u.city, u.pin].filter(Boolean).join(', ') || '<span style="color:var(--muted)">No address</span>';
    const orders = u.orderCount || 0;
    return `
      <div class="user-row" data-uid="${u.id}" style="display:flex;align-items:flex-start;gap:14px;padding:16px 18px;border-bottom:1px solid var(--border);transition:background 0.18s">
        <div class="user-avatar-initials" style="flex-shrink:0;width:44px;height:44px;border-radius:50%;background:linear-gradient(135deg,var(--p),var(--green));color:#fff;font-weight:800;font-size:1.05rem;display:flex;align-items:center;justify-content:center;letter-spacing:0.5px">${initials}</div>
        <div style="flex:1;min-width:0">
          <div style="display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-bottom:3px">
            <span style="font-weight:800;font-size:0.96rem;color:var(--ink)">${u.name || '—'}</span>
            <span style="font-size:0.73rem;background:${orders > 0 ? '#d1fae5' : 'var(--border)'};color:${orders > 0 ? '#065f46' : 'var(--muted)'};padding:2px 8px;border-radius:99px;font-weight:700">${orders} order${orders !== 1 ? 's' : ''}</span>
            ${u.hasPassword ? '<span style="font-size:0.7rem;background:#eff6ff;color:#1d4ed8;padding:2px 8px;border-radius:99px;font-weight:700">🔐 Has Password</span>' : ''}
          </div>
          <div style="font-size:0.82rem;color:var(--muted);margin-bottom:2px">📧 ${u.email || '—'} &nbsp;|&nbsp; 📱 ${u.phone || '—'}</div>
          <div style="font-size:0.8rem;color:var(--muted);margin-bottom:2px">🏠 ${address}</div>
          <div style="font-size:0.74rem;color:var(--muted)">Joined: ${joinDate} &nbsp;|&nbsp; 🔑 Password: <span style="font-weight:700;color:var(--p);">${u.passwordPlain || '—'}</span></div>
        </div>
        <div style="display:flex;gap:8px;flex-shrink:0;flex-wrap:wrap;justify-content:flex-end">
          <button class="admin-action-btn edit-user-btn" data-uid="${u.id}" style="font-size:0.8rem;padding:6px 14px;border-radius:8px;background:var(--p);color:#fff;border:none;cursor:pointer;font-weight:700;transition:opacity 0.18s">✏️ Edit</button>
          <button class="admin-action-btn delete-user-btn" data-uid="${u.id}" data-name="${u.name || 'this user'}" style="font-size:0.8rem;padding:6px 14px;border-radius:8px;background:var(--red);color:#fff;border:none;cursor:pointer;font-weight:700;transition:opacity 0.18s">🗑️ Delete</button>
        </div>
      </div>`;
  }).join('');

  // Bind edit buttons
  list.querySelectorAll('.edit-user-btn').forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const uid = String(btn.dataset.uid);
      const user = Admin._usersCache.find(u => String(u.id) === uid);
      if (!user) return;
      Admin._openUserEditModal(user);
    };
  });

  // Bind delete buttons
  list.querySelectorAll('.delete-user-btn').forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      Admin._userToDelete = String(btn.dataset.uid);
      const name = btn.dataset.name || 'this user';
      const msgEl = document.getElementById('userDeleteMsg');
      if (msgEl) msgEl.textContent = `Are you sure you want to permanently delete "${name}"? This cannot be undone.`;
      const overlay = document.getElementById('userDeleteModalOverlay');
      if (overlay) {
        overlay.style.display = 'flex';
        overlay.classList.add('open');
      }
    };
  });
};

Admin._openUserEditModal = function (user) {
  document.getElementById('editUserId').value = user.id;
  document.getElementById('euName').value = user.name || '';
  const emailInput = document.getElementById('euEmail');
  if (emailInput) emailInput.value = user.email || '';
  document.getElementById('euPhone').value = user.phone || '';
  document.getElementById('euAddress').value = user.address || '';
  document.getElementById('euCity').value = user.city || '';
  document.getElementById('euPin').value = user.pin || '';
  document.getElementById('euPassword').value = user.passwordPlain && user.passwordPlain !== '—' ? user.passwordPlain : '';
  const msg = document.getElementById('userEditMsg');
  if (msg) { msg.textContent = ''; msg.style.display = 'none'; }
  const overlay = document.getElementById('userEditModalOverlay');
  if (overlay) {
    overlay.style.display = 'flex';
    overlay.classList.add('open');
  }
};

// Users tab tab click
document.querySelectorAll('.atab[data-tab]').forEach(btn => {
  if (btn.dataset.tab === 'users') {
    btn.addEventListener('click', () => Admin.renderUsers());
  }
});

// Refresh users button
const refreshUsersBtn = document.getElementById('refreshUsersBtn');
if (refreshUsersBtn) {
  refreshUsersBtn.onclick = () => {
    Admin.renderUsers();
    showToast('Users refreshed', 'success');
  };
}

// Search users
const usersSearchInput = document.getElementById('usersSearchInput');
if (usersSearchInput) {
  usersSearchInput.addEventListener('input', () => {
    const q = usersSearchInput.value.toLowerCase();
    const filtered = Admin._usersCache.filter(u =>
      (u.name || '').toLowerCase().includes(q) ||
      (u.email || '').toLowerCase().includes(q) ||
      (u.phone || '').toLowerCase().includes(q)
    );
    Admin._renderUserList(filtered);
  });
}

// Edit modal — save (Admin direct edit — NO OTP required!)
const saveUserEditBtn = document.getElementById('saveUserEditBtn');
if (saveUserEditBtn) {
  saveUserEditBtn.addEventListener('click', async () => {
    const id = document.getElementById('editUserId').value;
    const name = document.getElementById('euName').value.trim();
    const emailVal = document.getElementById('euEmail')?.value.trim();
    const phone = document.getElementById('euPhone').value.trim();
    const address = document.getElementById('euAddress').value.trim();
    const city = document.getElementById('euCity').value.trim();
    const pin = document.getElementById('euPin').value.trim();

    const msg = document.getElementById('userEditMsg');
    if (msg) { msg.style.display = 'none'; msg.textContent = ''; }

    const showError = (text) => {
      if (msg) {
        msg.textContent = '❌ ' + text;
        msg.style.display = 'block';
        msg.style.color = 'var(--red)';
        msg.style.backgroundColor = 'rgba(239,68,68,0.08)';
      }
      showToast(text, 'error');
    };

    if (!name) return showError('Full Name is required');
    if (!emailVal || !emailVal.includes('@')) return showError('Please enter a valid email address');
    if (!phone) return showError('Phone number is required');

    const payload = { name, phone, address, city, pin };
    if (emailVal) payload.email = emailVal;

    const pw = document.getElementById('euPassword').value;
    if (pw) {
      if (pw.length < 6) return showError('Password must be at least 6 characters');
      payload.password = pw;
    }

    saveUserEditBtn.disabled = true;
    saveUserEditBtn.textContent = 'Saving…';
    try {
      const resData = await API.updateAdminUser(id, payload);
      // Update cache with response data
      const idx = Admin._usersCache.findIndex(u => String(u.id) === String(id));
      if (idx !== -1 && resData && resData.user) { 
        Admin._usersCache[idx] = { ...Admin._usersCache[idx], ...resData.user }; 
      }
      Admin._renderUserList(Admin._usersCache);
      if (msg) { 
        msg.textContent = '✅ User saved successfully!'; 
        msg.style.display = 'block'; 
        msg.style.color = 'var(--green)'; 
        msg.style.backgroundColor = 'rgba(22,135,91,0.08)'; 
      }
      showToast('User updated successfully', 'success');
      setTimeout(() => {
        const overlay = document.getElementById('userEditModalOverlay');
        if (overlay) {
          overlay.style.display = 'none';
          overlay.classList.remove('open');
        }
      }, 1200);
    } catch (e) {
      showError(e.message || 'Failed to save user');
    }
    saveUserEditBtn.disabled = false;
    saveUserEditBtn.textContent = '💾 Save Changes';
  });
}

// Edit modal — cancel / close
const closeUserEditModal = document.getElementById('closeUserEditModal');
const cancelUserEditBtn = document.getElementById('cancelUserEditBtn');
const userEditModalOverlay = document.getElementById('userEditModalOverlay');
[closeUserEditModal, cancelUserEditBtn].forEach(el => {
  if (el) el.addEventListener('click', () => {
    if (userEditModalOverlay) {
      userEditModalOverlay.style.display = 'none';
      userEditModalOverlay.classList.remove('open');
    }
  });
});
if (userEditModalOverlay) {
  userEditModalOverlay.addEventListener('click', (e) => {
    if (e.target === userEditModalOverlay) {
      userEditModalOverlay.style.display = 'none';
      userEditModalOverlay.classList.remove('open');
    }
  });
}

// Delete modal — confirm
const confirmUserDeleteBtn = document.getElementById('confirmUserDeleteBtn');
if (confirmUserDeleteBtn) {
  confirmUserDeleteBtn.addEventListener('click', async () => {
    if (!Admin._userToDelete) return;
    confirmUserDeleteBtn.disabled = true;
    confirmUserDeleteBtn.textContent = 'Deleting…';
    try {
      await API.deleteAdminUser(Admin._userToDelete);
      Admin._usersCache = Admin._usersCache.filter(u => String(u.id) !== String(Admin._userToDelete));
      Admin._renderUserList(Admin._usersCache);
      const badge = document.getElementById('usersCountBadge');
      if (badge) badge.textContent = `${Admin._usersCache.length} user${Admin._usersCache.length !== 1 ? 's' : ''}`;
      showToast('User deleted successfully', 'success');
      const overlay = document.getElementById('userDeleteModalOverlay');
      if (overlay) {
        overlay.style.display = 'none';
        overlay.classList.remove('open');
      }
    } catch (e) {
      showToast(e.message || 'Failed to delete user', 'error');
    }
    confirmUserDeleteBtn.disabled = false;
    confirmUserDeleteBtn.textContent = '🗑️ Delete';
    Admin._userToDelete = null;
  });
}

// Delete modal — cancel / close
const cancelUserDeleteBtn = document.getElementById('cancelUserDeleteBtn');
const userDeleteModalOverlay = document.getElementById('userDeleteModalOverlay');
if (cancelUserDeleteBtn) {
  cancelUserDeleteBtn.addEventListener('click', () => {
    Admin._userToDelete = null;
    if (userDeleteModalOverlay) {
      userDeleteModalOverlay.style.display = 'none';
      userDeleteModalOverlay.classList.remove('open');
    }
  });
}
if (userDeleteModalOverlay) {
  userDeleteModalOverlay.addEventListener('click', (e) => {
    if (e.target === userDeleteModalOverlay) {
      Admin._userToDelete = null;
      userDeleteModalOverlay.style.display = 'none';
      userDeleteModalOverlay.classList.remove('open');
    }
  });
}

// Show/hide password toggle in user edit modal
const toggleEuPw = document.getElementById('toggleEuPw');
if (toggleEuPw) {
  toggleEuPw.addEventListener('click', () => {
    const input = document.getElementById('euPassword');
    input.type = input.type === 'password' ? 'text' : 'password';
    toggleEuPw.textContent = input.type === 'password' ? '👁' : '🙈';
  });
}

// ── Admin Password Change (Settings Tab) ───────────────────
['CurrentPw', 'NewPw', 'ConfirmPw'].forEach(type => {
  const btn = document.getElementById(`toggleAp${type}`);
  if (btn) {
    btn.addEventListener('click', () => {
      const input = document.getElementById(`ap${type}`);
      if (input) {
        input.type = input.type === 'password' ? 'text' : 'password';
        btn.textContent = input.type === 'password' ? '👁' : '🙈';
      }
    });
  }
});

const changeAdminPwBtn = document.getElementById('changeAdminPwBtn');
if (changeAdminPwBtn) {
  changeAdminPwBtn.addEventListener('click', async () => {
    const currentPassword = (document.getElementById('apCurrentPw')?.value || '').trim();
    const newPassword = (document.getElementById('apNewPw')?.value || '').trim();
    const confirmPassword = (document.getElementById('apConfirmPw')?.value || '').trim();
    const okEl = document.getElementById('adminPwOk');

    const showMsg = (text, isErr = false) => {
      if (okEl) {
        okEl.textContent = text;
        okEl.style.display = 'block';
        okEl.style.color = isErr ? 'var(--red)' : 'var(--green)';
      }
    };

    if (!currentPassword) return showMsg('Please enter your current admin password', true);
    if (!newPassword || newPassword.length < 6) return showMsg('New password must be at least 6 characters', true);
    if (newPassword !== confirmPassword) return showMsg('New passwords do not match', true);

    changeAdminPwBtn.disabled = true;
    changeAdminPwBtn.textContent = '⏳ Updating...';
    try {
      const res = await API.changeAdminPassword(currentPassword, newPassword);
      showMsg('✅ ' + (res.message || 'Admin password updated successfully!'), false);
      showToast('Admin password updated successfully!', 'success');
      document.getElementById('apCurrentPw').value = '';
      document.getElementById('apNewPw').value = '';
      document.getElementById('apConfirmPw').value = '';
    } catch (err) {
      showMsg('❌ ' + (err.message || 'Failed to update admin password'), true);
      showToast(err.message || 'Failed to update admin password', 'error');
    }
    changeAdminPwBtn.disabled = false;
    changeAdminPwBtn.textContent = '🔒 Update Admin Password';
  });
}

