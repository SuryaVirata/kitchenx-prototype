# KitchenX Admin — Platform Admin API

**Base URL:** `{origin}/api/v1/admin`

Platform Admin can read every admin resource and write the catalogue, procurement, orders, customers, onboarding, leads and settings. Paths below are relative to the base URL. Private calls use a staff Bearer token from `POST /auth/login`.

Finance money, technical configuration, the relationship-manager book, and warehouse floor work are in their own files. Customer app routes stay in `sample rest repsoses KitchenX part 1.md`, part 2, and part 3. Admin uses the same `orderId`, `productId`, `outletId`, and `customerId`.

## 1. Auth and Session

Staff login is email and password. Do not reuse the customer OTP routes. A customer token must not call an admin route.

Access token: JWT, 15 minutes. Refresh token: opaque, 30 days, rotated on every use. A reused refresh token revokes the family. MFA for `PLATFORM_ADMIN` is TOTP. High-risk writes need `X-MFA-Assertion` from the last 5 minutes.

### 1.1 Login
**Method:** `POST`  
**URL:** `/auth/login`  
**Authorization:** Not required

**Request:**
```json
{
  "email": "rahul.sharma@kitchenx.com",
  "password": "correct-horse-battery-staple"
}
```

**Response:** `200` when MFA is not required
```json
{
  "success": true,
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.example",
    "refreshToken": "rt_7f3c",
    "tokenType": "Bearer",
    "expiresInSeconds": 900,
    "mfaRequired": false,
    "user": {
      "userId": "usr_001",
      "name": "Rahul Sharma",
      "email": "rahul.sharma@kitchenx.com",
      "role": "PLATFORM_ADMIN",
      "locations": [{ "locationId": "loc_hyd", "name": "Hyderabad" }]
    }
  }
}
```

**Response:** `200` when MFA is required
```json
{
  "success": true,
  "data": {
    "mfaRequired": true,
    "mfaChallengeId": "mfa_ch_91b2",
    "expiresInSeconds": 300
  }
}
```

**Notes:**
- Unknown email and a bad password both return `401 INVALID_CREDENTIALS`.
- Locked account returns `423 ACCOUNT_LOCKED`. Disabled account returns `403 ACCOUNT_DISABLED`.
- Never log the password. Five failures in 15 minutes lock the account.

### 1.2 Verify MFA
**Method:** `POST`  
**URL:** `/auth/mfa/verify`  
**Authorization:** MFA challenge token

**Request:**
```json
{ "mfaChallengeId": "mfa_ch_91b2", "code": "123456" }
```

**Response:** `200` — the same session object as login when MFA is not required.

### 1.3 Refresh Session
**Method:** `POST`  
**URL:** `/auth/refresh`  
**Authorization:** Refresh token

**Request:**
```json
{ "refreshToken": "rt_7f3c" }
```

**Response:** `200` — a new access token and a rotated refresh token.

### 1.4 Logout
**Method:** `POST`  
**URL:** `/auth/logout`  
**Authorization:** Bearer token

**Response:** `200` — `{ "success": true, "data": { "loggedOut": true } }`. The refresh family is revoked. The access token expires on its own.

### 1.5 Get Current Staff
**Method:** `GET`  
**URL:** `/auth/me`  
**Authorization:** Bearer token

**Response:**
```json
{
  "success": true,
  "data": {
    "userId": "usr_001",
    "name": "Rahul Sharma",
    "email": "rahul.sharma@kitchenx.com",
    "role": "PLATFORM_ADMIN",
    "permissions": ["products:read", "products:create", "orders:read"],
    "locations": [{ "locationId": "loc_hyd", "name": "Hyderabad" }],
    "mfaEnabled": true,
    "lastLoginAt": "2026-11-02T04:40:00Z"
  }
}
```

**Notes:**
- The server re-checks permissions on every request. Token claims are not the authority.

### 1.6 Forgot Password
**Method:** `POST`  
**URL:** `/auth/forgot-password`  
**Authorization:** Not required

**Request:**
```json
{ "email": "rahul.sharma@kitchenx.com" }
```

**Response:** `200` — always the same body, whether or not the email exists.

### 1.7 Reset Password
**Method:** `POST`  
**URL:** `/auth/reset-password`  
**Authorization:** Reset token

**Request:**
```json
{ "token": "reset_token", "password": "a-new-password" }
```

**Response:** `200`. The reset token is single-use, lasts 30 minutes, and invalidates existing refresh tokens.

## 2. Dashboard

### 2.1 Get Platform Dashboard
**Method:** `GET`  
**URL:** `/dashboards/platform`  
**Authorization:** Bearer token  
**Permission:** `dashboard:read`

**Query:** `locationId`, `from`, `to`

**Response:**
```json
{
  "success": true,
  "data": {
    "generatedAt": "2026-11-02T05:00:00Z",
    "range": { "from": "2026-10-04T00:00:00Z", "to": "2026-11-02T23:59:59Z" },
    "kpis": {
      "totalOrders": { "value": 1482, "changePct": 12.4 },
      "activeCustomers": { "value": 1026, "changePct": 3.1 },
      "productsListed": { "value": 12340, "changePct": 0.8 },
      "onTimeDeliveryPct": { "value": 98.7, "changePct": -0.2 }
    },
    "orderTrend": [
      { "date": "2026-10-27", "orders": 46, "gmv": 184300.5 }
    ],
    "recentOrders": [
      { "orderId": "ord_8810", "orderNumber": "ORD-8810", "customerName": "Cloud Bowl", "amount": 14280.0, "currency": "INR", "status": "DELIVERED", "createdAt": "2026-11-02T04:12:00Z" }
    ],
    "lowStock": [
      { "inventoryId": "inv_004", "productName": "Amul Butter 500 g", "sku": "AMB500", "availableQty": 4, "reorderLevel": 12, "locationId": "loc_hyd" }
    ],
    "pendingTasks": [
      { "type": "CREDIT_APPLICATION_VISIT", "count": 3, "href": "/admin/credit-applications?visitStatus=REQUESTED" }
    ]
  }
}
```

**Notes:**
- Scoped to the caller's locations. `changePct` compares the previous range of the same length.
- Cache at most 60 seconds. Do not scan unbounded tables per request.

## 3. Search, Notifications and Uploads

### 3.1 Search
**Method:** `GET`  
**URL:** `/search`  
**Authorization:** Bearer token  
**Permission:** Any authenticated staff user

**Query:** `q` (minimum 2 characters), `types` (`products`, `orders`, `customers`), `limit` (max 5 per group)

**Response:**
```json
{
  "success": true,
  "data": {
    "query": "amul",
    "groups": [
      {
        "type": "PRODUCT",
        "items": [
          { "id": "prod_001", "title": "Amul Butter 500 g", "subtitle": "AMB500 · Dairy", "href": "/admin/products/prod_001" }
        ]
      }
    ]
  }
}
```

**Notes:**
- A type the caller cannot read is omitted.
- Search is indexed.

### 3.2 List Notifications
**Method:** `GET`  
**URL:** `/notifications`  
**Authorization:** Bearer token  
**Permission:** `notifications:read`

**Query:** `unreadOnly`, `cursor`, `limit`

**Response:**
```json
{
  "success": true,
  "data": {
    "items": [
      {
        "notificationId": "notif_01",
        "type": "LOW_STOCK",
        "title": "Low stock: Amul Butter 500 g",
        "body": "4 units left at Hyderabad. Reorder level 12.",
        "severity": "WARNING",
        "read": false,
        "href": "/admin/inventory/inv_004",
        "createdAt": "2026-11-02T04:58:00Z"
      }
    ],
    "nextCursor": null
  }
}
```

**Notes:**
- Types: `LOW_STOCK`, `ORDER_EXCEPTION`, `RETURN_REQUEST`, `CREDIT_APPLICATION`, `SETTLEMENT_FAILURE`, `INTEGRATION_DEGRADED`, `USER_INVITE`, `SYSTEM`.
- Cursor pagination. No `page`.

### 3.3 Mark Notification Read
**Method:** `PATCH`  
**URL:** `/notifications/{notificationId}/read`  
**Authorization:** Bearer token  
**Permission:** `notifications:read`

**Response:** `200` — the notification with `read: true`.

### 3.4 Mark All Notifications Read
**Method:** `POST`  
**URL:** `/notifications/read-all`  
**Authorization:** Bearer token  
**Permission:** `notifications:read`

**Response:** `200` — `{ "success": true, "data": { "updated": true } }`.

### 3.5 Create Upload
**Method:** `POST`  
**URL:** `/uploads`  
**Authorization:** Bearer token  
**Permission:** Depends on `purpose`

**Request:**
```json
{
  "purpose": "PRODUCT_IMAGE",
  "fileName": "butter.webp",
  "contentType": "image/webp",
  "sizeBytes": 184320
}
```

**Response:** `201`
```json
{
  "success": true,
  "data": {
    "uploadId": "upl_01",
    "uploadUrl": "https://storage.example.com/signed/upl_01",
    "method": "PUT",
    "headers": { "Content-Type": "image/webp" },
    "expiresAt": "2026-11-02T05:15:00Z",
    "maxSizeBytes": 5242880
  }
}
```

**Notes:**
- Images: `image/jpeg`, `image/png`, `image/webp`. Documents: `application/pdf`.
- The server sniffs the file. Documents stay private and are read with a short-lived URL.
- `purpose`: `PRODUCT_IMAGE`, `CATEGORY_IMAGE`, `BRAND_LOGO`, `ADDON_IMAGE`, `SUPPLIER_LOGO`, `CMS_BANNER`, `CREDIT_DOCUMENT`, `PLATFORM_LOGO`.

### 3.6 Complete Upload
**Method:** `POST`  
**URL:** `/uploads/{uploadId}/complete`  
**Authorization:** Bearer token  
**Permission:** Same as the purpose

**Response:** `200` — `{ "success": true, "data": { "uploadId": "upl_01", "status": "READY" } }`.

## 4. Products

**Status:** `DRAFT`, `ACTIVE`, `INACTIVE`, `ARCHIVED`. `active: true` matches `ACTIVE` only. Delete is an archive. There is no hard delete.

### 4.1 List Products
**Method:** `GET`  
**URL:** `/products`  
**Authorization:** Bearer token  
**Permission:** `products:read`

**Query:** `q` (name, SKU, barcode, HSN), `categoryId`, `brandId`, `status`, `active`, `stockStatus` (`IN_STOCK`, `LOW_STOCK`, `OUT_OF_STOCK`), `locationId`, `minPrice`, `maxPrice`, `includeDeleted`, `page`, `limit`  
**Sort:** `createdAt`, `updatedAt`, `name`, `sku`, `sellingPrice`, `availableStock`

**Response:** List envelope. Each item uses the product object in 4.3. The admin list includes every status and cost fields. The customer list stays public and active-only.

### 4.2 Create Product
**Method:** `POST`  
**URL:** `/products`  
**Authorization:** Bearer token  
**Permission:** `products:create`

**Headers:** `Idempotency-Key`

**Request:**
```json
{
  "name": "Amul Butter 500 g",
  "sku": "AMB500",
  "categoryId": "cat_dairy",
  "brandId": "brand_amul",
  "shortDescription": "Salted table butter",
  "unit": "PACKET",
  "netWeight": 500,
  "unitType": "g",
  "barcode": "8901262010016",
  "hsnCode": "0405",
  "purchasePrice": 305.55,
  "mrp": 320.0,
  "sellingPrice": 305.55,
  "openingStock": 0,
  "active": true
}
```

