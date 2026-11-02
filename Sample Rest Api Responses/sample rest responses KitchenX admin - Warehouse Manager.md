# KitchenX Admin — Warehouse Manager API

**Base URL:** `{origin}/api/v1/admin`

The manager runs the hub and decides what the supervisor cannot: approvals, bins, expiry, and routes. Paths below are relative to the base URL. Private calls use a staff Bearer token. More than one location requires `X-Location-Id`.

Floor execution is in the Warehouse Supervisor file. The manager may run those calls. The manager cannot approve a request they created. Inventory, orders, and shipments stay in Platform Admin.

## 1. Dashboard

### 1.1 Get Manager Dashboard
**Method:** `GET`  
**URL:** `/warehouse/manager/dashboard`  
**Authorization:** Bearer token  
**Permission:** `dashboard:read`

**Query:** `locationId` (optional when the token has one location), `date` (default today in `Asia/Kolkata`)

**Response:**
```json
{
  "success": true,
  "data": {
    "generatedAt": "2026-11-02T06:00:00Z",
    "location": { "locationId": "loc_hyd", "name": "Hyderabad", "code": "HYD" },
    "shift": {
      "shiftId": "shf_20261102_morning",
      "name": "Morning",
      "startsAt": "2026-11-02T00:30:00Z",
      "endsAt": "2026-11-02T09:30:00Z",
      "manager": { "userId": "usr_032", "name": "Ananya Menon" }
    },
    "kpis": {
      "approvalsWaiting": { "value": 2, "amount": 49420.0, "currency": "INR" },
      "nearExpirySkus": { "value": 3, "valueAtRisk": 4570.0, "currency": "INR" },
      "routesToday": { "value": 5, "published": 3, "draft": 2 },
      "countVariance": { "value": 1, "amount": -820.0, "currency": "INR" }
    },
    "approvalQueue": [
      {
        "approvalId": "apv_021",
        "type": "MANUAL_INWARD",
        "title": "Manual inward · Basmati 25kg × 60",
        "amount": 48600.0,
        "currency": "INR",
        "submittedBy": { "userId": "usr_031", "name": "Suresh Rao" },
        "submittedAt": "2026-11-02T05:40:00Z",
        "slaDueAt": "2026-11-02T09:40:00Z",
        "status": "PENDING"
      }
    ],
    "expiryAtRisk": [
      {
        "batchId": "bat_curd_1104",
        "productName": "Curd 5kg",
        "binCode": "C-07",
        "quantity": 16,
        "unit": "TUB",
        "expiresAt": "2026-11-04",
        "daysToExpiry": 2,
        "value": 3360.0
      }
    ],
    "routes": [
      {
        "routeId": "rte_003",
        "routeNumber": "KX-R3",
        "name": "KitchenX Route 3",
        "status": "PLANNED",
        "stops": 6,
        "weightKg": 210,
        "capacityKg": 750,
        "utilizationPct": 28.0
      }
    ],
    "exceptions": { "blockedPackTasks": 1, "countSessionsOpen": 1, "expiredBatches": 1, "routesAwaitingPublish": 2 }
  }
}
```

**Notes:**
- `nearExpirySkus` counts SKUs. `valueAtRisk` sums batch cost, not selling price.
- `approvalsWaiting.amount` sums absolute pending amounts.
- This is a read model. Re-check the approval version before deciding. Cache at most 30 seconds.
- The floor queue is `GET /warehouse/dashboard` in the Supervisor file.

## 2. Approvals

One request, one decision. There is no generic status patch. A resubmission creates a new `approvalId`.

**Type:** `MANUAL_INWARD`, `COUNT_VARIANCE`, `EXPIRY_DISPOSITION`  
**Status:** `PENDING`, `APPROVED`, `SENT_BACK`, `INVESTIGATING`, `CANCELLED`

The checker cannot be the maker. Self-approval returns `409 SELF_APPROVAL_FORBIDDEN`. If the hub has one manager, the request escalates to a Platform Admin with `warehouse-approvals:decide` and the audit sets `breakGlass: true`.

### 2.1 List Approvals
**Method:** `GET`  
**URL:** `/warehouse/approvals`  
**Authorization:** Bearer token  
**Permission:** `warehouse-approvals:read`

**Query:** `type`, `status` (repeatable), `submittedBy`, `assignedToMe`, `from`, `to`, `minAmount`, `maxAmount`, `linkedResourceId`, `slaBreached`, `page`, `limit`  
**Sort:** `slaDueAt`, `submittedAt`, `amount`. Default `slaDueAt` ascending.

**Response:**
```json
{
  "success": true,
  "data": {
    "items": [
      {
        "approvalId": "apv_021",
        "type": "MANUAL_INWARD",
        "title": "Manual inward · Basmati 25kg × 60",
        "status": "PENDING",
        "amount": 48600.0,
        "currency": "INR",
        "submittedBy": { "userId": "usr_031", "name": "Suresh Rao" },
        "submittedAt": "2026-11-02T05:40:00Z",
        "slaDueAt": "2026-11-02T09:40:00Z",
        "slaBreached": false,
        "canDecide": true
      }
    ],
    "page": 1,
    "limit": 20,
    "totalItems": 2,
    "totalPages": 1,
    "hasNext": false,
    "hasPrev": false
  }
}
```

`canDecide` is false when the caller is the maker, the request is not open, or the caller lacks `warehouse-approvals:decide`. The server still enforces the rule.

### 2.2 Get Approval
**Method:** `GET`  
**URL:** `/warehouse/approvals/{approvalId}`  
**Authorization:** Bearer token  
**Permission:** `warehouse-approvals:read`. A count variance also needs `stock-counts:review` to see the lines.

