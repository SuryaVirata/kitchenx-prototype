# KitchenX Admin — Finance Admin API

**Base URL:** `{origin}/api/v1/admin`

Finance Admin reads orders, returns, customers and locations, and acts on refunds, payments, settlements, credit notes, customer ledgers, credit cases and finance reports. Paths below are relative to the base URL. Private calls use a staff Bearer token.

Shared objects for orders, returns, customers, locations, exports and the error envelope are in `sample rest responses KitchenX admin - Platform Admin.md`. This file defines the finance calls.

## 1. Dashboard

### 1.1 Get Finance Dashboard
**Method:** `GET`  
**URL:** `/dashboards/finance`  
**Authorization:** Bearer token  
**Permission:** `dashboard:read`

**Query:** `locationId`, `from`, `to` (default last 30 days)

**Response:**
```json
{
  "success": true,
  "data": {
    "generatedAt": "2026-11-02T05:00:00Z",
    "range": { "from": "2026-10-04T00:00:00Z", "to": "2026-11-02T23:59:59Z" },
    "kpis": {
      "prepaidSettled": { "value": 840000.0, "currency": "INR", "changePct": 6.2 },
      "codCollected": { "value": 120000.0, "currency": "INR", "changePct": -3.4 },
      "openRefunds": { "count": 6, "amount": 18400.0, "currency": "INR" },
      "creditNotes": { "count": 3, "amount": 9200.0, "currency": "INR" }
    },
    "settlementTrend": [
      { "date": "2026-10-27", "prepaid": 32400.0, "cod": 8100.0, "refunds": 1200.0 }
    ],
    "recentSettlements": [
      {
        "settlementId": "set_1902",
        "reference": "SET-1902",
        "orderNumber": "ORD-8810",
        "mode": "PREPAID",
        "amount": 14280.0,
        "currency": "INR",
        "status": "SETTLED",
        "settledAt": "2026-11-01T18:30:00Z"
      },
      {
        "paymentId": "pay_441",
        "reference": "COD-441",
        "orderNumber": "ORD-8818",
        "mode": "COD",
        "amount": 3640.0,
        "currency": "INR",
        "status": "COD_DUE",
        "dueAt": "2026-11-02T13:00:00Z"
      }
    ],
    "pendingActions": [
      { "type": "REFUND_RELEASE", "count": 4, "amount": 12800.0, "href": "/admin/refunds?status=REQUESTED" },
      { "type": "COD_MATCH", "count": 2, "amount": 5400.0, "href": "/admin/payments?mode=COD&status=COD_DUE" },
      { "type": "CREDIT_CASE", "count": 3, "href": "/admin/credit-cases?stage=WITH_FINANCE" }
    ]
  }
}
```

**Notes:**
- Location-scoped. Cash figures exclude cancelled orders.
- `openRefunds.amount` is the requested amount, not yet released.
- Numbers come from the ledger. Cache at most 60 seconds.

## 2. Refunds

The system creates a refund when a return is approved or a prepaid order is cancelled. Finance releases or holds it. Finance does not create refunds in this phase.

**Status:** `REQUESTED`, `ON_HOLD`, `APPROVED`, `PROCESSING`, `COMPLETED`, `FAILED`, `CANCELLED`  
**Method values:** `ORIGINAL_PAYMENT`, `WALLET`, `BANK_TRANSFER`, `CREDIT_NOTE`

`ORIGINAL_PAYMENT` is required for prepaid orders unless the provider refuses. Record the fallback.

### 2.1 List Refunds
**Method:** `GET`  
**URL:** `/refunds`  
**Authorization:** Bearer token  
**Permission:** `refunds:read`

**Query:** `q` (refund ID, order number, customer), `status`, `method`, `returnId`, `orderId`, `customerId`, `locationId`, `from`, `to`, `minAmount`, `maxAmount`, `page`, `limit`  
**Sort:** `createdAt`, `amount`, `releasedAt`

**Response:**
```json
{
  "success": true,
  "data": {
    "items": [
      {
        "refundId": "ref_0091",
        "refundNumber": "RFD-0091",
        "return": { "returnId": "ret_0091", "returnNumber": "RET-0091" },
        "order": { "orderId": "ord_8790", "orderNumber": "ORD-8790" },
        "customer": { "customerId": "cus_007", "name": "Spice Route" },
        "amount": 820.0,
        "currency": "INR",
        "method": "ORIGINAL_PAYMENT",
        "reason": "DAMAGED",
        "status": "REQUESTED",
        "createdAt": "2026-11-01T09:30:00Z"
      }
    ],
    "page": 1,
    "limit": 20,
    "totalItems": 6,
    "totalPages": 1,
    "hasNext": false,
    "hasPrev": false
  }
}
```

### 2.2 Get Refund
**Method:** `GET`  
**URL:** `/refunds/{refundId}`  
**Authorization:** Bearer token  
**Permission:** `refunds:read`