**Response:** `201` — the product object in 4.3.

**Notes:**
- `name` is 2–160 characters and unique per brand.
- `sku` is 3–40 characters, `[A-Z0-9_-]`, globally unique.
- `categoryId` and `brandId` must exist and be active.
- `unit` is `PACKET`, `BAG`, `BOTTLE`, `CRATE`, `CARTON`, or `PIECE`. `unitType` is `g`, `kg`, `ml`, `L`, or `pcs`.
- `netWeight` is greater than 0 and at most 100000.
- `mrp`, when sent, is at least `sellingPrice`. `hsnCode` is 4–8 digits. `barcode` is 8–14 digits and unique.
- `openingStock` creates an `OPENING_STOCK` movement.
- Duplicate SKU or barcode returns `409 DUPLICATE`. An inactive category or brand returns `422 BUSINESS_RULE_VIOLATION`.

### 4.3 Get Product
**Method:** `GET`  
**URL:** `/products/{productId}`  
**Authorization:** Bearer token  
**Permission:** `products:read`

**Response:**
```json
{
  "success": true,
  "data": {
    "productId": "prod_001",
    "name": "Amul Butter 500 g",
    "sku": "AMB500",
    "category": { "categoryId": "cat_dairy", "name": "Dairy" },
    "brand": { "brandId": "brand_amul", "name": "Amul" },
    "shortDescription": "Salted table butter",
    "unit": "PACKET",
    "netWeight": 500,
    "unitType": "g",
    "barcode": "8901262010016",
    "hsnCode": "0405",
    "images": [
      { "imageId": "img_01", "url": "https://cdn.example.com/p/amb500.webp", "alt": "Amul Butter 500 g", "sortOrder": 0 }
    ],
    "purchasePrice": 305.55,
    "mrp": 320.0,
    "sellingPrice": 305.55,
    "currency": "INR",
    "tax": { "taxType": "GST", "ratePct": 12, "hsnCode": "0405" },
    "openingStock": 0,
    "availableStock": 48,
    "reservedStock": 2,
    "status": "ACTIVE",
    "active": true,
    "createdAt": "2026-06-24T04:30:00Z",
    "updatedAt": "2026-11-01T10:12:00Z",
    "version": 7
  }
}
```

### 4.4 Update Product
**Method:** `PATCH`  
**URL:** `/products/{productId}`  
**Authorization:** Bearer token  
**Permission:** `products:update`

**Headers:** `If-Match`

**Request:**
```json
{ "sellingPrice": 309.0, "mrp": 325.0, "active": true }
```

**Response:** `200` — the updated product. Price changes are audited. `sku` is immutable after the first order references it (`409`).

### 4.5 Update Product Status
**Method:** `PATCH`  
**URL:** `/products/{productId}/status`  
**Authorization:** Bearer token  
**Permission:** `products:update`

**Request:**
```json
{ "status": "INACTIVE", "reason": "Discontinued by supplier" }
```

**Response:** `200` — the product. `reason` is 5–500 characters. Deactivating hides it from the customer catalogue and keeps historical orders.

### 4.6 Archive Product
**Method:** `DELETE`  
**URL:** `/products/{productId}`  
**Authorization:** Bearer token  
**Permission:** `products:delete`

**Response:** `200` — product with `status` `ARCHIVED`.

### 4.7 Add Product Image
**Method:** `POST`  
**URL:** `/products/{productId}/images`  
**Authorization:** Bearer token  
**Permission:** `products:update`

**Request:**
```json
{ "uploadId": "upl_01", "alt": "Front of pack", "sortOrder": 0, "isPrimary": true }
```

**Response:** `201` — the image. At most 8 images, 5 MB each. One primary.

### 4.8 Remove Product Image
**Method:** `DELETE`  
**URL:** `/products/{productId}/images/{imageId}`  
**Authorization:** Bearer token  
**Permission:** `products:update`

**Response:** `200`.

## 5. Categories

### 5.1 List Categories
**Method:** `GET`  
**URL:** `/categories`  
**Authorization:** Bearer token  
**Permission:** `categories:read`

**Query:** `q`, `parentId` (`null` for the top level), `active`, `includeDeleted`, `page`, `limit`  
**Sort:** `sortOrder`, `name`, `createdAt`

**Response:** List envelope. Each item uses the category object in 5.3.

### 5.2 Create Category
**Method:** `POST`  
**URL:** `/categories`  
**Authorization:** Bearer token  
**Permission:** `categories:create`

**Request:**
```json
{
  "name": "Dairy",
  "parentId": null,
  "description": "Milk, butter, cheese and curd",
  "imageUploadId": "upl_02",
  "sortOrder": 10,
  "active": true
}
```

**Response:** `201` — the category. `slug` is generated and unique. Maximum depth is 3. A category cannot be its own ancestor.

### 5.3 Get Category
**Method:** `GET`  
**URL:** `/categories/{categoryId}`  
**Authorization:** Bearer token  
**Permission:** `categories:read`

**Response:**
```json
{
  "success": true,
  "data": {
    "categoryId": "cat_dairy",
    "name": "Dairy",
    "slug": "dairy",
    "parent": null,
    "description": "Milk, butter, cheese and curd",
    "imageUrl": "https://cdn.example.com/c/dairy.webp",
    "sortOrder": 10,
    "active": true,
    "productCount": 214,
    "createdAt": "2026-06-01T06:00:00Z",
    "updatedAt": "2026-10-20T09:00:00Z"
  }
}
```

### 5.4 Update Category
**Method:** `PATCH`  
**URL:** `/categories/{categoryId}`  
**Authorization:** Bearer token  
**Permission:** `categories:update`

**Response:** `200` — the updated category. Body uses the create fields.

### 5.5 Delete Category
**Method:** `DELETE`  
**URL:** `/categories/{categoryId}`  
**Authorization:** Bearer token  
**Permission:** `categories:delete`

**Response:** `200`. Children or products return `409 CATEGORY_IN_USE`.

## 6. Brands

### 6.1 List Brands
**Method:** `GET`  
**URL:** `/brands`  
**Authorization:** Bearer token  
**Permission:** `brands:read`

**Query:** `q`, `active`, `categoryId`, `includeDeleted`, `page`, `limit`  
**Sort:** `name`, `createdAt`, `productCount`

**Response:** List envelope. Each item uses the brand object in 6.3.

### 6.2 Create Brand
**Method:** `POST`  
**URL:** `/brands`  
**Authorization:** Bearer token  
**Permission:** `brands:create`

**Request:**
```json
{ "name": "Amul", "description": "Indian dairy co-operative", "logoUploadId": "upl_03", "active": true }
```

**Response:** `201`. A duplicate name returns `409 DUPLICATE`.

### 6.3 Get Brand
**Method:** `GET`  
**URL:** `/brands/{brandId}`  
**Authorization:** Bearer token  
**Permission:** `brands:read`

**Response:**
```json
{
  "success": true,
  "data": {
    "brandId": "brand_amul",
    "name": "Amul",
    "description": "Indian dairy co-operative",
    "logoUrl": "https://cdn.example.com/b/amul.webp",
    "active": true,
    "productCount": 86,
    "createdAt": "2026-06-01T06:00:00Z",
    "updatedAt": "2026-09-14T11:30:00Z"
  }
}
```

### 6.4 Update Brand
**Method:** `PATCH`  
**URL:** `/brands/{brandId}`  
**Authorization:** Bearer token  
**Permission:** `brands:update`

**Response:** `200` — the updated brand.

### 6.5 Delete Brand
**Method:** `DELETE`  
**URL:** `/brands/{brandId}`  
**Authorization:** Bearer token  
**Permission:** `brands:delete`

**Response:** `200`. Blocked while products reference the brand.

## 7. Menu Add-ons

`available` is sold-out for the day. `active` is the catalogue switch. They are independent. `taxType` comes from platform tax configuration.

### 7.1 List Menu Add-ons
**Method:** `GET`  
**URL:** `/menu-addons`  
**Authorization:** Bearer token  
**Permission:** `menu-addons:read`

**Query:** `q`, `categoryId`, `available`, `active`, `page`, `limit`  
**Sort:** `name`, `price`, `createdAt`

**Response:** List envelope. Each item uses the add-on object in 7.3.

### 7.2 Create Menu Add-on
**Method:** `POST`  
**URL:** `/menu-addons`  
**Authorization:** Bearer token  
**Permission:** `menu-addons:create`

**Request:**
```json
{
  "name": "Extra Cheese",
  "categoryId": "cat_dairy",
  "price": 40.0,
  "taxType": "GST_5",
  "description": "30 g mozzarella blend",
  "imageUploadId": "upl_04",
  "available": true,
  "active": true
}
```

**Response:** `201` — the add-on object.

### 7.3 Get Menu Add-on
**Method:** `GET`  
**URL:** `/menu-addons/{addonId}`  
**Authorization:** Bearer token  
**Permission:** `menu-addons:read`

**Response:**
```json
{
  "success": true,
  "data": {
    "addonId": "addon_cheese",
    "name": "Extra Cheese",
    "category": { "categoryId": "cat_dairy", "name": "Dairy" },
    "price": 40.0,
    "currency": "INR",
    "taxType": "GST_5",
    "description": "30 g mozzarella blend",
    "imageUrl": "https://cdn.example.com/a/cheese.webp",
    "available": true,
    "active": true,
    "createdAt": "2026-07-02T05:00:00Z",
    "updatedAt": "2026-08-18T05:00:00Z"
  }
}
```

### 7.4 Update Menu Add-on
**Method:** `PATCH`  
**URL:** `/menu-addons/{addonId}`  
**Authorization:** Bearer token  
**Permission:** `menu-addons:update`

**Response:** `200` — the updated add-on.

### 7.5 Delete Menu Add-on
**Method:** `DELETE`  
**URL:** `/menu-addons/{addonId}`  
**Authorization:** Bearer token  
**Permission:** `menu-addons:delete`

**Response:** `200`.

## 8. Suppliers

**Type:** `MANUFACTURER`, `DISTRIBUTOR`, `WHOLESALER`, `FARM_PRODUCER`  
**Payment terms:** `ADVANCE`, `NET_7`, `NET_15`, `NET_30`

### 8.1 List Suppliers
**Method:** `GET`  
**URL:** `/suppliers`  
**Authorization:** Bearer token  
**Permission:** `suppliers:read`

**Query:** `q` (name, contact, email, phone, GSTIN), `type`, `active`, `supplyCategoryId`, `paymentTerms`, `page`, `limit`  
**Sort:** `name`, `createdAt`, `updatedAt`

**Response:** List envelope. Each item uses the supplier object in 8.3.

### 8.2 Create Supplier
**Method:** `POST`  
**URL:** `/suppliers`  
**Authorization:** Bearer token  
**Permission:** `suppliers:create`

**Request:** `name`, `type`, `contactPerson`, `email`, `phone`, `alternatePhone`, `gstin`, `paymentTerms`, `address`, `logoUploadId`, `supplyCategoryIds`, `active`.

**Response:** `201` — the supplier object.

**Notes:**
- GSTIN matches `^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$` and is unique among active suppliers.
- Phone is normalised to E.164.

