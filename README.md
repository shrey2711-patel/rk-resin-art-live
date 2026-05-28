# 🎨 RK Resin Art — Full E-commerce Website

## Tech Stack
- **Frontend**: HTML5, CSS3, Vanilla JavaScript (ES6+)
- **Backend**: Node.js + Express.js
- **Database**: JSON file (db.json) — no database setup needed!
- **Auth**: JWT tokens for admin

---

## 📁 Project Structure

```
rk-resin-art/
├── server.js              ← Express backend (API server)
├── package.json
├── data/
│   └── db.json            ← Your database (all data stored here)
└── public/
    ├── index.html         ← Main frontend page
    ├── css/
    │   └── style.css      ← All styles
    └── js/
        ├── api.js         ← All API calls (fetch wrapper)
        ├── cart.js        ← Cart logic + drawer
        ├── admin.js       ← Admin panel logic
        └── app.js         ← Main app: banner, products, search, modals
```

---

## 🚀 How to Run

### 1. Install Node.js
Download from https://nodejs.org (v16 or higher)

### 2. Install dependencies
```bash
cd rk-resin-art
npm install
```

### 3. Start the server
```bash
npm start
```

### 4. Open in browser
```
http://localhost:3000
```

---

## 🔑 Admin Panel

- Click **Admin Panel** button in the top-right navbar
- Password: **rk2024**
- Change the password in `data/db.json` → `settings.adminPassword`

### Admin Features:
| Tab | What you can do |
|-----|----------------|
| **Banners** | Add / delete slider banners |
| **Announcement** | Edit the top announcement bar |
| **Navigation** | Add / delete nav links (Row 1/2/3) |
| **Categories** | Add / delete product categories |
| **Products** | Add / delete products with price, stock, badge |
| **Orders** | View all orders, update status |

---

## 🛒 Customer Features
- Browse products by category
- Search products
- View product details in modal
- Add to cart with quantity controls
- Checkout with delivery details
- Order sent to WhatsApp + saved in backend

---

## 📡 API Endpoints

### Public
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/settings | Announce bar text |
| GET | /api/banners | Slider banners |
| GET | /api/nav | Navigation links |
| GET | /api/categories | Product categories |
| GET | /api/products | Products (filter, search, paginate) |
| GET | /api/products/:id | Single product |
| POST | /api/orders | Place order |
| POST | /api/admin/login | Admin login → JWT token |

### Admin (requires Bearer token)
| Method | Endpoint | Description |
|--------|----------|-------------|
| PUT | /api/admin/settings | Update announce text |
| POST/DELETE | /api/admin/banners | Manage banners |
| POST/DELETE | /api/admin/nav | Manage nav links |
| POST/DELETE | /api/admin/categories | Manage categories |
| POST/PUT/DELETE | /api/admin/products | Manage products |
| GET | /api/admin/orders | View all orders |
| PUT | /api/admin/orders/:id | Update order status |

---

## 🔧 Customization

### Change WhatsApp number
In `public/js/app.js`, find:
```js
window.open(`https://wa.me/919999999999?text=${msg}`, '_blank');
```
Replace `919999999999` with your number (country code + number, no spaces).

Also update in `public/index.html`:
```html
<a href="https://wa.me/919999999999" ...>
```

### Change admin password
Edit `data/db.json`:
```json
"settings": {
  "adminPassword": "YOUR_NEW_PASSWORD"
}
```

---

## 🌐 Deploy to Web (Free Options)

### Railway.app (Recommended)
1. Push to GitHub
2. Connect Railway to your repo
3. It auto-detects Node.js and deploys

### Render.com
1. Create a new Web Service
2. Connect your GitHub repo
3. Build command: `npm install`
4. Start command: `npm start`

---

Made with ❤️ for RK Resin Art