**Response:**
```json
{
  "success": true,
  "data": {
    "approvalId": "apv_021",
    "type": "MANUAL_INWARD",
    "title": "Manual inward · Basmati 25kg × 60",
    "status": "PENDING",
    "location": { "locationId": "loc_hyd", "name": "Hyderabad" },
    "amount": 48600.0,
    "currency": "INR",
    "submittedBy": { "userId": "usr_031", "name": "Suresh Rao", "role": "WAREHOUSE_SUPERVISOR" },
    "submittedAt": "2026-11-02T05:40:00Z",
    "assignedRole": "WAREHOUSE_MANAGER",
    "slaDueAt": "2026-11-02T09:40:00Z",
    "linkedResource": { "type": "MANUAL_INWARD", "id": "mi_0031", "reference": "MI-2026-0031" },
    "summary": "Emergency basmati purchase; no approved PO",
    "details": {
      "supplier": { "supplierId": "sup_012", "name": "Sri Traders" },
      "invoiceNumber": "INV-8891",
      "items": [
        {
          "productId": "prod_045",
          "name": "Basmati rice 25kg",
          "sku": "BAS25",
          "quantity": 60,
          "unitCost": 810.0,
          "lineTotal": 48600.0,
          "bin": { "binId": "bin_a_12", "code": "A-12" },
          "batchNumber": "BAS-2026-1102",
          "expiresAt": "2027-05-01"
        }
      ]
    },
    "effectPreview": {
      "inventoryDeltas": [
        { "productId": "prod_045", "binId": "bin_a_12", "quantityDelta": 60, "beforeQty": 12, "afterQty": 72, "unit": "BAG" }
      ],
      "financeImpact": null
    },
    "evidence": [{ "uploadId": "upl_61", "type": "INVOICE", "fileName": "INV-8891.pdf" }],
    "decision": null,
    "history": [
      { "event": "SUBMITTED", "actor": { "userId": "usr_031", "name": "Suresh Rao" }, "note": "Emergency purchase for today's orders", "createdAt": "2026-11-02T05:40:00Z" }
    ],
    "version": 3
  }
}
```

Another hub returns `403 OUT_OF_SCOPE`. Evidence URLs are short-lived. `amount` is absolute. The effect preview carries the signed quantity.

### 2.3 Approve Request
**Method:** `POST`  
**URL:** `/warehouse/approvals/{approvalId}/approve`  
**Authorization:** Bearer token  
**Permission:** `warehouse-approvals:decide`

**Headers:** `Idempotency-Key`, `If-Match`. Above the proposed ₹50,000 high-value threshold, also `X-MFA-Assertion`.

**Request:**
```json
{
  "note": "Invoice, quantity and bin capacity verified",
  "acknowledgeAmount": 48600.0
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "approvalId": "apv_021",
    "status": "APPROVED",
    "decision": {
      "decision": "APPROVED",
      "decidedBy": { "userId": "usr_032", "name": "Ananya Menon" },
      "decidedAt": "2026-11-02T06:10:00Z",
      "note": "Invoice, quantity and bin capacity verified"
    },
    "appliedEffects": {
      "inventoryAdjustments": [
        {
          "movementId": "mov_910",
          "inventoryId": "inv_045",
          "binId": "bin_a_12",
          "quantityDelta": 60,
          "balanceBefore": 12,
          "balanceAfter": 72,
          "reason": "SUPPLIER_CORRECTION",
          "referenceType": "MANUAL_INWARD",
          "referenceId": "mi_0031"
        }
      ],
      "linkedResource": { "type": "MANUAL_INWARD", "id": "mi_0031", "status": "COMPLETED" },
      "financeEvent": null
    },
    "version": 4
  },
  "meta": { "etag": "\"4\"" }
}
```

**Notes:**
- `acknowledgeAmount` must equal the current amount. Otherwise `422 AMOUNT_MISMATCH`.
- Allowed from `PENDING` or `INVESTIGATING`. Otherwise `409 ALREADY_DECIDED`.
- A cancelled or already applied linked resource returns `409 LINKED_RESOURCE_CHANGED`.
- The decision, movements, linked status, audit, and outbox commit together. A full or blocked bin returns `422` and posts nothing.
- Manual inward posts `ADJUSTMENT` with `SUPPLIER_CORRECTION` and completes the inward.
- Count variance posts `ADJUSTMENT` with `CYCLE_COUNT` and approves the count.
- Expiry write-off posts `EXPIRY`, sets the batch `WRITTEN_OFF`, and emits a Finance loss event.
- A material movement since the count was submitted returns `409 RECOUNT_REQUIRED`.

### 2.4 Send Approval Back
**Method:** `POST`  
**URL:** `/warehouse/approvals/{approvalId}/send-back`  
**Authorization:** Bearer token  
**Permission:** `warehouse-approvals:decide`

**Headers:** `Idempotency-Key`, `If-Match`

**Request:**
```json
{
  "reason": "QUANTITY_MISMATCH",
  "note": "Invoice says 50 bags, request says 60"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "approvalId": "apv_021",
    "status": "SENT_BACK",
    "decision": {
      "decision": "SENT_BACK",
      "decidedBy": { "userId": "usr_032", "name": "Ananya Menon" },
      "decidedAt": "2026-11-02T06:05:00Z",
      "note": "Invoice says 50 bags, request says 60"
    },
    "linkedResource": { "type": "MANUAL_INWARD", "id": "mi_0031", "status": "SENT_BACK" },
    "version": 4
  },
  "meta": { "etag": "\"4\"" }
}
```

**Notes:**
- `reason` is `QUANTITY_MISMATCH`, `PRICE_MISMATCH`, `MISSING_EVIDENCE`, `WRONG_BIN`, `RECOUNT_REQUIRED`, or `OTHER`. `OTHER` needs a note of 10–500 characters.
- No stock moves.
- A manual inward or count becomes `SENT_BACK` for the maker to edit and resubmit. An expiry disposition becomes `REJECTED` and the batch is unchanged.
- A second decision returns `409 ALREADY_DECIDED`.