**Response:**
```json
{
  "success": true,
  "data": {
    "refundId": "ref_0091",
    "refundNumber": "RFD-0091",
    "return": { "returnId": "ret_0091", "returnNumber": "RET-0091" },
    "order": { "orderId": "ord_8790", "orderNumber": "ORD-8790" },
    "customer": { "customerId": "cus_007", "name": "Spice Route" },
    "amount": 820.0,
    "currency": "INR",
    "method": "ORIGINAL_PAYMENT",
    "reason": "DAMAGED",
    "status": "REQUESTED",
    "provider": "RAZORPAY",
    "providerRefundId": null,
    "requestedBy": { "type": "PLATFORM_ADMIN", "userId": "usr_001", "name": "Rahul Sharma" },
    "approvedBy": null,
    "hold": null,
    "createdAt": "2026-11-01T09:30:00Z",
    "updatedAt": "2026-11-01T09:30:00Z",
    "version": 1
  }
}
```

### 2.3 Release Refund
**Method:** `POST`  
**URL:** `/refunds/{refundId}/release`  
**Authorization:** Bearer token  
**Permission:** `refunds:release`

**Headers:** `Idempotency-Key`, `X-MFA-Assertion`, `If-Match`

**Request:**
```json
{
  "amount": 820.0,
  "method": "ORIGINAL_PAYMENT",
  "note": "Damage confirmed by photos",
  "providerOptions": { "speed": "NORMAL" }
}
```

**Response:** `200`
```json
{
  "success": true,
  "data": {
    "refundId": "ref_0091",
    "status": "PROCESSING",
    "amount": 820.0,
    "currency": "INR",
    "providerRefundId": "rfnd_rzp_8812",
    "releasedAt": "2026-11-01T10:05:00Z",
    "expectedCompletionAt": "2026-11-04T10:05:00Z"
  }
}
```

**Notes:**
- Allowed only from `REQUESTED` or `ON_HOLD`. From `PROCESSING` or `COMPLETED` return `409 INVALID_STATE_TRANSITION`.
- `amount` must be less than or equal to `captured − alreadyRefunded − alreadyReserved`. Over that amount return `422 REFUND_EXCEEDS_CAPTURED`.
- A provider timeout is `202` with `status: PROCESSING`. Reconcile from the webhook. Retry with the same idempotency key.
- `COMPLETED` is set only by a verified provider webhook.
- `FAILED` stores `failureCode` and `failureMessage`. A retry is a new action.
- Releasing a refund does not close the return. Closing stays a Platform action.
- When dual control is on, the maker cannot approve. Return `409 MAKER_CHECKER_VIOLATION`.

### 2.4 Hold Refund
**Method:** `POST`  
**URL:** `/refunds/{refundId}/hold`  
**Authorization:** Bearer token  
**Permission:** `refunds:hold`

**Headers:** `Idempotency-Key`

**Request:**
```json
{
  "reason": "CUSTOMER_DISPUTE",
  "note": "Customer claims a second damaged item",
  "reviewAt": "2026-11-05T06:00:00Z"
}
```

**Response:** `200`
```json
{
  "success": true,
  "data": {
    "refundId": "ref_0091",
    "status": "ON_HOLD",
    "hold": {
      "reason": "CUSTOMER_DISPUTE",
      "note": "Customer claims a second damaged item",
      "reviewAt": "2026-11-05T06:00:00Z"
    },
    "version": 2
  }
}
```

**Notes:**
- `reason` is `CUSTOMER_DISPUTE`, `DOCUMENTATION_MISSING`, `FRAUD_REVIEW`, `PROVIDER_ISSUE`, or `OTHER`.
- `note` is 10–500 characters.
- Holding a completed refund returns `409`. A hold parks the refund. Extending a hold updates `reviewAt` and keeps history.

## 3. Payments

One payment is the money record for one order. Prepaid gateway payments and COD collections use the same resource.

**Status:** `PENDING`, `AUTHORIZED`, `CAPTURED`, `SETTLED`, `RECONCILED`, `COD_DUE`, `COD_COLLECTED`, `FAILED`, `REFUNDED`, `PARTIALLY_REFUNDED`  
**Mode:** `PREPAID`, `COD`, `CREDIT_NOTE`  
**Provider:** `RAZORPAY`, `CASH`, `CREDIT_NOTE`

### 3.1 List Payments
**Method:** `GET`  
**URL:** `/payments`  
**Authorization:** Bearer token  
**Permission:** `payments:read`

**Query:** `q` (payment ref, order number, customer), `mode`, `status`, `provider`, `orderId`, `customerId`, `locationId`, `settlementId`, `from`, `to`, `minAmount`, `maxAmount`, `page`, `limit`  
**Sort:** `createdAt`, `paidAt`, `amount`, `status`

**Response:** List envelope. Each item uses the payment object in 3.2.