### 8.3 Get Supplier
**Method:** `GET`  
**URL:** `/suppliers/{supplierId}`  
**Authorization:** Bearer token  
**Permission:** `suppliers:read`

**Response:**
```json
{
  "success": true,
  "data": {
    "supplierId": "sup_001",
    "name": "Fresh Farms Pvt Ltd",
    "type": "DISTRIBUTOR",
    "contactPerson": "Ramesh Kumar",
    "email": "ramesh@freshfarms.example",
    "phone": { "countryCode": "+91", "number": "9876543210" },
    "alternatePhone": null,
    "gstin": "22AAAAA0000A1Z5",
    "paymentTerms": "NET_15",
    "address": "Plot 14, Kukatpally, Hyderabad 500072",
    "logoUrl": "https://cdn.example.com/s/freshfarms.webp",
    "supplyCategories": [{ "categoryId": "cat_produce", "name": "Produce" }],
    "active": true,
    "openPurchaseOrders": 2,
    "createdAt": "2026-05-11T06:00:00Z",
    "updatedAt": "2026-10-02T08:00:00Z"
  }
}
```

### 8.4 Update Supplier
**Method:** `PATCH`  
**URL:** `/suppliers/{supplierId}`  
**Authorization:** Bearer token  
**Permission:** `suppliers:update`

**Response:** `200` — the updated supplier.

### 8.5 Update Supplier Status
**Method:** `PATCH`  
**URL:** `/suppliers/{supplierId}/status`  
**Authorization:** Bearer token  
**Permission:** `suppliers:update`

**Request:**
```json
{ "active": false }
```

**Response:** `200`. Open purchase orders return `409 SUPPLIER_HAS_OPEN_POS`.

### 8.6 List Supplier Purchase Orders
**Method:** `GET`  
**URL:** `/suppliers/{supplierId}/purchase-orders`  
**Authorization:** Bearer token  
**Permission:** `suppliers:read`

**Response:** List envelope of the purchase-order object in section 9.

## 9. Purchase Orders

**Status:** `DRAFT → PENDING_APPROVAL → APPROVED → PARTIALLY_RECEIVED → RECEIVED`. `DRAFT`, `PENDING_APPROVAL`, and `APPROVED` can move to `CANCELLED`. `RECEIVED` and `CANCELLED` are terminal.

### 9.1 List Purchase Orders
**Method:** `GET`  
**URL:** `/purchase-orders`  
**Authorization:** Bearer token  
**Permission:** `purchase-orders:read`

**Query:** `q` (PO number, supplier), `supplierId`, `status`, `locationId`, `poDateFrom`, `poDateTo`, `expectedFrom`, `expectedTo`, `page`, `limit`  
**Sort:** `poDate`, `expectedDeliveryDate`, `createdAt`, `total`

**Response:** List envelope. Each item uses the purchase-order object in 9.3.

### 9.2 Create Purchase Order
**Method:** `POST`  
**URL:** `/purchase-orders`  
**Authorization:** Bearer token  
**Permission:** `purchase-orders:create`

**Headers:** `Idempotency-Key`

**Request:**
```json
{
  "supplierId": "sup_001",
  "poNumber": "PO20250624001",
  "poDate": "2026-06-24",
  "expectedDeliveryDate": "2026-06-27",
  "deliveryLocationId": "loc_delhi",
  "items": [
    { "productId": "prod_001", "unit": "KG", "unitPrice": 28.0, "quantity": 120, "taxRatePct": 0 }
  ],
  "notes": "Deliver before 7 am"
}
```

**Response:** `201` — purchase order with `status` `DRAFT` or `PENDING_APPROVAL`.

**Notes:**
- `poNumber` is unique. The server may generate it.
- 1–200 lines. No duplicate `productId`. Totals are computed on the server. A client total that does not match returns `422 TOTAL_MISMATCH`.

### 9.3 Get Purchase Order
**Method:** `GET`  
**URL:** `/purchase-orders/{purchaseOrderId}`  
**Authorization:** Bearer token  
**Permission:** `purchase-orders:read`

**Response:**
```json
{
  "success": true,
  "data": {
    "purchaseOrderId": "po_20250624001",
    "poNumber": "PO20250624001",
    "supplier": { "supplierId": "sup_001", "name": "Fresh Farms Pvt Ltd" },
    "status": "PENDING_APPROVAL",
    "poDate": "2026-06-24T00:00:00Z",
    "expectedDeliveryDate": "2026-06-27T00:00:00Z",
    "deliveryLocation": { "locationId": "loc_delhi", "name": "Main Warehouse (Delhi)" },
    "items": [
      {
        "lineId": "pol_01",
        "product": { "productId": "prod_001", "name": "Tomatoes 1 kg", "sku": "VEG-TOM-001" },
        "unit": "KG",
        "unitPrice": 28.0,
        "quantity": 120,
        "receivedQuantity": 0,
        "taxRatePct": 0,
        "lineTotal": 3360.0
      }
    ],
    "subtotal": 3360.0,
    "taxTotal": 0.0,
    "total": 3360.0,
    "currency": "INR",
    "notes": "Deliver before 7 am",
    "createdBy": { "userId": "usr_001", "name": "Rahul Sharma" },
    "approvedBy": null,
    "createdAt": "2026-06-24T04:20:00Z",
    "updatedAt": "2026-06-24T04:20:00Z",
    "version": 1
  }
}
```

### 9.4 Update Purchase Order
**Method:** `PATCH`  
**URL:** `/purchase-orders/{purchaseOrderId}`  
**Authorization:** Bearer token  
**Permission:** `purchase-orders:update`

**Headers:** `If-Match`

**Response:** `200`. Allowed only in `DRAFT` or `PENDING_APPROVAL`. `items`, when sent, replaces the whole array.

### 9.5 Approve Purchase Order
**Method:** `POST`  
**URL:** `/purchase-orders/{purchaseOrderId}/approve`  
**Authorization:** Bearer token  
**Permission:** `purchase-orders:approve`

**Headers:** `If-Match`

**Response:** `200` — `status` `APPROVED`. When `settings.procurement.segregationOfDuties` is true, the creator cannot approve.

### 9.6 Cancel Purchase Order
**Method:** `POST`  
**URL:** `/purchase-orders/{purchaseOrderId}/cancel`  
**Authorization:** Bearer token  
**Permission:** `purchase-orders:cancel`

**Response:** `200` — `status` `CANCELLED`. A PO that already has receipts cannot be cancelled.

### 9.7 List Purchase Order Receipts
**Method:** `GET`  
**URL:** `/purchase-orders/{purchaseOrderId}/receipts`  
**Authorization:** Bearer token  
**Permission:** `purchase-orders:read`

**Response:** List envelope of goods receipts for this PO.

## 10. Inventory

`availableQty = onHandQty − reservedQty`. It is not an editable field. No call sets an absolute stock number.

### 10.1 List Inventory
**Method:** `GET`  
**URL:** `/inventory`  
**Authorization:** Bearer token  
**Permission:** `inventory:read`

**Query:** `q` (product, SKU), `categoryId`, `locationId`, `stockStatus`, `belowReorder`, `page`, `limit`  
**Sort:** `productName`, `availableQty`, `updatedAt`

**Response:** List envelope. Each item uses the balance object in 10.2.

### 10.2 Get Inventory
**Method:** `GET`  
**URL:** `/inventory/{inventoryId}`  
**Authorization:** Bearer token  
**Permission:** `inventory:read`

**Response:**
```json
{
  "success": true,
  "data": {
    "inventoryId": "inv_004",
    "product": { "productId": "prod_001", "name": "Amul Butter 500 g", "sku": "AMB500" },
    "location": { "locationId": "loc_hyd", "name": "Hyderabad" },
    "onHandQty": 6,
    "reservedQty": 2,
    "availableQty": 4,
    "reorderLevel": 12,
    "stockStatus": "LOW_STOCK",
    "unit": "PACKET",
    "lastMovementAt": "2026-11-02T04:10:00Z",
    "updatedAt": "2026-11-02T04:10:00Z",
    "version": 31
  }
}
```

### 10.3 List Inventory Movements
**Method:** `GET`  
**URL:** `/inventory/{inventoryId}/movements`  
**Authorization:** Bearer token  
**Permission:** `inventory:read`

**Query:** `type`, `from`, `to`, `page`, `limit`

**Response:** List of `movementId`, `type` (`OPENING_STOCK`, `PURCHASE_RECEIPT`, `SALE`, `RETURN`, `ADJUSTMENT`, `TRANSFER_IN`, `TRANSFER_OUT`, `DAMAGE`, `EXPIRY`), `quantityDelta`, `balanceAfter`, `referenceType`, `referenceId`, `actor`, `createdAt`.

### 10.4 Adjust Inventory
**Method:** `POST`  
**URL:** `/inventory/adjustments`  
**Authorization:** Bearer token  
**Permission:** `inventory:adjust`

**Headers:** `Idempotency-Key`, `If-Match`

**Request:**
```json
{
  "inventoryId": "inv_004",
  "quantityDelta": 24,
  "reason": "SUPPLIER_CORRECTION",
  "reference": "GRN-2026-0042",
  "note": "Invoice quantity was 24, received 0"
}
```

**Response:** `201` — the new balance and `movementId`. The ledger stores `beforeQty`, `delta`, `afterQty`, actor, reason, and reference.

**Notes:**
- `reason` is `CYCLE_COUNT`, `DAMAGE`, `EXPIRY`, `SUPPLIER_CORRECTION`, `THEFT_LOSS`, `TRANSFER`, or `OTHER`.
- `quantityDelta` is non-zero. The result must stay at least 0.
- Warehouse roles do not get this call. Their stock changes go through receiving, counts, and approvals.

### 10.5 List Low Stock
**Method:** `GET`  
**URL:** `/inventory/low-stock`  
**Authorization:** Bearer token  
**Permission:** `inventory:read`

**Query:** `locationId`, `page`, `limit`

**Response:** List envelope of balances where `availableQty` is at or below `reorderLevel`.

## 11. Goods Receipts

**Status:** `DRAFT → CONFIRMED`, or `DRAFT → CANCELLED`. `CONFIRMED` is terminal.

### 11.1 List Goods Receipts
**Method:** `GET`  
**URL:** `/goods-receipts`  
**Authorization:** Bearer token  
**Permission:** `goods-receipts:read`

**Query:** `q` (GRN ref, PO number, supplier), `purchaseOrderId`, `status`, `locationId`, `receivedFrom`, `receivedTo`, `page`, `limit`  
**Sort:** `receivingDate`, `createdAt`

**Response:** List envelope. Each item uses the receipt in 11.3.

### 11.2 Create Goods Receipt
**Method:** `POST`  
**URL:** `/goods-receipts`  
**Authorization:** Bearer token  
**Permission:** `goods-receipts:create`

**Headers:** `Idempotency-Key`

**Request:**
```json
{
  "purchaseOrderId": "po_20250624001",
  "receivingDate": "2026-06-27",
  "receivedBy": "Ananya Menon",
  "locationId": "loc_delhi",
  "referenceNumber": "GRN12345",
  "notes": "Two crates damaged in transit",
  "items": [
    { "purchaseOrderLineId": "pol_01", "receivingNowQty": 120 }
  ]
}
```

