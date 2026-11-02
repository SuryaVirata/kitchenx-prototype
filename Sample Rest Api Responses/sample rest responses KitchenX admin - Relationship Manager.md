# KitchenX Admin — Relationship Manager API

**Base URL:** `{origin}/api/v1/admin`

The Relationship Manager works only with kitchens assigned to them (`customer.assignedRmId`). Paths below are relative to the base URL. Private calls use a staff Bearer token.

Orders, customers, leads, returns, shipments and the error envelope are shared with Platform Admin. This file adds the RM dashboard, RM-scoped reads, lead activities, tickets and return requests. Customer app ticket creation uses the same ticket resource.

## 1. Dashboard

### 1.1 Get RM Dashboard
**Method:** `GET`  
**URL:** `/rm/dashboard`  
**Authorization:** Bearer token  
**Permission:** `dashboard:read`

**Query:** `locationId` (still limited to assigned customers), `from`, `to` (default last 30 days)

**Response:**
```json
{
  "success": true,
  "data": {
    "generatedAt": "2026-11-02T05:00:00Z",
    "rm": { "userId": "usr_021", "name": "Kavya Reddy" },
    "range": { "from": "2026-10-04T00:00:00Z", "to": "2026-11-02T23:59:59Z" },
    "kpis": {
      "assignedKitchens": { "value": 18, "change": 1 },
      "openTickets": { "value": 7, "change": 0 },
      "leadsInPipeline": { "value": 5, "change": 2 },
      "ordersThisWeek": { "value": 142, "changePct": 11.0 }
    },
    "kitchenActivity": [
      { "date": "2026-10-27", "orders": 118, "gmv": 412000.0, "currency": "INR" },
      { "date": "2026-10-28", "orders": 126, "gmv": 438500.0, "currency": "INR" }
    ],
    "kitchensToday": [
      {
        "customerId": "cus_007",
        "businessName": "Spice Route",
        "lastOrder": { "orderId": "ord_8821", "orderNumber": "ORD-8821", "lineCount": 14, "createdAt": "2026-11-02T04:10:00Z" },
        "openTicket": null,
        "status": "ACTIVE"
      },
      {
        "customerId": "cus_009",
        "businessName": "The Urban Table",
        "lastOrder": { "orderId": "ord_8824", "orderNumber": "ORD-8824", "lineCount": 9, "createdAt": "2026-11-02T03:40:00Z" },
        "openTicket": { "ticketId": "tkt_031", "subject": "Short supply", "status": "IN_PROGRESS" },
        "status": "FOLLOW_UP"
      }
    ],
    "quickCounts": {
      "ticketsNeedReply": 4,
      "leadsDueToday": 2,
      "ordersOutForDelivery": 6,
      "returnsOpen": 2
    }
  }
}
```

**Notes:**
- Every count is the caller's book only.
- `change` is the difference from the previous period of the same length. `changePct` is a percentage.
- Cache at most 60 seconds per RM.

## 2. Customers

RM reads assigned kitchens only. Credit is a boolean, not a limit.

### 2.1 List Assigned Customers
**Method:** `GET`  
**URL:** `/customers`  
**Authorization:** Bearer token  
**Permission:** `customers:read`

**Query:** `assignedToMe=true`, `q`, `status`, `category`, `city`, `hasOpenTicket`, `from`, `to`, `page`, `limit`  
**Sort:** `businessName`, `lastOrderAt`, `outletCount`

