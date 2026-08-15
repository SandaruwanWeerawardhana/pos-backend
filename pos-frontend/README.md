# POS Frontend

A modern, local-first Point of Sale (POS) system built with Next.js and React. Designed for retail and pharmacy businesses, with offline-first architecture, real-time inventory management, and comprehensive sales analytics.

## Overview

**pos-frontend** is a feature-rich web-based POS application that operates seamlessly in offline mode while syncing data with a backend server when available. It serves as the till terminal for retail environments, offering complete product management, inventory tracking, customer and supplier management, and detailed business analytics.

### Key Highlights

- **Offline-First Architecture**: Works without internet; syncs data automatically when online
- **Local-First Data**: IndexedDB-backed, with background sync to Go backend API
- **Rich Inventory Management**: Multi-warehouse support, batch tracking, stock movements
- **Flexible Payment Options**: Cash, card, QR payments with split payment support
- **Extensible Plugin System**: Add custom functionality for specialized business types (pharmacy, weights, etc.)
- **Hardware Integration**: Barcode scanner and scale support for streamlined checkout
- **Role-Based Access Control**: Staff management with granular permissions
- **Comprehensive Analytics**: Dashboard with sales trends, inventory insights, and financial metrics
- **Dark Mode Support**: Built-in theme switching for 24/7 operations

## Features

### POS Terminal
- Fast product lookup by name, SKU, or barcode scan
- Multi-item cart with line-level and cart-level discounting
- Real-time price calculations with tax handling
- Multiple payment methods (cash, card, QR code, other)
- Split payments for mixed tender transactions
- Receipt generation and printing
- Held cart functionality (save and resume transactions)
- Keyboard shortcuts for power-user workflows

### Product Management
- Create and edit products with detailed catalog information
- Multiple product types: standard, variable, service, combo
- Barcode generation and management (CODE128, CODE39, EAN13, EAN8, UPCA, UPCE)
- Product categories and brands
- Supplier linking and cost tracking
- Image uploads for product visuals
- Warranty and guarantee tracking
- Custom units of measure (kg, g, l, ml, pack, box, or user-defined)
- Batch and expiry date tracking for perishables
- Opening stock management per warehouse

### Inventory Management
- Multi-warehouse stock tracking
- Stock movements logging (additions, removals, transfers)
- Low-stock alerts and reorder level configuration
- Minimum stock level enforcement
- Batch management with expiry dates
- Stock transfers between warehouses
- Shelf location assignment

### Customer Management
- Customer database with contact information
- Credit limit configuration
- Credit tracking and ledger
- Payment history
- Royalty/loyalty program configuration
- Customer segmentation and filtering
- Export to Excel/PDF

### Supplier Management
- Supplier directory with contact details
- Payment tracking and due amounts
- Purchase order linking
- Supplier performance metrics
- Contact and tax information storage

### Purchase Management
- Purchase order creation and tracking
- Multiple purchase order statuses (draft, ordered, partial, received, cancelled)
- Purchase return processing
- Supplier invoice management
- Stock receiving and reconciliation

### Sales & Orders
- Complete order history with filtering and pagination
- Local and synced order tracking
- Order status monitoring (pending, syncing, synced, conflict, error)
- Payment method breakdown
- Date range filtering
- CSV export functionality

### Financial Management
- Daily cash reconciliation
- Payment method breakdown reporting
- Profit margin calculations
- Discount tracking and reporting
- Tax calculation and reporting
- Revenue vs. expense analysis
- Top-selling product identification

### Staff & Access Control
- User account management
- Role-based permission system
- PIN-based cashier authentication
- Password management (reset, change)
- User activity logging
- Multi-user support with conflict resolution

### Notifications
- In-app notification system
- Real-time alerts for stock issues
- Sync status notifications
- Dismissible notification panel

### Reporting & Analytics
- Dashboard with KPI cards and metrics
- Sales trend visualization (line/area charts)
- Product performance analysis (bar charts)
- Payment method distribution (pie charts)
- Inventory value summary
- Stock alert listing
- Customizable date ranges for reports
- Export capabilities (Excel, PDF, CSV)

### Hardware Integration
- Barcode scanner support (USB and camera-based via ZXing)
- Electronic scale integration (for weighted items)
- Device setup wizard and configuration
- Hardware status monitoring
- Network connectivity detection

### Settings & Configuration
- Business profile and settings
- Currency and money formatting
- Theme selection (light/dark mode)
- Hardware device configuration
- User profile management