**Response:** `201`
```json
{
  "success": true,
  "data": {
    "receiptId": "grn_0042",
    "referenceNumber": "GRN12345",
    "status": "DRAFT",
    "purchaseOrder": { "purchaseOrderId": "po_20250624001", "poNumber": "PO20250624001" },
    "items": [
      {
        "purchaseOrderLineId": "pol_01",
        "productId": "prod_001",
        "orderedQty": 120,
        "previouslyReceivedQty": 0,
        "receivingNowQty": 120,
        "unit": "KG"
      }
    ],
    "createdAt": "2026-06-27T02:10:00Z",
    "version": 1
  }
}
```

**Notes:**
- At least one line has `receivingNowQty` greater than 0. The server recomputes `previouslyReceivedQty`.
- A warehouse caller’s `receivedBy` is taken from the token.

### 11.3 Get Goods Receipt
**Method:** `GET`  
**URL:** `/goods-receipts/{receiptId}`  
**Authorization:** Bearer token  
**Permission:** `goods-receipts:read`

**Response:** The receipt object from 11.2 inside `data`.

### 11.4 Update Goods Receipt
**Method:** `PATCH`  
**URL:** `/goods-receipts/{receiptId}`  
**Authorization:** Bearer token  
**Permission:** `goods-receipts:update`

**Headers:** `If-Match`

**Response:** `200`. Allowed only while `DRAFT`.

### 11.5 Confirm Goods Receipt
**Method:** `POST`  
**URL:** `/goods-receipts/{receiptId}/confirm`  
**Authorization:** Bearer token  
**Permission:** `goods-receipts:confirm`

**Headers:** `Idempotency-Key`

**Response:** `200` — `status` `CONFIRMED`, purchase-receipt movements posted, and the PO moved to `PARTIALLY_RECEIVED` or `RECEIVED`.

**Notes:**
- Over-receipt returns `422 OVER_RECEIPT` unless the caller has `goods-receipts:over-receive` and sends `allowOverReceipt: true` with a reason.
- The same idempotency key returns the original result. A second confirm without a key returns `409 ALREADY_CONFIRMED`.
- Confirm, stock movements, and PO received quantity commit together.

### 11.6 Cancel Goods Receipt
**Method:** `POST`  
**URL:** `/goods-receipts/{receiptId}/cancel`  
**Authorization:** Bearer token  
**Permission:** `goods-receipts:cancel`

**Response:** `200` — `status` `CANCELLED`. Drafts only.

## 12. Orders

This is the same order as the customer API, with cross-customer scope and admin actions.

**Status:** `PLACED`, `CONFIRMED`, `PROCESSING`, `PACKED`, `OUT_FOR_DELIVERY`, `DELIVERED`, `CANCELLED`, `RETURN_REQUESTED`, `RETURNED`, `REFUNDED`  
**Payment status:** `PENDING`, `AUTHORIZED`, `PAID`, `PARTIALLY_REFUNDED`, `REFUNDED`, `FAILED`, `COD_DUE`, `COD_COLLECTED`

```
PLACED → CONFIRMED → PROCESSING → PACKED → OUT_FOR_DELIVERY → DELIVERED
any of those before OUT_FOR_DELIVERY → CANCELLED
DELIVERED → RETURN_REQUESTED → RETURNED → REFUNDED
```

### 12.1 List Orders
**Method:** `GET`  
**URL:** `/orders`  
**Authorization:** Bearer token  
**Permission:** `orders:read`

**Query:** `q` (order number, customer, phone), `status` (repeatable), `paymentMethod` (`PREPAID`, `COD`, `CREDIT_NOTE`), `paymentStatus`, `customerId`, `outletId`, `locationId`, `deliveryPartnerId`, `from`, `to`, `minAmount`, `maxAmount`, `hasException`, `page`, `limit`  
**Sort:** `createdAt`, `deliveredAt`, `total`, `status`. Default `createdAt` then `orderId`, both descending.

**Response:** List envelope. Each item uses the order object in 12.3.

### 12.2 Create Order on Behalf
**Method:** `POST`  
**URL:** `/orders`  
**Authorization:** Bearer token  
**Permission:** `orders:create`

**Headers:** `Idempotency-Key`

**Request:**
```json
{
  "customerId": "cus_014",
  "outletId": "out_003",
  "deliveryAddressId": "addr_001",
  "items": [
    { "productId": "prod_001", "quantity": 4 },
    { "productId": "prod_077", "quantity": 2 }
  ],
  "paymentMethod": "COD",
  "notes": "Phone order from the customer",
  "source": "ADMIN_ON_BEHALF"
}
```

**Response:** `201` — the priced order.

**Notes:**
- The client does not send `unitPrice`, `taxTotal`, or `total`. The server prices from the active price list.
- Products must be `ACTIVE` and serviceable to the outlet pincode.
- `COD` is allowed only when `settings.general.allowCodOrders` is true.
- Short stock returns `422 INSUFFICIENT_STOCK` with per-line available quantities. A successful create reserves stock.

### 12.3 Get Order
**Method:** `GET`  
**URL:** `/orders/{orderId}`  
**Authorization:** Bearer token  
**Permission:** `orders:read`

**Response:**
```json
{
  "success": true,
  "data": {
    "orderId": "ord_8810",
    "orderNumber": "ORD-8810",
    "customer": { "customerId": "cus_014", "name": "Cloud Bowl", "phone": "+919550100406" },
    "outlet": { "outletId": "out_003", "name": "Cloud Bowl Madhapur" },
    "location": { "locationId": "loc_hyd", "name": "Hyderabad" },
    "status": "DELIVERED",
    "payment": {
      "method": "PREPAID",
      "status": "PAID",
      "paidAmount": 14280.0,
      "currency": "INR",
      "gateway": "RAZORPAY",
      "paymentId": "pay_7712"
    },
    "items": [
      {
        "lineId": "oli_01",
        "productId": "prod_001",
        "name": "Amul Butter 500 g",
        "sku": "AMB500",
        "unit": "PACKET",
        "quantity": 40,
        "unitPrice": 305.55,
        "taxRatePct": 12,
        "lineTotal": 12222.0,
        "status": "DELIVERED"
      }
    ],
    "subtotal": 12222.0,
    "taxTotal": 1466.64,
    "deliveryFee": 591.36,
    "discountTotal": 0.0,
    "total": 14280.0,
    "currency": "INR",
    "deliveryAddress": {
      "addressId": "addr_001",
      "line1": "Plot 14, Kukatpally",
      "city": "Hyderabad",
      "state": "Telangana",
      "pincode": "500072",
      "contactName": "Ravi Teja",
      "contactPhone": "+919876543210"
    },
    "shipment": { "shipmentId": "shp_441", "status": "DELIVERED", "deliveryPartnerId": "dp_delhivery" },
    "placedBy": { "type": "CUSTOMER", "userId": null },
    "notes": "Leave at service entrance",
    "createdAt": "2026-11-02T03:50:00Z",
    "confirmedAt": "2026-11-02T03:52:00Z",
    "deliveredAt": "2026-11-02T05:40:00Z",
    "updatedAt": "2026-11-02T05:40:00Z",
    "version": 5
  }
}
```

Warehouse and RM responses may add read-only `fulfilmentStage` (`QUEUED`, `PICKING`, `PACKING`, `STAGED`, `HANDED_OVER`) and `priority` (`NORMAL`, `EXPRESS`). Those fields are derived. They are not accepted on a write.

### 12.4 Update Order
**Method:** `PATCH`  
**URL:** `/orders/{orderId}`  
**Authorization:** Bearer token  
**Permission:** `orders:update`

**Headers:** `If-Match`

**Request:** `deliveryAddressId`, `notes`, or `deliveryInstructions`, and only while `PLACED` or `CONFIRMED`.

**Response:** `200`. Items, prices, and customer are immutable. Change items by cancelling and creating again.

### 12.5 Update Order Status
**Method:** `PATCH`  
**URL:** `/orders/{orderId}/status`  
**Authorization:** Bearer token  
**Permission:** `orders:update`

**Request:**
```json
{ "status": "PACKED", "note": "Packed at Hyderabad hub" }
```

**Response:** `200` — the order. An illegal target returns `409 INVALID_STATE_TRANSITION` with `allowedNext`. `DELIVERED` comes from `OUT_FOR_DELIVERY` and needs delivery proof. The shipment call is the preferred path.

### 12.6 Cancel Order
**Method:** `POST`  
**URL:** `/orders/{orderId}/cancel`  
**Authorization:** Bearer token  
**Permission:** `orders:cancel`

**Headers:** `Idempotency-Key`

**Request:**
```json
{ "reason": "CUSTOMER_REQUEST", "note": "Customer called to cancel" }
```

**Response:** `200` — `status` `CANCELLED`, reserved stock released, and `refundId` when a prepaid refund request was created.

**Notes:**
- `reason` is `CUSTOMER_REQUEST`, `OUT_OF_STOCK`, `PAYMENT_FAILED`, `ADDRESS_ISSUE`, `DUPLICATE`, or `OTHER`.
- Cancel after `OUT_FOR_DELIVERY` returns `409`. Use a return.

### 12.7 Get Order Timeline
**Method:** `GET`  
**URL:** `/orders/{orderId}/timeline`  
**Authorization:** Bearer token  
**Permission:** `orders:read`

**Response:**
```json
{
  "success": true,
  "data": {
    "items": [
      { "eventId": "evt_1", "type": "ORDER_PLACED", "status": "PLACED", "actor": { "type": "CUSTOMER", "name": "Cloud Bowl" }, "note": null, "createdAt": "2026-11-02T03:50:00Z" },
      { "eventId": "evt_5", "type": "STATUS_CHANGED", "from": "OUT_FOR_DELIVERY", "to": "DELIVERED", "actor": { "type": "SYSTEM", "name": "Delhivery webhook" }, "createdAt": "2026-11-02T05:40:00Z" }
    ]
  }
}
```

### 12.8 Get Order Invoice
**Method:** `GET`  
**URL:** `/orders/{orderId}/invoice`  
**Authorization:** Bearer token  
**Permission:** `orders:read`

**Response:**
```json
{
  "success": true,
  "data": {
    "invoiceNumber": "KX-2026-008810",
    "invoiceDate": "2026-11-02T05:40:00Z",
    "pdfUrl": "https://cdn.example.com/signed/invoice",
    "expiresAt": "2026-11-02T06:40:00Z"
  }
}
```

The invoice is generated from the order snapshot. A later product edit does not change it.

## 13. Shipments and Delivery Partners

**Shipment status:** `PENDING_ASSIGNMENT → ASSIGNED → PICKED_UP → IN_TRANSIT → OUT_FOR_DELIVERY → DELIVERED`. Any open state can move to `FAILED` or `CANCELLED`.

### 13.1 List Shipments
**Method:** `GET`  
**URL:** `/shipments`  
**Authorization:** Bearer token  
**Permission:** `shipments:read`

**Query:** `q`, `status`, `deliveryPartnerId`, `locationId`, `from`, `to`, `lateOnly`, `page`, `limit`  
**Sort:** `createdAt`, `eta`, `status`

**Response:** List envelope of shipment summaries.

### 13.2 Get Shipment
**Method:** `GET`  
**URL:** `/shipments/{shipmentId}`  
**Authorization:** Bearer token  
**Permission:** `shipments:read`

**Response:** `200` — shipment id, order, partner, driver, vehicle, status, ETA, and AWB when present.