### 2.5 Investigate Approval
**Method:** `POST`  
**URL:** `/warehouse/approvals/{approvalId}/investigate`  
**Authorization:** Bearer token  
**Permission:** `warehouse-approvals:decide`

**Headers:** `Idempotency-Key`, `If-Match`

**Request:**
```json
{
  "reason": "SUSPECTED_THEFT",
  "note": "Review camera footage and the receiving log for C-04",
  "assigneeId": "usr_032"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "approvalId": "apv_022",
    "status": "INVESTIGATING",
    "investigation": {
      "reason": "SUSPECTED_THEFT",
      "note": "Review camera footage and the receiving log for C-04",
      "assignee": { "userId": "usr_032", "name": "Ananya Menon" },
      "startedAt": "2026-11-02T06:20:00Z"
    },
    "linkedResource": { "type": "STOCK_COUNT", "id": "cnt_009", "status": "INVESTIGATING" },
    "version": 5
  },
  "meta": { "etag": "\"5\"" }
}
```

**Notes:**
- `reason` is `SUSPECTED_THEFT`, `REPEATED_VARIANCE`, `SUPPLIER_DISPUTE`, `DAMAGE`, `SYSTEM_ERROR`, or `OTHER`.
- `assigneeId` must be an active manager or Platform Admin at the location. A supervisor cannot be the assignee.
- No stock moves. The linked count or disposition stays frozen. Starting an investigation does not allow self-approval.
- An already decided request returns `409 INVALID_STATE_TRANSITION`.

## 3. Zones and Bins

Zones are read-only in this version. Bins are manager-managed. Supervisors can read bin labels. They cannot create, block, or delete bins.

**Zone type:** `AMBIENT`, `COLD`, `DISPATCH`, `QUARANTINE`  
**Bin type:** `PICK_FACE`, `RESERVE`, `STAGING`, `DISPATCH`, `QUARANTINE`  
**Bin status:** `ACTIVE`, `BLOCKED`, `FULL`, `INACTIVE`. `FULL` is computed.

Prototype layout: A Produce 24, C Dairy cold 12, D Oils and pantry 18, F Dispatch 8.

```
ACTIVE → BLOCKED → ACTIVE
ACTIVE or BLOCKED → INACTIVE
```

### 3.1 List Zones
**Method:** `GET`  
**URL:** `/warehouse/zones`  
**Authorization:** Bearer token  
**Permission:** `bins:read`

**Query:** `type`, `status`, `q`  
**Sort:** `code`

**Response:**
```json
{
  "success": true,
  "data": {
    "items": [
      {
        "zoneId": "zone_a",
        "code": "A",
        "name": "Produce",
        "type": "AMBIENT",
        "temperature": { "minC": 10, "maxC": 25 },
        "binCount": 24,
        "activeBins": 24,
        "status": "ACTIVE",
        "version": 2
      }
    ]
  }
}
```

**Notes:**
- `code` is one uppercase letter, unique per location. `type` is immutable.
- A cold product can be binned only in a `COLD` zone. Staging uses `DISPATCH`. Quarantine uses `QUARANTINE`.
- `binCount` and `activeBins` are computed. Zone delete is not exposed.

### 3.2 List Bins
**Method:** `GET`  
**URL:** `/warehouse/bins`  
**Authorization:** Bearer token  
**Permission:** `bins:read`

**Query:** `zoneId`, `status` (repeatable), `type`, `q`, `utilizationAbove`, `includeInactive` (default false), `page`, `limit`  
**Sort:** `code`, `utilization.pct`, `updatedAt`

**Response:**
```json
{
  "success": true,
  "data": {
    "items": [
      {
        "binId": "bin_a_12",
        "code": "A-12",
        "zoneCode": "A",
        "type": "PICK_FACE",
        "status": "ACTIVE",
        "utilizationPct": 39,
        "stockSummary": { "skuCount": 4, "onHandQty": 86, "reservedQty": 12, "availableQty": 74 }
      }
    ],
    "page": 1,
    "limit": 20,
    "totalItems": 62,
    "totalPages": 4,
    "hasNext": true,
    "hasPrev": false
  }
}
```

### 3.3 Get Bin
**Method:** `GET`  
**URL:** `/warehouse/bins/{binId}`  
**Authorization:** Bearer token  
**Permission:** `bins:read`

**Response:**
```json
{
  "success": true,
  "data": {
    "binId": "bin_a_12",
    "code": "A-12",
    "zone": { "zoneId": "zone_a", "code": "A", "name": "Produce" },
    "location": { "locationId": "loc_hyd", "name": "Hyderabad" },
    "type": "PICK_FACE",
    "status": "ACTIVE",
    "capacity": { "weightKg": 800, "volumeM3": 6.0, "slots": 24 },
    "utilization": { "weightKg": 310, "volumeM3": 2.1, "slots": 11, "pct": 39 },
    "temperature": { "minC": 10, "maxC": 25 },
    "stockSummary": { "skuCount": 4, "onHandQty": 86, "reservedQty": 12, "availableQty": 74 },
    "notes": "Produce pick face",
    "version": 5
  }
}
```

Detail also includes `lots`, the last 20 `recentMovements`, `openTasks`, and `capacityWarning` (`null`, `NEAR_FULL` at 90%, or `FULL`).

### 3.4 Create Bin
**Method:** `POST`  
**URL:** `/warehouse/bins`  
**Authorization:** Bearer token  
**Permission:** `bins:create`

**Headers:** `Idempotency-Key`