**Response:**
```json
{
  "success": true,
  "data": {
    "items": [
      {
        "customerId": "cus_014",
        "businessName": "Cloud Bowl",
        "category": "CLOUD_KITCHEN",
        "contact": { "name": "Ravi Teja", "phone": "+919876543210", "email": "ravi@cloudbowl.example" },
        "outletCount": 3,
        "assignedRm": { "userId": "usr_021", "name": "Kavya Reddy" },
        "status": "ACTIVE",
        "hasCreditLine": true,
        "lastOrderAt": "2026-11-02T03:50:00Z"
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

**Notes:**
- `assignedToMe=true` means `assignedRmId` is the token subject.
- An `rmId` for another RM returns `403 OUT_OF_SCOPE`.
- RM does not receive limit, used, or available credit.
- `PATCH /customers/{customerId}` and status changes return `403 FORBIDDEN`.

### 2.2 Get Customer
**Method:** `GET`  
**URL:** `/customers/{customerId}`  
**Authorization:** Bearer token  
**Permission:** `customers:read`

**Response:** The RM customer object from 2.1 inside `data`. A customer assigned to someone else returns `403 OUT_OF_SCOPE`.

### 2.3 List Customer Outlets
**Method:** `GET`  
**URL:** `/customers/{customerId}/outlets`  
**Authorization:** Bearer token  
**Permission:** `customers:read`

**Response:** Outlet list for an assigned customer. Shape is in Platform Admin, Customers.

### 2.4 List Customer Orders
**Method:** `GET`  
**URL:** `/customers/{customerId}/orders`  
**Authorization:** Bearer token  
**Permission:** `customers:read`

**Response:** Order list for an assigned customer. Also requires the caller to hold `orders:read`.

## 3. Leads

Stages and the lead object are shared with Platform Admin. RM adds activities, proposals and claim. Phone is masked in lists unless the caller has `leads:read-pii`. Opening the full number on an assigned lead is audited.

**Stage:** `NEW → DISCOVERY → PROPOSAL → WON | LOST`. A backward move needs a note.

### 3.1 List Assigned Leads
**Method:** `GET`  
**URL:** `/leads`  
**Authorization:** Bearer token  
**Permission:** `leads:read`

**Query:** `assignedToMe=true`, `q`, `stage`, `area`, `dueToday`, `from`, `to`, `page`, `limit`  
**Sort:** `nextFollowUpAt`, `updatedAt`, `createdAt`

**Response:**
```json
{
  "success": true,
  "data": {
    "items": [
      {
        "leadId": "lead_0031",
        "name": "Ayesha Khan",
        "phone": "+91••••••3210",
        "productInterest": "Starter Kit — bakery",
        "area": "Gachibowli",
        "stage": "DISCOVERY",
        "assignedRm": { "userId": "usr_021", "name": "Kavya Reddy" },
        "nextFollowUpAt": "2026-11-03T06:00:00Z",
        "lastContactAt": "2026-11-01T07:30:00Z",
        "proposal": null,
        "createdAt": "2026-10-30T05:00:00Z",
        "updatedAt": "2026-11-01T07:30:00Z",
        "version": 3
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

### 3.2 Get Lead
**Method:** `GET`  
**URL:** `/leads/{leadId}`  
**Authorization:** Bearer token  
**Permission:** `leads:read`

**Query:** `include=activities,proposals`

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
    "stage": "DISCOVERY",
    "assignedRm": { "userId": "usr_021", "name": "Kavya Reddy" },
    "nextFollowUpAt": "2026-11-03T06:00:00Z",
    "notes": "Wants a site visit next week",
    "activities": [
      { "activityId": "act_01", "type": "CALL", "outcome": "CONNECTED", "note": "Discussed bakery setup", "createdAt": "2026-11-01T07:30:00Z", "createdBy": "Kavya Reddy" }
    ],
    "proposals": [],
    "createdAt": "2026-10-30T05:00:00Z",
    "updatedAt": "2026-11-01T07:30:00Z",
    "version": 3
  }
}
```

A lead assigned to another RM returns `403 OUT_OF_SCOPE`.

### 3.3 Update Lead
**Method:** `PATCH`  
**URL:** `/leads/{leadId}`  
**Authorization:** Bearer token  
**Permission:** `leads:update`

**Headers:** `If-Match`

**Request:**
```json
{
  "stage": "PROPOSAL",
  "nextFollowUpAt": "2026-11-05T06:00:00Z",
  "notes": "Proposal sent for bakery kit"
}
```

**Response:** `200` — the updated lead.

**Notes:**
- Allowed fields: `stage`, `nextFollowUpAt`, `notes`.
- An illegal stage returns `409 INVALID_STATE_TRANSITION` with `allowedNext`.
- `WON` needs a linked proposal or `wonReason`.
- `LOST` needs `lostReason`: `PRICE`, `TIMING`, `COMPETITOR`, `NOT_INTERESTED`, or `OTHER`.

### 3.4 Log Lead Activity
**Method:** `POST`  
**URL:** `/leads/{leadId}/activities`  
**Authorization:** Bearer token  
**Permission:** `leads:update`

**Headers:** `Idempotency-Key`

**Request:**
```json
{
  "type": "CALL",
  "outcome": "CONNECTED",
  "note": "Owner wants delivery before 6 am; asked for a sample menu",
  "durationSeconds": 420,
  "nextFollowUpAt": "2026-11-04T06:00:00Z"
}
```

**Response:** `201`
```json
{
  "success": true,
  "data": {
    "activityId": "act_02",
    "leadId": "lead_0031",
    "type": "CALL",
    "outcome": "CONNECTED",
    "note": "Owner wants delivery before 6 am; asked for a sample menu",
    "durationSeconds": 420,
    "createdBy": { "userId": "usr_021", "name": "Kavya Reddy" },
    "createdAt": "2026-11-02T05:20:00Z"
  }
}
```

**Notes:**
- `type` is `CALL`, `WHATSAPP`, `EMAIL`, `MEETING`, `SITE_VISIT`, or `NOTE`.
- `outcome` is `CONNECTED`, `NO_ANSWER`, `BUSY`, `WRONG_NUMBER`, `CALLBACK`, or `COMPLETED`.
- `note` is 2–2000 characters. `nextFollowUpAt` cannot be in the past.
- The call updates `lastContactAt` and the next follow-up together.

### 3.5 Send Proposal
**Method:** `POST`  
**URL:** `/leads/{leadId}/proposals`  
**Authorization:** Bearer token  
**Permission:** `leads:update`

**Headers:** `Idempotency-Key`

**Request:**
```json
{
  "amount": 45000.0,
  "currency": "INR",
  "validUntil": "2026-11-30",
  "documentUploadId": "upl_31",
  "note": "Bakery starter kit with 12-month support"
}
```

**Response:** `201`
```json
{
  "success": true,
  "data": {
    "proposalId": "prop_008",
    "leadId": "lead_0031",
    "status": "SENT",
    "amount": 45000.0,
    "currency": "INR",
    "validUntil": "2026-11-30",
    "documentUrl": "https://cdn.example.com/signed/prop_008",
    "sentAt": "2026-11-02T05:25:00Z",
    "sentBy": { "userId": "usr_021", "name": "Kavya Reddy" }
  }
}
```

**Notes:**
- `amount` must be greater than 0. `validUntil` is today or later.
- PDF only, at most 10 MB. The file is private and served by a short-lived URL.
- Sending from `DISCOVERY` moves the lead to `PROPOSAL`.
- A second proposal is a new version. It does not overwrite the first.

### 3.6 Claim Lead
**Method:** `POST`  
**URL:** `/leads/{leadId}/claim`  
**Authorization:** Bearer token  
**Permission:** `leads:claim`

**Headers:** `Idempotency-Key`

**Request:**
```json
{ "note": "Picked up from the unassigned queue" }
```

**Response:** `200` — lead with `assignedRm` set to the caller.

**Notes:**
- Only an unassigned lead, or a lead already assigned to the caller, can be claimed.
- Another RM's lead returns `409 LEAD_ALREADY_ASSIGNED`.
- Two RMs racing produce one winner. The other gets `409 LEAD_ALREADY_ASSIGNED`.
- Reassignment between RMs is `POST /leads/{leadId}/assign` and is a Platform action.

## 4. Tickets

Customer `POST /support/tickets` creates this same ticket. RM does not use a second ticket model.

**Category:** `SHORT_SUPPLY`, `QUALITY`, `DAMAGED`, `DELIVERY_DELAY`, `COD_QUERY`, `BILLING`, `REPLACEMENT`, `OTHER`  
**Status:** `OPEN`, `IN_PROGRESS`, `WAITING_CUSTOMER`, `WAITING_INTERNAL`, `RESOLVED`, `CLOSED`  
**Priority:** `LOW`, `NORMAL`, `HIGH`, `URGENT`  
**Team:** `RM`, `WAREHOUSE`, `FINANCE`, `LOGISTICS`, `TECHNICAL`

SLA: `URGENT` 1 hour, `HIGH` 4 business hours, `NORMAL` 1 business day, `LOW` 3 business days. The client cannot set SLA or the starting status.

### 4.1 List Tickets
**Method:** `GET`  
**URL:** `/rm/tickets`  
**Authorization:** Bearer token  
**Permission:** `tickets:read`

**Query:** `q` (number, customer, subject), `status`, `priority`, `category`, `customerId`, `orderId`, `assignedTeam`, `slaBreached`, `from`, `to`, `page`, `limit`  
**Sort:** `createdAt`, `priority`, `slaDueAt`

**Response:** List envelope of tickets for assigned customers. Each item uses the ticket object in 4.2.

### 4.2 Get Ticket
**Method:** `GET`  
**URL:** `/rm/tickets/{ticketId}`  
**Authorization:** Bearer token  
**Permission:** `tickets:read`

**Response:**
```json
{
  "success": true,
  "data": {
    "ticketId": "tkt_031",
    "ticketNumber": "TKT-031",
    "customer": { "customerId": "cus_009", "businessName": "The Urban Table" },
    "order": { "orderId": "ord_8824", "orderNumber": "ORD-8824" },
    "category": "SHORT_SUPPLY",
    "subject": "Roma tomato 10 kg missed",
    "description": "Roma tomato 10kg was missing from ORD-8824.",
    "priority": "HIGH",
    "status": "IN_PROGRESS",
    "assignedTeam": "RM",
    "assignedTo": { "userId": "usr_021", "name": "Kavya Reddy" },
    "messages": [
      {
        "messageId": "msg_01",
        "body": "Checking with the warehouse now.",
        "internal": false,
        "author": { "type": "RM", "name": "Kavya Reddy" },
        "createdAt": "2026-11-02T05:10:00Z"
      }
    ],
    "linkedReturnId": null,
    "slaDueAt": "2026-11-02T09:00:00Z",
    "createdAt": "2026-11-02T04:30:00Z",
    "updatedAt": "2026-11-02T05:10:00Z",
    "version": 2
  }
}
```

A ticket outside the book returns `403 OUT_OF_SCOPE`.

### 4.3 Create Ticket
**Method:** `POST`  
**URL:** `/rm/tickets`  
**Authorization:** Bearer token  
**Permission:** `tickets:create`

**Headers:** `Idempotency-Key`

**Request:**
```json
{
  "customerId": "cus_009",
  "orderId": "ord_8824",
  "category": "SHORT_SUPPLY",
  "subject": "Roma tomato 10 kg missed",
  "description": "Roma tomato 10kg was missing from ORD-8824.",
  "priority": "HIGH",
  "attachments": ["upl_41"]
}
```

**Response:** `201` — the created ticket, `status` `OPEN`.

**Notes:**
- The customer must be assigned to the caller. `orderId`, when sent, must belong to that customer.
- Subject is 5–120 characters. Description is 10–4000 characters.
- At most 5 attachments, 10 MB each, images or PDF.

### 4.4 Update Ticket
**Method:** `PATCH`  
**URL:** `/rm/tickets/{ticketId}`  
**Authorization:** Bearer token  
**Permission:** `tickets:update`

**Headers:** `If-Match`

**Request:**
```json
{
  "status": "RESOLVED",
  "resolutionNote": "Replacement booked for tomorrow"
}
```

**Response:** `200` — the updated ticket.

**Notes:**
- Allowed fields: `status`, `priority`, `assignedTeam`, `resolutionNote`.
- Path: `OPEN → IN_PROGRESS → WAITING_CUSTOMER | WAITING_INTERNAL → RESOLVED → CLOSED`.
- `RESOLVED` needs `resolutionNote` of 10–1000 characters.
- `CLOSED` can follow only `RESOLVED`. Reopening needs a note.
- A closed ticket rejects new messages with `409 TICKET_CLOSED`.

### 4.5 Add Ticket Message
**Method:** `POST`  
**URL:** `/rm/tickets/{ticketId}/messages`  
**Authorization:** Bearer token  
**Permission:** `tickets:update`

**Request:**
```json
{
  "body": "The warehouse has the missing crate; replacement will be booked.",
  "internal": false,
  "attachments": []
}
```

**Response:** `201` — the created message.

**Notes:**
- `internal: true` is hidden from the customer and needs `tickets:internal-note`, which RM does not have by default.
- Body is 1–4000 characters. HTML is sanitized.
- An external message on a `WAITING_CUSTOMER` ticket moves it to `IN_PROGRESS`.

### 4.6 Book Replacement
**Method:** `POST`  
**URL:** `/rm/tickets/{ticketId}/replacement`  
**Authorization:** Bearer token  
**Permission:** `tickets:update` and `rm-return-requests:create`

**Headers:** `Idempotency-Key`

**Request:**
```json
{
  "items": [{ "orderLineId": "oli_02", "quantity": 1 }],
  "reason": "SHORT_SUPPLY",
  "preferredDate": "2026-11-03",
  "note": "Customer accepts delivery before 8 am"
}
```

**Response:** `201`
```json
{
  "success": true,
  "data": {
    "returnId": "ret_0092",
    "returnNumber": "RET-0092",
    "status": "REQUESTED",
    "resolution": "REPLACEMENT",
    "ticketId": "tkt_031",
    "createdAt": "2026-11-02T05:15:00Z"
  }
}
```

**Notes:**
- This creates the Platform return with `resolution` `REPLACEMENT`.
- Quantity cannot exceed delivered minus already returned.
- The ticket stores `linkedReturnId`. Warehouse and Platform fulfil it.

### 4.7 Ask Finance
**Method:** `POST`  
**URL:** `/rm/tickets/{ticketId}/finance-query`  
**Authorization:** Bearer token  
**Permission:** `tickets:update`

**Request:**
```json
{
  "amount": 3640.0,
  "currency": "INR",
  "paymentId": "pay_441",
  "note": "Customer says cash was collected twice"
}
```

**Response:** `200` — ticket with `assignedTeam` `FINANCE` and an internal message.

**Notes:**
- This does not change payment status, issue a refund, or approve anything.
- `amount` must be positive. With `paymentId`, it cannot exceed that payment. Over the payment returns `422 AMOUNT_EXCEEDS_PAYMENT`.

## 5. Orders

Read only. `PICKING` in the UI is `fulfilmentStage`, not a second order status.

**Fulfilment stage:** `QUEUED`, `PICKING`, `PACKING`, `STAGED`, `HANDED_OVER`. It is derived from warehouse tasks. RM cannot set it.

### 5.1 List Orders
**Method:** `GET`  
**URL:** `/orders`  
**Authorization:** Bearer token  
**Permission:** `orders:read`

**Query:** `assignedToMe=true`, `q`, `status`, `from`, `to`, `customerId`, `locationId`, `minAmount`, `maxAmount`, `page`, `limit`  
**Sort:** `createdAt`, `total`, `status`. Default `createdAt` descending.

**Response:**
```json
{
  "success": true,
  "data": {
    "items": [
      {
        "orderId": "ord_8821",
        "orderNumber": "ORD-8821",
        "customer": { "customerId": "cus_007", "businessName": "Spice Route" },
        "lineCount": 14,
        "total": 12430.0,
        "currency": "INR",
        "status": "PROCESSING",
        "fulfilmentStage": "PICKING",
        "priority": "EXPRESS",
        "paymentStatus": "PAID",
        "createdAt": "2026-11-02T04:10:00Z"
      }
    ],
    "page": 1,
    "limit": 20,
    "totalItems": 3,
    "totalPages": 1,
    "hasNext": false,
    "hasPrev": false
  }
}
```

### 5.2 Get Order
**Method:** `GET`  
**URL:** `/orders/{orderId}`  
**Authorization:** Bearer token  
**Permission:** `orders:read`

**Response:** The order object in Platform Admin, plus `fulfilmentStage` and `priority`. A customer outside the book returns `403 OUT_OF_SCOPE`.

### 5.3 Get Order Timeline
**Method:** `GET`  
**URL:** `/orders/{orderId}/timeline`  
**Authorization:** Bearer token  
**Permission:** `orders:read`

**Response:** The timeline in Platform Admin, Orders. Read only.

**Notes:**
- Cancel, edit, and status change return `403 FORBIDDEN`.

## 6. Delivery

### 6.1 List Shipments
**Method:** `GET`  
**URL:** `/shipments`  
**Authorization:** Bearer token  
**Permission:** `shipments:read`

**Query:** `assignedToMe=true`, `q`, `status`, `deliveryPartnerId`, `from`, `to`, `lateOnly`, `page`, `limit`  
**Sort:** `eta`, `createdAt`

**Response:**
```json
{
  "success": true,
  "data": {
    "items": [
      {
        "shipmentId": "shp_441",
        "orderNumber": "ORD-8821",
        "customerName": "Spice Route",
        "route": "KitchenX · Route 3",
        "status": "OUT_FOR_DELIVERY",
        "eta": "2026-11-02T06:10:00Z",
        "late": false
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

### 6.2 Get Shipment
**Method:** `GET`  
**URL:** `/shipments/{shipmentId}`  
**Authorization:** Bearer token  
**Permission:** `shipments:read`

**Response:** The shipment object in Platform Admin, Shipments. Outside the book returns `403 OUT_OF_SCOPE`.

### 6.3 Get Shipment Tracking
**Method:** `GET`  
**URL:** `/shipments/{shipmentId}/tracking`  
**Authorization:** Bearer token  
**Permission:** `shipments:read`

**Response:** The tracking event list. RM cannot assign a driver or change shipment status.

## 7. Returns

### 7.1 List Returns
**Method:** `GET`  
**URL:** `/returns`  
**Authorization:** Bearer token  
**Permission:** `returns:read`

**Query:** `assignedToMe=true`, `status`, `type`, `from`, `to`, `page`, `limit`

**Response:** List envelope. Item shape is the return object in Platform Admin, Returns. Outside the book returns `403 OUT_OF_SCOPE`.

### 7.2 Get Return
**Method:** `GET`  
**URL:** `/returns/{returnId}`  
**Authorization:** Bearer token  
**Permission:** `returns:read`

**Response:** The return object in Platform Admin, Returns.

### 7.3 Create Return Request
**Method:** `POST`  
**URL:** `/rm/return-requests`  
**Authorization:** Bearer token  
**Permission:** `rm-return-requests:create`

**Headers:** `Idempotency-Key`

**Request:**
```json
{
  "orderId": "ord_8790",
  "type": "DAMAGED",
  "items": [{ "orderLineId": "oli_02", "quantity": 2 }],
  "reason": "Two packets crushed on arrival",
  "evidenceUploadIds": ["upl_51", "upl_52"],
  "requestedResolution": "REPLACEMENT",
  "customerNote": "Customer wants a replacement tomorrow"
}
```

**Response:** `201`
```json
{
  "success": true,
  "data": {
    "returnId": "ret_0092",
    "returnNumber": "RET-0092",
    "orderId": "ord_8790",
    "status": "REQUESTED",
    "type": "DAMAGED",
    "requestedResolution": "REPLACEMENT",
    "amount": 820.0,
    "currency": "INR",
    "createdAt": "2026-11-02T05:30:00Z"
  }
}
```

**Notes:**
- The order must be `DELIVERED` and belong to an assigned customer.
- `type` is `DAMAGED`, `WRONG_ITEM`, `SHORT_QUANTITY`, `QUALITY`, `EXPIRED`, or `OTHER`.
- `requestedResolution` is `REFUND`, `REPLACEMENT`, or `CREDIT_NOTE`. Finance decides the money. Platform approves the return.
- `DAMAGED`, `QUALITY`, and `EXPIRED` need 1–5 images or PDFs. Missing evidence returns `422 EVIDENCE_REQUIRED`.
- Quantity above delivered minus already returned returns `422 QUANTITY_EXCEEDS_DELIVERED`.
- This is the same return resource as Platform Admin.

## 8. Search

### 8.1 Search RM Book
**Method:** `GET`  
**URL:** `/rm/search`  
**Authorization:** Bearer token  
**Permission:** Any RM read permission

**Query:** `q` (minimum 2 characters), `types` (`customers`, `orders`, `tickets`, `leads`), `limit` (max 5 per group)

**Response:**
```json
{
  "success": true,
  "data": {
    "query": "spice",
    "groups": [
      {
        "type": "CUSTOMER",
        "items": [
          { "id": "cus_007", "title": "Spice Route", "subtitle": "Restaurant · 2 outlets", "href": "/rm/customers/cus_007" }
        ]
      },
      {
        "type": "ORDER",
        "items": [
          { "id": "ord_8821", "title": "ORD-8821", "subtitle": "Spice Route · ₹12,430 · Picking", "href": "/rm/orders/ord_8821" }
        ]
      }
    ]
  }
}
```

**Notes:**
- Results are limited to the RM's book.
- A type the caller cannot read is omitted.
- An empty result is `200` with empty groups.
- Search is indexed. Do not scan with an unbounded pattern.

## 9. Error Response

**Example:**
```json
{
  "success": false,
  "error": {
    "code": "OUT_OF_SCOPE",
    "message": "This account is not assigned to you",
    "requestId": "req_01J8Z4K2M9"
  }
}
```

| Status | Code | When |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Bad proposal date or missing lost reason |
| 403 | `FORBIDDEN`, `OUT_OF_SCOPE` | Another RM's record, a finance call, or a customer write |
| 409 | `LEAD_ALREADY_ASSIGNED`, `TICKET_CLOSED`, `INVALID_STATE_TRANSITION`, `VERSION_MISMATCH`, `IDEMPOTENCY_KEY_REUSED` | Conflict |
| 422 | `BUSINESS_RULE_VIOLATION`, `QUANTITY_EXCEEDS_DELIVERED`, `EVIDENCE_REQUIRED`, `AMOUNT_EXCEEDS_PAYMENT` | Rule failed |
| 428 | `PRECONDITION_REQUIRED` | Missing `If-Match` |

## 10. Reference

#### Permissions

```
dashboard:read
customers:read
orders:read
shipments:read
returns:read
rm-return-requests:create
leads:read          leads:update        leads:claim
tickets:read        tickets:create      tickets:update
notifications:read
```

A read-only RM drops `leads:update`, `leads:claim`, `tickets:create`, `tickets:update`, and `rm-return-requests:create`.

RM cannot change `assignedRmId`, read ledgers, payments, refunds, settlements, credit cases, or finance reports, or edit products, prices, inventory, zones, or settings. RM can read contact details, not PAN, bank details, credit documents, or full GST documents.

#### Scope

- `assignedToMe=true` is resolved on the server to the token subject.
- A detail read checks the parent customer. An unassigned ticket, order, or return returns `403 OUT_OF_SCOPE`, not `404`.
- `Idempotency-Key` is required on claim, proposal, return request, replacement, and ticket create.
- `If-Match` is required on lead stage and ticket status.
- RM actions are audited with `actorRole` `RELATIONSHIP_MANAGER`. RM cannot read or delete the platform audit log.

#### Flow

```
Lead:    NEW → DISCOVERY → PROPOSAL → WON | LOST
         WON is handed to Platform onboarding. RM does not create the customer.
Ticket:  OPEN → triage → optional replacement → return REQUESTED
         → Platform review → Finance money → RESOLVED → CLOSED
COD:     ticket COD_QUERY → finance-query → Finance matches cash
```

Closing a ticket does not close the return and does not release money. RM never edits payment status.

#### Cases to test

| Case | Expected |
|---|---|
| Read another RM's customer, or send another `rmId` | `403 OUT_OF_SCOPE` |
| `PATCH /customers/{customerId}` | `403 FORBIDDEN` |
| Claim an assigned lead | `409 LEAD_ALREADY_ASSIGNED` |
| `WON` with no proposal and no reason | `422 BUSINESS_RULE_VIOLATION` |
| Proposal date in the past | `400 VALIDATION_ERROR` |
| Replacement quantity above delivered | `422 QUANTITY_EXCEEDS_DELIVERED` |
| Damage return with no evidence | `422 EVIDENCE_REQUIRED` |
| Message on a closed ticket | `409 TICKET_CLOSED` |
| Internal note without permission | `403 FORBIDDEN` |
| Finance query above the payment | `422 AMOUNT_EXCEEDS_PAYMENT` |
| Stale `If-Match` | `409 VERSION_MISMATCH` |
| Same idempotency key, different body | `409 IDEMPOTENCY_KEY_REUSED` |
| Call a refund endpoint | `403 FORBIDDEN` |
| Empty search | `200` with empty groups |

#### Open decisions

1. Claim may be limited to the RM's area. That is the proposal.
2. Proposal amount may be free, with Platform approval above a threshold.
3. Confirm the business-hours SLA calendar.
4. A replacement uses the return flow with `resolution` `REPLACEMENT`.
5. Internal notes are hidden from the customer.
6. Confirm whether RM may set `assignedTeam` to Finance or Warehouse, or may only request help.
7. Commission is out of scope until the business defines it.
