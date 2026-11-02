# KitchenX Admin — Warehouse Supervisor API

**Base URL:** `{origin}/api/v1/admin`

The supervisor runs one hub for a shift. Paths below are relative to the base URL. Private calls use a staff Bearer token. When the token has more than one location, send `X-Location-Id`. A location outside the token returns `403 OUT_OF_SCOPE`.

Purchase orders, goods receipts, inventory, orders, and shipments are in Platform Admin. Approvals, bins, expiry, and routes are in the Warehouse Manager file. This file is floor execution: receiving, picking, packing, walk-in sales, and stock counts.

## 1. Dashboard

### 1.1 Get Warehouse Dashboard
**Method:** `GET`  
**URL:** `/warehouse/dashboard`  
**Authorization:** Bearer token  
**Permission:** `dashboard:read`

**Query:** `locationId` (optional when the token has one location), `date` (default today in `Asia/Kolkata`)

**Response:**
```json
{
  "success": true,
  "data": {
    "generatedAt": "2026-11-02T05:00:00Z",
    "location": { "locationId": "loc_hyd", "name": "Hyderabad", "code": "HYD" },
    "shift": {
      "shiftId": "shf_20261102_morning",
      "name": "Morning",
      "startsAt": "2026-11-02T00:30:00Z",
      "endsAt": "2026-11-02T09:30:00Z",
      "supervisor": { "userId": "usr_031", "name": "Suresh Rao" }
    },
    "kpis": {
      "openPickLists": { "value": 18, "unit": "LISTS" },
      "readyToDispatch": { "value": 11, "unit": "ORDERS" },
      "receiptsPending": { "value": 4, "unit": "GRNS" },
      "walkInSalesToday": { "value": 3, "unit": "SALES" }
    },
    "queues": { "picking": 18, "packing": 7, "staged": 11, "awaitingHandover": 4, "blocked": 1 },
    "dock": [
      {
        "dockId": "dock_2",
        "name": "Dock 2",
        "status": "OCCUPIED",
        "purchaseOrder": { "purchaseOrderId": "po_2041", "poNumber": "PO-2041" },
        "supplierName": "Fresh Farms",
        "eta": "2026-11-02T05:10:00Z"
      }
    ],
    "exceptions": { "shortPicks": 1, "damagedInbound": 0, "missingBarcode": 2, "blockedPackTasks": 1 },
    "lowStock": [
      { "productId": "prod_001", "name": "Amul Butter 500 g", "sku": "AMB500", "binCode": "C-04", "availableQty": 4, "reorderLevel": 12, "unit": "PACKET" }
    ]
  }
}
```

**Notes:**
- Counts are for the caller's location and the selected date.
- `walkInSalesToday` counts completed offline sales.
- `readyToDispatch` is packed or staged and not blocked. `blocked` is inside the packing queue.
- This is a read model. Re-check the resource version on the action call. Cache at most 30 seconds per location.

## 2. Receiving

Against a purchase order, use the goods-receipt calls in section 3. Without an approved PO, use a manual inward. A manual inward does not receive a PO.

### 2.1 Get Receiving Worklist
**Method:** `GET`  
**URL:** `/warehouse/receiving/worklist`  
**Authorization:** Bearer token  
**Permission:** `goods-receipts:read` and `purchase-orders:read`

**Query:** `date` (default today), `status` (`EXPECTED`, `AT_DOCK`, `RECEIVING`, `COMPLETED`, `CANCELLED`), `dockId`, `supplierId`, `q`, `page`, `limit`

**Response:**
```json
{
  "success": true,
  "data": {
    "items": [
      {
        "purchaseOrderId": "po_2041",
        "poNumber": "PO-2041",
        "supplier": { "supplierId": "sup_004", "name": "Fresh Farms" },
        "expectedAt": "2026-11-02T05:10:00Z",
        "dock": { "dockId": "dock_2", "name": "Dock 2" },
        "lineCount": 6,
        "totalQuantity": 240,
        "status": "AT_DOCK",
        "goodsReceipt": null
      }
    ],
    "page": 1,
    "limit": 20,
    "totalItems": 4,
    "totalPages": 1,
    "hasNext": false,
    "hasPrev": false
  }
}
```

**Notes:**
- Sort is `expectedAt` ascending, then `poNumber`.
- `totalQuantity` is the quantity still expected.

### 2.2 Scan Code
**Method:** `GET`  
**URL:** `/warehouse/scan`  
**Authorization:** Bearer token  
**Permission:** One of `goods-receipts:read`, `picking:read`, `packing:read`, `inventory:read`, `orders:read`

**Query:** `code` (1–64 characters). Exact barcode or QR. Text search is section 10.

**Response:** `200` for a purchase order
```json
{
  "success": true,
  "data": {
    "code": "PO-2041",
    "type": "PURCHASE_ORDER",
    "suggestedAction": "RECEIVE",
    "purchaseOrder": {
      "purchaseOrderId": "po_2041",
      "poNumber": "PO-2041",
      "status": "PARTIALLY_RECEIVED",
      "supplier": { "supplierId": "sup_004", "name": "Fresh Farms" }
    },
    "openLines": [
      {
        "purchaseOrderLineId": "pol_01",
        "productId": "prod_010",
        "name": "Roma tomato 10kg",
        "sku": "TOM10",
        "orderedQty": 40,
        "previouslyReceivedQty": 0,
        "remainingQty": 40,
        "unit": "CASE",
        "suggestedBin": { "binId": "bin_a_12", "code": "A-12" }
      }
    ]
  }
}
```

**Response:** `200` for a carton
```json
{
  "success": true,
  "data": {
    "code": "SSCC-890123456789012345",
    "type": "CARTON",
    "suggestedAction": "ADD_RECEIPT_LINE",
    "carton": {
      "cartonId": "ctn_7781",
      "purchaseOrderId": "po_2041",
      "productId": "prod_010",
      "sku": "TOM10",
      "quantity": 10,
      "unit": "CASE",
      "batchNumber": "TOM-2026-1102",
      "expiresAt": "2026-11-09",
      "alreadyReceived": false
    },
    "openReceipt": { "receiptId": "grn_0043", "status": "DRAFT" }
  }
}
```

**Notes:**
- Codes: product SKU or barcode, PO number, carton or SSCC, bin code, order number, pick-list number.
- Unknown code returns `404 SCAN_NOT_FOUND`. More than one match returns `409 SCAN_AMBIGUOUS` with at most 5 `candidates`.
- A carton already received sets `alreadyReceived: true`. Adding it again returns `409 CARTON_ALREADY_RECEIVED`.
- A product returns `type` `PRODUCT` and suggested bins. A bin returns `type` `BIN`.
- Scan does not create a line or move stock.

### 2.3 List Manual Inwards
**Method:** `GET`  
**URL:** `/warehouse/manual-inwards`  
**Authorization:** Bearer token  
**Permission:** `manual-inwards:read`

**Query:** `status`, `supplierId`, `from`, `to`, `q`, `page`, `limit`  
**Sort:** `createdAt` descending

**Response:** List envelope. Each item uses the manual-inward object in 2.4.

**Status:** `PENDING_APPROVAL`, `SENT_BACK`, `INVESTIGATING`, `COMPLETED`, `CANCELLED`, `REJECTED`. The supervisor can edit only `SENT_BACK`.

