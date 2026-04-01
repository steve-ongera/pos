# NaivasPOS — Professional Point of Sale System

A full-stack POS system built for Kenyan supermarkets (Naivas, QuickMart, Carrefour style).
Supports M-Pesa STK Push, loyalty points, barcode scanning, role-based access control, cash
drawer management, and a complete audit trail.

---

## Tech Stack

| Layer     | Technology                                      |
|-----------|-------------------------------------------------|
| Backend   | Django 5, Django REST Framework, SimpleJWT      |
| Frontend  | React 18, Vite, React Router v6                 |
| Payments  | Safaricom Daraja API (M-Pesa STK Push)          |
| Auth      | JWT (access + refresh tokens, token blacklist)  |
| Styling   | Custom CSS (1,500+ lines) — Deep Green & Gold   |
| Icons     | Bootstrap Icons 1.11                            |
| Fonts     | DM Sans + Space Mono (Google Fonts)             |
| Database  | SQLite (dev) — swap to PostgreSQL for prod      |

---

## Project Structure

```
pos_system/
│
├── README.md
│
├── backend/                          # Django project
│   ├── requirements.txt              # Python dependencies
│   │
│   ├── config/                       # Django config package
│   │   ├── __init__.py
│   │   ├── settings.py               # All settings (JWT, CORS, M-Pesa, Loyalty)
│   │   ├── urls.py                   # Root URL conf → /api/ + /api/auth/
│   │   └── wsgi.py                   # WSGI entry point
│   │
│   └── pos/                          # Core POS application
│       ├── models.py                 # All database models (see below)
│       ├── serializers.py            # DRF serializers for every model
│       ├── views.py                  # All ViewSets + APIViews
│       ├── urls.py                   # App URL router (products, sales, mpesa…)
│       ├── auth_urls.py              # Auth URLs (login, logout, token refresh)
│       ├── permissions.py            # Role guards: Cashier / Supervisor / Manager / Admin
│       └── middleware.py             # AuditLogMiddleware — logs every write request
│
└── frontend/                         # React + Vite project
    ├── index.html                    # Entry HTML (Bootstrap Icons, Google Fonts)
    ├── package.json
    ├── vite.config.js                # Vite + proxy to :8000
    │
    └── src/
        ├── main.jsx                  # ReactDOM.createRoot entry
        ├── App.jsx                   # Router, lazy page loading, route guards
        │
        ├── services/
        │   └── api.js                # Axios instance + JWT refresh interceptor
        │                             # Exports: authAPI, productsAPI, salesAPI,
        │                             #          mpesaAPI, drawerAPI, customersAPI,
        │                             #          reportsAPI, usersAPI, auditAPI…
        │
        ├── context/
        │   ├── AuthContext.jsx       # login / logout / hasRole / canDo
        │   └── FlashContext.jsx      # Global toast flash messages
        │
        ├── components/
        │   ├── Layout.jsx            # Sidebar + Topbar + Outlet
        │   ├── ProtectedRoute.jsx    # JWT guard + role guard
        │   ├── Spinner.jsx           # Loading spinner (fullscreen + inline)
        │   └── index.jsx             # Modal, DataTable, Badge, StatCard,
        │                             # SearchBar, ConfirmDialog, FormField,
        │                             # EmptyState
        │
        ├── pages/
        │   ├── Login.jsx             # Email/password login, lockout handling
        │   ├── Dashboard.jsx         # Stats, hourly chart, payment breakdown,
        │   │                         # top products, open drawer prompt
        │   ├── POS.jsx               # Full POS terminal — product grid, cart,
        │   │                         # barcode listener, M-Pesa flow, receipt
        │   ├── Sales.jsx             # Transaction list, detail modal, void sale
        │   ├── Products.jsx          # Product catalog CRUD + barcode field
        │   ├── Customers.jsx         # Customer list + loyalty points display
        │   ├── Users.jsx             # Staff management, role assignment
        │   ├── Reports.jsx           # Sales report by date, payment, cashier
        │   ├── Inventory.jsx         # Stock levels (auto-updated on sale)
        │   ├── AuditLogs.jsx         # Full activity log table
        │   ├── Settings.jsx          # Profile view + change password
        │   └── NotFound.jsx          # 404 page
        │
        └── styles/
            └── main.css              # 1,500+ line stylesheet
                                      # CSS variables, layout, POS grid, cart,
                                      # modals, flash messages, receipt, responsive
```