**Request:**
```json
{
  "zoneId": "zone_a",
  "code": "A-25",
  "type": "PICK_FACE",
  "capacity": { "weightKg": 800, "volumeM3": 6.0, "slots": 24 },
  "temperature": { "minC": 10, "maxC": 25 },
  "notes": "New produce pick face"
}
```

**Response:** `201`
```json
{
  "success": true,
  "data": {
    "binId": "bin_a_25",
    "code": "A-25",
    "zone": { "zoneId": "zone_a", "code": "A", "name": "Produce" },
    "type": "PICK_FACE",
    "status": "ACTIVE",
    "capacity": { "weightKg": 800, "volumeM3": 6.0, "slots": 24 },
    "utilization": { "weightKg": 0, "volumeM3": 0, "slots": 0, "pct": 0 },
    "stockSummary": { "skuCount": 0, "onHandQty": 0, "reservedQty": 0, "availableQty": 0 },
    "createdAt": "2026-11-02T06:30:00Z",
    "version": 1
  }
}
```

**Notes:**
- `code` matches `^[A-Z]-\d{2}$` and is unique in the location. A duplicate returns `409 DUPLICATE`.
- Over a configured `maxBins` returns `422 ZONE_CAPACITY_EXCEEDED`.
- `PICK_FACE` and `RESERVE` cannot sit in `DISPATCH`. `STAGING` and `DISPATCH` must. `QUARANTINE` must be in `QUARANTINE` or `COLD`.
- `code` and `zoneId` are immutable once the bin has stock or open tasks.

### 3.5 Update Bin
**Method:** `PATCH`  
**URL:** `/warehouse/bins/{binId}`  
**Authorization:** Bearer token  
**Permission:** `bins:update`

**Headers:** `If-Match`

**Request:**
```json
{
  "capacity": { "weightKg": 900, "volumeM3": 7.0, "slots": 28 },
  "notes": "Expanded produce pick face"
}
```

**Response:** `200` — the updated bin.

**Notes:**
- Allowed fields: `capacity`, `temperature`, `notes`. Status changes use block and unblock.
- Capacity below current use returns `422 CAPACITY_BELOW_UTILIZATION`.
- A temperature range that no longer covers stock returns `422 COLD_CHAIN_VIOLATION`.

### 3.6 Block Bin
**Method:** `POST`  
**URL:** `/warehouse/bins/{binId}/block`  
**Authorization:** Bearer token  
**Permission:** `bins:update`

**Headers:** `Idempotency-Key`, `If-Match`

**Request:**
```json
{
  "reason": "DAMAGED_SHELF",
  "note": "Shelf collapsed; maintenance ticket MT-441",
  "relocateToBinId": "bin_a_13"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "binId": "bin_a_12",
    "status": "BLOCKED",
    "block": {
      "reason": "DAMAGED_SHELF",
      "note": "Shelf collapsed; maintenance ticket MT-441",
      "blockedBy": { "userId": "usr_032", "name": "Ananya Menon" },
      "blockedAt": "2026-11-02T06:35:00Z"
    },
    "relocation": { "fromBinId": "bin_a_12", "toBinId": "bin_a_13", "movementIds": ["mov_915", "mov_916"] },
    "version": 6
  }
}
```

**Notes:**
- `reason` is `DAMAGED_SHELF`, `DAMAGED_RACK`, `CLEANING`, `QUARANTINE`, `MAINTENANCE`, or `OTHER`.
- An empty bin needs no relocation. Stock without `relocateToBinId` returns `409 BIN_NOT_EMPTY`.
- Staged pack tasks return `409 BIN_IN_USE`. Reserved picks return `409 BIN_HAS_RESERVATIONS`.
- The destination must be compatible, active, in the location, and have capacity. Relocation is one transaction.

### 3.7 Unblock Bin
**Method:** `POST`  
**URL:** `/warehouse/bins/{binId}/unblock`  
**Authorization:** Bearer token  
**Permission:** `bins:update`

**Headers:** `Idempotency-Key`, `If-Match`

**Request:**
```json
{ "note": "Repair completed", "inspectionPassed": true }
```

**Response:** `200` — `status` `ACTIVE`. A `DAMAGED_SHELF` block cannot be cleared until the inspection passes.

### 3.8 Deactivate Bin
**Method:** `DELETE`  
**URL:** `/warehouse/bins/{binId}`  
**Authorization:** Bearer token  
**Permission:** `bins:delete`

**Headers:** `If-Match`

**Response:** `200` — `status` `INACTIVE`. Allowed only with no stock, reservation, open task, staged order, or open count, and not when it is the last dispatch or staging bin. Otherwise `409 BIN_IN_USE`. The code stays reserved unless `reuseCode: true` is sent with an audit reason.

## 4. Near Expiry

Status is computed daily. The default near-expiry window is 7 days. `value` is quantity times unit cost.

**Status:** `NORMAL`, `NEAR_EXPIRY`, `EXPIRED`, `QUARANTINED`, `RETURN_PENDING`, `RETURNED`, `WRITE_OFF_PENDING`, `WRITTEN_OFF`, `DISPOSED`

### 4.1 List Expiry Batches
**Method:** `GET`  
**URL:** `/warehouse/expiry`  
**Authorization:** Bearer token  
**Permission:** `expiry:read`

**Query:** `daysToExpiry` (0–90, default 7), `status` (repeatable), `zoneId`, `categoryId`, `q`, `includeExpired` (default true), `page`, `limit`  
**Sort:** `expiresAt` ascending, then `value` descending