### 2.4 Create Manual Inward
**Method:** `POST`  
**URL:** `/warehouse/manual-inwards`  
**Authorization:** Bearer token  
**Permission:** `manual-inwards:create`

**Headers:** `Idempotency-Key`

**Request:**
```json
{
  "supplierId": "sup_012",
  "invoiceNumber": "INV-8891",
  "invoiceDate": "2026-11-02",
  "receivedAt": "2026-11-02T05:40:00Z",
  "dockId": "dock_2",
  "reason": "NO_PO",
  "notes": "Emergency basmati purchase for today's orders",
  "items": [
    {
      "productId": "prod_045",
      "quantity": 60,
      "unitCost": 810.0,
      "binId": "bin_a_12",
      "batchNumber": "BAS-2026-1102",
      "expiresAt": "2027-05-01"
    }
  ],
  "attachments": ["upl_61"]
}
```

**Response:** `201` above the auto-approval threshold
```json
{
  "success": true,
  "data": {
    "manualInwardId": "mi_0031",
    "referenceNumber": "MI-2026-0031",
    "status": "PENDING_APPROVAL",
    "location": { "locationId": "loc_hyd", "name": "Hyderabad" },
    "supplier": { "supplierId": "sup_012", "name": "Sri Traders" },
    "invoiceNumber": "INV-8891",
    "totalAmount": 48600.0,
    "currency": "INR",
    "autoApproved": false,
    "approvalId": "apv_021",
    "inventoryAdjustments": [],
    "createdBy": { "userId": "usr_031", "name": "Suresh Rao" },
    "createdAt": "2026-11-02T05:40:00Z"
  }
}
```

**Notes:**
- At or below the threshold the same shape returns `status` `COMPLETED`, `autoApproved` true, and one adjustment per line.
- The proposed threshold is ₹25,000 per request and is set per location. The server decides it.
- 1–100 items. `quantity` is greater than 0. `unitCost` is at least 0. The total is computed on the server.
- `reason` is `NO_PO`, `EMERGENCY`, `SUPPLIER_DIRECT`, `OPENING_STOCK`, or `OTHER`. A reason other than `NO_PO` needs a note of 10–500 characters.
- `invoiceNumber` is required for `NO_PO` and `SUPPLIER_DIRECT`, and unique per supplier. A duplicate returns `409 DUPLICATE_INVOICE`.
- A past `expiresAt` returns `422 EXPIRED_STOCK`. A cold product in a non-cold bin returns `422 COLD_CHAIN_VIOLATION`.
- The bin must be `ACTIVE`, in the location, and have capacity. Over capacity returns `422 BIN_CAPACITY_EXCEEDED`.
- Stock posts as `ADJUSTMENT` with `reason` `SUPPLIER_CORRECTION` and `referenceType` `MANUAL_INWARD`. It never changes a PO and never creates a GRN.

### 2.5 Get Manual Inward
**Method:** `GET`  
**URL:** `/warehouse/manual-inwards/{manualInwardId}`  
**Authorization:** Bearer token  
**Permission:** `manual-inwards:read`

**Response:** The object from 2.4 plus items, approval, evidence, and effect.

### 2.6 Update Manual Inward
**Method:** `PATCH`  
**URL:** `/warehouse/manual-inwards/{manualInwardId}`  
**Authorization:** Bearer token  
**Permission:** `manual-inwards:update`

**Headers:** `If-Match`

**Response:** `200`. Allowed only in `SENT_BACK`. Items, supplier, invoice, and notes can change. The server re-prices and re-checks the threshold.

### 2.7 Resubmit Manual Inward
**Method:** `POST`  
**URL:** `/warehouse/manual-inwards/{manualInwardId}/resubmit`  
**Authorization:** Bearer token  
**Permission:** `manual-inwards:update`

**Headers:** `Idempotency-Key`

**Response:** `200` — `SENT_BACK` becomes `PENDING_APPROVAL` with a new `approvalId`. The old approval stays in history.

### 2.8 Cancel Manual Inward
**Method:** `POST`  
**URL:** `/warehouse/manual-inwards/{manualInwardId}/cancel`  
**Authorization:** Bearer token  
**Permission:** `manual-inwards:cancel`

**Request:**
```json
{ "reason": "Entered against the wrong supplier" }
```

**Response:** `200` — `status` `CANCELLED`. Allowed from `PENDING_APPROVAL` or `SENT_BACK`. No stock effect.

## 3. Goods Receipts

These are the Platform goods-receipt calls. For a warehouse caller, `receivedBy` comes from the token.

### 3.1 List Goods Receipts
**Method:** `GET`  
**URL:** `/goods-receipts`  
**Authorization:** Bearer token  
**Permission:** `goods-receipts:read`

**Query:** `locationId`, `status`, `purchaseOrderId`, `page`, `limit`

**Response:** The list in Platform Admin, Goods Receipts.

### 3.2 Create Goods Receipt
**Method:** `POST`  
**URL:** `/goods-receipts`  
**Authorization:** Bearer token  
**Permission:** `goods-receipts:create`

**Headers:** `Idempotency-Key`

**Request:** `purchaseOrderId` and `items[].receivingNowQty`. An optional `binId` on each line is the warehouse putaway target.

**Response:** `201` — draft receipt. Body is in Platform Admin, Goods Receipts.

### 3.3 Get Goods Receipt
**Method:** `GET`  
**URL:** `/goods-receipts/{receiptId}`  
**Authorization:** Bearer token  
**Permission:** `goods-receipts:read`

**Response:** The receipt object in Platform Admin, Goods Receipts.

### 3.4 Update Goods Receipt
**Method:** `PATCH`  
**URL:** `/goods-receipts/{receiptId}`  
**Authorization:** Bearer token  
**Permission:** `goods-receipts:update`

**Headers:** `If-Match`

**Response:** `200`. Drafts only.

### 3.5 Confirm Goods Receipt
**Method:** `POST`  
**URL:** `/goods-receipts/{receiptId}/confirm`  
**Authorization:** Bearer token  
**Permission:** `goods-receipts:confirm`

**Headers:** `Idempotency-Key`

**Response:**
```json
{
  "success": true,
  "data": {
    "receiptId": "grn_0043",
    "referenceNumber": "GRN-2026-0043",
    "status": "CONFIRMED",
    "purchaseOrder": { "purchaseOrderId": "po_2041", "poNumber": "PO-2041", "status": "PARTIALLY_RECEIVED" },
    "movements": [
      { "movementId": "mov_902", "productId": "prod_010", "quantityDelta": 40, "unit": "CASE" }
    ],
    "confirmedAt": "2026-11-02T06:05:00Z"
  }
}
```

**Notes:**
- Over-receipt returns `422 OVER_RECEIPT`. The supervisor does not have `goods-receipts:over-receive`.
- The same idempotency key returns the original result. Without a key, a second confirm returns `409 ALREADY_CONFIRMED`.
- If `binId` is omitted, stock posts to the location receiving bin. Changing a bin after confirm is a manager transfer.
- A damaged carton is a note and an attachment, not a silent accept.

### 3.6 Cancel Goods Receipt
**Method:** `POST`  
**URL:** `/goods-receipts/{receiptId}/cancel`  
**Authorization:** Bearer token  
**Permission:** `goods-receipts:cancel`