### 13.3 Assign Shipment
**Method:** `POST`  
**URL:** `/shipments/{shipmentId}/assign`  
**Authorization:** Bearer token  
**Permission:** `shipments:assign`

**Request:**
```json
{
  "deliveryPartnerId": "dp_delhivery",
  "driverName": "Amit Singh",
  "driverPhone": "+919876543210",
  "vehicleNumber": "DL01AB1234",
  "eta": "2026-11-02T06:30:00Z",
  "reassign": false,
  "reason": null
}
```

**Response:** `200` — shipment `ASSIGNED`. Reassigning an assigned shipment needs `reassign: true` and a `reason` of 5–200 characters. The delivery OTP is not returned after creation.

### 13.4 Update Shipment Status
**Method:** `PATCH`  
**URL:** `/shipments/{shipmentId}/status`  
**Authorization:** Bearer token  
**Permission:** `shipments:update`

**Request:**
```json
{
  "status": "DELIVERED",
  "proof": { "type": "OTP", "reference": "proof-ref" }
}
```

**Response:** `200`. `DELIVERED` needs proof `OTP`, `SIGNATURE`, or `PHOTO`. `FAILED` needs `failureReason`: `CUSTOMER_UNAVAILABLE`, `WRONG_ADDRESS`, `REFUSED`, `PAYMENT_ISSUE`, or `OTHER`. `OUT_FOR_DELIVERY` and `DELIVERED` update the order in the same transaction.

### 13.5 Get Shipment Tracking
**Method:** `GET`  
**URL:** `/shipments/{shipmentId}/tracking`  
**Authorization:** Bearer token  
**Permission:** `shipments:read`

**Response:** Ordered tracking events.

### 13.6 List Delivery Partners
**Method:** `GET`  
**URL:** `/delivery-partners`  
**Authorization:** Bearer token  
**Permission:** `delivery-partners:read`

**Response:** List envelope of partners.

### 13.7 Get Delivery Partner
**Method:** `GET`  
**URL:** `/delivery-partners/{partnerId}`  
**Authorization:** Bearer token  
**Permission:** `delivery-partners:read`

**Response:** Partner detail and availability.

### 13.8 List Partner Shipments
**Method:** `GET`  
**URL:** `/delivery-partners/{partnerId}/shipments`  
**Authorization:** Bearer token  
**Permission:** `shipments:read`

**Response:** Active load for that partner.

## 14. Returns

Refund money is in the Finance file. Platform owns the operational return.

**Status:** `REQUESTED`, `UNDER_REVIEW`, `APPROVED`, `REJECTED`, `PICKUP_SCHEDULED`, `RECEIVED`, `REFUND_PENDING`, `REFUNDED`, `CLOSED`  
**Type:** `DAMAGED`, `WRONG_ITEM`, `SHORT_QUANTITY`, `QUALITY`, `EXPIRED`, `OTHER`

### 14.1 List Returns
**Method:** `GET`  
**URL:** `/returns`  
**Authorization:** Bearer token  
**Permission:** `returns:read`

**Query:** `q`, `type`, `status`, `customerId`, `orderId`, `locationId`, `from`, `to`, `page`, `limit`  
**Sort:** `createdAt`, `updatedAt`, `amount`

**Response:** List envelope. Each item uses the return object in 14.2.

### 14.2 Get Return
**Method:** `GET`  
**URL:** `/returns/{returnId}`  
**Authorization:** Bearer token  
**Permission:** `returns:read`

**Response:**
```json
{
  "success": true,
  "data": {
    "returnId": "ret_0091",
    "returnNumber": "RET-0091",
    "order": { "orderId": "ord_8790", "orderNumber": "ORD-8790" },
    "customer": { "customerId": "cus_007", "name": "Spice Route" },
    "type": "DAMAGED",
    "status": "UNDER_REVIEW",
    "reason": "Two packets crushed on arrival",
    "items": [
      { "orderLineId": "oli_02", "productId": "prod_031", "quantity": 2, "unitPrice": 410.0, "refundAmount": 820.0 }
    ],
    "amount": 820.0,
    "currency": "INR",
    "evidence": [{ "fileId": "upl_09", "url": "https://cdn.example.com/signed/evidence", "contentType": "image/jpeg" }],
    "pickup": null,
    "refund": null,
    "createdAt": "2026-11-01T09:10:00Z",
    "updatedAt": "2026-11-01T09:10:00Z",
    "version": 1
  }
}
```

`refundAmount` uses the original order line, not the current catalogue price. Quantity cannot exceed delivered minus already returned. A return starts from a `DELIVERED` order.

### 14.3 Review Return
**Method:** `POST`  
**URL:** `/returns/{returnId}/review`  
**Authorization:** Bearer token  
**Permission:** `returns:resolve`

**Request:**
```json
{
  "decision": "APPROVE",
  "approvedItems": [{ "orderLineId": "oli_02", "quantity": 2 }],
  "note": "Photos confirm damage"
}
```

**Response:** `200`. Approve sets `REFUND_PENDING` and creates a refund request. It does not move money. Reject needs a note of 5–500 characters and a reason code.

### 14.4 Schedule Return Pickup
**Method:** `POST`  
**URL:** `/returns/{returnId}/schedule-pickup`  
**Authorization:** Bearer token  
**Permission:** `returns:resolve`

**Request:**
```json
{ "zoneId": "zone_hyd_west", "scheduledDate": "2026-11-03" }
```

**Response:** `200` — `status` `PICKUP_SCHEDULED`. The server checks serviceability.

### 14.5 Receive Return
**Method:** `POST`  
**URL:** `/returns/{returnId}/receive`  
**Authorization:** Bearer token  
**Permission:** `returns:resolve`

**Response:** `200` — `status` `RECEIVED`.

### 14.6 Close Return
**Method:** `POST`  
**URL:** `/returns/{returnId}/close`  
**Authorization:** Bearer token  
**Permission:** `returns:resolve`

**Response:** `200` — `status` `CLOSED`. Allowed when the linked refund is `COMPLETED`, or waived with a reason and `refunds:waive`.

### 14.7 Get Return Timeline
**Method:** `GET`  
**URL:** `/returns/{returnId}/timeline`  
**Authorization:** Bearer token  
**Permission:** `returns:read`

**Response:** Ordered return events.

## 15. Customers and Outlets

**Customer status:** `PENDING_APPROVAL`, `ACTIVE`, `ON_HOLD`, `SUSPENDED`, `CLOSED`  
`ON_HOLD` blocks new orders. `SUSPENDED` blocks login. `CLOSED` is terminal.

**Outlet status:** `ACTIVE`, `INACTIVE`, `TEMPORARILY_CLOSED`

### 15.1 List Customers
**Method:** `GET`  
**URL:** `/customers`  
**Authorization:** Bearer token  
**Permission:** `customers:read`

**Query:** `q` (business, contact, phone, GSTIN), `status`, `category`, `city`, `rmId`, `onboardingStatus`, `hasCreditLine`, `page`, `limit`  
**Sort:** `name`, `createdAt`, `outletCount`, `lastOrderAt`

**Response:** List envelope. List items omit PAN, bank details, and document URLs.

### 15.2 Get Customer
**Method:** `GET`  
**URL:** `/customers/{customerId}`  
**Authorization:** Bearer token  
**Permission:** `customers:read`

**Response:**
```json
{
  "success": true,
  "data": {
    "customerId": "cus_014",
    "businessName": "Cloud Bowl",
    "category": "CLOUD_KITCHEN",
    "contact": { "name": "Ravi Teja", "phone": "+919876543210", "email": "ravi@cloudbowl.example" },
    "gstin": "36AABCK9999P1Z5",
    "address": { "line1": "Plot 14", "city": "Hyderabad", "state": "Telangana", "pincode": "500072" },
    "outletCount": 3,
    "assignedRm": { "userId": "usr_021", "name": "Kavya Reddy" },
    "onboardingStatus": "APPROVED",
    "status": "ACTIVE",
    "credit": { "creditCaseId": "cred_003", "approvedLimit": 50000.0, "used": 19800.0, "available": 30200.0, "currency": "INR" },
    "createdAt": "2026-04-10T05:00:00Z",
    "lastOrderAt": "2026-11-02T03:50:00Z",
    "version": 12
  }
}
```

Detail document links are short-lived. RM receives `hasCreditLine` instead of the credit amounts.

### 15.3 Update Customer
**Method:** `PATCH`  
**URL:** `/customers/{customerId}`  
**Authorization:** Bearer token  
**Permission:** `customers:update`

**Request:** `contact.name`, `contact.email`, `assignedRmId`, `category`, `notes`.

**Response:** `200`. Business name, GSTIN, and legal address need `customers:override-profile` and a reason.

### 15.4 Update Customer Status
**Method:** `PATCH`  
**URL:** `/customers/{customerId}/status`  
**Authorization:** Bearer token  
**Permission:** `customers:update`

**Request:**
```json
{ "status": "ON_HOLD", "reason": "Payment overdue" }
```

**Response:** `200`.

### 15.5 List Customer Outlets
**Method:** `GET`  
**URL:** `/customers/{customerId}/outlets`  
**Authorization:** Bearer token  
**Permission:** `customers:read`

**Response:** Outlets for that customer.

### 15.6 List Customer Orders
**Method:** `GET`  
**URL:** `/customers/{customerId}/orders`  
**Authorization:** Bearer token  
**Permission:** `customers:read`

**Response:** Order history for that customer.

### 15.7 Get Customer Ledger
**Method:** `GET`  
**URL:** `/customers/{customerId}/ledger`  
**Authorization:** Bearer token  
**Permission:** `customers:read`

**Response:** The ledger summary in Finance Admin, Customer Ledgers.

### 15.8 List Outlets
**Method:** `GET`  
**URL:** `/outlets`  
**Authorization:** Bearer token  
**Permission:** `outlets:read`

**Query:** `q`, `customerId`, `city`, `pincode`, `status`, `zoneId`, `rmId`, `page`, `limit`

**Response:** Cross-customer outlet list.

### 15.9 Get Outlet
**Method:** `GET`  
**URL:** `/outlets/{outletId}`  
**Authorization:** Bearer token  
**Permission:** `outlets:read`

**Response:** Outlet detail. Admin may update `assignedRmId`, `zoneId`, `status`, `deliveryWindow`, and `serviceabilityOverride`. Profile fields stay customer-owned.

## 16. Credit Applications

Platform records the visit and sends the case to Finance. Finance sets the limit. `applicationId` and Finance `creditCaseId` are the same value.

**Stage:** `REVIEW → WITH_FINANCE → APPROVED | REJECTED`  
**Visit:** `REQUESTED → REGISTERED | NOT_REQUIRED`  
**Document type:** `GST`, `FSSAI`, `PAN`, `BANK_STATEMENT`, `IT_RETURN`, `ADDRESS_PROOF`  
**Document status:** `PENDING`, `VERIFIED`, `REJECTED`

### 16.1 List Credit Applications
**Method:** `GET`  
**URL:** `/credit-applications`  
**Authorization:** Bearer token  
**Permission:** `credit-applications:read`

**Query:** `q`, `stage`, `visitStatus`, `bizType`, `locationId`, `submittedFrom`, `submittedTo`, `assignedTo`, `page`, `limit`  
**Sort:** `submittedAt`, `updatedAt`, `approvedLimit`

**Response:** List envelope. Each item uses the application object in 16.2. Lists do not include document URLs.