### 3.2 Get Payment
**Method:** `GET`  
**URL:** `/payments/{paymentId}`  
**Authorization:** Bearer token  
**Permission:** `payments:read`

**Response:**
```json
{
  "success": true,
  "data": {
    "paymentId": "pay_7712",
    "reference": "PAY-7712",
    "order": { "orderId": "ord_8810", "orderNumber": "ORD-8810" },
    "customer": { "customerId": "cus_014", "name": "Cloud Bowl" },
    "mode": "PREPAID",
    "provider": "RAZORPAY",
    "providerPaymentId": "pay_rzp_9912",
    "amount": 14280.0,
    "currency": "INR",
    "status": "CAPTURED",
    "settlement": null,
    "paidAt": "2026-11-02T03:51:00Z",
    "reconciliation": null,
    "refundedAmount": 0.0,
    "createdAt": "2026-11-02T03:50:00Z",
    "updatedAt": "2026-11-02T03:51:00Z",
    "version": 2
  }
}
```

**Notes:**
- `amount` is always positive. `refundedAmount` is the sum of completed and processing refunds.
- `netAmount` is `amount − refundedAmount`. Do not store it as a client field.

### 3.3 Reconcile Prepaid Payment
**Method:** `POST`  
**URL:** `/payments/{paymentId}/reconcile`  
**Authorization:** Bearer token  
**Permission:** `payments:reconcile`

**Headers:** `Idempotency-Key`, `X-MFA-Assertion`, `If-Match`

**Request:**
```json
{
  "providerSettlementId": "setl_rzp_7781",
  "settledAmount": 14280.0,
  "settledAt": "2026-11-02T18:30:00Z",
  "bankReference": "NEFT-20261102-7781",
  "fees": 285.6,
  "taxOnFees": 51.40,
  "note": "Matched to Razorpay settlement report"
}
```

**Response:** `200` — payment with `status` `RECONCILED` and a stored `reconciliation` (actor, timestamp, refs, fees).

**Notes:**
- Allowed from `CAPTURED` only. `SETTLED` or `RECONCILED` returns `409 ALREADY_RECONCILED`.
- `settledAmount` must equal `amount`. Any difference returns `422 AMOUNT_MISMATCH`. Do not adjust silently.
- `fees + taxOnFees` must be less than or equal to `settledAmount`. Net payout is computed on the server.
- Reusing another payment's settlement reference returns `409 DUPLICATE_SETTLEMENT_REFERENCE`.
- A later gateway correction is a new reconciliation adjustment, not an edit of this payment.

### 3.4 Match COD
**Method:** `POST`  
**URL:** `/payments/{paymentId}/match-cod`  
**Authorization:** Bearer token  
**Permission:** `payments:match-cod`

**Headers:** `Idempotency-Key`, `X-MFA-Assertion`

**Request:**
```json
{
  "collectedAmount": 3640.0,
  "collectedAt": "2026-11-02T12:40:00Z",
  "collectedBy": "Amit Singh",
  "cashDepositReference": "CASH-HYD-20261102-04",
  "note": "Collected at delivery"
}
```

**Response:** `200` — payment with `status` `COD_COLLECTED`, or `RECONCILED` once the cash deposit is confirmed.

**Notes:**
- Allowed from `COD_DUE`, or from `COD_COLLECTED` for a shortfall correction. Already reconciled returns `409`.
- `collectedAmount` must equal the order COD due.
- A shortfall requires `shortfallReason`: `CUSTOMER_PAID_PARTIAL`, `CHANGE_NOT_AVAILABLE`, `DISPUTE`, or `OTHER`. It creates a customer-ledger receivable.
- An overpayment requires `overpaymentReason` and creates a credit balance.
- `collectedBy` must be an active delivery partner when the order has a shipment.
- If `settings.finance.codDepositConfirmed` is true, deposit confirmation is a separate step.
- Reject a future `collectedAt` and a date before delivery.
- Settlement date filters use the business date in `Asia/Kolkata`, cut off at 23:59:59.

## 4. Settlements

A settlement is a provider or bank payout covering one or more payments.

**Status:** `PENDING`, `IN_TRANSIT`, `SETTLED`, `RECONCILED`, `FAILED`

### 4.1 List Settlements
**Method:** `GET`  
**URL:** `/settlements`  
**Authorization:** Bearer token  
**Permission:** `settlements:read`

**Query:** `q` (settlement ref, bank ref), `provider`, `status`, `from`, `to`, `minAmount`, `maxAmount`, `locationId`, `page`, `limit`  
**Sort:** `settledAt`, `netAmount`, `createdAt`

**Response:** List envelope. Each item uses the settlement object in 4.2, without the payment breakdown.

### 4.2 Get Settlement
**Method:** `GET`  
**URL:** `/settlements/{settlementId}`  
**Authorization:** Bearer token  
**Permission:** `settlements:read`