### Plugin System
- Extensible architecture for business-specific features
- Pre-built plugin: weighted-item (for products sold by weight)
- Plugin slots for cart rows, inventory panels, dashboard widgets, receipt extras, and product forms
- Custom field definitions and data storage

## Tech Stack

| Category | Technology |
|----------|------------|
| **Frontend Framework** | Next.js 16.2.11, React 19.2.4 |
| **Language** | TypeScript 5 |
| **Styling** | Tailwind CSS 4, PostCSS 4 |
| **State Management** | Zustand 5.0.14, TanStack Query 5.101.4 |
| **Forms** | React Hook Form 7.83.0, Zod 4.4.3 |
| **UI Components** | Lucide React 1.27.0, custom component library |
| **Data Visualization** | Recharts 3.10.1 |
| **Local Storage** | Dexie 4.4.4 (IndexedDB wrapper) |
| **Hardware** | ZXing (barcode scanning) |
| **Testing** | Vitest 4.1.10, React Testing Library 16.3.2 |
| **Code Quality** | ESLint 9, TypeScript strict mode |
| **Backend API** | Go API with HTTP client, mock API for dev |
| **Theme** | next-themes 0.4.6 |
| **Compiler** | React Compiler enabled |

## Architecture

### Overall Design

**pos-frontend** follows a **local-first, sync-second** architecture:

```
┌─────────────────────────────────────────────┐
│           React UI Components               │
│        (Next.js App Router pages)           │
└────────────────┬────────────────────────────┘
                 │
┌────────────────▼────────────────────────────┐
│      Zustand Stores (auth, connection)      │
│      TanStack Query (server state)          │
└────────────────┬────────────────────────────┘
                 │
┌────────────────▼────────────────────────────┐
│    Database Layer (db module)               │
│  - Direct IndexedDB access                  │
│  - Query helpers & transactions             │
│  - Cart/order/product operations            │
└────────────────┬────────────────────────────┘
                 │
┌────────────────▼──────────────────────────────┐
│        Dexie (IndexedDB Wrapper)             │
│  ┌─────────────────────────────────────────┐ │
│  │ Local Tables                            │ │
│  │ - products (cached from server)         │ │
│  │ - cartItems                             │ │
│  │ - pendingOrders (unsynced sales)        │ │
│  │ - customers, suppliers, discounts       │ │
│  │ - stockMovements, warehouses            │ │
│  │ - purchaseOrders, roles, staffUsers     │ │
│  │ - and more...                           │ │
│  └─────────────────────────────────────────┘ │
└────────────────┬──────────────────────────────┘
                 │
         ┌───────┴────────┐
         │                │
┌────────▼────────┐  ┌────▼─────────────────┐
│  SyncManager    │  │  API Client           │
│  (background)   │  │  - Real (HTTP)        │
│  - 15s polling  │  │  - Mock (dev)         │
│  - Order sync   │  │                       │
│  - Product push │  │  Endpoints:           │
│  - Pulls        │  │  - /auth/*            │
└────────┬────────┘  │  - /products/*        │
         │           │  - /orders/*          │
         │           │  - /auth/profile      │
         │           └────┬─────────────────┘
         │                │
         └────────┬───────┘
                  │
         ┌────────▼─────────┐
         │ Go Backend API   │
         │ (HTTP/REST)      │
         │ Port 8080        │
         └──────────────────┘
```

### Data Flow

1. **Reading**: UI reads from IndexedDB (via Dexie) directly — the source of truth
2. **Writing**: User actions update IndexedDB immediately for instant UI feedback
3. **Syncing**: Background SyncManager polls every 15 seconds:
   - Batches unsynced orders and pushes to server
   - Pushes local product creates, edits, and deletes sequentially
   - Pulls fresh product catalog to refresh cache
4. **Conflict Handling**: Server-side conflicts are marked `sync_status: "conflict"` for review
5. **Offline**: App works fully offline; syncing resumes when connectivity returns

### Design Patterns

- **Local-First**: IndexedDB is source of truth; server is backup and aggregate
- **CRUD Operations**: Database module exports functions like `searchProducts`, `addToCart`, `createOrder`, etc.
- **Transactions**: Dexie transactions ensure atomic multi-table operations (e.g., claiming sync batches)
- **Hooks Pattern**: Custom React hooks (e.g., `useCart`, `useAuth`) encapsulate business logic
- **Plugin Architecture**: Extensible system for business-type-specific UI and fields