### 16.2 Get Credit Application
**Method:** `GET`  
**URL:** `/credit-applications/{applicationId}`  
**Authorization:** Bearer token  
**Permission:** `credit-applications:read`

**Response:**
```json
{
  "success": true,
  "data": {
    "applicationId": "cred_003",
    "kitchen": { "customerId": "cus_014", "name": "Cloud Bowl" },
    "businessType": "CLOUD_KITCHEN",
    "contact": { "name": "Ravi Teja", "phone": "+919876543210", "email": "ravi@cloudbowl.example" },
    "address": "Plot 14, Kukatpally, Hyderabad 500072",
    "gstin": "36AABCK9999P1Z5",
    "documents": [
      { "documentType": "GST", "status": "VERIFIED", "fileName": "gst.pdf", "uploadedAt": "2026-10-28T06:00:00Z" },
      { "documentType": "PAN", "status": "VERIFIED", "fileName": "pan.pdf", "uploadedAt": "2026-10-28T06:02:00Z" }
    ],
    "visitStatus": "REQUESTED",
    "visit": { "date": "2026-11-03", "time": "11:00", "address": "Plot 14, Kukatpally", "notes": null },
    "stage": "REVIEW",
    "approvedLimit": null,
    "usedLimit": 0.0,
    "currency": "INR",
    "submittedAt": "2026-10-28T06:05:00Z",
    "version": 1
  }
}
```

### 16.3 Register Visit
**Method:** `POST`  
**URL:** `/credit-applications/{applicationId}/register-visit`  
**Authorization:** Bearer token  
**Permission:** `credit-applications:visit`

**Request:**
```json
{
  "visitedAt": "2026-11-02T10:30:00+05:30",
  "visitAddress": "Plot 14, Kukatpally, Hyderabad 500072",
  "notes": "Kitchen operational; storage and cold room verified"
}
```

**Response:** `200` — `visitStatus` `REGISTERED`. Only from `REQUESTED`. `visitedAt` cannot be in the future. Notes are at most 1000 characters.

### 16.4 Skip Visit
**Method:** `POST`  
**URL:** `/credit-applications/{applicationId}/skip-visit`  
**Authorization:** Bearer token  
**Permission:** `credit-applications:visit`

**Request:**
```json
{ "reason": "Existing verified customer with 14 months of orders" }
```

**Response:** `200` — `visitStatus` `NOT_REQUIRED`. `reason` is 10–500 characters. This does not hand the case to Finance.

### 16.5 Send to Finance
**Method:** `POST`  
**URL:** `/credit-applications/{applicationId}/send-to-finance`  
**Authorization:** Bearer token  
**Permission:** `credit-applications:submit`

**Headers:** `Idempotency-Key`

**Request:**
```json
{ "note": "Visit completed; recommend a limit of 50000" }
```

**Response:** `200` — `stage` `WITH_FINANCE`. Visit must be `REGISTERED` or `NOT_REQUIRED`. Otherwise `409 INVALID_STATE_TRANSITION`. Platform cannot set the limit here.

### 16.6 Reject Credit Application
**Method:** `POST`  
**URL:** `/credit-applications/{applicationId}/reject`  
**Authorization:** Bearer token  
**Permission:** `credit-applications:reject`

**Request:**
```json
{ "reason": "INCOMPLETE_DOCUMENTS", "note": "Bank statement missing for 3 months" }
```

**Response:** `200` — `stage` `REJECTED`. `reason` is `INCOMPLETE_DOCUMENTS`, `BUSINESS_NOT_ELIGIBLE`, `DUPLICATE_APPLICATION`, `FRAUD_SUSPECTED`, or `OTHER`. The customer is notified.

### 16.7 List Credit Documents
**Method:** `GET`  
**URL:** `/credit-applications/{applicationId}/documents`  
**Authorization:** Bearer token  
**Permission:** `credit-applications:read`

**Response:** Document metadata and signed URLs that expire within 10 minutes. Each view is audited. Bank and IT documents mask the account number except the last 4 digits.

## 17. Onboarding

This reviews the customer onboarding records from part 1. It does not create a second profile.

**Status:** `PENDING_REVIEW`, `INFO_REQUESTED`, `APPROVED`, `REJECTED`

### 17.1 List Onboarding
**Method:** `GET`  
**URL:** `/onboarding`  
**Authorization:** Bearer token  
**Permission:** `onboarding:read`

**Query:** `q`, `status`, `mobileVerified`, `gstStatus` (`ATTACHED`, `NOT_ATTACHED`, `NOT_APPLICABLE`), `category`, `area`, `from`, `to`, `page`, `limit`  
**Sort:** `submittedAt`, `businessName`

**Response:** List envelope. Each item uses the object in 17.2.

### 17.2 Get Onboarding
**Method:** `GET`  
**URL:** `/onboarding/{applicationId}`  
**Authorization:** Bearer token  
**Permission:** `onboarding:read`

**Response:**
```json
{
  "success": true,
  "data": {
    "applicationId": "onb_0021",
    "businessName": "Chai Buddy Kukatpally",
    "category": "CHAIN",
    "area": "Kukatpally",
    "contact": { "name": "Suresh Rao", "phone": "+919876543210" },
    "mobileVerified": true,
    "gstStatus": "ATTACHED",
    "documentsComplete": false,
    "status": "PENDING_REVIEW",
    "submittedAt": "2026-11-01T04:00:00Z",
    "createdAt": "2026-11-01T04:00:00Z",
    "version": 1
  }
}
```

### 17.3 Approve Onboarding
**Method:** `POST`  
**URL:** `/onboarding/{applicationId}/approve`  
**Authorization:** Bearer token  
**Permission:** `onboarding:approve`

**Headers:** `Idempotency-Key`

**Request:**
```json
{ "assignedRmId": "usr_021", "customerCategory": "CHAIN", "note": "Documents checked" }
```

**Response:** `200` — links or creates the customer and an outlet draft. It does not create credit. `assignedRmId` must be an active `RELATIONSHIP_MANAGER`. A second approve returns `409 ALREADY_APPROVED`.

### 17.4 Reject Onboarding
**Method:** `POST`  
**URL:** `/onboarding/{applicationId}/reject`  
**Authorization:** Bearer token  
**Permission:** `onboarding:reject`

**Request:**
```json
{ "reason": "DOCUMENTS_UNVERIFIABLE", "note": "GSTIN does not match business name" }
```

**Response:** `200` — `status` `REJECTED`. `reason` is `DOCUMENTS_UNVERIFIABLE`, `OUT_OF_SERVICE_AREA`, `DUPLICATE`, `POLICY`, or `OTHER`. The record is kept.

### 17.5 Request Onboarding Info
**Method:** `POST`  
**URL:** `/onboarding/{applicationId}/request-info`  
**Authorization:** Bearer token  
**Permission:** `onboarding:approve`

**Request:**
```json
{ "note": "Please upload the FSSAI certificate" }
```

**Response:** `200` — `status` `INFO_REQUESTED`.

## 18. Leads

**Stage:** `NEW → DISCOVERY → PROPOSAL → WON | LOST`. A backward move needs `leads:update` and a note. RM activities, proposals, and claim are in the Relationship Manager file.

### 18.1 List Leads
**Method:** `GET`  
**URL:** `/leads`  
**Authorization:** Bearer token  
**Permission:** `leads:read`

**Query:** `q`, `stage`, `rmId`, `area`, `from`, `to`, `page`, `limit`  
**Sort:** `createdAt`, `updatedAt`, `stage`

**Response:** List envelope. Phone is masked unless the caller has `leads:read-pii`.

### 18.2 Create Lead
**Method:** `POST`  
**URL:** `/leads`  
**Authorization:** Bearer token  
**Permission:** `leads:create`

**Request:** `name`, `phone`, `email`, `productInterest`, `area`, `notes`.

**Response:** `201` — lead with `stage` `NEW`.

### 18.3 Get Lead
**Method:** `GET`  
**URL:** `/leads/{leadId}`  
**Authorization:** Bearer token  
**Permission:** `leads:read`

**Response:**
```json
{
  "success": true,
  "data": {
    "leadId": "lead_0031",
    "name": "Ayesha Khan",
    "phone": "+919876543210",
    "email": "ayesha@example.com",
    "productInterest": "Starter Kit — bakery",
    "area": "Gachibowli",
    "assignedRm": { "userId": "usr_021", "name": "Kavya Reddy" },
    "stage": "DISCOVERY",
    "nextFollowUpAt": "2026-11-05T06:00:00Z",
    "notes": "Wants a site visit next week",
    "createdAt": "2026-10-30T05:00:00Z",
    "updatedAt": "2026-11-01T05:00:00Z",
    "version": 2
  }
}
```

### 18.4 Update Lead
**Method:** `PATCH`  
**URL:** `/leads/{leadId}`  
**Authorization:** Bearer token  
**Permission:** `leads:update`

**Headers:** `If-Match`

**Response:** `200`. Platform may edit the lead fields. RM may change only `stage`, `nextFollowUpAt`, and `notes`.

### 18.5 Assign Lead
**Method:** `POST`  
**URL:** `/leads/{leadId}/assign`  
**Authorization:** Bearer token  
**Permission:** `leads:assign`

**Request:**
```json
{ "rmId": "usr_021", "note": "Area match" }
```

**Response:** `200` — `assignedRm` updated. The RM must be active. History stays in the audit log.

## 19. Sellers

The prototype panel has no fields. Do not build this module until seller type, commission, and payout rules are agreed.

### 19.1 List Sellers
**Method:** `GET`  
**URL:** `/sellers`  
**Authorization:** Bearer token  
**Permission:** `sellers:read`

**Response:** List of provisional sellers: `sellerId`, `name`, `type` (`VENDOR`, `PARTNER`, `FRANCHISE`), `contact`, `gstin`, `commissionPct`, `payoutCycle`, `status` (`ACTIVE`, `SUSPENDED`, `OFFBOARDED`), `createdAt`.

### 19.2 Get Seller
**Method:** `GET`  
**URL:** `/sellers/{sellerId}`  
**Authorization:** Bearer token  
**Permission:** `sellers:read`

**Response:** The seller object.

### 19.3 Update Seller
**Method:** `PATCH`  
**URL:** `/sellers/{sellerId}`  
**Authorization:** Bearer token  
**Permission:** `sellers:update`

**Response:** `200`.

### 19.4 Update Seller Status
**Method:** `PATCH`  
**URL:** `/sellers/{sellerId}/status`  
**Authorization:** Bearer token  
**Permission:** `sellers:update`

**Response:** `200`.

### 19.5 List Seller Settlements
**Method:** `GET`  
**URL:** `/sellers/{sellerId}/settlements`  
**Authorization:** Bearer token  
**Permission:** `sellers:read`

**Response:** Payout history. Money movement stays with Finance.

## 20. Price Lists and Offers

Only one `ACTIVE` global list may overlap a location, currency, and date. Overlap returns `409 PRICE_LIST_OVERLAP`. Resolution order to confirm: customer, then category, then location, then global.

**Price-list status:** `DRAFT`, `ACTIVE`, `EXPIRED`  
**Offer status:** `DRAFT`, `SCHEDULED`, `LIVE`, `PAUSED`, `EXPIRED`  
**Discount type:** `PERCENTAGE`, `FLAT`