**Response:** `200`. Drafts only.

## 4. Pick Lists

The server creates a pick list when an order is `CONFIRMED` or `PROCESSING` and stock is reserved. The supervisor does not create one.

**Status:** `QUEUED`, `PICKING`, `PICKED`, `PICKED_WITH_SHORTAGE`, `CANCELLED`  
**Line status:** `PENDING`, `PICKED`, `SHORT`, `CANCELLED`

```
QUEUED → PICKING → PICKED
                 → PICKED_WITH_SHORTAGE
QUEUED or PICKING → CANCELLED (server or order cancellation only)
```

### 4.1 List Pick Lists
**Method:** `GET`  
**URL:** `/warehouse/pick-lists`  
**Authorization:** Bearer token  
**Permission:** `picking:read`

**Query:** `status` (repeatable), `priority` (`NORMAL`, `EXPRESS`), `routeId`, `assignedToMe`, `q`, `from`, `to`, `page`, `limit`  
**Sort:** `priority`, `createdAt`, `updatedAt`. Default priority descending, then `createdAt` ascending.

**Response:**
```json
{
  "success": true,
  "data": {
    "items": [
      {
        "pickListId": "pick_8821",
        "orderNumber": "ORD-8821",
        "customerName": "Spice Route",
        "lineCount": 14,
        "priority": "EXPRESS",
        "routeName": "KitchenX Route 3",
        "status": "PICKING",
        "assignedTo": { "userId": "usr_031", "name": "Suresh Rao" },
        "createdAt": "2026-11-02T04:12:00Z"
      }
    ],
    "page": 1,
    "limit": 20,
    "totalItems": 18,
    "totalPages": 1,
    "hasNext": false,
    "hasPrev": false
  }
}
```

### 4.2 Get Pick List
**Method:** `GET`  
**URL:** `/warehouse/pick-lists/{pickListId}`  
**Authorization:** Bearer token  
**Permission:** `picking:read`

**Response:**
```json
{
  "success": true,
  "data": {
    "pickListId": "pick_8821",
    "pickListNumber": "PL-8821",
    "order": { "orderId": "ord_8821", "orderNumber": "ORD-8821", "priority": "EXPRESS", "fulfilmentStage": "PICKING" },
    "customer": { "customerId": "cus_007", "name": "Spice Route" },
    "route": { "routeId": "rte_003", "name": "KitchenX Route 3" },
    "status": "PICKING",
    "lineCount": 14,
    "pickedLineCount": 3,
    "assignedTo": { "userId": "usr_031", "name": "Suresh Rao" },
    "claimExpiresAt": "2026-11-02T05:30:00Z",
    "lines": [
      {
        "lineId": "pil_01",
        "orderLineId": "oli_01",
        "product": { "productId": "prod_010", "name": "Roma tomato 10kg", "sku": "TOM10" },
        "bin": { "binId": "bin_a_12", "code": "A-12" },
        "requestedQty": 10,
        "pickedQty": 10,
        "shortQty": 0,
        "unit": "CASE",
        "status": "PICKED"
      }
    ],
    "shortages": [],
    "createdAt": "2026-11-02T04:12:00Z",
    "updatedAt": "2026-11-02T05:02:00Z",
    "version": 4
  }
}
```

Another location returns `403 OUT_OF_SCOPE`. Missing returns `404 NOT_FOUND`.

### 4.3 Start Pick List
**Method:** `POST`  
**URL:** `/warehouse/pick-lists/{pickListId}/start`  
**Authorization:** Bearer token  
**Permission:** `picking:execute`

**Headers:** `Idempotency-Key`, `If-Match`

**Request:**
```json
{ "note": "Starting the express route" }
```

**Response:**
```json
{
  "success": true,
  "data": {
    "pickListId": "pick_8821",
    "status": "PICKING",
    "assignedTo": { "userId": "usr_031", "name": "Suresh Rao" },
    "claimExpiresAt": "2026-11-02T05:30:00Z",
    "version": 5
  },
  "meta": { "etag": "\"5\"" }
}
```

**Notes:**
- A `QUEUED` list is claimed for 30 minutes. Any line activity renews the lease.
- Starting the caller's own claim is idempotent.
- Another user's claim returns `409 PICK_LIST_ALREADY_CLAIMED` with `assignedTo` and `claimExpiresAt`. After the lease, the next caller may take it.
- `PICKED`, `PICKED_WITH_SHORTAGE`, or `CANCELLED` returns `409 INVALID_STATE_TRANSITION`.
- Missing `If-Match` returns `428 PRECONDITION_REQUIRED`. Stale returns `409 VERSION_MISMATCH`.

### 4.4 Pick Line
**Method:** `POST`  
**URL:** `/warehouse/pick-lists/{pickListId}/lines/{lineId}/pick`  
**Authorization:** Bearer token  
**Permission:** `picking:execute`

**Headers:** `Idempotency-Key`, `If-Match`

**Request:**
```json
{
  "pickedQty": 8,
  "shortQty": 0,
  "scanCode": "TOM10",
  "binId": "bin_a_12",
  "note": null
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "pickListId": "pick_8821",
    "lineId": "pil_02",
    "pickedQty": 8,
    "shortQty": 0,
    "status": "PICKED",
    "lineStatus": "PICKED",
    "pickedLineCount": 4,
    "version": 6
  },
  "meta": { "etag": "\"6\"" }
}
```

**Notes:**
- `pickedQty + shortQty` must equal `requestedQty`. Otherwise `422 QUANTITY_MISMATCH`.
- Over-pick returns `422 OVER_PICK`.
- `scanCode` is required unless `manualEntry` is true with `manualEntryReason` of 5–200 characters.
- Wrong product returns `422 WRONG_ITEM_SCANNED`. Wrong bin returns `422 WRONG_BIN`.
- A short line needs `shortReason`: `OUT_OF_STOCK`, `DAMAGED`, `MISSING`, `EXPIRED`, or `OTHER`. Missing it returns `422 SHORT_PICK_REASON_REQUIRED`.
- A short pick does not reduce the order. Packing stays blocked until Platform or RM resolves it.
- Insufficient bin stock at commit returns `422 INSUFFICIENT_STOCK` with `availableQty`.
- A line from another list returns `404 NOT_FOUND`.

### 4.5 Complete Pick List
**Method:** `POST`  
**URL:** `/warehouse/pick-lists/{pickListId}/complete`  
**Authorization:** Bearer token  
**Permission:** `picking:execute`

**Headers:** `Idempotency-Key`, `If-Match`

**Request:**
```json
{ "note": "All lines picked except one short line" }
```

**Response:**
```json
{
  "success": true,
  "data": {
    "pickListId": "pick_8821",
    "status": "PICKED_WITH_SHORTAGE",
    "pickedLineCount": 14,
    "shortageCount": 1,
    "packTask": { "packTaskId": "pkt_8821", "status": "BLOCKED", "blockedReason": "SHORTAGE" },
    "completedAt": "2026-11-02T05:22:00Z",
    "version": 8
  }
}
```