## Folder Structure

```
pos-frontend/
├── src/
│   ├── app/                          # Next.js App Router
│   │   ├── layout.tsx                # Root layout
│   │   ├── page.tsx                  # Landing/home
│   │   ├── (app)/                    # Protected routes
│   │   │   ├── auth/                 # Auth pages
│   │   │   │   ├── login/
│   │   │   │   ├── register/
│   │   │   │   ├── forgot-password/
│   │   │   │   └── reset-password/
│   │   │   ├── pos/                  # POS terminal
│   │   │   │   ├── page.tsx          # Main till
│   │   │   │   ├── hold/             # Held carts
│   │   │   │   └── close/            # End of day
│   │   │   └── (office)/             # Office/admin routes
│   │   │       ├── dashboard/        # Analytics dashboard
│   │   │       ├── products/         # Product management
│   │   │       ├── people/           # Customers & suppliers
│   │   │       ├── purchases/        # Purchase orders
│   │   │       ├── sales/            # Order history
│   │   │       ├── store/            # Inventory & warehouses
│   │   │       ├── discounts/        # Discount management
│   │   │       ├── settings/         # User & business settings
│   │   │       ├── users/            # Staff management
│   │   │       ├── reports/          # Financial reports
│   │   │       └── profile/          # User profile
│   │   ├── not-found.tsx             # 404 page
│   │   ├── error.tsx                 # Error boundary
│   │   └── global-error.tsx          # Global error handler
│   ├── lib/
│   │   ├── api/                      # API client layer
│   │   │   ├── client.ts             # ApiClient interface
│   │   │   ├── real.ts               # HTTP backend implementation
│   │   │   ├── mock.ts               # In-memory mock implementation
│   │   │   └── index.ts              # Exports apiClient singleton
│   │   ├── db/                       # Database/IndexedDB layer
│   │   │   ├── index.ts              # Dexie schema & PosDB class
│   │   │   ├── customers.ts          # Customer queries
│   │   │   ├── suppliers.ts          # Supplier queries
│   │   │   ├── discounts.ts          # Discount queries
│   │   │   ├── purchases.ts          # Purchase order queries
│   │   │   ├── inventory.ts          # Stock/warehouse queries
│   │   │   ├── cash-reconciliation.ts# Cash tracking
│   │   │   ├── held-carts.ts         # Held cart queries
│   │   │   ├── notifications.ts      # Notification queries
│   │   │   ├── settings.ts           # Settings queries
│   │   │   ├── reports.ts            # Reporting queries
│   │   │   ├── dashboard.ts          # Dashboard data queries
│   │   │   └── users.ts              # Staff user queries
│   │   ├── services/                 # Business logic layer
│   │   │   ├── http-client.ts        # HTTP utility & auth interceptor
│   │   │   ├── auth.service.ts       # Auth API calls
│   │   │   ├── product.service.ts    # Product API calls
│   │   │   └── order.service.ts      # Order API calls
│   │   ├── sync/                     # Sync manager
│   │   │   ├── index.ts              # SyncManager class & polling logic
│   │   │   └── use-sync-status.ts    # React hook for sync UI
│   │   ├── store/                    # Zustand state stores
│   │   │   ├── auth.ts               # Auth state & methods
│   │   │   ├── connection.ts         # Online/offline state
│   │   │   ├── hardware.ts           # Hardware (scale/scanner) config
│   │   │   └── plugin.ts             # Plugin registry state
│   │   ├── hooks/                    # React hooks
│   │   │   ├── use-auth.ts           # Auth context
│   │   │   ├── use-cart.ts           # Cart management
│   │   │   ├── use-sales-feed.ts     # Server orders + local overlay
│   │   │   ├── use-offline-status.ts # Offline detection
│   │   │   ├── use-hardware.ts       # Hardware device access
│   │   │   ├── use-scale.ts          # Scale reading integration
│   │   │   ├── use-plugin.ts         # Plugin hooks
│   │   │   ├── use-settings.ts       # User settings
│   │   │   ├── use-keyboard-shortcuts.ts  # Keyboard helpers
│   │   │   ├── use-form-draft.ts     # Form auto-save
│   │   │   ├── use-unsaved-changes.ts    # Dirty form tracking
│   │   │   └── use-product-duplicates.ts # SKU/barcode conflict detection
│   │   ├── types/                    # TypeScript type definitions
│   │   │   ├── index.ts              # Core domain types (Product, Order, etc.)
│   │   │   ├── plugin.ts             # Plugin system types
│   │   │   ├── hardware.ts           # Hardware types
│   │   │   ├── hardware.config.ts    # Hardware configuration
│   │   │   ├── sync.config.ts        # Sync polling configuration
│   │   │   └── routes.ts             # Route constants
│   │   ├── format.ts                 # Date/currency formatting helpers
│   │   ├── cart-math.ts              # Cart calculation logic
│   │   ├── motion.ts                 # Animation utilities
│   │   └── export.ts                 # Excel/PDF export helpers
│   ├── components/
│   │   ├── providers/
│   │   │   ├── query-provider.tsx    # TanStack Query wrapper
│   │   │   └── theme-provider.tsx    # Dark/light mode
│   │   ├── shell/                    # Main layout components
│   │   │   ├── app-header.tsx        # Top navigation bar
│   │   │   ├── app-shell-init.tsx    # Init sync, auth checks
│   │   │   ├── require-auth.tsx      # Auth guard HOC
│   │   │   ├── require-office.tsx    # Admin guard HOC
│   │   │   ├── theme-toggle.tsx      # Dark mode toggle
│   │   │   ├── connection-pill.tsx   # Online/offline indicator
│   │   │   ├── notification-panel.tsx# Notification UI
│   │   │   ├── command-palette.tsx   # Cmd+K search
│   │   │   ├── pwa-install-button.tsx# PWA install prompt
│   │   │   └── landing-header.tsx    # Homepage header
│   │   ├── pos/                      # POS terminal components
│   │   │   ├── Terminal.tsx          # Main checkout UI
│   │   │   ├── ProductGrid.tsx       # Product browsing
│   │   │   ├── ProductSearch.tsx     # Name/SKU/barcode search
│   │   │   ├── CategorySidebar.tsx   # Category filtering
│   │   │   ├── Cart.tsx              # Cart display
│   │   │   ├── CartItem.tsx          # Cart line item
│   │   │   ├── QuickActions.tsx      # Checkout buttons
│   │   │   ├── Receipt.tsx           # Receipt template
│   │   │   └── HoldModal.tsx         # Save/resume cart UI
│   │   ├── products/                 # Product form & components
│   │   │   ├── BasicInformationSection.tsx
│   │   │   ├── PricingSection.tsx
│   │   │   ├── InventorySection.tsx
│   │   │   ├── OpeningStockSection.tsx
│   │   │   ├── MediaSection.tsx
│   │   │   ├── WarrantySection.tsx
│   │   │   ├── PharmacySection.tsx
│   │   │   ├── LocationSection.tsx
│   │   │   ├── OnThisPageNav.tsx    # Scroll spy
│   │   │   ├── ProductSummaryPanel.tsx
│   │   │   ├── BarcodeImage.tsx
│   │   │   ├── OptionsSection.tsx
│   │   │   ├── FormSection.tsx
│   │   │   └── ProductFormSkeleton.tsx
│   │   ├── hardware/                 # Hardware integration
│   │   │   ├── BarcodeScanner.tsx
│   │   │   ├── ScaleDisplay.tsx
│   │   │   ├── HardwareStatusBar.tsx
│   │   │   └── DeviceSetupWizard.tsx
│   │   ├── plugin-slots/             # Plugin injection points
│   │   │   ├── PluginCartRow.tsx
│   │   │   ├── PluginInventoryPanel.tsx
│   │   │   ├── PluginDashboardWidget.tsx
│   │   │   ├── PluginProductForm.tsx
│   │   │   └── PluginReceiptExtras.tsx
│   │   ├── ui/                       # Reusable UI components
│   │   │   ├── Button.tsx            # Button variants
│   │   │   ├── Input.tsx             # Text input
│   │   │   ├── Select.tsx            # Dropdown select
│   │   │   ├── Modal.tsx             # Modal dialog
│   │   │   ├── Table.tsx             # Data table
│   │   │   ├── DataTable.tsx         # Sortable/filterable table
│   │   │   ├── Badge.tsx             # Status badges
│   │   │   ├── Spinner.tsx           # Loading spinner
│   │   │   ├── Skeleton.tsx          # Skeleton loader
│   │   │   ├── Toast.tsx             # Toast notifications
│   │   │   ├── PageHeader.tsx        # Page title & actions
│   │   │   ├── StatCard.tsx          # KPI card
│   │   │   ├── Textarea.tsx          # Multi-line input
│   │   │   ├── NumberField.tsx       # Number input
│   │   │   ├── ImageDropzone.tsx     # Image upload
│   │   │   ├── Combobox.tsx          # Searchable select
│   │   │   ├── ConfirmDialog.tsx     # Confirmation modal
│   │   │   ├── UserForm.tsx          # User/staff form
│   │   │   ├── PermissionPicker.tsx  # Permission checkboxes
│   │   │   └── EmptyState.tsx        # Empty state placeholder
│   │   └── shared/                   # Shared components
│   │       ├── OfflineBanner.tsx     # Offline mode indicator
│   │       └── SyncStatusDot.tsx     # Sync status indicator
│   ├── plugins/                      # Business-type extensions
│   │   ├── registry.ts               # Plugin loader
│   │   └── weighted-item/            # Example plugin (scale-based)
│   │       ├── index.ts              # Plugin definition
│   │       ├── fields.ts             # Custom fields
│   │       ├── CartRow.tsx           # Cart display override
│   │       └── InventoryPanel.tsx    # Inventory display override
│   ├── globals.css                   # Tailwind directives & globals
│   └── middleware.ts                 # Auth/redirect middleware
├── public/                           # Static assets
│   └── fonts/                        # Custom fonts (if any)
├── tests/                            # Test files
│   └── **/*.test.ts(x)               # Vitest test files
├── .env.example                      # Environment template
├── .env.local                        # Local environment (git-ignored)
├── package.json                      # Dependencies & scripts
├── tsconfig.json                     # TypeScript configuration
├── next.config.ts                    # Next.js configuration (React Compiler enabled)
├── tailwind.config.ts                # Tailwind CSS configuration
├── vitest.config.ts                  # Vitest configuration
├── vitest.setup.ts                   # Vitest globals & polyfills
├── eslint.config.js                  # ESLint rules (flat config)
└── README.md                         # This file
```