---

## Database Models (`pos/models.py`)

| Model                | Description                                              |
|----------------------|----------------------------------------------------------|
| `User`               | Custom user with roles, PIN, login lockout, branch link  |
| `Branch`             | Store locations                                          |
| `Category`           | Hierarchical product categories with Bootstrap icon name |
| `Supplier`           | Supplier/vendor records                                  |
| `Product`            | Full product: barcode, SKU, price, VAT, weighable flag   |
| `Inventory`          | Stock per product per branch                             |
| `Customer`           | Loyalty member: phone, points, total spent               |
| `Sale`               | Transaction header: payment method, totals, M-Pesa ref   |
| `SaleItem`           | Line items: qty, price, tax, discount per item           |
| `MpesaTransaction`   | STK Push record: status, checkout ID, receipt number     |
| `LoyaltyTransaction` | Points earned / redeemed per sale                        |
| `AuditLog`           | Every write action: user, IP, action, timestamp          |
| `CashDrawer`         | Opening float, closing, variance tracking                |
| `Discount`           | Named promotions: % or fixed, per product/category       |

---

## API Endpoints

### Auth — `/api/auth/`
```
POST   /auth/login/                  Email + password → JWT tokens
POST   /auth/logout/                 Blacklist refresh token
POST   /auth/token/refresh/          Refresh access token
GET    /auth/me/                     Current user profile
POST   /auth/change-password/        Change own password
POST   /auth/verify-pin/             Counter PIN re-authentication
POST   /auth/supervisor/verify/      Supervisor override for cashier actions
```

### Products — `/api/products/`
```
GET    /products/                    List (search, filter by category)
POST   /products/                    Create (manager+)
PATCH  /products/{id}/               Update (manager+)
DELETE /products/{id}/               Deactivate (manager+)
GET    /products/pos-list/           Lightweight POS product grid
GET    /products/barcode/{barcode}/  Barcode scanner lookup
```

### Sales — `/api/sales/`
```
GET    /sales/                       List (cashier sees own only)
POST   /sales/                       Create sale + process inventory
GET    /sales/{id}/                  Detail + items
POST   /sales/{id}/void/             Void with reason + supervisor PIN
POST   /sales/{id}/complete-mpesa/   Mark pending M-Pesa sale as complete
```

### M-Pesa — `/api/mpesa/`
```
POST   /mpesa/stk-push/              Initiate STK Push (bypassed in DEBUG)
POST   /mpesa/callback/              Safaricom Daraja callback (AllowAny)
GET    /mpesa/status/{checkoutId}/   Poll transaction status
```

### Other
```
GET    /dashboard/                   Summary stats for dashboard
GET    /reports/sales/               Sales report with filters
GET    /reports/products/            Top products report
GET    /reports/cashier/             Cashier drawer report
GET    /customers/lookup/            Search by phone or card number
POST   /loyalty/redeem/              Validate points redemption
GET    /cash-drawer/current/         Get cashier's open drawer
POST   /cash-drawer/open/            Open drawer with float
POST   /cash-drawer/{id}/close/      Close drawer + calculate variance
GET    /audit-logs/                  Activity log (manager+)
```

---

## User Roles & Permissions

| Permission          | Cashier | Supervisor | Manager | Admin |
|---------------------|:-------:|:----------:|:-------:|:-----:|
| Create sale         | ✅      | ✅         | ✅      | ✅    |
| View own sales      | ✅      | ✅         | ✅      | ✅    |
| View all sales      | ❌      | ✅         | ✅      | ✅    |
| Void sale           | ❌ *    | ✅         | ✅      | ✅    |
| Approve discount    | ❌      | ✅         | ✅      | ✅    |
| Manage products     | ❌      | ❌         | ✅      | ✅    |
| Manage customers    | ✅      | ✅         | ✅      | ✅    |
| View reports        | ❌      | ✅         | ✅      | ✅    |
| Manage users        | ❌      | ❌         | ✅      | ✅    |
| View audit logs     | ❌      | ❌         | ✅      | ✅    |

> \* Cashier can void with supervisor PIN override

---

## M-Pesa Integration

In **DEBUG mode** (`DEBUG=True` in settings), STK Push is **bypassed** — the sale is
immediately marked complete without calling Safaricom. This lets you develop and test
the full sale flow without real credentials.