**Response:**
```json
{
  "success": true,
  "data": {
    "items": [
      {
        "batchId": "bat_curd_1104",
        "productName": "Curd 5kg",
        "sku": "CURD5",
        "binCode": "C-07",
        "quantity": 16,
        "unit": "TUB",
        "expiresAt": "2026-11-04",
        "daysToExpiry": 2,
        "value": 3360.0,
        "status": "NEAR_EXPIRY"
      }
    ],
    "summary": { "batchCount": 3, "skuCount": 3, "totalValue": 4570.0, "expiredValue": 490.0, "currency": "INR" },
    "page": 1,
    "limit": 20,
    "totalItems": 3,
    "totalPages": 1,
    "hasNext": false,
    "hasPrev": false
  }
}
```

A supervisor does not see cost and cannot dispose a batch. `daysToExpiry` of 0 means today. A negative value is expired.

### 4.2 Get Expiry Batch
**Method:** `GET`  
**URL:** `/warehouse/expiry/{batchId}`  
**Authorization:** Bearer token  
**Permission:** `expiry:read`

**Response:**
```json
{
  "success": true,
  "data": {
    "batchId": "bat_curd_1104",
    "batchNumber": "CURD-2026-1104",
    "product": { "productId": "prod_curd5", "name": "Curd 5kg", "sku": "CURD5", "category": "DAIRY", "coldChain": true },
    "location": { "locationId": "loc_hyd", "name": "Hyderabad" },
    "bin": { "binId": "bin_c_07", "code": "C-07", "zoneCode": "C" },
    "quantity": 16,
    "unit": "TUB",
    "unitCost": 210.0,
    "value": 3360.0,
    "currency": "INR",
    "receivedAt": "2026-10-29T03:20:00Z",
    "expiresAt": "2026-11-04",
    "daysToExpiry": 2,
    "status": "NEAR_EXPIRY",
    "supplier": { "supplierId": "sup_009", "name": "Dairy Craft" },
    "goodsReceipt": { "receiptId": "grn_0021", "referenceNumber": "GRN-2026-0021" },
    "reservedQty": 0,
    "availableQty": 16,
    "disposition": null,
    "version": 3
  }
}
```

Detail also includes movements, dispositions, open orders, a supplier-return reference, and the cold-chain range.

### 4.3 Create Disposition
**Method:** `POST`  
**URL:** `/warehouse/expiry/{batchId}/dispositions`  
**Authorization:** Bearer token  
**Permission:** `expiry:dispose`

**Headers:** `Idempotency-Key`, `If-Match`

**Request:**
```json
{
  "action": "QUARANTINE",
  "quantity": 16,
  "reason": "NEAR_EXPIRY",
  "destinationBinId": "bin_c_12",
  "note": "Move to cold quarantine for quality check",
  "evidenceUploadIds": []
}
```

**Response:** `201` when applied
```json
{
  "success": true,
  "data": {
    "dispositionId": "disp_0041",
    "batchId": "bat_curd_1104",
    "action": "QUARANTINE",
    "status": "APPLIED",
    "quantity": 16,
    "unit": "TUB",
    "fromBin": { "binId": "bin_c_07", "code": "C-07" },
    "toBin": { "binId": "bin_c_12", "code": "C-12" },
    "inventoryMovements": [
      { "movementId": "mov_917", "quantityDelta": -16, "binId": "bin_c_07" },
      { "movementId": "mov_918", "quantityDelta": 16, "binId": "bin_c_12" }
    ],
    "approval": null,
    "appliedAt": "2026-11-02T06:40:00Z",
    "version": 4
  }
}
```

**Response:** `201` when a write-off is above the threshold
```json
{
  "success": true,
  "data": {
    "dispositionId": "disp_0042",
    "batchId": "bat_curd_1104",
    "action": "WRITE_OFF",
    "status": "PENDING_APPROVAL",
    "quantity": 16,
    "value": 3360.0,
    "currency": "INR",
    "approval": { "approvalId": "apv_023", "status": "PENDING", "assignedRole": "WAREHOUSE_MANAGER" },
    "inventoryMovements": [],
    "version": 4
  }
}
```

**Notes:**
- `action` is `QUARANTINE`, `RETURN_TO_SUPPLIER`, `WRITE_OFF`, or `DISPOSE`.
- `reason` is `NEAR_EXPIRY`, `EXPIRED`, `DAMAGED`, `QUALITY_HOLD`, `SUPPLIER_RECALL`, `CONTAMINATION`, or `OTHER`.
- Quantity above the batch returns `422 QUANTITY_EXCEEDS_BATCH`. A partial quantity splits the batch.
- A reserved batch returns `409 BATCH_RESERVED` with the order IDs.
- Quarantine and supplier return need a `QUARANTINE` or compatible `COLD` bin.
- `WRITE_OFF` of expired or contaminated stock needs 1–5 evidence files. Missing evidence returns `422 EVIDENCE_REQUIRED`.
- The proposed write-off threshold is ₹2,000. At or below it, the movement posts. Above it, another manager approves. The client cannot send `autoApprove`.
- `DISPOSE` is allowed only from `WRITTEN_OFF`. It records a certificate and does not post a second movement.
- The warehouse cannot set a selling price. Markdown is a Platform price-list change.
- A supplier return does not create a supplier credit. Procurement and Finance settle that.

## 5. Dispatch Routes

Publish assigns shipments. Handover, in the Supervisor file, is what moves the order to `OUT_FOR_DELIVERY`.

**Status:** `DRAFT → PLANNED → PUBLISHED → IN_PROGRESS → COMPLETED`. Any state before `IN_PROGRESS` can move to `CANCELLED`.  
**Type:** `OWN_FLEET`, `COURIER`  
**Stop status:** `PLANNED`, `LOADED`, `HANDED_OVER`, `DELIVERED`, `FAILED`, `CANCELLED`

### 5.1 Get Routing Queue
**Method:** `GET`  
**URL:** `/warehouse/routing/queue`  
**Authorization:** Bearer token  
**Permission:** `routes:read`