**Response:**
```json
{
  "success": true,
  "data": {
    "settlementId": "set_1902",
    "reference": "SET-1902",
    "provider": "RAZORPAY",
    "providerSettlementId": "setl_rzp_7781",
    "grossAmount": 14280.0,
    "fees": 285.6,
    "taxOnFees": 51.40,
    "netAmount": 13943.0,
    "currency": "INR",
    "status": "SETTLED",
    "paymentCount": 1,
    "settledAt": "2026-11-02T18:30:00Z",
    "bankReference": null,
    "reconciliation": null,
    "payments": [
      { "paymentId": "pay_7712", "orderNumber": "ORD-8810", "amount": 14280.0, "fees": 285.6 }
    ],
    "totals": { "grossAmount": 14280.0, "fees": 285.6, "taxOnFees": 51.40, "netAmount": 13943.0 },
    "createdAt": "2026-11-01T18:30:00Z",
    "version": 1
  }
}
```

**Notes:**
- `grossAmount` equals the sum of linked captured payments.
- `netAmount` equals `gross − fees − taxOnFees`.
- A payment belongs to at most one settlement.
- A provider split is a new settlement. Do not edit line items.

### 4.3 Reconcile Settlement
**Method:** `POST`  
**URL:** `/settlements/{settlementId}/reconcile`  
**Authorization:** Bearer token  
**Permission:** `settlements:reconcile`

**Headers:** `Idempotency-Key`, `X-MFA-Assertion`, `If-Match`

**Request:**
```json
{
  "bankReference": "NEFT-20261102-7781",
  "creditedAmount": 13943.0,
  "creditedAt": "2026-11-02T19:05:00Z",
  "note": "Matched to bank credit"
}
```

**Response:** `200` — settlement with `status` `RECONCILED` and the bank reference stored.

**Notes:**
- `creditedAmount` must equal `netAmount`. Any difference returns `422 AMOUNT_MISMATCH`.
- `bankReference` is unique. One bank credit cannot settle two records. A reuse returns `409 DUPLICATE_SETTLEMENT_REFERENCE`.
- The same settlement and bank reference is idempotent.

## 5. Credit Notes

A credit note is store credit when money is not returned on the original payment method.

**Status:** `DRAFT`, `PENDING_APPROVAL`, `APPROVED`, `APPLIED`, `REJECTED`, `VOID`

### 5.1 List Credit Notes
**Method:** `GET`  
**URL:** `/credit-notes`  
**Authorization:** Bearer token  
**Permission:** `credit-notes:read`

**Query:** `q` (credit-note number, order, customer), `status`, `customerId`, `orderId`, `returnId`, `from`, `to`, `page`, `limit`  
**Sort:** `createdAt`, `amount`, `issuedAt`

**Response:** List envelope. Each item uses the credit-note object in 5.2.

### 5.2 Get Credit Note
**Method:** `GET`  
**URL:** `/credit-notes/{creditNoteId}`  
**Authorization:** Bearer token  
**Permission:** `credit-notes:read`

**Response:**
```json
{
  "success": true,
  "data": {
    "creditNoteId": "cn_118",
    "creditNoteNumber": "CN-118",
    "customer": { "customerId": "cus_007", "name": "Spice Route" },
    "order": { "orderId": "ord_8790", "orderNumber": "ORD-8790" },
    "return": { "returnId": "ret_0091" },
    "amount": 820.0,
    "currency": "INR",
    "reason": "DAMAGED",
    "status": "PENDING_APPROVAL",
    "issuedAt": null,
    "appliedToOrderId": null,
    "expiresAt": "2027-11-01T00:00:00Z",
    "createdBy": { "userId": "usr_001", "name": "Rahul Sharma" },
    "approvedBy": null,
    "createdAt": "2026-11-01T09:35:00Z",
    "version": 1
  }
}
```

### 5.3 Approve Credit Note
**Method:** `POST`  
**URL:** `/credit-notes/{creditNoteId}/approve`  
**Authorization:** Bearer token  
**Permission:** `credit-notes:approve`

**Headers:** `Idempotency-Key`, `If-Match`, `X-MFA-Assertion`

**Request:**
```json
{
  "note": "Approved as store credit",
  "expiresInDays": 365
}
```

**Response:** `200` — credit note with `status` `APPROVED`, `issuedAt` set, and an immutable ledger credit posted.

**Notes:**
- Allowed only from `PENDING_APPROVAL`.
- `amount` must be within the same order balance as refunds. A credit note and a refund cannot both fully cover the same amount.
- Approval does not change the order total.
- `APPLIED` is set by the system when an order consumes the credit.
- `VOID` of an approved unused note uses `credit-notes:approve` and a reason. A partly used note cannot be voided.
- Expiry is a scheduled job. An expired note moves to `VOID` with `expired: true`. Default life is 365 days.