In **production** (`DEBUG=False`), the real Safaricom Daraja API is called:
1. Cashier enters customer's Safaricom number
2. Backend calls `stkpush/v1/processrequest` with amount + shortcode
3. Customer gets a prompt on their phone to enter M-Pesa PIN
4. Safaricom calls `/api/mpesa/callback/` with result
5. Frontend polls `/api/mpesa/status/{id}/` every 3 seconds
6. On confirmation, sale is marked complete and loyalty points are awarded

Set these in your `.env` for production:
```env
MPESA_ENVIRONMENT=production
MPESA_CONSUMER_KEY=your_key
MPESA_CONSUMER_SECRET=your_secret
MPESA_SHORTCODE=your_shortcode
MPESA_PASSKEY=your_passkey
MPESA_CALLBACK_URL=https://yourdomain.com/api/mpesa/callback/
```

---

## Loyalty Points System

| Setting              | Default | Location            |
|----------------------|---------|---------------------|
| Points per KES spent | 1 pt    | `settings.py`       |
| KES value per point  | KES 1   | `settings.py`       |
| Minimum redemption   | 100 pts | `settings.py`       |

- Points are earned automatically on every completed sale (if customer is linked)
- Points are reversed automatically if a sale is voided
- Cashier can look up customer by phone number or loyalty card number at POS
- Redemption converts points to a direct KES discount on the current sale

---

## Security Features

- **JWT authentication** with 8-hour access tokens (full shift) + refresh rotation
- **Token blacklisting** on logout — stolen refresh tokens are invalidated
- **Account lockout** after 5 failed login attempts (15 min lockout)
- **Role-based route guards** on both frontend (React) and backend (DRF permissions)
- **Cashier isolation** — cashiers only see their own sales in the API
- **Supervisor PIN override** required for cashier-initiated void
- **Cash drawer variance** alerts when closing amount differs by > KES 100
- **Audit log middleware** — every POST/PUT/PATCH/DELETE is logged with user + IP
- **Dedicated audit log model** for all business-critical actions
- **HTTPS enforcement** + HSTS in production (settings.py)
- **No POS access without open drawer** for cash payments

---

## Getting Started

### Backend Setup

```bash
cd backend

# Create virtual environment
python -m venv venv
source venv/bin/activate          # Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Create logs directory
mkdir logs

# Run migrations
python manage.py makemigrations pos
python manage.py migrate

# Create superuser (admin)
python manage.py createsuperuser

# Start server
python manage.py runserver
```

### Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Start dev server
npm run dev
```

Open `http://localhost:5173` — the frontend proxies API calls to `http://localhost:8000`.

### Environment Variables (Backend)

Create `backend/.env`:
```env
SECRET_KEY=your-very-secret-key-here
DEBUG=True
ALLOWED_HOSTS=localhost,127.0.0.1

# M-Pesa (leave blank for DEBUG bypass)
MPESA_ENVIRONMENT=sandbox
MPESA_CONSUMER_KEY=
MPESA_CONSUMER_SECRET=
MPESA_SHORTCODE=174379
MPESA_PASSKEY=
MPESA_CALLBACK_URL=https://yourdomain.com/api/mpesa/callback/
```

### Environment Variables (Frontend)

Create `frontend/.env`:
```env
VITE_API_URL=http://localhost:8000/api
```

---

## Production Deployment Notes

1. Switch database to **PostgreSQL** in `settings.py`
2. Set `DEBUG=False` and `MPESA_ENVIRONMENT=production`
3. Run `python manage.py collectstatic`
4. Serve backend with **Gunicorn** behind **Nginx**
5. Run `npm run build` and serve `dist/` from Nginx
6. Set a real `SECRET_KEY` (50+ random characters)
7. Set `MPESA_CALLBACK_URL` to your public HTTPS domain

---

## Barcode Scanner Integration

The POS page includes a global `keypress` listener that captures barcode scanner input.
Hardware barcode scanners type characters very fast then send `Enter` — the listener
captures this pattern (≥4 chars + Enter within 100ms) and calls
`GET /api/products/barcode/{barcode}/` automatically.

To test without hardware: focus anywhere on the POS page (not in an input field) and
type a barcode string quickly + press Enter.

Products need a `barcode` field set in the product catalog to be found by scanner.

---

## License

MIT — free to use, modify, and deploy for commercial supermarket operations.