**Query:** `date` (default today), `area`, `status` (`READY`, `STAGED`, `BLOCKED`), `q`, `page`, `limit`  
**Sort:** `area`, `createdAt`

**Response:**
```json
{
  "success": true,
  "data": {
    "items": [
      {
        "orderId": "ord_8821",
        "orderNumber": "ORD-8821",
        "customerName": "Spice Route",
        "area": "Jubilee Hills",
        "weightKg": 42.0,
        "status": "STAGED",
        "suggestedRoute": { "routeId": "rte_003", "name": "KitchenX Route 3" },
        "assignedRoute": null,
        "shipmentId": "shp_441"
      }
    ],
    "page": 1,
    "limit": 20,
    "totalItems": 5,
    "totalPages": 1,
    "hasNext": false,
    "hasPrev": false
  }
}
```

Only packed or staged orders that are not blocked, not cancelled, and not already on a published route. `weightKg` comes from the pack task.

### 5.2 List Routes
**Method:** `GET`  
**URL:** `/warehouse/routes`  
**Authorization:** Bearer token  
**Permission:** `routes:read`

**Query:** `date`, `status` (repeatable), `type`, `deliveryPartnerId`, `q`, `page`, `limit`  
**Sort:** `date`, then `routeNumber`

**Response:** List envelope. Each item uses the route object in 5.4 without the stop array when the list is summarized. Detail includes stops.

### 5.3 Get Route
**Method:** `GET`  
**URL:** `/warehouse/routes/{routeId}`  
**Authorization:** Bearer token  
**Permission:** `routes:read`

**Response:** The route object from 5.4 plus linked shipments, pack tasks, manifest metadata, and events. Another hub returns `403 OUT_OF_SCOPE`.

### 5.4 Create Route
**Method:** `POST`  
**URL:** `/warehouse/routes`  
**Authorization:** Bearer token  
**Permission:** `routes:create`

**Headers:** `Idempotency-Key`

**Request:** own fleet
```json
{
  "date": "2026-11-02",
  "type": "OWN_FLEET",
  "name": "KitchenX Route 3",
  "vehicle": { "vehicleNumber": "TS09AB1234", "type": "TEMPO", "capacityKg": 750 },
  "driver": { "name": "Imran Khan", "phone": "+919876543210" },
  "zoneIds": ["zone_a", "zone_c"],
  "notes": "North route"
}
```

**Request:** courier
```json
{
  "date": "2026-11-02",
  "type": "COURIER",
  "name": "Delhivery B2B · Gachibowli",
  "deliveryPartnerId": "dp_delhivery",
  "service": "B2B",
  "maxStops": 40,
  "notes": "Hand off at the courier dock"
}
```

**Response:** `201` — route `DRAFT`. `routeNumber` is generated. A past date returns `422 DATE_IN_PAST`. A vehicle that already has a published route that day returns `409 VEHICLE_ALREADY_ROUTED`.

The created route uses this shape once stops exist:

```json
{
  "routeId": "rte_003",
  "routeNumber": "KX-R3",
  "name": "KitchenX Route 3",
  "date": "2026-11-02",
  "type": "OWN_FLEET",
  "status": "PLANNED",
  "location": { "locationId": "loc_hyd", "name": "Hyderabad" },
  "vehicle": { "vehicleNumber": "TS09AB1234", "type": "TEMPO", "capacityKg": 750 },
  "driver": { "name": "Imran Khan", "phone": "+919876543210" },
  "stops": [
    {
      "stopId": "stp_01",
      "sequence": 1,
      "orderId": "ord_8821",
      "orderNumber": "ORD-8821",
      "customerName": "Spice Route",
      "area": "Jubilee Hills",
      "weightKg": 42.0,
      "shipmentId": "shp_441",
      "eta": "2026-11-02T07:10:00Z",
      "status": "PLANNED"
    }
  ],
  "totals": { "stops": 1, "weightKg": 42.0, "capacityKg": 750, "utilizationPct": 5.6 },
  "version": 3
}
```

### 5.5 Update Route
**Method:** `PATCH`  
**URL:** `/warehouse/routes/{routeId}`  
**Authorization:** Bearer token  
**Permission:** `routes:update`

**Headers:** `If-Match`

**Response:** `200`. Allowed in `DRAFT` or `PLANNED` for `name`, `vehicle`, `driver`, `maxStops`, and `notes`. `type`, `date`, `deliveryPartnerId`, and `routeNumber` are immutable. Capacity below assigned weight returns `422 CAPACITY_BELOW_ASSIGNED_WEIGHT`.

### 5.6 Assign Orders to Route
**Method:** `POST`  
**URL:** `/warehouse/routes/{routeId}/orders`  
**Authorization:** Bearer token  
**Permission:** `routes:assign`

**Headers:** `Idempotency-Key`, `If-Match`

**Request:**
```json
{ "orderIds": ["ord_8821", "ord_8830"] }
```

**Response:**
```json
{
  "success": true,
  "data": {
    "routeId": "rte_003",
    "status": "PLANNED",
    "assigned": [
      { "orderId": "ord_8821", "orderNumber": "ORD-8821", "stopId": "stp_01", "sequence": 1, "weightKg": 42.0 }
    ],
    "rejected": [],
    "totals": { "stops": 2, "weightKg": 103.0, "capacityKg": 750, "utilizationPct": 13.7 },
    "version": 4
  },
  "meta": { "etag": "\"4\"" }
}
```

**Notes:**
- Orders must be packed or staged, in the location, for the route date, and not on another published route. Otherwise `409 ORDER_NOT_READY` or `409 ORDER_ALREADY_ROUTED`.
- A short or blocked pack returns `409 ORDER_BLOCKED`.
- Own-fleet overweight returns `422 VEHICLE_CAPACITY_EXCEEDED`. Courier over `maxStops` returns `422 MAX_STOPS_EXCEEDED`.
- The default is all-or-nothing. `partial: true` assigns the valid orders and lists the rest in `rejected`.
- The first stop moves the route from `DRAFT` to `PLANNED`.