### 5.4 Reject Credit Note
**Method:** `POST`  
**URL:** `/credit-notes/{creditNoteId}/reject`  
**Authorization:** Bearer token  
**Permission:** `credit-notes:reject`

**Headers:** `Idempotency-Key`, `If-Match`

**Request:**
```json
{
  "reason": "DUPLICATE_REQUEST",
  "note": "A refund was already released for this return"
}
```

**Response:** `200` — credit note with `status` `REJECTED`.

**Notes:**
- `reason` is `DUPLICATE_REQUEST`, `AMOUNT_INVALID`, `POLICY`, or `OTHER`.

## 6. Customer Ledgers

The ledger is the source of truth for prepaid balance, COD due, and credit used.

**Balance status:** `CLEAR`, `COD_OPEN`, `CREDIT_OPEN`, `OVERDUE`  
**Entry types:** `ORDER_CHARGE`, `PAYMENT_RECEIVED`, `REFUND_ISSUED`, `CREDIT_NOTE_ISSUED`, `CREDIT_NOTE_APPLIED`, `COD_COLLECTED`, `COD_SHORTFALL`, `ADJUSTMENT`, `OPENING_BALANCE`, `WRITE_OFF`

### 6.1 List Customer Ledgers
**Method:** `GET`  
**URL:** `/customer-ledgers`  
**Authorization:** Bearer token  
**Permission:** `customer-ledgers:read`

**Query:** `q` (customer), `status`, `hasCodDue`, `hasCredit`, `locationId`, `rmId`, `page`, `limit`  
**Sort:** `codDue`, `prepaidBalance`, `creditUsed`, `lastActivityAt`

**Response:** List envelope. Each item uses the balance object in 6.2.

### 6.2 Get Customer Ledger
**Method:** `GET`  
**URL:** `/customer-ledgers/{customerId}`  
**Authorization:** Bearer token  
**Permission:** `customer-ledgers:read`

**Response:**
```json
{
  "success": true,
  "data": {
    "customerId": "cus_007",
    "businessName": "Spice Route",
    "currency": "INR",
    "prepaidBalance": 42100.0,
    "codDue": 0.0,
    "credit": { "approvedLimit": 50000.0, "used": 0.0, "available": 50000.0 },
    "status": "CLEAR",
    "lastActivityAt": "2026-11-01T12:00:00Z",
    "version": 44
  }
}
```

### 6.3 List Ledger Entries
**Method:** `GET`  
**URL:** `/customer-ledgers/{customerId}/entries`  
**Authorization:** Bearer token  
**Permission:** `customer-ledgers:read`

**Query:** `page`, `limit`, `from`, `to`, `entryType`

**Response:**
```json
{
  "success": true,
  "data": {
    "items": [
      {
        "entryId": "led_991",
        "entryType": "COD_COLLECTED",
        "referenceType": "PAYMENT",
        "referenceId": "pay_441",
        "debit": 0.0,
        "credit": 3640.0,
        "balanceAfter": 42100.0,
        "currency": "INR",
        "description": "COD cash collected for ORD-8818",
        "createdAt": "2026-11-02T12:40:00Z",
        "createdBy": { "userId": "usr_002", "name": "Meera Iyer" }
      }
    ],
    "page": 1,
    "limit": 20,
    "totalItems": 44,
    "totalPages": 3,
    "hasNext": true,
    "hasPrev": false
  }
}
```

**Notes:**
- Entries are append-only. There is no edit or delete.
- A correction is a reversing entry with a reason. That needs `customer-ledgers:adjust`, which Finance does not have by default.
- The summary must equal the latest `balanceAfter` in each bucket. If it does not, return `500 LEDGER_INCONSISTENT` and alert. Do not recompute silently.

## 7. Credit Cases

`creditCaseId` is the same value as Platform `applicationId`. Do not create a second ID. Platform owns the visit and hand-off. This section is the Finance decision.

**Stage filter:** `WITH_FINANCE`, `APPROVED`, `REJECTED`. Default queue is `WITH_FINANCE`.

### 7.1 List Credit Cases
**Method:** `GET`  
**URL:** `/credit-cases`  
**Authorization:** Bearer token  
**Permission:** `credit-cases:read`

**Query:** `q`, `stage`, `visitStatus`, `customerId`, `minLimit`, `maxLimit`, `from`, `to`, `page`, `limit`  
**Sort:** `submittedAt`, `approvedLimit`, `updatedAt`

**Response:** List envelope. Each item uses the credit-case object in 7.2.

### 7.2 Get Credit Case
**Method:** `GET`  
**URL:** `/credit-cases/{creditCaseId}`  
**Authorization:** Bearer token  
**Permission:** `credit-cases:read`