**Notes:**
- Every line must be `PICKED`, `SHORT`, or `CANCELLED`. Otherwise `422 PICK_INCOMPLETE` with the pending line IDs.
- All picked or cancelled becomes `PICKED`. Any short line becomes `PICKED_WITH_SHORTAGE` and the pack task is `BLOCKED`.
- The order status stays `PROCESSING`. `fulfilmentStage` moves to `PACKING`.
- One pack task per pick list. A pick list is never deleted.

## 5. Pack and Dispatch

A pack task is created when a pick list completes. Handover is the only warehouse call that moves the order to `OUT_FOR_DELIVERY`.

**Status:** `PACKING`, `PACKED`, `STAGED`, `LOADED`, `HANDED_OVER`, `BLOCKED`, `CANCELLED`  
**Mode:** `OWN_FLEET`, `COURIER`

```
PACKING → PACKED → STAGED → LOADED → HANDED_OVER
PACKED or STAGED → HANDED_OVER for courier or customer pickup
PACKING → BLOCKED when the pick is short
```

### 5.1 Get Pack Queue
**Method:** `GET`  
**URL:** `/warehouse/pack-queue`  
**Authorization:** Bearer token  
**Permission:** `dispatch:read` or `packing:read`

**Query:** `status` (repeatable), `mode`, `routeId`, `deliveryPartnerId`, `blocked`, `q`, `page`, `limit`  
**Sort:** `createdAt` ascending, then order number

**Response:**
```json
{
  "success": true,
  "data": {
    "items": [
      {
        "packTaskId": "pkt_8810",
        "orderNumber": "ORD-8810",
        "customerName": "Cloud Bowl",
        "mode": "OWN_FLEET",
        "routeName": "KitchenX Route 2",
        "status": "LOADED",
        "packageCount": 2,
        "totalWeightKg": 12.0,
        "stagingBin": { "binId": "bin_f_03", "code": "F-03" },
        "action": "HANDOVER"
      }
    ],
    "page": 1,
    "limit": 20,
    "totalItems": 11,
    "totalPages": 1,
    "hasNext": false,
    "hasPrev": false
  }
}
```

### 5.2 Get Pack Task
**Method:** `GET`  
**URL:** `/warehouse/pack-tasks/{packTaskId}`  
**Authorization:** Bearer token  
**Permission:** `packing:read`

**Response:**
```json
{
  "success": true,
  "data": {
    "packTaskId": "pkt_8814",
    "order": { "orderId": "ord_8814", "orderNumber": "ORD-8814", "status": "PROCESSING", "fulfilmentStage": "PACKING" },
    "customer": { "customerId": "cus_018", "name": "Sweet House" },
    "mode": "COURIER",
    "deliveryPartner": { "deliveryPartnerId": "dp_delhivery", "name": "Delhivery B2B" },
    "route": null,
    "status": "PACKING",
    "blockedReason": null,
    "packages": [
      { "packageId": "pkg_01", "weightKg": 8.0, "dimensionsCm": { "length": 40, "width": 30, "height": 25 }, "sealNumber": "SEAL-9912" }
    ],
    "totalWeightKg": 8.0,
    "stagingBin": null,
    "shipment": { "shipmentId": "shp_514", "status": "PENDING_ASSIGNMENT", "awbNumber": null },
    "assignedTo": null,
    "createdAt": "2026-11-02T04:40:00Z",
    "updatedAt": "2026-11-02T05:10:00Z",
    "version": 2
  }
}
```

Detail also includes `pickListId`, `packageCount`, `handover`, and the last 20 `events`.

### 5.3 Mark Packed
**Method:** `POST`  
**URL:** `/warehouse/pack-tasks/{packTaskId}/pack`  
**Authorization:** Bearer token  
**Permission:** `packing:execute`

**Headers:** `Idempotency-Key`, `If-Match`

**Request:**
```json
{
  "packages": [
    { "weightKg": 8.0, "dimensionsCm": { "length": 40, "width": 30, "height": 25 }, "sealNumber": "SEAL-9912" }
  ],
  "note": "One carton, sealed"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "packTaskId": "pkt_8814",
    "status": "PACKED",
    "order": { "orderId": "ord_8814", "status": "PACKED", "fulfilmentStage": "PACKED" },
    "shipment": { "shipmentId": "shp_514", "status": "PENDING_ASSIGNMENT" },
    "version": 3
  },
  "meta": { "etag": "\"3\"" }
}
```

**Notes:**
- The pick list must be `PICKED`. A shortage or `BLOCKED` task returns `409 PACK_BLOCKED`.
- 1–50 packages. `weightKg` is greater than 0. Dimensions are positive integers. Seal number is 4–40 characters.
- The server computes `totalWeightKg`.
- The order moves `PROCESSING → PACKED` in the same transaction.

### 5.4 Stage Pack Task
**Method:** `POST`  
**URL:** `/warehouse/pack-tasks/{packTaskId}/stage`  
**Authorization:** Bearer token  
**Permission:** `dispatch:stage`

**Headers:** `Idempotency-Key`, `If-Match`

**Request:**
```json
{ "stagingBinId": "bin_f_03", "note": "Staged for Route 3" }
```

**Response:**
```json
{
  "success": true,
  "data": {
    "packTaskId": "pkt_8814",
    "status": "STAGED",
    "stagingBin": { "binId": "bin_f_03", "code": "F-03" },
    "order": { "orderId": "ord_8814", "status": "PACKED", "fulfilmentStage": "STAGED" },
    "version": 4
  },
  "meta": { "etag": "\"4\"" }
}
```

**Notes:**
- Only a `PACKED` task can be staged.
- The bin must be Zone F, type `STAGING` or `DISPATCH`, `ACTIVE`, and have capacity. A bad bin returns `422 INVALID_STAGING_BIN`. Over capacity returns `422 BIN_CAPACITY_EXCEEDED` or `409 BIN_CAPACITY_CONFLICT`.
- Staging does not change the canonical order status.
- The same call with a new `If-Match` moves the task to another staging bin.

### 5.5 Load Pack Task
**Method:** `POST`  
**URL:** `/warehouse/pack-tasks/{packTaskId}/load`  
**Authorization:** Bearer token  
**Permission:** `dispatch:stage`

**Headers:** `Idempotency-Key`, `If-Match`

**Request:**
```json
{
  "vehicleNumber": "TS09AB1234",
  "driverName": "Imran Khan",
  "sealNumber": "SEAL-9912",
  "note": "Loaded on Route 3"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "packTaskId": "pkt_8818",
    "status": "LOADED",
    "route": { "routeId": "rte_005", "name": "KitchenX Route 5", "status": "PUBLISHED" },
    "vehicle": { "vehicleNumber": "TS09AB1234", "driverName": "Imran Khan" },
    "order": { "orderId": "ord_8818", "status": "PACKED", "fulfilmentStage": "STAGED" },
    "version": 5
  },
  "meta": { "etag": "\"5\"" }
}
```

**Notes:**
- Own fleet only. A courier task goes from `PACKED` or `STAGED` to handover.
- The route must be `PUBLISHED` and contain this order. Otherwise `409 ROUTE_NOT_PUBLISHED` or `409 ORDER_NOT_ON_ROUTE`.
- Vehicle or driver that does not match the route returns `409 VEHICLE_MISMATCH`.
- Over the vehicle weight returns `422 VEHICLE_CAPACITY_EXCEEDED`.
- Load does not change the canonical order status.