### 5.7 Remove Route Stop
**Method:** `DELETE`  
**URL:** `/warehouse/routes/{routeId}/orders/{orderId}`  
**Authorization:** Bearer token  
**Permission:** `routes:assign`

**Headers:** `If-Match`

**Response:** `200` — the stop is removed and the rest are re-sequenced. After publish and before `IN_PROGRESS`, send `reason` of 5–200 characters. After `IN_PROGRESS` returns `409 ROUTE_IN_PROGRESS`. Removing the last stop returns the route to `DRAFT`.

### 5.8 Publish Route
**Method:** `POST`  
**URL:** `/warehouse/routes/{routeId}/publish`  
**Authorization:** Bearer token  
**Permission:** `routes:publish`

**Headers:** `Idempotency-Key`, `If-Match`

**Request:**
```json
{ "notifyDriver": true, "manifestFormat": "PDF" }
```

**Response:**
```json
{
  "success": true,
  "data": {
    "routeId": "rte_003",
    "status": "PUBLISHED",
    "publishedAt": "2026-11-02T06:50:00Z",
    "manifest": { "format": "PDF", "url": "https://cdn.example.com/signed/manifest", "expiresAt": "2026-11-03T06:50:00Z", "stopCount": 2 },
    "shipments": [
      {
        "shipmentId": "shp_441",
        "orderId": "ord_8821",
        "status": "ASSIGNED",
        "deliveryPartnerId": "dp_kitchenx",
        "driverName": "Imran Khan",
        "vehicleNumber": "TS09AB1234",
        "eta": "2026-11-02T07:10:00Z"
      }
    ],
    "courier": null,
    "version": 5
  },
  "meta": { "etag": "\"5\"" }
}
```

A courier response adds `courier.deliveryPartnerId`, `courier.service`, and `courier.awbNumbers`.

**Notes:**
- No stops returns `422 ROUTE_EMPTY`. Own fleet without driver, vehicle, or capacity returns `422 ROUTE_INCOMPLETE`.
- A courier route is not published until every stop has an AWB. A partner business rejection returns `422 PARTNER_REJECTED`. A partner outage returns `502 PARTNER_ERROR` and does not publish.
- A notification failure does not roll back the publish.
- A second publish without a key returns `409 ALREADY_PUBLISHED`.
- Publish does not set the order to `OUT_FOR_DELIVERY`.

### 5.9 Close Route
**Method:** `POST`  
**URL:** `/warehouse/routes/{routeId}/close`  
**Authorization:** Bearer token  
**Permission:** `routes:close`

**Headers:** `Idempotency-Key`, `If-Match`

**Request:**
```json
{
  "note": "All stops delivered; one returned package",
  "returnedPackages": [
    { "orderId": "ord_8830", "packageId": "pkg_02", "reason": "CUSTOMER_REFUSED", "restockBinId": "bin_a_13" }
  ]
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "routeId": "rte_003",
    "status": "COMPLETED",
    "closedAt": "2026-11-02T13:30:00Z",
    "summary": { "stops": 6, "delivered": 5, "failed": 1, "returnedPackages": 1 },
    "version": 8
  },
  "meta": { "etag": "\"8\"" }
}
```

**Notes:**
- Every stop must be `DELIVERED`, `FAILED`, or `CANCELLED`. Otherwise `409 ROUTE_HAS_OPEN_STOPS`.
- A returned package is restocked in the same transaction. A blocked or incompatible bin is rejected.
- Closing does not mark a failed delivery as delivered, and it does not settle cash or refunds.
- A `DRAFT` or `PLANNED` route must be published or cancelled, not closed.

## 6. Inherited Floor Calls

The manager can run every supervisor call. Payloads are in the Warehouse Supervisor file. A manager who creates an above-threshold inward or count is the maker and cannot approve it.

### 6.1 Get Floor Dashboard
**Method:** `GET`  
**URL:** `/warehouse/dashboard`  
**Authorization:** Bearer token  
**Permission:** `dashboard:read`

**Response:** The floor dashboard in the Supervisor file.

The rest of the floor uses the same calls as the Supervisor file, with the same method, URL, body, and response:

- Receiving worklist, scan, and manual inward — Supervisor section 2
- Goods receipts — Supervisor section 3
- Pick lists — Supervisor section 4
- Pack queue, pack, stage, load, and handover — Supervisor section 5
- Offline sales — Supervisor section 6
- Stock counts — Supervisor section 7
- Bin stock and warehouse search — Supervisor sections 8 and 10

**Notes:**
- Optional `goods-receipts:over-receive` lets a manager confirm an over-receipt with `allowOverReceipt: true` and a reason. It is not granted by default.
- The manager cannot void a completed walk-in sale.
- Direct `POST /inventory/adjustments`, `PATCH /orders/{orderId}/status`, and finance refund calls return `403 FORBIDDEN`.

## 7. Error Response

**Example:**
```json
{
  "success": false,
  "error": {
    "code": "SELF_APPROVAL_FORBIDDEN",
    "message": "You cannot approve a request you created",
    "details": [{ "field": "approvalId", "code": "SELF_APPROVAL_FORBIDDEN", "message": "A different manager must decide" }],
    "requestId": "req_01J8Z4K2M9"
  }
}
```