**Response:**
```json
{
  "success": true,
  "data": {
    "creditCaseId": "cred_003",
    "applicationId": "cred_003",
    "customerId": "cus_014",
    "businessName": "Cloud Bowl",
    "stage": "WITH_FINANCE",
    "visitStatus": "REGISTERED",
    "visitSummary": "Visited 2026-11-02; kitchen and cold storage verified",
    "documentsComplete": true,
    "risk": { "score": 72, "band": "MEDIUM", "notes": "14 months of on-time orders" },
    "approvedLimit": null,
    "usedLimit": 0.0,
    "availableLimit": 0.0,
    "currency": "INR",
    "submittedAt": "2026-10-28T06:05:00Z",
    "decision": null,
    "version": 3
  }
}
```

**Notes:**
- `risk` is optional until a real risk provider exists. Do not present it as a live score.

### 7.3 Approve Credit Case
**Method:** `POST`  
**URL:** `/credit-cases/{creditCaseId}/approve`  
**Authorization:** Bearer token  
**Permission:** `credit-cases:decide`

**Headers:** `Idempotency-Key`, `If-Match`, `X-MFA-Assertion`

**Request:**
```json
{
  "approvedLimit": 50000.0,
  "note": "Based on 14 months of orders and verified documents",
  "reviewAt": "2027-05-01"
}
```

**Response:** `200`
```json
{
  "success": true,
  "data": {
    "creditCaseId": "cred_003",
    "stage": "APPROVED",
    "approvedLimit": 50000.0,
    "usedLimit": 0.0,
    "availableLimit": 50000.0,
    "currency": "INR",
    "decision": {
      "by": { "userId": "usr_002", "name": "Meera Iyer" },
      "at": "2026-11-02T06:20:00Z",
      "note": "Based on 14 months of orders and verified documents"
    },
    "version": 4
  }
}
```

**Notes:**
- Allowed only from `WITH_FINANCE`. From `APPROVED` or `REJECTED` return `409 ALREADY_DECIDED`.
- Required documents must be `VERIFIED`. Default set: `GST`, `PAN`, `BANK_STATEMENT`, `ADDRESS_PROOF`. Missing documents return `422 REQUIRED_DOCUMENTS_MISSING` with the missing types.
- `approvedLimit` is from 1000 to 5000000, 2 decimal places, and is the total limit.
- Approval creates the credit bucket: `availableLimit = approvedLimit − usedLimit`. Notify the customer.
- The Platform user who sent the case cannot approve it. Return `403 MAKER_CHECKER_VIOLATION`.
- Only one `APPROVED` case per customer. A second case returns `409 ACTIVE_CREDIT_EXISTS`. Use adjust-limit.

### 7.4 Reject Credit Case
**Method:** `POST`  
**URL:** `/credit-cases/{creditCaseId}/reject`  
**Authorization:** Bearer token  
**Permission:** `credit-cases:decide`

**Headers:** `Idempotency-Key`, `If-Match`, `X-MFA-Assertion`

**Request:**
```json
{
  "reason": "INSUFFICIENT_HISTORY",
  "note": "Only 6 weeks of order history; reapply after 3 months"
}
```

**Response:** `200` — case with `stage` `REJECTED`. The decision is terminal. Documents are retained. Customer notification is required.

**Notes:**
- `reason` is `INSUFFICIENT_HISTORY`, `DOCUMENTS_UNVERIFIABLE`, `RISK_LIMIT`, `DUPLICATE_APPLICATION`, `POLICY`, or `OTHER`.

### 7.5 Adjust Credit Limit
**Method:** `POST`  
**URL:** `/credit-cases/{creditCaseId}/adjust-limit`  
**Authorization:** Bearer token  
**Permission:** `credit-cases:decide`

**Headers:** `Idempotency-Key`, `If-Match`, `X-MFA-Assertion`

**Request:**
```json
{
  "approvedLimit": 75000.0,
  "reason": "Six additional months of on-time payments",
  "effectiveAt": "2026-12-01"
}
```

**Response:** `200` — the same approved case at a new `version`, with before and after limits in the audit record.

**Notes:**
- Only for an already approved case.
- A limit below `usedLimit` returns `422 LIMIT_BELOW_UTILISATION`.
- Reducing the limit does not cancel open orders. It blocks new credit above the available amount.

## 8. Reports

The report calls are shared with Platform Admin. Finance uses these keys.

| `reportKey` | Content | Required filters | Minimum columns |
|---|---|---|---|
| `SETTLEMENT_VS_PAYOUT` | Gateway gross, fees, tax, net, bank credit | `from`, `to`, `locationId` optional | settlementRef, provider, gross, fees, net, bankRef, status |
| `COD_CASH_CYCLE` | COD due, collected, deposited | `from`, `to`, `locationId` optional, `deliveryPartnerId` optional | orderNo, due, collected, variance, collectedAt, depositRef |
| `REFUND_REGISTER` | Requested, released, completed | `from`, `to`, `status` optional | refundNo, orderNo, amount, status, approvedBy, releasedAt |
| `CREDIT_UTILISATION` | Limit, used, available, overdue | `asOf`, `locationId` optional | customer, limit, used, available, daysOverdue |
| `REVENUE_BY_MODE` | Prepaid, COD, credit note | `from`, `to`, `locationId` optional | date, prepaid, cod, creditNote, total |