### 5.6 Hand Over Pack Task
**Method:** `POST`  
**URL:** `/warehouse/pack-tasks/{packTaskId}/handover`  
**Authorization:** Bearer token  
**Permission:** `dispatch:handover`

**Headers:** `Idempotency-Key`, `If-Match`

**Request:**
```json
{
  "handedTo": { "type": "DRIVER", "name": "Imran Khan", "phone": "+919876543210" },
  "proof": { "type": "OTP", "reference": "handover-token-7712" },
  "sealNumber": "SEAL-9912",
  "note": "Two cartons handed to the driver"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "packTaskId": "pkt_8810",
    "status": "HANDED_OVER",
    "handedOverAt": "2026-11-02T05:35:00Z",
    "handedTo": { "type": "DRIVER", "name": "Imran Khan" },
    "order": { "orderId": "ord_8810", "status": "OUT_FOR_DELIVERY", "fulfilmentStage": "HANDED_OVER" },
    "shipment": { "shipmentId": "shp_442", "status": "PICKED_UP", "awbNumber": null },
    "route": { "routeId": "rte_002", "status": "IN_PROGRESS" },
    "version": 6
  },
  "meta": { "etag": "\"6\"" }
}
```

**Notes:**
- Own fleet must be `LOADED` on a published route with a matching driver and vehicle.
- Courier must be `PACKED` or `STAGED`, with a partner and an AWB. Missing AWB returns `422 AWB_REQUIRED`.
- `handedTo.type` is `DRIVER`, `COURIER`, or `CUSTOMER_PICKUP`. Customer pickup needs signature or photo proof.
- `proof.type` is `OTP`, `SIGNATURE`, or `PHOTO`. OTP is checked on the server and never returned.
- This proof is chain of custody. Customer delivery proof stays on the Platform shipment.
- One transaction sets the pack task, order `OUT_FOR_DELIVERY`, shipment `PICKED_UP`, and the route `IN_PROGRESS` on the first handover. A failed cascade rolls back.
- A blocked or cancelled task returns `409 INVALID_STATE_TRANSITION`.

## 6. Offline Sales

A walk-in sale creates a canonical order with `source` `WALK_IN` and `fulfilmentMode` `PICKUP`. It is not a separate ledger. There is no void. A correction is a Platform return and a Finance refund.

**Status:** `COMPLETED`, `PAYMENT_PENDING`, `CANCELLED`

### 6.1 Quote Offline Sale
**Method:** `POST`  
**URL:** `/warehouse/offline-sales/quote`  
**Authorization:** Bearer token  
**Permission:** `offline-sales:read`

**Request:**
```json
{
  "customerId": null,
  "walkInCustomer": { "name": "Ravi Teja", "phone": "+919876543210" },
  "items": [
    { "productId": "prod_010", "quantity": 2 },
    { "productId": "prod_021", "quantity": 1 }
  ],
  "paymentMethod": "CASH"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "quoteId": "quo_551",
    "expiresAt": "2026-11-02T04:50:00Z",
    "location": { "locationId": "loc_hyd", "name": "Hyderabad" },
    "items": [
      { "productId": "prod_010", "name": "Roma tomato 10kg", "quantity": 2, "unitPrice": 420.0, "lineTotal": 840.0, "availableQty": 40 }
    ],
    "subtotal": 1220.0,
    "taxTotal": 0.0,
    "discountTotal": 0.0,
    "total": 1220.0,
    "currency": "INR",
    "paymentMethod": "CASH",
    "warnings": []
  }
}
```

**Notes:**
- No side effects. 1–50 items. The server prices and checks stock. The client does not send prices.
- The quote lasts 5 minutes.

### 6.2 Record Offline Sale
**Method:** `POST`  
**URL:** `/warehouse/offline-sales`  
**Authorization:** Bearer token  
**Permission:** `offline-sales:create`

**Headers:** `Idempotency-Key`, `X-Device-Id`

**Request:**
```json
{
  "quoteId": "quo_551",
  "customerId": null,
  "walkInCustomer": { "name": "Ravi Teja", "phone": "+919876543210" },
  "items": [
    { "productId": "prod_010", "quantity": 2 },
    { "productId": "prod_021", "quantity": 1 }
  ],
  "payment": { "method": "CASH", "tenderedAmount": 1500.0 },
  "clientMutationId": "handheld-04-20261102-0007",
  "note": "Counter sale"
}
```

**Response:** `201`
```json
{
  "success": true,
  "data": {
    "saleId": "sale_0031",
    "receiptNumber": "KX-WI-2026-0031",
    "status": "COMPLETED",
    "order": { "orderId": "ord_8831", "orderNumber": "ORD-8831", "status": "DELIVERED" },
    "total": 1220.0,
    "payment": { "method": "CASH", "status": "PAID", "tenderedAmount": 1500.0, "changeDue": 280.0 },
    "receiptUrl": "https://cdn.example.com/signed/receipt",
    "inventoryMovements": [
      { "movementId": "mov_903", "productId": "prod_010", "quantityDelta": -2, "balanceAfter": 38 }
    ],
    "createdAt": "2026-11-02T04:47:00Z",
    "version": 1
  }
}
```

**Notes:**
- The server re-prices at commit. An expired or changed quote returns `409 QUOTE_EXPIRED` with a fresh quote.
- A short line returns `422 INSUFFICIENT_STOCK`. There is no partial sale.
- Cash below the total returns `422 CASH_TENDER_INSUFFICIENT`. Change is computed on the server. Finance reconciles the drawer.
- Prepaid needs `payment.reference` for a captured POS or UPI payment. Missing returns `422 PAYMENT_REFERENCE_REQUIRED`. A decline returns `422 PAYMENT_FAILED` and creates no order.
- `CREDIT`, `COD`, and delivery return `422 PAYMENT_METHOD_NOT_ALLOWED`.
- `customerId` or `walkInCustomer.name` is required.
- The order is created as `DELIVERED` with counter handover proof. This is a controlled exception to the delivery transition. Confirm it in Platform orders before building it.
- The same `clientMutationId` and body from the same device returns the original sale.
- Walk-in sales disabled at the location returns `403 OFFLINE_SALES_DISABLED`.

### 6.3 List Offline Sales
**Method:** `GET`  
**URL:** `/warehouse/offline-sales`  
**Authorization:** Bearer token  
**Permission:** `offline-sales:read`

**Query:** `date`, `from`, `to`, `cashierId`, `paymentMethod`, `status`, `q`, `page`, `limit`  
**Sort:** `createdAt` descending

**Response:** List envelope of sale summaries plus `cashTotal` for the range. `cashTotal` is not a settlement.

### 6.4 Get Offline Sale
**Method:** `GET`  
**URL:** `/warehouse/offline-sales/{saleId}`  
**Authorization:** Bearer token  
**Permission:** `offline-sales:read`

**Response:** The full sale, including a fresh `receiptUrl`. Re-printing does not create a sale.

## 7. Stock Counts

The session snapshots system quantity at creation. Within tolerance, submit posts `ADJUSTMENT` movements with `reason` `CYCLE_COUNT`. Above tolerance, a manager approval is created. The supervisor never sets an absolute quantity and never approves a variance.