## Database Schema

**pos-frontend** stores all data in IndexedDB via Dexie. The schema is versioned and auto-migrates on app updates.

### Core Tables

| Table | Purpose | Primary Key | Indexes |
|-------|---------|-------------|---------|
| `products` | Cached product catalog | `id` | `name`, `sku`, `barcode` |
| `cartItems` | Current shopping cart | `++id` (auto-increment) | `product_id` |
| `pendingOrders` | Unsynced sales | `client_generated_id` | `sync_status`, `created_at` |
| `syncMeta` | Sync state & metadata | `key` | — |

### Local-Only Tables (No Server Sync Yet)

| Table | Purpose | Primary Key |
|-------|---------|-------------|
| `customers` | Customer directory | `id` |
| `suppliers` | Supplier directory | `id` |
| `discounts` | Discount rules | `id` |
| `heldCarts` | Saved carts | `id` |
| `cashReconciliations` | Daily cash counts | `id` |

### Inventory & Purchasing

| Table | Purpose | Primary Key | Indexes |
|-------|---------|-------------|---------|
| `stockMovements` | Stock in/out log | `id` | `product_id`, `type`, `created_at` |
| `warehouses` | Warehouse locations | `id` | `name` |
| `warehouseLocations` | Shelf/rack references | `id` | — |
| `purchaseOrders` | Supplier orders | `id` | `supplier_id`, `status`, `created_at` |
| `purchaseReturns` | Return tracking | `id` | `purchase_order_id`, `created_at` |

