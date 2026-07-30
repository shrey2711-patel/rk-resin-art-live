const fs = require('fs');
const css = `
/* ═══════════════════════════════════════════════════════
   PREMIUM PRODUCT DETAILS PAGE (PDP) REDESIGN
   Inspired by Apple, Stripe, Linear, Nothing
   ═══════════════════════════════════════════════════════ */

/* PDP Container — 2 column grid on desktop */
.pdp-container {
  display: grid;
  grid-template-columns: 45% 55%;
  grid-template-rows: auto auto;
  grid-template-areas:
    "left right"
    "bottom bottom";
  gap: 0;
  font-family: 'Plus Jakarta Sans', 'Inter', 'Outfit', sans-serif;
  background: #FAF8F5;
  min-height: 100%;
}

.pdp-left  { grid-area: left;   padding: 32px 24px 32px 32px; }
.pdp-right { grid-area: right;  padding: 32px 32px 32px 24px; }
.pdp-bottom { grid-area: bottom; padding: 0 32px 40px; border-top: 1px solid #E5E7EB; }

/* ── Image Gallery ── */
.pdp-gallery {
  display: flex;
  flex-direction: row;
  gap: 12px;
  align-items: flex-start;
  position: sticky;
  top: 16px;
}

.pdp-thumbs {
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex-shrink: 0;
}

.pdp-thumb {
  width: 64px;
  height: 64px;
  border-radius: 10px;
  border: 2px solid transparent;
  overflow: hidden;
  cursor: pointer;
  padding: 0;
  background: #fff;
  transition: border-color 0.2s, transform 0.2s;
  flex-shrink: 0;
}
.pdp-thumb img { width: 100%; height: 100%; object-fit: cover; }
.pdp-thumb:hover { transform: scale(1.05); }
.pdp-thumb.active { border-color: #111111; }

.pdp-main-img-wrap {
  flex: 1;
  border-radius: 20px;
  overflow: hidden;
  background: #FFFFFF;
  box-shadow: 0 4px 24px rgba(0,0,0,0.06);
  aspect-ratio: 1 / 1;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
}

.pdp-main-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: opacity 0.2s ease;
}

.pdp-main-img-wrap:hover .pdp-main-img {
  transform: scale(1.04);
  transition: transform 0.4s ease, opacity 0.2s ease;
}

.pdp-emoji-wrap { background: #f0eef8 !important; }
.pdp-emoji-big { font-size: 5rem; text-align: center; }

/* ── Highlights ── */
.pdp-highlights {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  margin-top: 24px;
}
.pdp-highlight {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.78rem;
  font-weight: 500;
  color: #374151;
  background: #fff;
  padding: 8px 12px;
  border-radius: 10px;
  border: 1px solid #E5E7EB;
}
.pdp-hl-icon {
  width: 20px;
  height: 20px;
  background: #111111;
  color: #fff;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.7rem;
  font-weight: 800;
  flex-shrink: 0;
}

/* ── Right Sticky Panel ── */
.pdp-sticky-panel {
  position: sticky;
  top: 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  background: #FFFFFF;
  border-radius: 24px;
  padding: 28px;
  box-shadow: 0 8px 32px rgba(0,0,0,0.05);
  border: 1px solid #E5E7EB;
}

/* Meta: category + badge */
.pdp-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.pdp-category {
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.8px;
  text-transform: uppercase;
  color: #6B7280;
}
.pdp-badge {
  font-size: 0.68rem;
  font-weight: 700;
  padding: 2px 10px;
  border-radius: 99px;
  text-transform: uppercase;
  letter-spacing: 0.4px;
}
.pdp-badge-new { background: #DCFCE7; color: #166534; }
.pdp-badge-hot { background: #FEE2E2; color: #991B1B; }
.pdp-badge-sale { background: #FEF3C7; color: #92400E; }
.pdp-badge-featured { background: #EDE9FE; color: #5B21B6; }

/* Title */
.pdp-title {
  font-size: clamp(1.4rem, 3.5vw, 2rem);
  font-weight: 800;
  color: #111111;
  line-height: 1.2;
  margin: 0;
  letter-spacing: -0.5px;
}

.pdp-unit {
  font-size: 0.82rem;
  color: #6B7280;
  font-weight: 500;
}

/* Rating */
.pdp-rating-row {
  display: flex;
  align-items: center;
  gap: 6px;
}
.pdp-stars { color: #F59E0B; font-size: 1rem; letter-spacing: 1px; }
.pdp-rating-val { font-weight: 700; color: #374151; font-size: 0.88rem; }
.pdp-rating-count { font-size: 0.8rem; color: #3A7D44; text-decoration: none; }
.pdp-rating-count:hover { text-decoration: underline; }
.pdp-no-rating { font-size: 0.8rem; color: #9CA3AF; }

/* Price block */
.pdp-price-block {
  display: flex;
  align-items: baseline;
  gap: 10px;
  flex-wrap: wrap;
}
.pdp-price {
  font-size: clamp(1.6rem, 4vw, 2.2rem);
  font-weight: 800;
  color: #111111;
  letter-spacing: -1px;
  line-height: 1;
}
.pdp-orig-price {
  color: #9CA3AF;
  font-size: 0.9rem;
}
.pdp-discount-badge {
  font-size: 0.72rem;
  font-weight: 800;
  background: #DCFCE7;
  color: #166534;
  padding: 3px 10px;
  border-radius: 99px;
  letter-spacing: 0.2px;
}

/* Stock badges */
.pdp-stock-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 0.78rem;
  font-weight: 700;
  padding: 4px 12px;
  border-radius: 99px;
}
.pdp-stock-badge.in  { background: #DCFCE7; color: #166534; }
.pdp-stock-badge.low { background: #FEF3C7; color: #92400E; }
.pdp-stock-badge.oos { background: #FEE2E2; color: #991B1B; }

/* Variants */
.pdp-variants-block { display: flex; flex-direction: column; gap: 8px; }
.pdp-variants-label {
  font-size: 0.78rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: #6B7280;
}
.pdp-variants-chips { display: flex; gap: 8px; flex-wrap: wrap; }
.pdp-chip {
  padding: 6px 16px;
  border-radius: 10px;
  border: 2px solid #E5E7EB;
  background: #fff;
  font-size: 0.82rem;
  font-weight: 600;
  color: #374151;
  cursor: pointer;
  transition: all 0.18s ease;
}
.pdp-chip:hover { border-color: #111111; color: #111111; }
.pdp-chip.selected {
  background: #111111;
  color: #fff;
  border-color: #111111;
  transform: scale(1.04);
}

/* Quantity stepper */
.pdp-qty-row {
  display: flex;
  align-items: center;
  gap: 14px;
}
.pdp-qty-label {
  font-size: 0.78rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: #6B7280;
}
.pdp-qty-ctrl {
  display: flex;
  align-items: center;
  border: 2px solid #E5E7EB;
  border-radius: 12px;
  overflow: hidden;
  background: #fff;
}
.pdp-qty-btn {
  width: 36px;
  height: 36px;
  background: none;
  border: none;
  font-size: 1.2rem;
  cursor: pointer;
  color: #374151;
  font-weight: 300;
  transition: background 0.15s;
}
.pdp-qty-btn:hover { background: #F3F4F6; }
.pdp-qty-val {
  min-width: 36px;
  text-align: center;
  font-weight: 700;
  font-size: 0.92rem;
  color: #111111;
  border-left: 1px solid #E5E7EB;
  border-right: 1px solid #E5E7EB;
  padding: 0 6px;
  line-height: 36px;
}

/* CTA Buttons */
.pdp-actions {
  display: flex;
  gap: 10px;
  align-items: stretch;
}

.pdp-btn-primary {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  background: #111111;
  color: #FFFFFF;
  border: none;
  border-radius: 14px;
  padding: 14px 20px;
  font-size: 0.92rem;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.22s ease;
  font-family: inherit;
  letter-spacing: 0.1px;
}
.pdp-btn-primary:hover:not(:disabled) {
  background: #2D2D2D;
  transform: translateY(-2px);
  box-shadow: 0 8px 20px rgba(0,0,0,0.25);
}
.pdp-btn-primary:active { transform: translateY(0); }
.pdp-btn-primary:disabled { background: #D1D5DB; cursor: not-allowed; }
.pdp-btn-primary.added { background: #166534; }

.pdp-btn-secondary {
  flex: 1;
  background: #FFFFFF;
  color: #111111;
  border: 2px solid #111111;
  border-radius: 14px;
  padding: 14px 20px;
  font-size: 0.92rem;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.22s ease;
  font-family: inherit;
}
.pdp-btn-secondary:hover:not(:disabled) {
  background: #111111;
  color: #fff;
  transform: translateY(-2px);
  box-shadow: 0 8px 20px rgba(0,0,0,0.12);
}
.pdp-btn-secondary:disabled { opacity: 0.5; cursor: not-allowed; }

.pdp-btn-wish {
  width: 48px;
  height: 52px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 14px;
  border: 2px solid #E5E7EB;
  background: #fff;
  color: #9CA3AF;
  cursor: pointer;
  transition: all 0.22s ease;
  padding: 0;
}
.pdp-btn-wish:hover { border-color: #EF4444; color: #EF4444; }
.pdp-btn-wish.active { border-color: #EF4444; color: #EF4444; background: #FEF2F2; }

/* Delivery row */
.pdp-delivery-row {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 14px;
  background: #F9FAFB;
  border-radius: 12px;
  border: 1px solid #E5E7EB;
}
.pdp-delivery-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.78rem;
  color: #374151;
  font-weight: 500;
}

/* Payment icons */
.pdp-payment-icons {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.pdp-pay-label { font-size: 0.72rem; color: #9CA3AF; font-weight: 500; margin-right: 4px; }
.pdp-pay-icon { height: 22px; width: auto; border-radius: 4px; }

/* ── Bottom Tabs ── */
.pdp-tabs {
  display: flex;
  gap: 0;
  border-bottom: 1px solid #E5E7EB;
  margin: 28px 0 0;
}
.pdp-tab {
  padding: 12px 20px;
  font-size: 0.85rem;
  font-weight: 600;
  color: #6B7280;
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
  cursor: pointer;
  transition: all 0.18s ease;
  font-family: inherit;
  white-space: nowrap;
}
.pdp-tab:hover { color: #111111; }
.pdp-tab.active { color: #111111; border-bottom-color: #111111; }

.pdp-tab-pane { padding: 24px 0; }

.pdp-desc-content { font-size: 0.9rem; line-height: 1.75; color: #374151; }
.pdp-desc-content p { margin: 0 0 12px; }
.pdp-desc-content ul { padding-left: 18px; margin: 0 0 12px; }
.pdp-desc-content li { margin-bottom: 4px; }

/* ── Similar Products Carousel ── */
.pdp-similar { margin-top: 32px; }
.pdp-similar-title {
  font-size: 1.1rem;
  font-weight: 800;
  color: #111111;
  margin: 0 0 16px;
  letter-spacing: -0.3px;
}
.pdp-similar-carousel {
  display: flex;
  gap: 14px;
  overflow-x: auto;
  padding-bottom: 12px;
  scroll-snap-type: x mandatory;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: thin;
  scrollbar-color: #E5E7EB transparent;
}
.pdp-similar-card {
  flex-shrink: 0;
  width: 160px;
  background: #fff;
  border-radius: 16px;
  border: 1px solid #E5E7EB;
  overflow: hidden;
  cursor: pointer;
  text-align: left;
  padding: 0;
  transition: all 0.2s ease;
  scroll-snap-align: start;
}
.pdp-similar-card:hover {
  box-shadow: 0 8px 24px rgba(0,0,0,0.1);
  transform: translateY(-3px);
}
.pdp-similar-img { aspect-ratio: 1 / 1; overflow: hidden; }
.pdp-similar-img .prod-image-wrap,
.pdp-similar-img .prod-emoji-fallback { width: 100%; height: 100%; border-radius: 0; }
.pdp-similar-info { padding: 10px 12px; }
.pdp-similar-name { font-size: 0.75rem; font-weight: 600; color: #2D2D2D; margin-bottom: 4px; line-height: 1.3; }
.pdp-similar-price { font-size: 0.82rem; font-weight: 800; color: #111111; }

/* ── Override product-modal for PDP ── */
.product-modal:has(.pdp-container) {
  max-width: 1100px;
  border-radius: 24px;
  overflow: hidden;
  box-shadow: 0 24px 60px rgba(0,0,0,0.12);
}

.product-modal:has(.pdp-container) .modal-body {
  padding: 0;
}

/* ── Responsive: Tablet ── */
@media (max-width: 900px) {
  .pdp-container {
    grid-template-columns: 1fr;
    grid-template-areas:
      "left"
      "right"
      "bottom";
  }
  .pdp-left  { padding: 24px 20px 0; }
  .pdp-right { padding: 20px; }
  .pdp-bottom { padding: 0 20px 32px; }
  .pdp-gallery { flex-direction: column-reverse; }
  .pdp-thumbs { flex-direction: row; }
  .pdp-sticky-panel { position: static; }
  .pdp-main-img-wrap { max-width: 100%; }
}

/* ── Responsive: Mobile ── */
@media (max-width: 576px) {
  .pdp-left { padding: 16px 16px 0; }
  .pdp-right { padding: 16px; }
  .pdp-bottom { padding: 0 16px 24px; }
  .pdp-title { font-size: 1.35rem; }
  .pdp-price { font-size: 1.6rem; }
  .pdp-sticky-panel { padding: 20px 16px; border-radius: 16px; }
  .pdp-actions { flex-wrap: wrap; }
  .pdp-btn-wish { width: 100%; height: 44px; }
  .pdp-highlights { grid-template-columns: 1fr 1fr; }
  .pdp-similar-card { width: 140px; }
}
`;
fs.appendFileSync('public/css/style.css', "\n" + css, 'utf8');
console.log('Appended css');