**Status:** `DRAFT`, `IN_PROGRESS`, `SUBMITTED`, `INVESTIGATING`, `APPROVED`, `SENT_BACK`, `CLOSED`, `CANCELLED`  
**Line status:** `PENDING`, `MATCHED`, `VARIANCE`, `RECOUNT_REQUIRED`  
**Count type:** `CYCLE`, `FULL`, `SPOT`

### 7.1 List Stock Counts
**Method:** `GET`  
**URL:** `/warehouse/stock-counts`  
**Authorization:** Bearer token  
**Permission:** `stock-counts:read`

**Query:** `status`, `countType`, `zoneId`, `from`, `to`, `q`, `page`, `limit`  
**Sort:** `createdAt` descending

**Response:** List envelope of count headers.

### 7.2 Get Stock Count
**Method:** `GET`  
**URL:** `/warehouse/stock-counts/{countId}`  
**Authorization:** Bearer token  
**Permission:** `stock-counts:read`

**Response:**
```json
{
  "success": true,
  "data": {
    "countId": "cnt_009",
    "countNumber": "CNT-2026-009",
    "location": { "locationId": "loc_hyd", "name": "Hyderabad" },
    "scope": { "zoneId": "zone_c", "zoneCode": "C", "binIds": ["bin_c_04", "bin_c_07"], "categoryId": null },
    "countType": "CYCLE",
    "blind": false,
    "status": "IN_PROGRESS",
    "lineCount": 3,
    "countedLineCount": 3,
    "varianceLineCount": 1,
    "totalVarianceValue": -820.0,
    "currency": "INR",
    "countedBy": { "userId": "usr_031", "name": "Suresh Rao" },
    "submittedAt": null,
    "reviewedBy": null,
    "createdAt": "2026-11-02T05:00:00Z",
    "updatedAt": "2026-11-02T05:50:00Z",
    "version": 4
  }
}
```

Detail is the header and a summary. Lines are 7.4.

### 7.3 Create Stock Count
**Method:** `POST`  
**URL:** `/warehouse/stock-counts`  
**Authorization:** Bearer token  
**Permission:** `stock-counts:create`

**Headers:** `Idempotency-Key`

**Request:**
```json
{
  "locationId": "loc_hyd",
  "zoneId": "zone_c",
  "binIds": ["bin_c_04", "bin_c_07"],
  "categoryId": null,
  "countType": "CYCLE",
  "blind": false,
  "scheduledFor": "2026-11-02",
  "note": "Daily cold-chain cycle count"
}
```

**Response:** `201` — session with `status` `IN_PROGRESS` and a snapshot of system quantities.

**Notes:**
- Send exactly one of `zoneId` or `binIds`. `binIds` is 1–500, same location, `ACTIVE`.
- A second open session on a bin returns `409 COUNT_SESSION_OPEN`.
- `blind: true` hides `systemQty` until submit. The default is false.
- An empty scope returns `422 EMPTY_COUNT_SCOPE`.

### 7.4 List Count Lines
**Method:** `GET`  
**URL:** `/warehouse/stock-counts/{countId}/lines`  
**Authorization:** Bearer token  
**Permission:** `stock-counts:read`

**Query:** `status`, `q` (bin, SKU), `page`, `limit` (max 200)  
**Sort:** `binCode`, then `sku`

**Response:** List envelope. A line is:

```json
{
  "lineId": "scl_01",
  "bin": { "binId": "bin_c_04", "code": "C-04" },
  "product": { "productId": "prod_021", "name": "Paneer 1kg", "sku": "PNR1" },
  "batchNumber": "PNR-2026-1102",
  "expiresAt": "2026-11-07",
  "systemQty": 117,
  "countedQty": 115,
  "varianceQty": -2,
  "unitCost": 410.0,
  "varianceValue": -820.0,
  "unit": "PACKET",
  "status": "VARIANCE",
  "movementDuringCount": false
}
```

### 7.5 Save Count Lines
**Method:** `PATCH`  
**URL:** `/warehouse/stock-counts/{countId}/lines`  
**Authorization:** Bearer token  
**Permission:** `stock-counts:submit`

**Headers:** `If-Match`

**Request:**
```json
{
  "lines": [
    { "lineId": "scl_01", "countedQty": 115 },
    { "lineId": "scl_02", "countedQty": 16 }
  ]
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "countId": "cnt_009",
    "status": "IN_PROGRESS",
    "countedLineCount": 3,
    "lineCount": 3,
    "varianceLineCount": 1,
    "version": 5
  },
  "meta": { "etag": "\"5\"" }
}
```

**Notes:**
- `countedQty` is at least 0. Weight units allow 3 decimal places. Countable units are integers.
- The session must be `IN_PROGRESS` or `SENT_BACK`. Otherwise `409 COUNT_LOCKED`.
- This does not post stock and does not change `systemQty`.

### 7.6 Submit Stock Count
**Method:** `POST`  
**URL:** `/warehouse/stock-counts/{countId}/submit`  
**Authorization:** Bearer token  
**Permission:** `stock-counts:submit`

**Headers:** `Idempotency-Key`, `If-Match`

**Request:**
```json
{ "note": "Paneer is two packets short", "evidenceUploadIds": [] }
```

**Response:** `200` within tolerance
```json
{
  "success": true,
  "data": {
    "countId": "cnt_010",
    "status": "APPROVED",
    "summary": {
      "lineCount": 1,
      "matchedLines": 0,
      "varianceLines": 1,
      "totalVarianceQty": -1,
      "totalVarianceValue": -210.0,
      "currency": "INR",
      "withinTolerance": true
    },
    "approval": null,
    "inventoryAdjustments": [
      { "movementId": "mov_905", "productId": "prod_010", "quantityDelta": -1, "balanceAfter": 85, "reason": "CYCLE_COUNT" }
    ],
    "submittedAt": "2026-11-02T05:55:00Z",
    "version": 6
  }
}
```

**Response:** `200` above tolerance
```json
{
  "success": true,
  "data": {
    "countId": "cnt_009",
    "status": "SUBMITTED",
    "summary": {
      "lineCount": 3,
      "matchedLines": 2,
      "varianceLines": 1,
      "totalVarianceQty": -2,
      "totalVarianceValue": -820.0,
      "currency": "INR",
      "withinTolerance": false
    },
    "approval": { "approvalId": "apv_022", "status": "PENDING", "assignedRole": "WAREHOUSE_MANAGER" },
    "inventoryAdjustments": [],
    "submittedAt": "2026-11-02T05:55:00Z",
    "version": 6
  }
}
```

**Notes:**
- Every line needs `countedQty`. Otherwise `422 COUNT_INCOMPLETE`.
- A material movement during the count returns `422 RECOUNT_REQUIRED`.
- Proposed tolerance is the larger of an absolute quantity and `systemQty × tolerancePct`, and a value cap. Defaults: 0 for cold-chain and high-value items, 2% otherwise, and ₹5,000 total. The server applies the rule.
- The supervisor cannot approve their own variance.

### 7.7 List Count Variances
**Method:** `GET`  
**URL:** `/warehouse/stock-counts/{countId}/variances`  
**Authorization:** Bearer token  
**Permission:** `stock-counts:read`

**Response:** Lines where `varianceQty` is not 0, with system quantity, counted quantity, value, and the tolerance decision. This is not an approval call.