### 20.1 List Price Lists
**Method:** `GET`  
**URL:** `/price-lists`  
**Authorization:** Bearer token  
**Permission:** `price-lists:read`

**Response:** List of `name`, `scope` (`GLOBAL`, `CUSTOMER`, `CUSTOMER_CATEGORY`, `LOCATION`), scope id, `currency`, `validFrom`, `validTo`, `status`, and `items` (`productId`, `price`, `minQty`).

### 20.2 Create Price List
**Method:** `POST`  
**URL:** `/price-lists`  
**Authorization:** Bearer token  
**Permission:** `price-lists:create`

**Response:** `201`.

### 20.3 Get Price List
**Method:** `GET`  
**URL:** `/price-lists/{priceListId}`  
**Authorization:** Bearer token  
**Permission:** `price-lists:read`

**Response:** The price list including items.

### 20.4 Update Price List
**Method:** `PATCH`  
**URL:** `/price-lists/{priceListId}`  
**Authorization:** Bearer token  
**Permission:** `price-lists:update`

**Response:** `200`.

### 20.5 Delete Price List
**Method:** `DELETE`  
**URL:** `/price-lists/{priceListId}`  
**Authorization:** Bearer token  
**Permission:** `price-lists:delete`

**Response:** `200`.

### 20.6 List Offers
**Method:** `GET`  
**URL:** `/offers`  
**Authorization:** Bearer token  
**Permission:** `offers:read`

**Query:** `q`, `status`, `categoryId`, `placement`, `activeNow`, `page`, `limit`  
**Sort:** `startsAt`, `createdAt`, `priority`

**Response:** List envelope, including drafts. The customer `GET /offers` stays the public read.

### 20.7 Create Offer
**Method:** `POST`  
**URL:** `/offers`  
**Authorization:** Bearer token  
**Permission:** `offers:create`

**Response:** `201` — offer `DRAFT`. Percentage value is greater than 0 and at most 100, and needs `maxDiscount`. `endsAt` must be after `startsAt`.

### 20.8 Get Offer
**Method:** `GET`  
**URL:** `/offers/{offerId}`  
**Authorization:** Bearer token  
**Permission:** `offers:read`

**Response:**
```json
{
  "success": true,
  "data": {
    "offerId": "offer_012",
    "title": "10% off dairy",
    "description": "Valid on orders above ₹2,000",
    "imageUrl": "https://cdn.example.com/o/dairy.webp",
    "discountType": "PERCENTAGE",
    "discountValue": 10,
    "maxDiscount": 500.0,
    "minOrderValue": 2000.0,
    "categoryIds": ["cat_dairy"],
    "placement": "HOME",
    "startsAt": "2026-11-01T00:00:00Z",
    "endsAt": "2026-11-30T23:59:59Z",
    "status": "SCHEDULED",
    "priority": 10,
    "createdAt": "2026-10-25T05:00:00Z",
    "updatedAt": "2026-10-25T05:00:00Z",
    "version": 1
  }
}
```

### 20.9 Update Offer
**Method:** `PATCH`  
**URL:** `/offers/{offerId}`  
**Authorization:** Bearer token  
**Permission:** `offers:update`

**Response:** `200`.

### 20.10 Delete Offer
**Method:** `DELETE`  
**URL:** `/offers/{offerId}`  
**Authorization:** Bearer token  
**Permission:** `offers:delete`

**Response:** `200` for a `DRAFT` only. Otherwise pause or expire it.

## 21. Policies

Banners are in Technical Admin. This section is policy pages only. The customer app reads `GET /policies/cancellation` from this content.

**Keys:** `CANCELLATION`, `RETURNS`, `PRIVACY`, `TERMS`, `DELIVERY`

### 21.1 List Policies
**Method:** `GET`  
**URL:** `/cms/policies`  
**Authorization:** Bearer token  
**Permission:** `cms:read`

**Response:** List of policy objects.

### 21.2 Update Policy
**Method:** `PATCH`  
**URL:** `/cms/policies/{policyKey}`  
**Authorization:** Bearer token  
**Permission:** `cms:write`

**Headers:** `If-Match`

**Request:**
```json
{ "title": "Cancellation policy", "bodyMarkdown": "Orders can be cancelled until they are out for delivery." }
```

**Response:**
```json
{
  "success": true,
  "data": {
    "policyKey": "CANCELLATION",
    "title": "Cancellation policy",
    "bodyMarkdown": "Orders can be cancelled until they are out for delivery.",
    "version": 4,
    "updatedBy": { "userId": "usr_001", "name": "Rahul Sharma" },
    "updatedAt": "2026-10-30T05:00:00Z"
  }
}
```

Markdown is sanitized. Script tags are rejected. The change is live immediately and versioned.

## 22. Reports

Finance report keys are in the Finance file. Platform keys in the prototype are `ORDER_TO_DELIVERY` and `INVENTORY_MATCH`.

### 22.1 List Reports
**Method:** `GET`  
**URL:** `/reports`  
**Authorization:** Bearer token  
**Permission:** `reports:read`

**Response:**
```json
{
  "success": true,
  "data": [
    { "reportKey": "ORDER_TO_DELIVERY", "name": "Order to delivery", "description": "Placed to delivered timings by location", "supportedFormats": ["JSON", "CSV", "XLSX"], "permission": "reports:read" },
    { "reportKey": "INVENTORY_MATCH", "name": "Inventory match", "description": "Physical count vs system balance", "supportedFormats": ["JSON", "CSV"], "permission": "reports:read" }
  ]
}
```

### 22.2 Run Report
**Method:** `GET`  
**URL:** `/reports/{reportKey}`  
**Authorization:** Bearer token  
**Permission:** `reports:read`

**Query:** `from`, `to`, `locationId`, `page`, `limit`, `sortBy`, `sortOrder`, plus report-specific filters

**Response:** List envelope of rows and `meta.columns`.

### 22.3 Export Report
**Method:** `POST`  
**URL:** `/reports/{reportKey}/exports`  
**Authorization:** Bearer token  
**Permission:** `reports:export`

**Headers:** `Idempotency-Key`

**Request:**
```json
{ "format": "XLSX", "filters": { "from": "2026-10-01", "to": "2026-10-31", "locationId": "loc_hyd" } }
```

**Response:** `202`
```json
{
  "success": true,
  "data": { "jobId": "exp_01", "status": "QUEUED", "createdAt": "2026-11-02T05:10:00Z" }
}
```

Over 100,000 rows returns `422 EXPORT_TOO_LARGE`.

### 22.4 Get Export Job
**Method:** `GET`  
**URL:** `/exports/{jobId}`  
**Authorization:** Bearer token  
**Permission:** `reports:read`

**Response:** `status` `QUEUED`, `RUNNING`, `COMPLETED`, `FAILED`, or `EXPIRED`, plus `rowCount`, `downloadUrl`, `expiresAt`, and `error`.

## 23. Users and Roles

The request and response bodies are in Technical Admin, Users and Roles. Platform uses the same URLs.

### 23.1 List Users
**Method:** `GET`  
**URL:** `/users`  
**Authorization:** Bearer token  
**Permission:** `users:read`

**Response:** The user list in Technical Admin, 8.1.

### 23.2 Invite User
**Method:** `POST`  
**URL:** `/users/invite`  
**Authorization:** Bearer token  
**Permission:** `users:invite`

**Headers:** `Idempotency-Key`

**Request:** `name`, `email`, `phone`, `roleId`, `locationIds`, `sendWelcomeEmail`.

**Response:** `201` — user `INVITED`. Body is in Technical Admin, 8.2.

### 23.3 Get User
**Method:** `GET`  
**URL:** `/users/{userId}`  
**Authorization:** Bearer token  
**Permission:** `users:read`

**Response:** The user object in Technical Admin, 8.3.

### 23.4 Update User
**Method:** `PATCH`  
**URL:** `/users/{userId}`  
**Authorization:** Bearer token  
**Permission:** `users:update`

**Headers:** `If-Match`. Promotion to `PLATFORM_ADMIN` also needs `X-MFA-Assertion`.

**Response:** `200` — the updated user. Body is in Technical Admin, 8.4.

### 23.5 Activate User
**Method:** `POST`  
**URL:** `/users/{userId}/activate`  
**Authorization:** Bearer token  
**Permission:** `users:update`

**Response:** `200` — user `ACTIVE`. No request body. See Technical Admin, 8.5.

### 23.6 Deactivate User
**Method:** `POST`  
**URL:** `/users/{userId}/deactivate`  
**Authorization:** Bearer token  
**Permission:** `users:deactivate`

**Request:** `reason`, `note`, `reassignToUserId`.

**Response:** `200` — user `DEACTIVATED`. Body is in Technical Admin, 8.6.

### 23.7 List Roles
**Method:** `GET`  
**URL:** `/roles`  
**Authorization:** Bearer token  
**Permission:** `roles:read`

**Response:** The role catalogue in Technical Admin, 8.7.

### 23.8 Get Role
**Method:** `GET`  
**URL:** `/roles/{roleId}`  
**Authorization:** Bearer token  
**Permission:** `roles:read`

**Response:** The role plus `permissions` and `description`. See Technical Admin, 8.8.

### 23.9 Replace Role Permissions
**Method:** `PUT`  
**URL:** `/roles/{roleId}/permissions`  
**Authorization:** Bearer token  
**Permission:** `roles:assign`

**Headers:** `If-Match`, `X-MFA-Assertion`

**Request:** `{ "permissions": ["cms:read"] }`

**Response:** `200` — the role with the replaced set. See Technical Admin, 8.9.

**Notes:**
- Built-in roles cannot be edited.
- A user cannot deactivate or demote themselves.
- The last active `PLATFORM_ADMIN` returns `409 LAST_SUPER_ADMIN`.

## 24. Settings and Locations

### 24.1 Get General Settings
**Method:** `GET`  
**URL:** `/settings/general`  
**Authorization:** Bearer token  
**Permission:** `settings:read`

**Response:**
```json
{
  "success": true,
  "data": {
    "businessName": "KitchenX",
    "supportEmail": "care@kitchenx.example",
    "supportPhone": { "countryCode": "+91", "number": "9876543210" },
    "address": "12A, Food Hub, Nehru Place, New Delhi 110019",
    "timezone": "Asia/Kolkata",
    "currency": "INR",
    "locale": "en-IN",
    "logoUrl": "https://cdn.example.com/brand/logo.webp",
    "toggles": {
      "multiLocation": true,
      "customerSignup": true,
      "supplierPortal": true,
      "allowCodOrders": true,
      "lowStockNotifications": true,
      "orderEmailNotifications": true,
      "marketingEmails": false
    },
    "version": 18,
    "updatedAt": "2026-10-31T05:00:00Z"
  }
}
```

### 24.2 Update General Settings
**Method:** `PATCH`  
**URL:** `/settings/general`  
**Authorization:** Bearer token  
**Permission:** `settings:update`

**Headers:** `If-Match`. `currency` and `timezone` also need `X-MFA-Assertion`.

**Response:** `200`. Unknown toggles return `400`. `allowCodOrders` affects new orders only. `timezone` is an IANA name.

### 24.3 Get Business Settings
**Method:** `GET`  
**URL:** `/settings/business`  
**Authorization:** Bearer token  
**Permission:** `settings:read`