### Business Tables

| Table | Purpose | Primary Key | Indexes |
|-------|---------|-------------|---------|
| `categories` | Product categories | `id` | `name` |
| `brands` | Product brands | `id` | — |
| `productUnits` | Custom units of measure | `id` | — |
| `roles` | Staff roles | `id` | `name` |
| `staffUsers` | Employee accounts | `id` | `email`, `role_id` |
| `notifications` | In-app alerts | `id` | `kind`, `created_at` |
| `deletedProducts` | Delete outbox (sync only) | `id` | — |

## API Documentation

The frontend communicates with the Go backend via REST API at `NEXT_PUBLIC_API_BASE_URL` (default: `http://localhost:8080`).

### Authentication

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---|
| POST | `/auth/login` | User login | No |
| POST | `/auth/register` | Create account | No |
| POST | `/auth/password/reset-request` | Request password reset | No |
| POST | `/auth/password/reset` | Reset password with token | No |
| POST | `/auth/password/change` | Change current password | Yes |
| PATCH | `/auth/profile` | Update user profile | Yes |

### Products

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---|
| GET | `/products` | Fetch all products (for cache) | Yes |
| POST | `/products` | Create offline-created product | Yes |
| PUT | `/products/{id}` | Update product fields | Yes |
| DELETE | `/products/{id}` | Delete product | Yes |