### 7.8 Cancel Stock Count
**Method:** `POST`  
**URL:** `/warehouse/stock-counts/{countId}/cancel`  
**Authorization:** Bearer token  
**Permission:** `stock-counts:create`

**Headers:** `Idempotency-Key`, `If-Match`

**Request:**
```json
{ "reason": "Created against the wrong zone" }
```

**Response:** `200` — `status` `CANCELLED`. Only `DRAFT` or `IN_PROGRESS`. No stock movement.

## 8. Bin Stock

Bin stock is a read-only projection of the Platform inventory ledger. A write returns `405 METHOD_NOT_ALLOWED`.

### 8.1 List Bin Stock
**Method:** `GET`  
**URL:** `/warehouse/bin-stock`  
**Authorization:** Bearer token  
**Permission:** `inventory:read`, `bin-stock:read`, and `bins:read`

**Query:** `locationId`, `zoneId`, `binId`, `productId`, `q`, `includeZero` (default false), `expiringBefore`, `page`, `limit`  
**Sort:** `binCode`, `expiresAt`, `availableQty`

**Response:**
```json
{
  "success": true,
  "data": {
    "items": [
      {
        "binStockId": "bst_1201",
        "bin": { "binId": "bin_c_07", "code": "C-07", "zoneCode": "C" },
        "product": { "productId": "prod_curd5", "name": "Curd 5kg", "sku": "CURD5" },
        "batch": { "batchId": "bat_curd_1104", "batchNumber": "CURD-2026-1104", "expiresAt": "2026-11-04" },
        "inventoryId": "inv_curd5",
        "onHandQty": 16,
        "reservedQty": 0,
        "availableQty": 16,
        "unit": "TUB",
        "lastMovementAt": "2026-11-01T09:10:00Z",
        "expiringSoon": true
      }
    ],
    "page": 1,
    "limit": 20,
    "totalItems": 1,
    "totalPages": 1,
    "hasNext": false,
    "hasPrev": false
  }
}
```

### 8.2 Get Bin Stock
**Method:** `GET`  
**URL:** `/warehouse/bin-stock/{binId}`  
**Authorization:** Bearer token  
**Permission:** `inventory:read`, `bin-stock:read`, and `bins:read`

**Response:** Bin header, capacity, product and batch rows, and a summary. Movements stay on `GET /inventory/{inventoryId}/movements`.

**Notes:**
- `availableQty = onHandQty − reservedQty`.
- `expiringSoon` is true within 7 days. Expired stock is shown and is not pickable until a manager disposition.
- Another hub returns `403 OUT_OF_SCOPE`.

## 9. Shared Reads

The supervisor cannot cancel an order, change its status, edit items, assign a shipment, or read payment, margin, credit, or the full customer profile. Phone is returned on the handover task only.

| `fulfilmentStage` | When |
|---|---|
| `QUEUED` | Order confirmed, pick not started |
| `PICKING` | Pick list `PICKING` |
| `PACKING` | Pick complete, pack task `PACKING` or `BLOCKED` |
| `STAGED` | Pack task `STAGED` or `LOADED` |
| `HANDED_OVER` | Pack task `HANDED_OVER` |

### 9.1 List Inventory
**Method:** `GET`  
**URL:** `/inventory`  
**Authorization:** Bearer token  
**Permission:** `inventory:read`

**Query:** `locationId`

**Response:** The inventory list in Platform Admin.

### 9.2 List Inventory Movements
**Method:** `GET`  
**URL:** `/inventory/{inventoryId}/movements`  
**Authorization:** Bearer token  
**Permission:** `inventory:read`

**Response:** The movement list in Platform Admin. `POST /inventory/adjustments` returns `403 FORBIDDEN`.

### 9.3 List Orders
**Method:** `GET`  
**URL:** `/orders`  
**Authorization:** Bearer token  
**Permission:** `orders:read`

**Query:** `locationId`, `status`, `page`, `limit`

**Response:** Orders for the hub, including read-only `fulfilmentStage`.

### 9.4 Get Order
**Method:** `GET`  
**URL:** `/orders/{orderId}`  
**Authorization:** Bearer token  
**Permission:** `orders:read`

**Response:** The order object in Platform Admin, plus `fulfilmentStage`.

### 9.5 Get Order Timeline
**Method:** `GET`  
**URL:** `/orders/{orderId}/timeline`  
**Authorization:** Bearer token  
**Permission:** `orders:read`

**Response:** The timeline in Platform Admin.

### 9.6 List Shipments
**Method:** `GET`  
**URL:** `/shipments`  
**Authorization:** Bearer token  
**Permission:** `shipments:read`

**Query:** `locationId`, `status`

**Response:** Shipment summaries. Assign and status change return `403 FORBIDDEN`.

### 9.7 Get Shipment
**Method:** `GET`  
**URL:** `/shipments/{shipmentId}`  
**Authorization:** Bearer token  
**Permission:** `shipments:read`

**Response:** AWB, partner, and tracking fields from Platform Admin.

### 9.8 List Purchase Orders
**Method:** `GET`  
**URL:** `/purchase-orders`  
**Authorization:** Bearer token  
**Permission:** `purchase-orders:read`

**Query:** `locationId`

**Response:** The purchase-order list in Platform Admin.

### 9.9 Get Purchase Order
**Method:** `GET`  
**URL:** `/purchase-orders/{purchaseOrderId}`  
**Authorization:** Bearer token  
**Permission:** `purchase-orders:read`

**Response:** PO lines and remaining quantity.

### 9.10 List Products
**Method:** `GET`  
**URL:** `/products`  
**Authorization:** Bearer token  
**Permission:** `products:read`

**Query:** `locationId`, `status=ACTIVE`

**Response:** Active products for scan and walk-in display. Cost and margin are omitted.

### 9.11 Get Product
**Method:** `GET`  
**URL:** `/products/{productId}`  
**Authorization:** Bearer token  
**Permission:** `products:read`

**Response:** Unit, tax, and cold-chain flag.

### 9.12 Get Location
**Method:** `GET`  
**URL:** `/locations/{locationId}`  
**Authorization:** Bearer token  
**Permission:** `locations:read`

**Response:** The caller's hub. Another hub returns `403 OUT_OF_SCOPE`.

## 10. Search

### 10.1 Search Warehouse
**Method:** `GET`  
**URL:** `/warehouse/search`  
**Authorization:** Bearer token  
**Permission:** One of `orders:read`, `products:read`, `bins:read`, `goods-receipts:read`

**Query:** `q` (2–80 characters), `types` (`orders`, `products`, `bins`, `receipts`), `limit` (1–10, default 5)

**Response:**
```json
{
  "success": true,
  "data": {
    "query": "spice",
    "groups": [
      {
        "type": "ORDER",
        "items": [
          { "id": "ord_8821", "title": "ORD-8821", "subtitle": "Spice Route · 14 lines · Picking", "href": "/warehouse/pick-lists/pick_8821" }
        ]
      }
    ]
  }
}
```

**Notes:**
- Exact barcodes use Scan Code. A type the caller cannot read is omitted.
- Results stay in the caller's location. An empty result is `200`.
- Search does not return phone, payment, or a full address.

## 11. Error Response