**Response:**
```json
{
  "success": true,
  "data": {
    "legalName": "KitchenX Foods Pvt Ltd",
    "gstin": "07AABCK9999P1Z5",
    "invoicePrefix": "KX-",
    "invoiceSequence": 8810,
    "brandColor": "#FF4F18",
    "supportHours": "09:00-21:00",
    "version": 6
  }
}
```

### 24.4 Update Business Settings
**Method:** `PATCH`  
**URL:** `/settings/business`  
**Authorization:** Bearer token  
**Permission:** `settings:update`

**Headers:** `If-Match`, `X-MFA-Assertion`

**Response:** `200`. `invoicePrefix` is 2–10 characters, `[A-Z0-9-]`, and does not renumber old invoices. `invoiceSequence` is server-controlled.

### 24.5 List Locations
**Method:** `GET`  
**URL:** `/locations`  
**Authorization:** Bearer token  
**Permission:** `locations:read`

**Response:** List envelope. Each item uses the location object in 24.7.

### 24.6 Create Location
**Method:** `POST`  
**URL:** `/locations`  
**Authorization:** Bearer token  
**Permission:** `locations:create`

**Response:** `201`. `code` is unique and immutable.

### 24.7 Get Location
**Method:** `GET`  
**URL:** `/locations/{locationId}`  
**Authorization:** Bearer token  
**Permission:** `locations:read`

**Response:**
```json
{
  "success": true,
  "data": {
    "locationId": "loc_hyd",
    "name": "Hyderabad",
    "code": "HYD",
    "type": "DARK_STORE",
    "address": "Plot 14, Kukatpally, Hyderabad 500072",
    "city": "Hyderabad",
    "state": "Telangana",
    "pincode": "500072",
    "timezone": "Asia/Kolkata",
    "active": true,
    "createdAt": "2026-03-01T05:00:00Z",
    "updatedAt": "2026-09-10T05:00:00Z",
    "version": 3
  }
}
```

Pincode serviceability is a delivery zone, not a location.

### 24.8 Update Location
**Method:** `PATCH`  
**URL:** `/locations/{locationId}`  
**Authorization:** Bearer token  
**Permission:** `locations:update`

**Headers:** `If-Match`

**Response:** `200` — the location object from 24.7.

### 24.9 Deactivate Location
**Method:** `DELETE`  
**URL:** `/locations/{locationId}`  
**Authorization:** Bearer token  
**Permission:** `locations:delete`

**Response:** `200` — soft deactivate. Open orders, open POs, or active staff return `409 LOCATION_IN_USE`.

## 25. Audit Logs

### 25.1 List Audit Logs
**Method:** `GET`  
**URL:** `/audit-logs`  
**Authorization:** Bearer token  
**Permission:** `audit:read`

**Query:** `actorId`, `action`, `resourceType`, `resourceId`, `outcome` (`SUCCESS`, `FAILURE`), `from`, `to`, `requestId`, `cursor`, `limit`

**Response:** Newest first. `data.items` and `data.nextCursor`. No page number. No update or delete.

### 25.2 Get Audit Log
**Method:** `GET`  
**URL:** `/audit-logs/{auditId}`  
**Authorization:** Bearer token  
**Permission:** `audit:read`

**Response:**
```json
{
  "success": true,
  "data": {
    "auditId": "aud_01",
    "actor": { "userId": "usr_001", "name": "Rahul Sharma", "role": "PLATFORM_ADMIN" },
    "action": "PRODUCT_PRICE_UPDATED",
    "resourceType": "PRODUCT",
    "resourceId": "prod_001",
    "before": { "sellingPrice": 305.55 },
    "after": { "sellingPrice": 309.0 },
    "outcome": "SUCCESS",
    "requestId": "req_01J8Z4K2M9",
    "ip": "203.0.113.10",
    "userAgent": "Mozilla/5.0",
    "createdAt": "2026-11-01T10:12:00Z"
  }
}
```

`before` and `after` never include passwords, tokens, full bank accounts, PAN, or document contents.

## 26. Service Health

Writes are in Technical Admin. Platform may read.

### 26.1 Get Service Health
**Method:** `GET`  
**URL:** `/service-health`  
**Authorization:** Bearer token  
**Permission:** `integrations:read`

**Response:** The health object in Technical Admin, Service Health.

### 26.2 List Incidents
**Method:** `GET`  
**URL:** `/incidents`  
**Authorization:** Bearer token  
**Permission:** `integrations:read`

**Response:** The incident list in Technical Admin, Incidents.

### 26.3 Get Incident
**Method:** `GET`  
**URL:** `/incidents/{incidentId}`  
**Authorization:** Bearer token  
**Permission:** `integrations:read`

**Response:** The incident object in Technical Admin, Incidents.

## 27. Error Response

**Example:**
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "The request contains invalid data",
    "details": [
      { "field": "sellingPrice", "code": "INVALID_VALUE", "message": "Must be greater than 0" }
    ],
    "requestId": "req_01J8Z4K2M9"
  }
}
```

| Status | Code | When |
|---|---|---|
| 400 | `VALIDATION_ERROR`, `INVALID_QUERY_PARAMETER` | Bad body or query |
| 401 | `UNAUTHENTICATED`, `TOKEN_EXPIRED`, `INVALID_CREDENTIALS` | Auth |
| 403 | `FORBIDDEN`, `OUT_OF_SCOPE`, `MFA_REQUIRED`, `ACCOUNT_DISABLED` | Permission, location, or step-up |
| 404 | `NOT_FOUND` | Missing resource. Do not use 404 to hide a resource from a permitted admin |
| 409 | `CONFLICT`, `DUPLICATE`, `INVALID_STATE_TRANSITION`, `VERSION_MISMATCH`, `IDEMPOTENCY_KEY_REUSED` | Conflict |
| 422 | `BUSINESS_RULE_VIOLATION`, `OVER_RECEIPT`, `INSUFFICIENT_STOCK`, `TOTAL_MISMATCH`, `EXPORT_TOO_LARGE` | Rule failed |
| 423 | `ACCOUNT_LOCKED` | Login lockout |
| 428 | `PRECONDITION_REQUIRED` | Missing `If-Match` |
| 429 | `RATE_LIMITED` | Throttled. `Retry-After` is set |
| 500 | `INTERNAL_ERROR` | Unexpected |

## 28. Reference

#### Shared response

A single resource is `{ "success": true, "data": {} }`. A mutation of a versioned resource also returns `meta.etag`.

A list is:

```json
{
  "success": true,
  "data": {
    "items": [],
    "page": 1,
    "limit": 20,
    "totalItems": 0,
    "totalPages": 0,
    "hasNext": false,
    "hasPrev": false
  }
}
```

- `page` starts at 1. `limit` defaults to 20 and maxes at 100.
- `totalItems` is the filtered count, before the page slice.
- Filter, then sort, then paginate. An empty list is `200`, not `404`.
- Sort always adds `id` as a tie-break.
- `page`, `limit`, `q` (1–120 characters), `sortBy`, `sortOrder` (`asc` or `desc`), `from`, `to` (at most 366 days), and `locationId` follow this contract on every list that documents them.
- An unknown query parameter returns `400 INVALID_QUERY_PARAMETER`.
- Audit logs and staff notifications use `cursor` and `nextCursor` instead of `page`.

#### Fields

- IDs are opaque and prefixed: `prod_`, `cat_`, `brand_`, `addon_`, `sup_`, `po_`, `inv_`, `grn_`, `ord_`, `shp_`, `ret_`, `cus_`, `out_`, `cred_`, `lead_`, `usr_`, `role_`, `zone_`, `ban_`, `notif_`, `pay_`, `set_`, `aud_`.
- Money is decimal rupees, 2 decimal places, with `"currency": "INR"`.
- Dates in responses are ISO 8601 UTC. Display uses `Asia/Kolkata`.
- Enums are `UPPER_SNAKE_CASE`. Booleans are real booleans.
- Plain text is trimmed. HTML is rejected except in sanitized CMS fields.

#### Idempotency, versions, audit, limits

`Idempotency-Key` is required on create order, create PO, goods-receipt confirm, stock adjustment, credit submit, refund, payment reconcile, COD match, user invite, and export. The same key and body returns the original response. The same key and a different body returns `409 IDEMPOTENCY_KEY_REUSED`.

`If-Match` is required on product price, inventory adjustment, credit decision, settings, payment reconciliation, and role change. Missing returns `428`. Stale returns `409 VERSION_MISMATCH`.

Every mutation writes an append-only audit record: actor, role, action, resource, before, after, IP, user agent, request id, and time.

| Scope | Limit |
|---|---|
| Login | 5 failures / 15 min / account |
| Reads | 600 requests / minute / user |
| Writes | 120 requests / minute / user |
| Exports | 10 concurrent jobs / admin, 3 / finance user |

High-risk permissions that need `X-MFA-Assertion`: `refunds:release`, `payments:reconcile`, `payments:match-cod`, `credit-notes:approve`, `credit-cases:decide`, `roles:assign`, `integrations:update`, `settings:update`.

`*:read` never implies a write. `orders:update` does not imply `orders:cancel`.

#### Permissions

```
products:read/create/update/delete
orders:read/create/update/cancel
returns:read/resolve
payments, settlements, refunds, credit notes — Finance file
credit-applications:read/visit/submit/reject
users, roles, cms, zones, notifications, integrations — Technical file
reports:read/export
audit:read
dashboard:read
```

The same `resource:action` pattern covers categories, brands, menu add-ons, suppliers, purchase orders, inventory, goods receipts, shipments, delivery partners, customers, outlets, onboarding, leads, sellers, price lists, offers, and locations. Named actions such as `purchase-orders:approve` are separate permissions.

#### Cases to test

| Case | Expected |
|---|---|
| Unknown query or sort field | `400 INVALID_QUERY_PARAMETER` |
| `limit=101` | `400 VALIDATION_ERROR` |
| Page past the end | `200` with empty `items` |
| Duplicate SKU, GSTIN, or PO number | `409 DUPLICATE` |
| Product with an inactive category | `422 BUSINESS_RULE_VIOLATION` |
| Confirm a GRN over the remaining quantity | `422 OVER_RECEIPT` |
| Cancel an order that is out for delivery | `409 INVALID_STATE_TRANSITION` |
| Send a credit case before the visit is done | `409 INVALID_STATE_TRANSITION` |
| Stale `If-Match` | `409 VERSION_MISMATCH` |
| Same idempotency key, different body | `409 IDEMPOTENCY_KEY_REUSED` |
| Finance user calls `POST /products` | `403 FORBIDDEN` |
| Technical user reads orders | `403 FORBIDDEN` |
| Location outside the token | `403 OUT_OF_SCOPE` |
| Export over the row cap | `422 EXPORT_TOO_LARGE` |
| Deactivate the last super admin | `409 LAST_SUPER_ADMIN` |

#### Open decisions

1. Do not implement sellers until type, commission, and payout are agreed.
2. Confirm price-list precedence before orders use it.
3. Tax rates are assumed to come from HSN or category on the server.
4. Store money as integer paise or decimal, and use that choice in the customer API too.
5. Decide whether a seller is the same record as a supplier.
6. Proposed audit retention is 7 years for finance and 2 years for operations.
7. Customer return creation is not in parts 1–3. Decide whether returns start in the app or with support and admin.
8. PO self-approval is controlled by `settings.procurement.segregationOfDuties`. The proposed default is that the creator cannot approve.