### Orders & Sales

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---|
| POST | `/orders/sync` | Sync unsynced orders to server | Yes |
| GET | `/orders` | Fetch order history (paginated) | Yes |

### Request/Response Format

- All requests: `Content-Type: application/json`
- All responses: JSON or error (see **Error Handling** below)
- Money fields: Integer cents (e.g., `100` = $1.00)
- Dates: ISO 8601 strings (e.g., `"2026-08-04T14:30:00Z"`)
- Auth: Bearer token in `Authorization: Bearer <token>` header

## Installation

### Prerequisites

- Node.js 18+ (npm or yarn)
- Go backend running on port 8080 (for real API; optional if using mock)
- Modern web browser with IndexedDB support

### Setup Steps

1. **Clone the repository**
   ```bash
   git clone <repo-url>
   cd pos-frontend
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment variables**
   ```bash
   cp .env.example .env.local
   ```
   Edit `.env.local`:
   ```bash
   NEXT_PUBLIC_USE_MOCK_API=false           # Use real backend (set to anything else for mock)
   NEXT_PUBLIC_API_BASE_URL=http://localhost:8080  # Backend origin (no trailing slash)
   ```

4. **(Optional) Start the Go backend**
   ```bash
   # See pos-backend repository for setup instructions
   # Backend must be running on port 8080 if NEXT_PUBLIC_USE_MOCK_API=false
   ```

5. **Start the dev server**
   ```bash
   npm run dev
   ```
   Open [http://localhost:3000](http://localhost:3000) in your browser.

## Environment Variables

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `NEXT_PUBLIC_USE_MOCK_API` | Use in-memory mock backend instead of real API (for dev) | `true` (unset = mock) | No |
| `NEXT_PUBLIC_API_BASE_URL` | Origin of the Go backend API | `http://localhost:8080` | When using real API |

## Running the Project

### Development

```bash
# Start dev server with Turbopack (hot reload)
npm run dev
```