**Example:**
```json
{
  "success": false,
  "error": {
    "code": "OUT_OF_SCOPE",
    "message": "This resource is not in your location",
    "details": [{ "field": "locationId", "code": "OUT_OF_SCOPE", "message": "Send X-Location-Id" }],
    "requestId": "req_01J8Z4K2M9"
  }
}
```

| Status | Code | When |
|---|---|---|
| 400 | `LOCATION_REQUIRED`, `VALIDATION_ERROR`, `INVALID_QUERY_PARAMETER` | Missing location, bad body, or unknown query |
| 403 | `FORBIDDEN`, `OUT_OF_SCOPE`, `OFFLINE_SALES_DISABLED` | Manager call, other hub, or walk-in disabled |
| 404 | `SCAN_NOT_FOUND`, `NOT_FOUND` | Unknown code or missing resource |
| 409 | `SCAN_AMBIGUOUS`, `CARTON_ALREADY_RECEIVED`, `ALREADY_CONFIRMED`, `DUPLICATE_INVOICE`, `PICK_LIST_ALREADY_CLAIMED`, `PACK_BLOCKED`, `ROUTE_NOT_PUBLISHED`, `ORDER_NOT_ON_ROUTE`, `VEHICLE_MISMATCH`, `BIN_CAPACITY_CONFLICT`, `QUOTE_EXPIRED`, `IDEMPOTENCY_KEY_REUSED`, `COUNT_SESSION_OPEN`, `COUNT_LOCKED`, `VERSION_MISMATCH`, `INVALID_STATE_TRANSITION` | Conflict |
| 422 | `OVER_RECEIPT`, `EXPIRED_STOCK`, `COLD_CHAIN_VIOLATION`, `BIN_CAPACITY_EXCEEDED`, `QUANTITY_MISMATCH`, `OVER_PICK`, `WRONG_ITEM_SCANNED`, `WRONG_BIN`, `SHORT_PICK_REASON_REQUIRED`, `PICK_INCOMPLETE`, `INVALID_STAGING_BIN`, `VEHICLE_CAPACITY_EXCEEDED`, `AWB_REQUIRED`, `INSUFFICIENT_STOCK`, `CASH_TENDER_INSUFFICIENT`, `PAYMENT_REFERENCE_REQUIRED`, `PAYMENT_FAILED`, `PAYMENT_METHOD_NOT_ALLOWED`, `EMPTY_COUNT_SCOPE`, `COUNT_INCOMPLETE`, `RECOUNT_REQUIRED` | Rule failed |
| 428 | `PRECONDITION_REQUIRED` | Missing `If-Match` |

## 12. Reference

#### Permissions

```
dashboard:read
goods-receipts:read/create/update/confirm/cancel
manual-inwards:read/create/update/cancel
picking:read/execute
packing:read/execute
dispatch:read/stage/handover
offline-sales:read/create
stock-counts:read/create/submit
inventory:read    bin-stock:read    bins:read
orders:read       shipments:read    purchase-orders:read
products:read     locations:read    notifications:read
```

The supervisor cannot approve their own inward or count, edit bins, dispose expiry, publish a route, call `POST /inventory/adjustments`, change an order or shipment status, or read finance and the platform audit log.

#### Headers and locking

- `Idempotency-Key` is required on manual inward create and resubmit, GRN create and confirm, pick start, line pick, pick complete, pack, stage, load, handover, offline sale, and count create and submit.
- The same key and body returns the original response for at least 24 hours. A different body returns `409 IDEMPOTENCY_KEY_REUSED`.
- `If-Match` is the quoted `version`. It is required on manual-inward patch, pick mutations, pack mutations, count line save, and count submit.
- `X-Device-Id` is required on offline sales and recommended on scan, pick, and pack.
- Reads: 600 per minute. Writes: 120 per minute. Scans: 300 per minute per device. Offline sales: 60 creates per minute per device.

#### ID prefixes

`pick_` pick list, `pkt_` pack task, `mi_` manual inward, `sale_` offline sale, `cnt_` stock count, `scl_` count line, `bin_` bin, `bat_` batch. Do not parse a prefix for status.

#### Cases to test

| Case | Expected |
|---|---|
| Several locations and no `X-Location-Id` | `400 LOCATION_REQUIRED` |
| Another hub's bin, order, or GRN | `403 OUT_OF_SCOPE` |
| Manager-only call, direct stock adjustment, or order status patch | `403 FORBIDDEN` |
| Unknown or ambiguous scan | `404 SCAN_NOT_FOUND` or `409 SCAN_AMBIGUOUS` |
| Carton already received | `409 CARTON_ALREADY_RECEIVED` |
| GRN over-receipt | `422 OVER_RECEIPT` |
| Manual inward above ₹25,000 | `201` `PENDING_APPROVAL`, no stock |
| Expired batch or cold product in an ambient bin | `422 EXPIRED_STOCK` or `422 COLD_CHAIN_VIOLATION` |
| Duplicate supplier invoice | `409 DUPLICATE_INVOICE` |
| Pick claimed by someone else | `409 PICK_LIST_ALREADY_CLAIMED` |
| Pick quantities that do not add up, or an over-pick | `422 QUANTITY_MISMATCH` or `422 OVER_PICK` |
| Wrong product or bin scan | `422 WRONG_ITEM_SCANNED` or `422 WRONG_BIN` |
| Complete a pick with a pending line | `422 PICK_INCOMPLETE` |
| Pack a short pick | `409 PACK_BLOCKED` |
| Stage outside Zone F | `422 INVALID_STAGING_BIN` |
| Load without a published route or the route vehicle | `409 ROUTE_NOT_PUBLISHED` or `409 VEHICLE_MISMATCH` |
| Courier handover without an AWB | `422 AWB_REQUIRED` |
| Walk-in short stock, low cash, missing prepaid ref, or credit | `422` as named above |
| Quote expired | `409 QUOTE_EXPIRED` |
| Second open count on a bin | `409 COUNT_SESSION_OPEN` |
| Submit with blank lines or a material movement | `422 COUNT_INCOMPLETE` or `422 RECOUNT_REQUIRED` |
| Stale or missing `If-Match` | `409 VERSION_MISMATCH` or `428 PRECONDITION_REQUIRED` |
| Empty list | `200` with `items: []` |

#### Open decisions

1. Bin stock is a projection of the Platform ledger. Confirm that every movement carries a bin.
2. Pick claim is a 30-minute lease. Dispatcher assignment is the alternative.
3. A short pick blocks packing until Platform or RM resolves it.
4. Manual-inward auto-approval is proposed at ₹25,000.
5. Batch and expiry are required for perishables.
6. A walk-in order is created as `DELIVERED`. Platform orders must allow that exception.
7. The warehouse records cash. Finance closes the drawer.
8. A walk-in may need a phone or GSTIN for a B2B invoice. The prototype uses a free-text name.
9. Count tolerance is proposed at 2% and ₹5,000, with zero tolerance for cold chain.
10. Physical returns at the hub are not in this contract. Platform owns return receipt.
11. "Offline sale" means a counter sale, not an offline-first handheld queue.
12. Confirm whether a GRN line may carry `binId`, or whether putaway is a separate task.
13. `fulfilmentStage` is read-only and derived. It must not become a second writable order status.