### 8.1 List Reports
**Method:** `GET`  
**URL:** `/reports`  
**Authorization:** Bearer token  
**Permission:** `reports:read`

**Response:** `200` — the report catalogue the caller can run. Finance sees the five keys above.

### 8.2 Run Report
**Method:** `GET`  
**URL:** `/reports/{reportKey}`  
**Authorization:** Bearer token  
**Permission:** `reports:read`

**Query:** report filters, plus `page`, `limit`, `sortBy`, `sortOrder`

**Response:** `200` — list envelope of rows, plus `meta.columns`.

**Notes:**
- JSON is the paginated read. A report must not change ledgers or settlements.

### 8.3 Export Report
**Method:** `POST`  
**URL:** `/reports/{reportKey}/exports`  
**Authorization:** Bearer token  
**Permission:** `reports:export`

**Headers:** `Idempotency-Key`, `X-MFA-Assertion`

**Request:**
```json
{
  "format": "XLSX",
  "filters": { "from": "2026-10-01", "to": "2026-10-31", "locationId": "loc_hyd" }
}
```

**Response:** `202`
```json
{
  "success": true,
  "data": { "jobId": "exp_01", "status": "QUEUED", "createdAt": "2026-11-02T05:10:00Z" }
}
```

**Notes:**
- Format is `CSV` or `XLSX` only.
- Cap is 100,000 rows and 10 concurrent jobs per user. Over the cap returns `422 EXPORT_TOO_LARGE`.
- Files that contain customer financial data are watermarked with the requesting user and timestamp, and expire after 24 hours.

### 8.4 Get Export Job
**Method:** `GET`  
**URL:** `/exports/{jobId}`  
**Authorization:** Bearer token  
**Permission:** `reports:read`

**Response:** `200` — `status` is `QUEUED`, `RUNNING`, `COMPLETED`, `FAILED`, or `EXPIRED`, plus `rowCount`, `downloadUrl`, `expiresAt`, and `error` when failed.

## 9. Shared Reads

Finance order and return screens are read-only. Release and Hold on a return screen call section 2, filtered by `returnId`. There is no `POST /returns/{id}/refund`.

### 9.1 List Orders
**Method:** `GET`  
**URL:** `/orders`  
**Authorization:** Bearer token  
**Permission:** `orders:read`

**Query:** `locationId`, `status`, `from`, `to`, `customerId`, `q`, `page`, `limit`

**Response:** List envelope. Item shape is the order object in Platform Admin, Orders.

### 9.2 Get Order
**Method:** `GET`  
**URL:** `/orders/{orderId}`  
**Authorization:** Bearer token  
**Permission:** `orders:read`

**Response:** The order object in Platform Admin, Orders.

**Notes:**
- `PATCH /orders/{orderId}`, `PATCH /orders/{orderId}/status`, and `POST /orders/{orderId}/cancel` return `403 FORBIDDEN`.

### 9.3 List Returns
**Method:** `GET`  
**URL:** `/returns`  
**Authorization:** Bearer token  
**Permission:** `returns:read`

**Response:** List envelope. Item shape is the return object in Platform Admin, Returns.

### 9.4 Get Return
**Method:** `GET`  
**URL:** `/returns/{returnId}`  
**Authorization:** Bearer token  
**Permission:** `returns:read`

**Response:** The return object in Platform Admin, Returns.

**Notes:**
- `POST /returns/{returnId}/review` returns `403 FORBIDDEN`.

### 9.5 List Customers
**Method:** `GET`  
**URL:** `/customers`  
**Authorization:** Bearer token  
**Permission:** `customers:read`

**Response:** List envelope. Item shape is the customer object in Platform Admin, Customers.

### 9.6 Get Customer
**Method:** `GET`  
**URL:** `/customers/{customerId}`  
**Authorization:** Bearer token  
**Permission:** `customers:read`

**Response:** The customer object in Platform Admin, Customers.

**Notes:**
- Customer writes return `403 FORBIDDEN`.

### 9.7 List Locations
**Method:** `GET`  
**URL:** `/locations`  
**Authorization:** Bearer token  
**Permission:** `locations:read`

**Response:** The location list in Platform Admin, Settings and locations.

## 10. Error Response