Access at [http://localhost:3000](http://localhost:3000). The app auto-reloads on file changes.

### Production Build

```bash
# Build optimized bundle
npm run build

# Start production server
npm run start
```

### Testing

```bash
# Run tests once (CI mode)
npm run test

# Run tests in watch mode (for development)
npm run test:watch
```

Test files live in `tests/` and use Vitest + React Testing Library. IndexedDB is polyfilled with `fake-indexeddb`.

### Linting & Code Quality

```bash
# Run ESLint
npm run lint

# ESLint is configured for Next.js core-web-vitals + TypeScript
# Flat config in eslintrc.js
```

## Screenshots

### POS Terminal
The main till interface for checkout. Features barcode search, product grid, cart, and payment processing.

### Dashboard
Analytics dashboard with sales trends, inventory insights, payment breakdown, and top-selling products.

### Product Management
Create and edit products with detailed catalog information, images, pricing, inventory, and business-type-specific fields (pharmacy, weights, etc.).

### Inventory
Multi-warehouse stock tracking, stock movements, purchase orders, and low-stock alerts.

### Customers & Suppliers
Directory management with contact information, credit tracking, and filtering.

### Staff Management
User and role administration with granular permission control.

## Authentication Flow

### Account Login
1. User enters email and password on login page
2. Frontend POST to `/auth/login`
3. Backend returns JWT token and user profile
4. Token stored in Zustand auth store (persisted to sessionStorage)
5. HTTP interceptor auto-adds `Authorization: Bearer <token>` to all requests
6. User redirected to dashboard or previous page

### Account Registration
1. New user fills form (name, business name, email, password, business type)
2. Frontend POST to `/auth/register`
3. Server creates account and returns token/profile
4. User logged in immediately

### Cashier PIN Login
1. Staff selects "Cashier PIN" mode on login
2. Enters PIN
3. Frontend calls `loginStaff(pin)` (server-side lookup)
4. Session tied to staff user and permissions

### Password Reset
1. User enters email on "Forgot Password" page
2. POST to `/auth/password/reset-request`
3. Server sends reset email (or returns `devToken` in mock mode for testing)
4. User clicks link or enters token on reset page
5. Sets new password via `POST /auth/password/reset`
6. Redirected to login

### Session Management
- Token stored in Zustand store (cleared on logout)
- HTTP client auto-includes token in every authenticated request
- Expired sessions: if 401 is returned, login page is shown with `?reason=expired`
- No automatic refresh token (backend responsibility)

### Roles & Permissions
- Account owner: Full access
- Staff users: Assigned role with granular permission set (view products, create orders, manage inventory, etc.)
- Permissions enforced client-side (UI hidden for unauthorised users) and server-side (API rejects calls)

## Error Handling

### Validation
- Forms use Zod schemas for input validation before submission
- Server returns 400 with validation errors for invalid requests
- Toast notifications show user-friendly error messages

### HTTP Errors
- **4xx errors**: Displayed to user with actionable messages
- **5xx errors**: Logged and retried by SyncManager (transient failures expected)
- **Network errors**: App continues to work offline; orders queued for sync

### Conflict Handling
- Order sync conflict: marked `sync_status: "conflict"` for manual review
- Product conflict: server edits respected; local edits marked `_pending_update` and retried
- Duplicate prevention: SKU/barcode conflicts detected before product creation

### User Feedback
- Toast notifications for actions (success/error/info)
- Inline field validation on form submission
- Dialog confirmations for destructive actions
- Loading spinners and skeleton screens during async operations

## Performance Optimizations

### Frontend Optimizations
- **React Compiler Enabled**: Automatic memoization; avoid manual `useMemo`/`useCallback`
- **Code Splitting**: Next.js automatic per-route bundles
- **Image Optimization**: `next/image` for responsive images
- **Lazy Loading**: Product forms lazy-loaded on demand
- **Skeleton Loading**: UI placeholders while data loads
- **Pagination**: Order history paginated (server-driven)

### Data Optimizations
- **Local-First**: Read from IndexedDB instantly (no network round-trip)
- **Caching**: Product catalog cached in IndexedDB; refreshed on sync
- **Batch Sync**: Orders pushed in batches up to `maxBatchSize` (configurable)
- **Dexie Transactions**: Multi-table operations atomic (no partial updates)
- **Deduplication**: `useSalesFeed` prevents local orders from appearing twice when synced

### UI Optimizations
- **Dark Mode**: next-themes with CSS custom properties (no runtime calc)
- **Virtualization**: Large lists (products, orders) virtualized if needed (future)
- **Debouncing**: Search input and filter inputs debounced
- **No Unnecessary Re-renders**: Zustand for fine-grained updates; TanStack Query for server state

## Security

### Authentication
- JWT tokens from backend; opaque to frontend
- Token stored only in Zustand store + sessionStorage (not localStorage)
- Cleared on logout; no persistent storage across sessions

### Authorization
- Role-based access control (RBAC) for staff users
- Permissions checked client-side (UI) and server-side (API)
- Admin-only pages protected by `require-office` HOC

### Input Validation
- All user input validated with Zod before submission
- Forms reject invalid data before sending to server
- Server re-validates all inputs (defense in depth)

### Data Security
- Money always integer cents (no float rounding errors)
- Passwords never logged or exposed
- Sensitive data (tokens, PII) not cached in localStorage
- SQLite/database encryption at backend (outside scope of frontend)

### Secure Headers
- HTTP client sets secure headers (CORS handled by backend)
- Backend CORS configuration must whitelist `NEXT_PUBLIC_API_BASE_URL`
- Credentials not sent with CORS requests (stateless JWT)

### Client-Side Security
- **No `any` types**: All code uses strict TypeScript (`unknown` + narrowing)
- **No inline HTML**: React escapes text; no `dangerouslySetInnerHTML` except for templates
- **Barcode Scanner**: ZXing runs locally; no external requests
- **Image Upload**: Client-side validation; server-side format/size checks required

## Deployment

### Local Development
Use `npm run dev` with mock API enabled (default).

### Staging/Production

#### Option 1: Vercel (Recommended for Next.js)
1. Push code to GitHub
2. Import repo in Vercel
3. Set environment variables in Vercel dashboard:
   ```
   NEXT_PUBLIC_USE_MOCK_API=false
   NEXT_PUBLIC_API_BASE_URL=https://api.yourdomain.com
   ```
4. Vercel auto-deploys on push
5. Access at `https://your-app.vercel.app`

#### Option 2: Self-Hosted VPS (e.g., AWS EC2, DigitalOcean, Hetzner)
1. SSH into server
2. Install Node.js 18+
3. Clone repo and install dependencies
4. Build:
   ```bash
   npm run build
   ```
5. Run with process manager (PM2):
   ```bash
   npm install -g pm2
   pm2 start "npm start" --name pos-frontend
   pm2 save
   ```
6. Configure reverse proxy (Nginx):
   ```nginx
   server {
     listen 80;
     server_name yourdomain.com;
     location / {
       proxy_pass http://localhost:3000;
       proxy_set_header Host $host;
       proxy_set_header X-Real-IP $remote_addr;
     }
   }
   ```
7. Set up HTTPS with Let's Encrypt (Certbot)
8. Configure environment file:
   ```bash
   export NEXT_PUBLIC_API_BASE_URL=https://api.yourdomain.com
   ```

#### Option 3: Docker
Create `Dockerfile`:
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY .next ./
EXPOSE 3000
CMD ["npm", "start"]
```

Build and run:
```bash
docker build -t pos-frontend .
docker run -p 3000:3000 \
  -e NEXT_PUBLIC_API_BASE_URL=https://api.yourdomain.com \
  pos-frontend
```

#### Environment Setup for Production
```bash
# .env.production.local
NEXT_PUBLIC_USE_MOCK_API=false
NEXT_PUBLIC_API_BASE_URL=https://api.yourdomain.com
```

## Future Improvements

- **Mobile App**: React Native version for tablets/phones
- **Offline Sync Retry**: Exponential backoff and manual retry UI for failed orders
- **Multi-Tenant**: Support multiple business locations
- **Advanced Reporting**: Custom date ranges, drill-down analysis, PDF exports
- **Third-Party Integrations**: Accounting software (QuickBooks), payment gateways (Stripe, Square)
- **Inventory Forecasting**: Predictive stock alerts based on sales trends
- **Customer Loyalty**: Points programs, rewards, member-only pricing
- **Receipt Printer**: Direct thermal printer integration via Electron/Capacitor
- **Variant Management**: Bundle products (combo packs), product variations
- **Virtual Inventory**: Online store connected to the same POS database
- **Audit Trail**: Log all changes for compliance and debugging
- **Backup & Recovery**: Automatic daily syncs to cloud storage
- **Performance**: Product list virtualization for 100k+ items

## Contributing

Contributions are welcome! Please follow these guidelines:

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature`
3. Follow the code style:
   - No `any` types; use `unknown` instead
   - No default exports
   - TypeScript strict mode enforced
   - No unnecessary comments (comment the "why", not the "what")
   - Use Zod for schema validation
   - Use Zustand for global state, hooks for local state
4. Test your changes: `npm run test`
5. Lint your code: `npm run lint`
6. Commit with clear messages following conventional commits (feat, fix, docs, etc.)
7. Push and open a pull request

## License

This project is proprietary and confidential. Unauthorized copying, distribution, or use is strictly prohibited.

## Author

**Project**: Office POS System  
**Repository**: pos-frontend  
**Email**: info@southasianaffairs.com  
**GitHub**: [Link to repository](https://github.com/yourusername/pos-frontend)

---

## Quick Reference

### Key Hooks
- `useAuth()` — Authentication and login
- `useCart()` — Shopping cart management
- `useSettings()` — User preferences and money format
- `useConnectionListener()` — Online/offline state
- `usePlugin()` — Plugin data access
- `useSalesFeed()` — Server orders + local overlay

### Database Helpers
- `searchProducts(query)` — Find products by name/SKU/barcode
- `addToCart(product, quantity)` — Add item to cart
- `createLocalOrder(cart, paymentMethod)` — Create unsynced order
- `listSuppliers()`, `listCustomers()`, `listPurchaseOrders()` — List data
- `deleteProduct(id)` — Delete with soft-delete outbox

### Configuration Files
- `tsconfig.json` — TypeScript strict mode, `@/*` alias
- `next.config.ts` — React Compiler enabled
- `tailwind.config.ts` — Tailwind CSS v4
- `vitest.config.ts` — Test runner with jsdom environment
- `.env.example` — Template for environment variables

### Useful Commands
```bash
npm run dev             # Start dev server
npm run build           # Optimize production build
npm run start           # Run production server
npm run test            # Run all tests
npm run test:watch      # Watch mode for tests
npm run lint            # ESLint code quality check
```

For more information, see the [CLAUDE.md](CLAUDE.md) file in the repository.