| Status | Code | When |
|---|---|---|
| 400 | `VALIDATION_ERROR`, `INVALID_QUERY_PARAMETER` | Bad bin code, missing reason, or unknown query |
| 403 | `FORBIDDEN`, `OUT_OF_SCOPE`, `MFA_REQUIRED` | Finance or stock-adjust call, another hub, or missing step-up |
| 409 | `SELF_APPROVAL_FORBIDDEN`, `ALREADY_DECIDED`, `LINKED_RESOURCE_CHANGED`, `RECOUNT_REQUIRED`, `BIN_NOT_EMPTY`, `BIN_IN_USE`, `BIN_HAS_RESERVATIONS`, `DUPLICATE`, `BATCH_RESERVED`, `VEHICLE_ALREADY_ROUTED`, `ORDER_NOT_READY`, `ORDER_BLOCKED`, `ORDER_ALREADY_ROUTED`, `ALREADY_PUBLISHED`, `ROUTE_IN_PROGRESS`, `ROUTE_HAS_OPEN_STOPS`, `INVALID_STATE_TRANSITION`, `VERSION_MISMATCH`, `IDEMPOTENCY_KEY_REUSED` | Conflict |
| 422 | `AMOUNT_MISMATCH`, `BIN_CAPACITY_EXCEEDED`, `BIN_BLOCKED`, `ZONE_CAPACITY_EXCEEDED`, `CAPACITY_BELOW_UTILIZATION`, `COLD_CHAIN_VIOLATION`, `QUANTITY_EXCEEDS_BATCH`, `EVIDENCE_REQUIRED`, `DATE_IN_PAST`, `VEHICLE_CAPACITY_EXCEEDED`, `MAX_STOPS_EXCEEDED`, `ROUTE_EMPTY`, `ROUTE_INCOMPLETE`, `AWB_REQUIRED`, `PARTNER_REJECTED`, `CAPACITY_BELOW_ASSIGNED_WEIGHT` | Rule failed |
| 428 | `PRECONDITION_REQUIRED` | Missing `If-Match` |
| 502 | `PARTNER_ERROR` | Courier API failed. The route is not published |

## 8. Reference

#### Permissions added to the supervisor set

```
warehouse-approvals:read      warehouse-approvals:decide
bins:create                   bins:update        bins:delete
expiry:read                   expiry:dispose
routes:read                   routes:create      routes:update
routes:assign                 routes:publish     routes:close
stock-counts:review
goods-receipts:over-receive
```

The manager does not get `inventory:adjust`, `orders:update`, `shipments:assign`, `returns:resolve`, or finance permissions. Route publish is the controlled shipment assignment.

#### Maker and checker

| Decision | Checker | Self-approval |
|---|---|---|
| Manual inward above threshold | A different manager, or Platform break-glass | Forbidden |
| Count variance above tolerance | A different manager, or Platform break-glass | Forbidden |
| Expiry write-off above ₹2,000 | A different manager, or Platform break-glass | Forbidden |
| Bin block and route publish | None | Allowed and audited |
| Over-receipt | None, with a reason | Allowed and audited |

The first decision wins. The second caller gets `409 ALREADY_DECIDED`. An edit or cancel while the checker is deciding returns `409 LINKED_RESOURCE_CHANGED`. A breached SLA does not auto-approve.

#### Headers

`Idempotency-Key` is required on approve, send-back, investigate, bin create, block, unblock, disposition, route create, assign, publish, and close. `If-Match` is required on those writes plus bin update, bin delete, and route update. Keys last at least 24 hours and are scoped to the manager and location.

Reads: 600 per minute. Writes: 120 per minute. Approvals: 60 per minute. High-value approvals: 10 per minute. Route publish: 30 per minute per location.

#### Cases to test

| Case | Expected |
|---|---|
| Approve your own request | `409 SELF_APPROVAL_FORBIDDEN` |
| `acknowledgeAmount` does not match | `422 AMOUNT_MISMATCH` |
| High-value approval without MFA | `403 MFA_REQUIRED` |
| Approve a full or blocked bin | `422`, and no stock is posted |
| Approve a count that moved | `409 RECOUNT_REQUIRED` |
| Duplicate bin code | `409 DUPLICATE` |
| Block a stocked bin with no destination | `409 BIN_NOT_EMPTY` |
| Write off more than the batch, or a reserved batch | `422 QUANTITY_EXCEEDS_BATCH` or `409 BATCH_RESERVED` |
| Write off above ₹2,000 | `201` `PENDING_APPROVAL`, no movement |
| Assign an unpacked or already routed order | `409 ORDER_NOT_READY` or `409 ORDER_ALREADY_ROUTED` |
| Publish with no stops, no driver, or no AWB | `422 ROUTE_EMPTY`, `422 ROUTE_INCOMPLETE`, or `422 AWB_REQUIRED` |
| Close a route that still has an open stop | `409 ROUTE_HAS_OPEN_STOPS` |
| Direct inventory adjustment or a finance refund | `403 FORBIDDEN` |
| Empty list | `200` with `items: []` |

#### Open decisions

1. Thresholds of ₹25,000 for a manual inward, ₹2,000 for a write-off, and ₹50,000 for MFA are proposals.
2. A single-manager hub needs a real Platform break-glass permission, or the request waits.
3. Zones are read-only. Confirm whether managers may create them.
4. Bin stock stays a projection of the Platform ledger.
5. Batch and expiry are required for perishables.
6. Finance reads the loss movement. It does not approve the stock write-off first.
7. Supplier credit is left to procurement and Finance.
8. Routing is manual. An optimizer or live courier planner is later work.
9. Courier capacity is `maxStops`. Own fleet capacity is weight.
10. Over-receipt permission is optional and high risk.
11. Emergency shipment reassignment is not a separate permission. Publish is the path.
12. Hub returns receiving is not in this contract.
13. A walk-in `DELIVERED` order still needs an explicit Platform exception.
14. A manager with several hubs works one location at a time.
15. Route publish is operational, not a second stock approval.
