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

  setBannerUploadStatus(message, type = '') {
    const el = document.getElementById('bannerUploadStatus');
    if (!el) return;
    el.textContent = message;
    el.className = `upload-status ${type}`;

    const saveBtn = document.getElementById('addBannerBtn');
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
        saveBtn.textContent = this.editState.section === 'banner' ? 'Update Banner' : '+ Add Banner';
      }
    }
  },

  updateBannerImagePreview(url) {
    const hidden = document.getElementById('bfImageUrl');
    const wrap = document.getElementById('bannerImagePreview');
    const img = document.getElementById('bfImagePreviewImg');
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

  isValidImageType(file) {
    if (!file) return false;
    const type = (file.type || '').toLowerCase();
    if (['image/jpeg', 'image/png', 'image/webp'].includes(type)) return true;
    
    // Fallback check on extension in case MIME type is missing or generic (e.g. on mobile/external folders)
    const ext = (file.name || '').split('.').pop().toLowerCase();
    if (['jpg', 'jpeg', 'png', 'webp'].includes(ext)) return true;
    
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

  async uploadBannerImage(file) {
    if (!file) return;
    
    if (this.isHeicImage(file)) {
      showToast('iPhone HEIC files are not supported natively. Please convert to JPG/PNG or select a different photo!', 'error');
      return;
    }

    if (!this.isValidImageType(file)) {
      showToast('Please choose a JPG, PNG or WEBP image', 'error');
      return;
    }

    this.updateBannerImagePreview(URL.createObjectURL(file));
    this.setBannerUploadStatus('Uploading image...', 'loading');
    try {
      const optimizedFile = await this.resizeImageForUpload(file);
      const result = await API.uploadImage(optimizedFile);
      this.updateBannerImagePreview(result.url);
      this.setBannerUploadStatus('Image uploaded and ready to save.', 'success');
    } catch (e) {
      this.updateBannerImagePreview('');
      this.setBannerUploadStatus(`Upload failed: ${e.message}`, 'error');
      showToast(`Upload failed: ${e.message}`, 'error');
    }
  },

  updateImagePreview(url) {
    const hidden = document.getElementById('pfImageUrl');
    const wrap = document.getElementById('productImagePreview');
    const img = document.getElementById('pfImagePreviewImg');
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

  async resizeImageForUpload(file) {
    // If it's webp or not an image type, we return it as is
    if (file.type === 'image/webp') return file;
    const ext = (file.name || '').split('.').pop().toLowerCase();
    if (ext === 'webp') return file;

    try {
      const imageUrl = URL.createObjectURL(file);
      const img = new Image();
      
      // Use onload/onerror standard events instead of decode() to prevent mobile browser crashes/timing issues
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = () => reject(new Error('Failed to load image for resize'));
        img.src = imageUrl;
      });

      const scale = Math.min(1, this.maxUploadWidth / img.width);
      if (scale === 1) {
        URL.revokeObjectURL(imageUrl);
        return file;
      }

      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        URL.revokeObjectURL(imageUrl);
        return file; // Fail-safe: fallback to original file
      }
      
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(imageUrl);

      const mimeType = file.type || 'image/jpeg';
      const blob = await new Promise(resolve => canvas.toBlob(resolve, mimeType, 0.95));
      if (!blob) return file; // Fail-safe: fallback to original file
      return new File([blob], file.name, { type: mimeType });
    } catch (err) {
      console.warn("Image resize failed, falling back to original file:", err);
      return file; // Safety: upload original file if resizing fails
    }
  },

  async uploadProductImage(file) {
    if (!file) return;
    
    if (this.isHeicImage(file)) {
      showToast('iPhone HEIC files are not supported natively. Please convert to JPG/PNG or select a different photo!', 'error');
      return;
    }

    if (!this.isValidImageType(file)) {
      showToast('Please choose a JPG, PNG or WEBP image', 'error');
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
    
    if (this.isHeicImage(file)) {
      showToast('iPhone HEIC files are not supported natively. Please convert to JPG/PNG or select a different photo!', 'error');
      return;
    }

    if (!this.isValidImageType(file)) {
      showToast('Please choose a JPG, PNG or WEBP image', 'error');
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
    document.getElementById('bfImageFile').value = '';
    this.updateBannerImagePreview('');
    this.setBannerUploadStatus('');
    const btn = document.getElementById('addBannerBtn');
    const cancel = document.getElementById('cancelBannerBtn');
    if (btn) btn.textContent = '+ Add Banner';
    if (cancel) cancel.style.display = 'none';
    this.editState = { section: null, id: null };
  },

  setBannerEdit(banner) {
    document.getElementById('bfImageFile').value = '';
    this.updateBannerImagePreview(banner.imageUrl || '');
    this.setBannerUploadStatus(banner.imageUrl ? 'Current banner image loaded.' : '');
    const btn = document.getElementById('addBannerBtn');
    const cancel = document.getElementById('cancelBannerBtn');
    if (btn) btn.textContent = 'Update Banner';
    if (cancel) cancel.style.display = '';
    this.editState = { section: 'banner', id: banner.id };
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

  resetProductForm() {
    ['pfName', 'pfPrice', 'pfOrig', 'pfStock', 'pfEmoji', 'pfBadge', 'pfDesc', 'pfImageUrl', 'pfUnit'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    const ratioEl = document.getElementById('pfImgRatio');
    if (ratioEl) ratioEl.value = '4:3';
    document.getElementById('pfCat').value = this.data.categories[0]?.name || '';
    document.getElementById('pfImageFile').value = '';
    this.updateImagePreview('');
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
    document.getElementById('pfImageFile').value = '';

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
      document.getElementById('pfStock').value = product.stock || '';

      document.getElementById('pfImageUrl').value = product.imageUrl || '';
      this.updateImagePreview(product.imageUrl || '');
      this.setUploadStatus(product.imageUrl ? 'Current product image loaded.' : '');

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
      document.getElementById('pfImageUrl').value = '';
      this.updateImagePreview('');
      this.setUploadStatus('');

      const vlSel = document.getElementById('pfVariantLabel');
      const customInp = document.getElementById('pfVariantLabelCustom');
      const addBtn = document.getElementById('addVariantRowBtn');
      const rowsEl = document.getElementById('pfVariantRows');
      if (vlSel && rowsEl) {
        rowsEl.innerHTML = '';
        const knownLabels = ['Size','Weight','Grams','Litre','Volume','Pack','Colour'];
        if (knownLabels.includes(vl)) {
          vlSel.value = vl;
          if (customInp) customInp.style.display = 'none';
          if (addBtn) addBtn.style.display = '';
          (product.variants || []).forEach(v => this.addVariantRow(v.label, v.price, v.stock, v.imageUrl || ''));
        } else {
          vlSel.value = 'Custom';
          if (customInp) { customInp.value = vl; customInp.style.display = ''; }
          if (addBtn) addBtn.style.display = '';
          (product.variants || []).forEach(v => this.addVariantRow(v.label, v.price, v.stock, v.imageUrl || ''));
        }
      }
    }
  },

  async saveBannerForm() {
    const imageUrl = document.getElementById('bfImageUrl').value.trim();
    if (!imageUrl) { showToast('Please upload a banner image first', 'error'); return; }
    if (imageUrl.startsWith('blob:')) {
      showToast('Please wait for the banner image to finish uploading!', 'error');
      return;
    }
    const payload = {
      imageUrl
    };
    if (this.editState.section === 'banner' && this.editState.id) {
      await API.updateBanner(this.editState.id, payload);
      showToast('Banner updated', 'success');
    } else {
      await API.addBanner(payload);
      showOk('bannerOk');
    }
    this.resetBannerForm();
    await this.loadAll();
    this.renderBanners();
    App.loadBanners();
  },

  async saveNavForm() {
    const label = document.getElementById('nfLabel').value.trim();
    if (!label) { showToast('Nav label is required', 'error'); return; }
    const payload = {
      label,
      row: Number(document.getElementById('nfRow').value),
      featured: document.getElementById('nfFeat').value === 'true'
    };
    if (this.editState.section === 'nav' && this.editState.id) {
      await API.updateNav(this.editState.id, payload);
      showToast('Nav link updated', 'success');
    } else {
      await API.addNav(payload);
      showOk('navOk');
    }
    this.resetNavForm();
    await this.loadAll();
    this.renderNav();
    App.loadNav();
  },

  async saveCategoryForm() {
    const name = document.getElementById('cfName').value.trim();
    if (!name) { showToast('Category name is required', 'error'); return; }
    
    const imageUrl = document.getElementById('cfImageUrl').value.trim();
    if (imageUrl.startsWith('blob:')) {
      showToast('Please wait for the category image to finish uploading!', 'error');
      return;
    }

    const payload = {
      name,
      emoji: document.getElementById('cfEmoji').value.trim() || '📦',
      color: document.getElementById('cfColor').value,
      imageUrl: imageUrl || null
    };
    if (this.editState.section === 'category' && this.editState.id) {
      await API.updateCategory(this.editState.id, payload);
      showToast('Category updated', 'success');
    } else {
      await API.addCategory(payload);
      showOk('catOk');
    }
    this.resetCategoryForm();
    await this.loadAll();
    this.renderCategories();
    App.loadCategories();
  },

  async saveProductForm() {
    const name = document.getElementById('pfName').value.trim();
    if (!name) { showToast('Product name is required', 'error'); return; }

    const isMulti = document.getElementById('pfMultiVariant')?.checked;

    let price = 0;
    let originalPrice = null;
    let stock = 0;
    let imageUrl = '';
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
      stock = parseInt(document.getElementById('pfStock').value) || 0;
      
      imageUrl = document.getElementById('pfImageUrl').value.trim();
      if (imageUrl.startsWith('blob:')) {
        showToast('Please wait for the product image to finish uploading!', 'error');
        return;
      }
    } else {
      // Variable Product Mode
      const vlSel = document.getElementById('pfVariantLabel');
      const customInp = document.getElementById('pfVariantLabelCustom');
      variantLabel = vlSel ? vlSel.value : '';
      if (variantLabel === 'Custom') variantLabel = (customInp ? customInp.value.trim() : '') || '';
      if (!variantLabel) {
        showToast('Please select a variant type (e.g. Size, Grams)!', 'error');
        return;
      }

      const variantRows = document.querySelectorAll('.admin-variant-row');
      const vrList = [];
      variantRows.forEach(row => {
        const lbl = row.querySelector('.vr-label')?.value.trim();
        const prc = parseFloat(row.querySelector('.vr-price')?.value);
        const stk = parseInt(row.querySelector('.vr-stock')?.value);
        const img = row.querySelector('.vr-image')?.value.trim() || null;
        if (lbl) {
          vrList.push({
            label: lbl,
            price: isNaN(prc) ? null : prc,
            stock: isNaN(stk) ? 0 : stk,
            imageUrl: img
          });
        }
      });

      if (vrList.length === 0) {
        showToast('Please add at least one variant option row!', 'error');
        return;
      }

      // Check if any variant image is still uploading (blob:)
      const stillUploading = vrList.some(v => v.imageUrl && v.imageUrl.startsWith('blob:'));
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

  addVariantRow(label = '', price = '', stock = '', imageUrl = '') {
    const rowsEl = document.getElementById('pfVariantRows');
    if (!rowsEl) return;
    const row = document.createElement('div');
    row.className = 'admin-variant-row';
    
    const vlSel = document.getElementById('pfVariantLabel');
    const hasLabel = vlSel && vlSel.value;
    const labelStyle = hasLabel ? '' : 'display:none;';
    const labelVal = hasLabel ? label : 'Standard';
    const removeBtnStyle = hasLabel ? '' : 'display:none;';

    const thumbHtml = imageUrl
      ? `<img class="vr-thumb-img" src="${imageUrl}" style="width:36px; height:36px; object-fit:cover; border-radius:4px; border:1px solid var(--border);">`
      : `<span class="vr-thumb-fallback" style="font-size:1.2rem; display:flex; align-items:center; justify-content:center; width:36px; height:36px; background:var(--pl); border-radius:4px; border:1px solid var(--border)">🖼️</span>`;

    row.innerHTML = `
      <span class="admin-variant-row-label" style="${labelStyle}">Option:</span>
      <input class="vr-label" placeholder="e.g. Size 6 / 100g" value="${labelVal}" maxlength="50" style="${labelStyle}">
      <span class="admin-variant-row-label">Price ₹:</span>
      <input class="vr-price" type="number" placeholder="Price" value="${price}" min="0" style="max-width:90px">
      <span class="admin-variant-row-label">Stock:</span>
      <input class="vr-stock" type="number" placeholder="Stock" value="${stock}" min="0" style="max-width:70px">
      
      <!-- Variant Image Controls -->
      <div class="vr-image-section" style="display:inline-flex; align-items:center; gap:6px;">
        <div class="vr-thumb-wrap" style="width:36px; height:36px; display:flex; align-items:center; justify-content:center;">
          ${thumbHtml}
        </div>
        <input class="vr-image" type="hidden" value="${imageUrl}">
        <button type="button" class="vr-upload-trigger-btn" style="padding:4px 8px; font-size:0.72rem; border-radius:4px; background:var(--pl); border:1px solid var(--border); color:var(--text); cursor:pointer;">📷 Upload</button>
        <input class="vr-file-input" type="file" accept="image/*" style="display:none">
      </div>
      
      <button type="button" class="admin-remove-variant-btn" title="Remove" style="${removeBtnStyle}">✕</button>`;

    // Wire events
    row.querySelector('.vr-upload-trigger-btn').onclick = () => {
      row.querySelector('.vr-file-input').click();
    };

    row.querySelector('.vr-file-input').onchange = (e) => {
      const file = e.target.files[0];
      if (file) {
        this.uploadVariantImage(file, row);
      }
    };

    row.querySelector('.admin-remove-variant-btn').onclick = () => row.remove();
    rowsEl.appendChild(row);
  },

  async uploadVariantImage(file, row) {
    if (!file) return;

    if (this.isHeicImage(file)) {
      showToast('iPhone HEIC files are not supported natively. Please convert to JPG/PNG or select a different photo!', 'error');
      return;
    }

    if (!this.isValidImageType(file)) {
      showToast('Please choose a JPG, PNG or WEBP image', 'error');
      return;
    }

    const thumbWrap = row.querySelector('.vr-thumb-wrap');
    const uploadBtn = row.querySelector('.vr-upload-trigger-btn');
    const hiddenInput = row.querySelector('.vr-image');

    if (thumbWrap) thumbWrap.innerHTML = `<span style="font-size:0.75rem; color:var(--muted);">...</span>`;
    if (uploadBtn) {
      uploadBtn.disabled = true;
      uploadBtn.textContent = '...';
      uploadBtn.style.opacity = '0.6';
    }

    try {
      const optimizedFile = await this.resizeImageForUpload(file);
      const result = await API.uploadImage(optimizedFile);
      
      if (hiddenInput) hiddenInput.value = result.url;
      if (thumbWrap) {
        thumbWrap.innerHTML = `<img class="vr-thumb-img" src="${result.url}" style="width:36px; height:36px; object-fit:cover; border-radius:4px; border:1px solid var(--border);">`;
      }
      if (uploadBtn) {
        uploadBtn.disabled = false;
        uploadBtn.textContent = '📷 Upload';
        uploadBtn.style.opacity = '';
      }
      showToast('Variant image uploaded!', 'success');
    } catch (e) {
      if (thumbWrap) {
        thumbWrap.innerHTML = `<span class="vr-thumb-fallback" style="font-size:1.2rem; display:flex; align-items:center; justify-content:center; width:36px; height:36px; background:var(--pl); border-radius:4px; border:1px solid var(--border)">🖼️</span>`;
      }
      if (uploadBtn) {
        uploadBtn.disabled = false;
        uploadBtn.textContent = '📷 Upload';
        uploadBtn.style.opacity = '';
      }
      showToast('Variant image upload failed', 'error');
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
    if (!list) return;
    list.innerHTML = this.data.banners.map(b => `
      <div class="admin-list-item">
        <div class="ali-thumb" style="width: 80px; height: 50px; border-radius: 4px; overflow: hidden; background: #eee; border: 1px solid var(--border)">
          ${b.imageUrl ? `<img src="${b.imageUrl}" style="width:100%; height:100%; object-fit:cover;" alt="Banner">` : '🖼️'}
        </div>
        <div class="ali-info">
          <div class="ali-name">Banner #${b.id}</div>
          <div class="ali-sub">Pure Visual Image Slide</div>
        </div>
        <div class="ali-actions">
          <button class="ali-edit" data-edit-bid="${b.id}">Edit</button>
          <button class="ali-del" data-bid="${b.id}">Delete</button>
        </div>
      </div>`).join('') || '<div style="color:var(--muted);font-size:0.82rem;padding:8px">No banners yet.</div>';

    list.querySelectorAll('[data-edit-bid]').forEach(btn => {
      btn.onclick = () => {
        const banner = this.data.banners.find(item => item.id === Number(btn.dataset.editBid));
        if (banner) this.setBannerEdit(banner);
      };
    });

    list.querySelectorAll('[data-bid]').forEach(btn => {
      btn.onclick = async () => {
        await API.deleteBanner(Number(btn.dataset.bid));
        showOk('bannerOk');
        await this.loadAll();
        this.renderBanners();
        App.loadBanners();
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
    if (!sel) return;
    sel.innerHTML = this.data.categories.map(c => `<option value="${c.name}">${c.emoji} ${c.name}</option>`).join('');
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
document.getElementById('saveAnnounceBtn').onclick = async () => {
  const text = document.getElementById('afAnnounce').value.trim();
  const cartEnabled = document.getElementById('afCartEnabled').checked;
  const trackStock = document.getElementById('afTrackStock').checked;

  await API.updateSettings({ 
    announce: text, 
    cartEnabled: cartEnabled,
    trackStock: trackStock
  });
  document.getElementById('announceText').textContent = text;
  showOk('announceOk');
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
  showOk('billingSettingsOk');
  if (typeof App !== 'undefined' && typeof App.loadSettings === 'function') {
    await App.loadSettings();
  }
};

// Save Payment Settings
document.getElementById('savePaymentSettingsBtn').onclick = async () => {
  const razorpayEnabled = document.getElementById('afRazorpayEnabled').checked;

  await API.updateSettings({
    razorpayEnabled: razorpayEnabled
  });
  showOk('paymentSettingsOk');
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

// Add / Update Product
document.getElementById('pfImageFile').onchange = async (e) => {
  await Admin.uploadProductImage(e.target.files[0]);
};

document.getElementById('removeProductImageBtn').onclick = () => {
  document.getElementById('pfImageFile').value = '';
  Admin.updateImagePreview('');
  Admin.setUploadStatus('Image removed. Save product to keep this change.', 'success');
};

const productUploadBox = document.getElementById('productUploadBox');
['dragenter', 'dragover'].forEach(eventName => {
  productUploadBox.addEventListener(eventName, (e) => {
    e.preventDefault();
    productUploadBox.classList.add('dragging');
  });
});
['dragleave', 'drop'].forEach(eventName => {
  productUploadBox.addEventListener(eventName, (e) => {
    e.preventDefault();
    productUploadBox.classList.remove('dragging');
  });
});
productUploadBox.addEventListener('drop', async (e) => {
  const file = e.dataTransfer.files[0];
  document.getElementById('pfImageFile').files = e.dataTransfer.files;
  await Admin.uploadProductImage(file);
});

// Banner Image upload events
document.getElementById('bfImageFile').onchange = async (e) => {
  await Admin.uploadBannerImage(e.target.files[0]);
};

document.getElementById('removeBannerImageBtn').onclick = () => {
  document.getElementById('bfImageFile').value = '';
  Admin.updateBannerImagePreview('');
  Admin.setBannerUploadStatus('Image removed. Save banner to keep this change.', 'success');
};

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
    document.getElementById('bfImageFile').files = e.dataTransfer.files;
    await Admin.uploadBannerImage(file);
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
      category: "Resins",
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