**Example:**
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "The request contains invalid data",
    "details": [
      { "field": "amount", "code": "INVALID_VALUE", "message": "Must be greater than 0" }
    ],
    "requestId": "req_01J8Z4K2M9"
  }
}
```

| Status | Code | When |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Bad body, including a negative amount |
| 401 | `UNAUTHENTICATED` | Missing or expired token |
| 403 | `FORBIDDEN`, `OUT_OF_SCOPE`, `MFA_REQUIRED`, `MAKER_CHECKER_VIOLATION` | Permission, location, step-up, or maker is checker |
| 409 | `INVALID_STATE_TRANSITION`, `ALREADY_RECONCILED`, `ALREADY_DECIDED`, `DUPLICATE_SETTLEMENT_REFERENCE`, `VERSION_MISMATCH`, `ACTIVE_CREDIT_EXISTS` | Conflict |
| 422 | `REFUND_EXCEEDS_CAPTURED`, `AMOUNT_MISMATCH`, `REQUIRED_DOCUMENTS_MISSING`, `LIMIT_BELOW_UTILISATION`, `EXPORT_TOO_LARGE` | Rule failed |
| 428 | `PRECONDITION_REQUIRED` | Missing `If-Match` |
| 500 | `LEDGER_INCONSISTENT` | Ledger does not match its entries |

## 11. Reference

#### Permissions

```
orders:read              returns:read             customers:read
payments:read            payments:reconcile       payments:match-cod
settlements:read         settlements:reconcile
refunds:read             refunds:release          refunds:hold
credit-notes:read        credit-notes:approve     credit-notes:reject
customer-ledgers:read
credit-cases:read        credit-cases:decide
reports:read             reports:export
dashboard:read           locations:read
```

A read-only analyst keeps only the `*:read` permissions. No extra endpoints are required.

Finance cannot edit products, customers, orders, returns, users, zones, CMS, notification rules, integrations, or platform settings.

#### Money rules

- Every finance write requires `Idempotency-Key`.
- `refunds:release`, `payments:reconcile`, `payments:match-cod`, `credit-notes:approve`, `credit-cases:decide`, and `reports:export` require `X-MFA-Assertion` issued within the last 5 minutes.
- When `settings.finance.dualControl` is true, the maker of a refund or credit note cannot approve it.
- Amounts are decimal rupees, 2 decimal places, `currency: "INR"`. Round half-up on the final payable amount only.
- Negative amounts are rejected. A correction is an adjustment or reversal.
- Same idempotency key and same body returns the original response. Same key and a different body returns `409 IDEMPOTENCY_KEY_REUSED`.

#### State

```
Refund:     REQUESTED → PROCESSING → COMPLETED
            REQUESTED → ON_HOLD → PROCESSING
            FAILED → PROCESSING (new retry)
Payment:    CAPTURED → RECONCILED
            COD_DUE → COD_COLLECTED → RECONCILED
Settlement: PENDING → IN_TRANSIT → SETTLED → RECONCILED
Credit:     REVIEW → WITH_FINANCE → APPROVED | REJECTED
            APPROVED → adjust-limit → APPROVED (new version)
```

`COMPLETED` on a refund is terminal and is never set by the admin UI.

#### Invariants

1. Payments for an order sum to the order total unless a documented adjustment exists.
2. Refunded plus refunds in flight plus credit notes cannot exceed captured.
3. `credit.used` is at least 0. `credit.available = approvedLimit − used`.
4. Settlement gross equals the sum of linked payment amounts.
5. Settlement net equals gross minus fees minus tax on fees.
6. Ledger entries sum to the bucket balance.
7. A payment belongs to at most one settlement.

#### Cases to test

| Case | Expected |
|---|---|
| Release the same refund with a new idempotency key | `409 INVALID_STATE_TRANSITION` |
| Release above captured balance | `422 REFUND_EXCEEDS_CAPTURED` |
| Reconcile with a ₹1 difference | `422 AMOUNT_MISMATCH` |
| Reuse a bank reference | `409 DUPLICATE_SETTLEMENT_REFERENCE` |
| COD shortfall without a reason | `400 VALIDATION_ERROR` |
| Approve a credit case with PAN missing | `422 REQUIRED_DOCUMENTS_MISSING` |
| Approve a credit case twice | `409 ALREADY_DECIDED` |
| Platform user approves the case they sent | `403 MAKER_CHECKER_VIOLATION` |
| Reduce a limit below used | `422 LIMIT_BELOW_UTILISATION` |
| Finance calls `POST /products` or cancels an order | `403 FORBIDDEN` |
| Stale `If-Match` | `409 VERSION_MISMATCH` |
| Order outside location scope | `403 OUT_OF_SCOPE` |
| Export over 100,000 rows | `422 EXPORT_TOO_LARGE` |
| Negative amount | `400 VALIDATION_ERROR` |

#### Open decisions

1. Dual control above ₹10,000 for refunds, and for every credit limit, is proposed.
2. COD matching may need a separate bank-deposit step. The prototype only shows Match cash.
3. If the original payment method cannot be refunded, confirm whether a credit note is automatic or chosen by Finance.
4. `risk` stays optional until a provider exists.
5. Gateway fees are authoritative and stored per settlement.
6. Credit-note expiry default is 365 days.
7. GST split on credit notes (CGST, SGST, IGST) needs a tax rule before real documents are issued.
