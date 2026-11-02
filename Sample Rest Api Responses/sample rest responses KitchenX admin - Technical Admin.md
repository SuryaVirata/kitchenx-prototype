# KitchenX Admin — Technical Admin API

**Base URL:** `{origin}/api/v1/admin`

Technical Admin configures banners, notifications, users, roles, delivery zones, integrations, service health and incidents. Paths below are relative to the base URL. Private calls use a staff Bearer token.

Orders, payments, catalogue writes and the shared error envelope are in `sample rest responses KitchenX admin - Platform Admin.md`. This file is the source for banners, notification rules, zones, integrations, health and the user write schema.

## 1. Dashboard

### 1.1 Get Technical Dashboard
**Method:** `GET`  
**URL:** `/dashboards/technical`  
**Authorization:** Bearer token  
**Permission:** `dashboard:read`

**Query:** `locationId` (optional)

**Response:**
```json
{
  "success": true,
  "data": {
    "generatedAt": "2026-11-02T05:00:00Z",
    "kpis": {
      "activeUsers": { "value": 42, "changePct": 2.4 },
      "deliveryZones": { "value": 18, "changePct": 0.0 },
      "integrationHealthPct": { "value": 99.2, "changePct": -0.3 },
      "openIncidents": { "value": 1, "changePct": null }
    },
    "uptimeTrend": [
      { "date": "2026-10-27", "uptimePct": 99.8 },
      { "date": "2026-10-28", "uptimePct": 99.1 }
    ],
    "serviceHealth": [
      { "serviceKey": "PAYMENTS", "name": "Payments", "provider": "Razorpay", "status": "HEALTHY", "latencyMs": 118 },
      { "serviceKey": "SMS_OTP", "name": "SMS OTP", "provider": "MSG91", "status": "DEGRADED", "latencyMs": null },
      { "serviceKey": "B2B_COURIER", "name": "B2B courier", "provider": "Delhivery", "status": "HEALTHY", "latencyMs": 240 },
      { "serviceKey": "MAPS_ETA", "name": "Maps / ETA", "provider": "Google", "status": "HEALTHY", "latencyMs": 90 }
    ],
    "quickActions": [
      { "key": "INVITE_USER", "label": "Add user", "href": "/admin/users?action=invite" },
      { "key": "EDIT_ZONE", "label": "Edit zone", "href": "/admin/delivery-zones" },
      { "key": "CHECK_COURIER", "label": "Courier health", "href": "/admin/service-health" },
      { "key": "PUSH_NOTICE", "label": "Push notice", "href": "/admin/notification-campaigns/new" },
      { "key": "PUBLISH_BANNER", "label": "Publish banner", "href": "/admin/cms/banners/new" }
    ]
  }
}
```

**Notes:**
- Aggregate only. No personal data.
- `integrationHealthPct` is the share of enabled providers that were `HEALTHY` over the last 24 hours.
- Cache at most 30 seconds.

## 2. Service Health

**Status:** `HEALTHY`, `DEGRADED`, `DOWN`, `UNKNOWN`

### 2.1 Get Service Health
**Method:** `GET`  
**URL:** `/service-health`  
**Authorization:** Bearer token  
**Permission:** `service-health:read`

**Response:**
```json
{
  "success": true,
  "data": {
    "generatedAt": "2026-11-02T05:00:00Z",
    "overallStatus": "DEGRADED",
    "services": [
      {
        "serviceKey": "PAYMENTS",
        "name": "Payments",
        "provider": "Razorpay",
        "status": "HEALTHY",
        "latencyMs": 118,
        "uptimePct24h": 99.98,
        "lastCheckedAt": "2026-11-02T04:59:30Z",
        "lastIncidentAt": null,
        "environment": "LIVE"
      },
      {
        "serviceKey": "SMS_OTP",
        "name": "SMS OTP",
        "provider": "MSG91",
        "status": "DEGRADED",
        "latencyMs": null,
        "uptimePct24h": 97.4,
        "lastCheckedAt": "2026-11-02T04:59:20Z",
        "lastIncidentAt": "2026-11-02T03:10:00Z",
        "environment": "LIVE",
        "degradedReason": "Provider latency above 5 s; OTP fallback active"
      }
    ]
  }
}
```

**Notes:**
- Status comes from a probe, not from a typed value. No probe within 2× the interval returns `UNKNOWN`.
- Probe every 60 seconds for payments and OTP, and every 120 seconds for courier and maps.
- `latencyMs` is null when the probe fails.
- Do not return credentials, account IDs, or raw provider errors.
- There is no call here that sets a provider status.

## 3. Incidents

**Status:** `OPEN`, `ACKNOWLEDGED`, `MONITORING`, `RESOLVED`  
**Severity:** `SEV1`, `SEV2`, `SEV3`, `SEV4`

### 3.1 List Incidents
**Method:** `GET`  
**URL:** `/incidents`  
**Authorization:** Bearer token  
**Permission:** `incidents:read`

**Query:** `q`, `status`, `severity`, `serviceKey`, `assigneeId`, `from`, `to`, `page`, `limit`  
**Sort:** `startedAt`, `severity`, `updatedAt`

**Response:** List envelope. Each item uses the incident object in 3.2.

### 3.2 Get Incident
**Method:** `GET`  
**URL:** `/incidents/{incidentId}`  
**Authorization:** Bearer token  
**Permission:** `incidents:read`

**Response:**
```json
{
  "success": true,
  "data": {
    "incidentId": "inc_0042",
    "title": "MSG91 OTP latency",
    "severity": "SEV2",
    "status": "ACKNOWLEDGED",
    "serviceKey": "SMS_OTP",
    "provider": "MSG91",
    "description": "OTP delivery above 5 s in 18% of requests",
    "impact": "Customer login and COD delivery OTP affected",
    "assignee": { "userId": "usr_003", "name": "Arjun Desai" },
    "startedAt": "2026-11-02T03:10:00Z",
    "acknowledgedAt": "2026-11-02T03:18:00Z",
    "resolvedAt": null,
    "updates": [
      { "at": "2026-11-02T03:18:00Z", "by": "Arjun Desai", "note": "Provider acknowledged; failover to backup sender enabled" }
    ],
    "createdAt": "2026-11-02T03:10:00Z",
    "updatedAt": "2026-11-02T03:18:00Z",
    "version": 2
  }
}
```

### 3.3 Update Incident
**Method:** `PATCH`  
**URL:** `/incidents/{incidentId}`  
**Authorization:** Bearer token  
**Permission:** `incidents:update`

**Headers:** `If-Match`

**Request:**
```json
{
  "status": "MONITORING",
  "assigneeId": "usr_003",
  "note": "Latency down to 1.2 s; monitoring for 30 minutes"
}
```

**Response:** `200` — the updated incident.

**Notes:**
- Forward path is `OPEN → ACKNOWLEDGED → MONITORING → RESOLVED`. A backward move needs a note.
- `RESOLVED` requires `resolutionNote` of 10–1000 characters and sets `resolvedAt` on the server.
- Incidents are never deleted.
- Creating an incident by hand is not in this contract. Add `POST /incidents` later if it is needed.

## 4. CMS Banners

The customer app reads live banners with `GET /banners?placement=HOME`. This section is the admin source.

**Status:** `DRAFT`, `SCHEDULED`, `LIVE`, `PAUSED`, `EXPIRED`  
**Placement:** `HOME`, `EXPLORE`, `CATEGORY`, `ACCOUNT`

### 4.1 List Banners
**Method:** `GET`  
**URL:** `/cms/banners`  
**Authorization:** Bearer token  
**Permission:** `cms:read`

**Query:** `q` (title), `placement`, `status`, `activeNow`, `from`, `to`, `page`, `limit`  
**Sort:** `sortOrder`, `startsAt`, `createdAt`, `updatedAt`

**Response:** List envelope of banners in every status. Each item uses the banner object in 4.3.

### 4.2 Create Banner
**Method:** `POST`  
**URL:** `/cms/banners`  
**Authorization:** Bearer token  
**Permission:** `cms:write`

**Request:**
```json
{
  "title": "Fresh supplies, delivered",
  "subtitle": "Order before 6 am for same-day delivery",
  "imageUploadId": "upl_21",
  "mobileImageUploadId": "upl_22",
  "altText": "Fresh produce crates",
  "placement": "HOME",
  "target": { "type": "CATEGORY", "categoryId": "cat_produce" },
  "startsAt": "2026-11-01T00:00:00Z",
  "endsAt": "2026-11-30T23:59:59Z",
  "sortOrder": 1
}
```

**Response:** `201` — banner with `status` `DRAFT`.

### 4.3 Get Banner
**Method:** `GET`  
**URL:** `/cms/banners/{bannerId}`  
**Authorization:** Bearer token  
**Permission:** `cms:read`

**Response:**
```json
{
  "success": true,
  "data": {
    "bannerId": "ban_001",
    "title": "Fresh supplies, delivered",
    "subtitle": "Order before 6 am for same-day delivery",
    "imageUrl": "https://cdn.example.com/cms/banner-01.webp",
    "mobileImageUrl": "https://cdn.example.com/cms/banner-01-m.webp",
    "altText": "Fresh produce crates",
    "placement": "HOME",
    "target": { "type": "CATEGORY", "categoryId": "cat_produce", "url": null },
    "startsAt": "2026-11-01T00:00:00Z",
    "endsAt": "2026-11-30T23:59:59Z",
    "status": "LIVE",
    "sortOrder": 1,
    "createdBy": { "userId": "usr_003", "name": "Arjun Desai" },
    "publishedAt": "2026-10-31T18:00:00Z",
    "createdAt": "2026-10-30T06:00:00Z",
    "updatedAt": "2026-10-31T18:00:00Z",
    "version": 3
  }
}
```

### 4.4 Update Banner
**Method:** `PATCH`  
**URL:** `/cms/banners/{bannerId}`  
**Authorization:** Bearer token  
**Permission:** `cms:write`

**Headers:** `If-Match`

**Request:** Same fields as create. Only supplied fields change. Allowed while `DRAFT` or `SCHEDULED`.

**Response:** `200` — the updated banner.

### 4.5 Delete Banner
**Method:** `DELETE`  
**URL:** `/cms/banners/{bannerId}`  
**Authorization:** Bearer token  
**Permission:** `cms:write`

**Response:** `200` — deleted. Only a `DRAFT` can be deleted. `LIVE` and `SCHEDULED` must be paused or expired first.

### 4.6 Publish Banner
**Method:** `POST`  
**URL:** `/cms/banners/{bannerId}/publish`  
**Authorization:** Bearer token  
**Permission:** `cms:publish`

**Headers:** `If-Match`

**Request:**
```json
{
  "publishAt": "2026-11-01T00:00:00Z",
  "note": "November campaign"
}
```

**Response:** `200` — `SCHEDULED` when `publishAt` is in the future, otherwise `LIVE`.

### 4.7 Pause Banner
**Method:** `POST`  
**URL:** `/cms/banners/{bannerId}/pause`  
**Authorization:** Bearer token  
**Permission:** `cms:publish`

**Headers:** `If-Match`

**Response:** `200` — banner with `status` `PAUSED`.

**Notes:**
- `target.type` is `NONE`, `CATEGORY`, `PRODUCT`, `OFFER`, or `URL`. The target must exist and be active. A URL must be `https` on an allow-listed domain.
- `endsAt` must be after `startsAt`. Maximum length is 366 days.
- Images are checked on publish (desktop 1440×600, mobile 720×900) and for file size.
- One `LIVE` banner per `placement` and `sortOrder`. A clash returns `409 BANNER_SLOT_CONFLICT`.
- Publish, pause, and expiry clear the public banner cache within 60 seconds.
- Expiry at `endsAt` is a job. It sets `EXPIRED`.
- Title is at most 80 characters, subtitle at most 160. Alt text is required.

## 5. Notification Settings and Rules

The prototype toggles (new order, delivery delay, SMS OTP) are channel settings plus one rule per event. Do not expose a toggle that has no rule.

**Event keys:** `ORDER_PLACED`, `ORDER_CANCELLED`, `DELIVERY_DELAY`, `RETURN_REQUESTED`, `LOW_STOCK`, `CREDIT_APPLICATION`, `SETTLEMENT_FAILURE`, `INTEGRATION_DEGRADED`, `OTP`

### 5.1 Get Notification Settings
**Method:** `GET`  
**URL:** `/notification-settings`  
**Authorization:** Bearer token  
**Permission:** `notifications:read`

**Response:**
```json
{
  "success": true,
  "data": {
    "channels": {
      "email": { "enabled": true, "provider": "SES", "fromAddress": "no-reply@kitchenx.example" },
      "sms": { "enabled": true, "provider": "MSG91", "senderId": "KITCHX" },
      "push": { "enabled": false, "provider": null },
      "whatsapp": { "enabled": false, "provider": null }
    },
    "otp": {
      "length": 6,
      "expiresInSeconds": 300,
      "maxAttempts": 5,
      "resendCooldownSeconds": 30,
      "fallbackChannel": "SMS"
    },
    "quietHours": { "enabled": true, "start": "21:00", "end": "08:00", "timezone": "Asia/Kolkata" },
    "updatedAt": "2026-10-31T05:00:00Z",
    "version": 9
  }
}
```

### 5.2 Update Notification Settings
**Method:** `PATCH`  
**URL:** `/notification-settings`  
**Authorization:** Bearer token  
**Permission:** `notifications:write`

**Headers:** `If-Match`. OTP changes also require `X-MFA-Assertion`.

**Request:** The same shape as 5.1. Only supplied fields change.

**Response:** `200` — the updated settings.

**Notes:**
- `otp.length` is 4–8. `expiresInSeconds` is 60–600. `maxAttempts` is 3–10. `resendCooldownSeconds` is 15–120.
- OTP changes apply to new challenges only.
- Quiet hours suppress marketing and push. They do not suppress transactional alerts or OTP.
- Provider secrets are edited in Integrations, not here.

### 5.3 List Notification Rules
**Method:** `GET`  
**URL:** `/notification-rules`  
**Authorization:** Bearer token  
**Permission:** `notifications:read`

**Response:**
```json
{
  "success": true,
  "data": {
    "items": [
      {
        "ruleId": "rule_order_placed",
        "eventKey": "ORDER_PLACED",
        "name": "New order alerts",
        "enabled": true,
        "channels": ["EMAIL", "SMS"],
        "recipients": { "type": "ROLE", "roleIds": ["role_ops"], "userIds": [] },
        "templateId": "tmpl_order_placed",
        "throttle": { "maxPerHour": 60, "dedupeWindowSeconds": 300 },
        "conditions": { "locationIds": ["loc_hyd"] },
        "updatedAt": "2026-10-31T05:00:00Z",
        "version": 2
      }
    ]
  }
}
```

### 5.4 Update Notification Rule
**Method:** `PATCH`  
**URL:** `/notification-rules/{ruleId}`  
**Authorization:** Bearer token  
**Permission:** `notifications:write`

**Headers:** `If-Match`

**Request:**
```json
{
  "enabled": false,
  "channels": ["EMAIL"],
  "throttle": { "maxPerHour": 30 }
}
```

**Response:** `200` — the updated rule.

**Notes:**
- `channels` must be a non-empty subset of enabled channels.
- `recipients.type` is `ROLE`, `USER`, `EMAIL`, or `WEBHOOK`. A webhook must be HTTPS and is signed with the integration secret.
- A location without its own rule inherits the organisation rule.
- Enabling SMS while SMS is `DOWN` returns `409 PROVIDER_UNAVAILABLE`.

## 6. Notification Templates

**Status:** `DRAFT`, `ACTIVE`, `ARCHIVED`

### 6.1 List Templates
**Method:** `GET`  
**URL:** `/notification-templates`  
**Authorization:** Bearer token  
**Permission:** `notifications:read`

**Query:** `q`, `channel`, `eventKey`, `locale`, `status`, `page`, `limit`  
**Sort:** `updatedAt`, `name`

**Response:** List envelope. Each item uses the template object in 6.3.

### 6.2 Create Template
**Method:** `POST`  
**URL:** `/notification-templates`  
**Authorization:** Bearer token  
**Permission:** `notifications:write`

**Request:** `name`, `eventKey`, `channel`, `locale`, `subject`, `body`.

**Response:** `201` — template with `status` `DRAFT`.

### 6.3 Get Template
**Method:** `GET`  
**URL:** `/notification-templates/{templateId}`  
**Authorization:** Bearer token  
**Permission:** `notifications:read`

**Response:**
```json
{
  "success": true,
  "data": {
    "templateId": "tmpl_order_placed",
    "name": "Order placed — email",
    "eventKey": "ORDER_PLACED",
    "channel": "EMAIL",
    "locale": "en-IN",
    "subject": "Your KitchenX order {{orderNumber}} is confirmed",
    "body": "Hi {{customerName}}, we received your order of {{total}}.",
    "variables": ["orderNumber", "customerName", "total"],
    "status": "ACTIVE",
    "version": 4,
    "updatedAt": "2026-10-31T05:00:00Z"
  }
}
```

### 6.4 Update Template
**Method:** `PATCH`  
**URL:** `/notification-templates/{templateId}`  
**Authorization:** Bearer token  
**Permission:** `notifications:write`

**Headers:** `If-Match`

**Request:**
```json
{ "status": "ACTIVE" }
```

**Response:** `200` — the updated template.

**Notes:**
- Variables must be on the allow-list for that event. An unknown variable returns `422 UNKNOWN_TEMPLATE_VARIABLE`.
- No code, loops, or includes in a template.
- SMS body is at most 160 characters per segment. WhatsApp templates must already be approved by the provider.
- Sending uses the active version at send time. Clone a template that is mid-campaign instead of editing it.
- There is no delete. Archive with `status: ARCHIVED`.

## 7. Notification Campaigns

The prototype has no campaign screen. The dashboard "Push notice" action implies one. Confirm this module before building it.

**Status:** `DRAFT`, `SCHEDULED`, `SENDING`, `SENT`, `FAILED`, `CANCELLED`  
**Audience:** `ALL_CUSTOMERS`, `SEGMENT`, `CUSTOMER_IDS`

### 7.1 List Campaigns
**Method:** `GET`  
**URL:** `/notification-campaigns`  
**Authorization:** Bearer token  
**Permission:** `notifications:read`

**Response:** List envelope of `campaignId`, `name`, `templateId`, `channel`, `audience`, `segment`, `scheduledAt`, `status`, `stats` (`targeted`, `sent`, `failed`, `skipped`), `createdAt`.

### 7.2 Create Campaign
**Method:** `POST`  
**URL:** `/notification-campaigns`  
**Authorization:** Bearer token  
**Permission:** `notifications:write`

**Response:** `201` — campaign with `status` `DRAFT`.

### 7.3 Get Campaign
**Method:** `GET`  
**URL:** `/notification-campaigns/{campaignId}`  
**Authorization:** Bearer token  
**Permission:** `notifications:read`

**Response:** The campaign object from 7.1.

### 7.4 Send Campaign
**Method:** `POST`  
**URL:** `/notification-campaigns/{campaignId}/send`  
**Authorization:** Bearer token  
**Permission:** `notifications:send`

**Headers:** `Idempotency-Key`, `X-MFA-Assertion`

**Response:** `200` — campaign moves to `SENDING` or `SCHEDULED`.

**Notes:**
- Marketing consent (`marketingOptIn=true`) is required. Transactional messages do not use this call.
- Hard cap is 50,000 recipients. Over the cap returns `422 AUDIENCE_TOO_LARGE`.
- A campaign cannot be edited after `SENDING`.
- Email needs an unsubscribe link.

## 8. Users and Roles

This is the write schema for Platform and Technical. Both roles use these URLs.

**User status:** `INVITED`, `ACTIVE`, `SUSPENDED`, `DEACTIVATED`

### 8.1 List Users
**Method:** `GET`  
**URL:** `/users`  
**Authorization:** Bearer token  
**Permission:** `users:read`

**Query:** `q` (name, email), `roleId`, `status`, `locationId`, `mfaEnabled`, `page`, `limit`  
**Sort:** `name`, `createdAt`, `lastLoginAt`

**Response:** List envelope. List items omit the full permission array. Detail is 8.3.

### 8.2 Invite User
**Method:** `POST`  
**URL:** `/users/invite`  
**Authorization:** Bearer token  
**Permission:** `users:invite`

**Headers:** `Idempotency-Key`

**Request:**
```json
{
  "name": "Priya Nair",
  "email": "priya.nair@kitchenx.com",
  "phone": { "countryCode": "+91", "number": "9876543210" },
  "roleId": "role_ops",
  "locationIds": ["loc_hyd"],
  "sendWelcomeEmail": true
}
```

**Response:** `201`
```json
{
  "success": true,
  "data": {
    "userId": "usr_044",
    "status": "INVITED",
    "email": "priya.nair@kitchenx.com",
    "inviteExpiresAt": "2026-11-05T05:00:00Z"
  }
}
```

**Notes:**
- Email is unique and immutable after invite.
- The role must exist and be assignable by the caller. Non-global roles need at least one location.
- The invite link is single-use and lasts 72 hours. Never return a password.
- A duplicate active email returns `409 DUPLICATE`.
- Re-inviting an `INVITED` user rotates the token and invalidates the old link.

### 8.3 Get User
**Method:** `GET`  
**URL:** `/users/{userId}`  
**Authorization:** Bearer token  
**Permission:** `users:read`

**Response:**
```json
{
  "success": true,
  "data": {
    "userId": "usr_003",
    "name": "Arjun Desai",
    "email": "arjun.desai@kitchenx.com",
    "phone": { "countryCode": "+91", "number": "9876543210" },
    "role": { "roleId": "role_technical", "key": "TECHNICAL_ADMIN", "name": "Technical Admin" },
    "permissions": ["cms:read", "cms:write", "zones:read", "users:read"],
    "locations": [{ "locationId": "loc_hyd", "name": "Hyderabad" }],
    "status": "ACTIVE",
    "mfaEnabled": true,
    "lastLoginAt": "2026-11-02T04:45:00Z",
    "createdAt": "2026-03-10T05:00:00Z",
    "updatedAt": "2026-10-20T05:00:00Z",
    "version": 4
  }
}
```

### 8.4 Update User
**Method:** `PATCH`  
**URL:** `/users/{userId}`  
**Authorization:** Bearer token  
**Permission:** `users:update`

**Headers:** `If-Match`. Promoting to `PLATFORM_ADMIN` also requires `X-MFA-Assertion`.

**Request:**
```json
{
  "roleId": "role_finance",
  "locationIds": ["loc_hyd", "loc_delhi"]
}
```

**Response:** `200` — the updated user.

**Notes:**
- Allowed fields: `name`, `phone`, `roleId`, `locationIds`.
- A role change also needs `roles:assign`.
- A user cannot change their own role.
- The last active `PLATFORM_ADMIN` cannot be demoted. Return `409 LAST_SUPER_ADMIN`.
- The caller cannot grant a permission they do not hold. Return `403 PRIVILEGE_ESCALATION`.

### 8.5 Activate User
**Method:** `POST`  
**URL:** `/users/{userId}/activate`  
**Authorization:** Bearer token  
**Permission:** `users:update`

**Response:** `200` — user with `status` `ACTIVE`. No request body.

### 8.6 Deactivate User
**Method:** `POST`  
**URL:** `/users/{userId}/deactivate`  
**Authorization:** Bearer token  
**Permission:** `users:deactivate`

**Request:**
```json
{
  "reason": "LEFT_COMPANY",
  "note": "Last working day 2026-11-30",
  "reassignToUserId": "usr_021"
}
```

**Response:** `200` — user with `status` `DEACTIVATED`. Refresh tokens are revoked.

**Notes:**
- `reason` is `LEFT_COMPANY`, `ROLE_CHANGE`, `SECURITY`, `CONTRACT_END`, or `OTHER`.
- Open leads and customers must be reassigned, or the response lists them and rejects the call.
- Self-deactivation returns `403`. The last super admin returns `409 LAST_SUPER_ADMIN`.

### 8.7 List Roles
**Method:** `GET`  
**URL:** `/roles`  
**Authorization:** Bearer token  
**Permission:** `roles:read`

**Response:**
```json
{
  "success": true,
  "data": [
    { "roleId": "role_platform", "key": "PLATFORM_ADMIN", "name": "Platform Admin", "builtIn": true, "userCount": 1, "permissionCount": 42 },
    { "roleId": "role_finance", "key": "FINANCE_ADMIN", "name": "Finance Admin", "builtIn": true, "userCount": 2, "permissionCount": 18 },
    { "roleId": "role_technical", "key": "TECHNICAL_ADMIN", "name": "Technical Admin", "builtIn": true, "userCount": 1, "permissionCount": 24 }
  ]
}
```

### 8.8 Get Role
**Method:** `GET`  
**URL:** `/roles/{roleId}`  
**Authorization:** Bearer token  
**Permission:** `roles:read`

**Response:** The role from 8.7 plus `permissions` and `description`.

### 8.9 Replace Role Permissions
**Method:** `PUT`  
**URL:** `/roles/{roleId}/permissions`  
**Authorization:** Bearer token  
**Permission:** `roles:assign`

**Headers:** `If-Match`, `X-MFA-Assertion`

**Request:**
```json
{
  "permissions": ["cms:read", "cms:write", "zones:read", "zones:update"]
}
```

**Response:** `200` — the role with the replaced permission set.

**Notes:**
- Built-in roles are immutable. Return `409 BUILT_IN_ROLE_IMMUTABLE`.
- Built-in keys: `PLATFORM_ADMIN`, `FINANCE_ADMIN`, `TECHNICAL_ADMIN`, `RELATIONSHIP_MANAGER`, `WAREHOUSE_MANAGER`, `WAREHOUSE_SUPERVISOR`.
- Every permission must exist. An empty set returns `422`.
- Granting a permission the caller lacks returns `403 PRIVILEGE_ESCALATION`.
- The cache is cleared within 60 seconds. The audit record stores before and after.

## 9. Delivery Zones

Serviceability is by pincode. Polygon and radius are not in the prototype.

### 9.1 List Delivery Zones
**Method:** `GET`  
**URL:** `/delivery-zones`  
**Authorization:** Bearer token  
**Permission:** `zones:read`

**Query:** `q`, `city`, `locationId`, `active`, `pincode`, `routeCode`, `page`, `limit`  
**Sort:** `name`, `city`, `createdAt`

**Response:** List envelope. Each item uses the zone object in 9.3.

### 9.2 Create Delivery Zone
**Method:** `POST`  
**URL:** `/delivery-zones`  
**Authorization:** Bearer token  
**Permission:** `zones:create`

**Request:**
```json
{
  "name": "Hyderabad West",
  "city": "Hyderabad",
  "locationId": "loc_hyd",
  "routeCode": "HYD-W",
  "cutoffTime": "18:00",
  "deliveryDays": ["MON"],
  "pincodes": ["500034", "500081"],
  "active": true
}
```

**Response:** `201` — the created zone.

### 9.3 Get Delivery Zone
**Method:** `GET`  
**URL:** `/delivery-zones/{zoneId}`  
**Authorization:** Bearer token  
**Permission:** `zones:read`

**Response:**
```json
{
  "success": true,
  "data": {
    "zoneId": "zone_hyd_west",
    "name": "Hyderabad West",
    "city": "Hyderabad",
    "location": { "locationId": "loc_hyd", "name": "Hyderabad" },
    "routeCode": "HYD-W",
    "cutoffTime": "18:00",
    "deliveryDays": ["MON", "TUE", "WED", "THU", "FRI", "SAT"],
    "pincodeCount": 42,
    "minOrderValue": 500.0,
    "deliveryFee": 0.0,
    "currency": "INR",
    "active": true,
    "createdAt": "2026-04-01T05:00:00Z",
    "updatedAt": "2026-10-15T05:00:00Z",
    "version": 6
  }
}
```

### 9.4 Update Delivery Zone
**Method:** `PATCH`  
**URL:** `/delivery-zones/{zoneId}`  
**Authorization:** Bearer token  
**Permission:** `zones:update`

**Headers:** `If-Match`

**Response:** `200` — the updated zone.

### 9.5 Deactivate Delivery Zone
**Method:** `DELETE`  
**URL:** `/delivery-zones/{zoneId}`  
**Authorization:** Bearer token  
**Permission:** `zones:delete`

**Headers:** `X-MFA-Assertion`

**Response:** `200` — soft deactivate (`active: false`).

**Notes:**
- Blocked when active outlets or open orders use the zone. Return `409 ZONE_IN_USE`.

### 9.6 List Zone Pincodes
**Method:** `GET`  
**URL:** `/delivery-zones/{zoneId}/pincodes`  
**Authorization:** Bearer token  
**Permission:** `zones:read`

**Response:** `200` — `{ "success": true, "data": { "pincodes": ["500034"] } }`.

### 9.7 Replace Zone Pincodes
**Method:** `PUT`  
**URL:** `/delivery-zones/{zoneId}/pincodes`  
**Authorization:** Bearer token  
**Permission:** `zones:update`

**Headers:** `If-Match`

**Request:**
```json
{ "pincodes": ["500034", "500081"] }
```

**Response:** `200` — the zone with the new `pincodeCount`. The replace is atomic.

**Notes:**
- `cutoffTime` is `HH:mm` in the location timezone. `deliveryDays` is a non-empty subset of `MON` through `SUN`.
- `routeCode` is unique per location and matches `[A-Z0-9-]{2,20}`.
- `minOrderValue` and `deliveryFee` are at least 0, 2 decimal places.
- Pincodes are 6-digit Indian PINs, deduplicated, at most 5,000 per zone.
- A pincode cannot sit in two active zones in the same location. Return `409 PINCODE_CONFLICT` with the other zone.
- Customer serviceability stays `POST /delivery-locations/check-serviceability` in the customer API. It reads this data.

## 10. Integrations

**Provider keys:** `RAZORPAY`, `MSG91`, `DELHIVERY`, `GOOGLE_MAPS`

### 10.1 List Integrations
**Method:** `GET`  
**URL:** `/settings/integrations`  
**Authorization:** Bearer token  
**Permission:** `integrations:read`

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "providerKey": "RAZORPAY",
      "displayName": "Razorpay",
      "mode": "LIVE",
      "status": "CONNECTED",
      "maskedKeyId": "rzp_live_••••9f2a",
      "webhookUrl": "https://api.kitchenx.example/webhooks/razorpay",
      "secretLastRotatedAt": "2026-09-01T05:00:00Z",
      "lastVerifiedAt": "2026-11-02T04:58:00Z",
      "config": { "currency": "INR", "captureMethod": "AUTOMATIC" }
    }
  ]
}
```

### 10.2 Update Integration
**Method:** `PATCH`  
**URL:** `/settings/integrations/{providerKey}`  
**Authorization:** Bearer token  
**Permission:** `integrations:update`

**Headers:** `If-Match`, `X-MFA-Assertion`

**Request:**
```json
{
  "mode": "TEST",
  "apiKeyId": "rzp_test_xxx",
  "apiSecret": "write-only-value",
  "webhookSecret": "write-only-value",
  "config": { "captureMethod": "MANUAL" }
}
```

**Response:** `200` — the masked integration. Secrets are not returned.

**Notes:**
- `TEST` to `LIVE` needs MFA, a successful test, and `confirmLive: true`. Otherwise return `422 LIVE_CONFIRMATION_REQUIRED`.
- Status cannot be set by the client. It follows service health.

### 10.3 Test Integration
**Method:** `POST`  
**URL:** `/settings/integrations/{providerKey}/test`  
**Authorization:** Bearer token  
**Permission:** `integrations:update`

**Response:** `200`
```json
{
  "success": true,
  "data": { "ok": true, "latencyMs": 120, "checkedAt": "2026-11-02T05:00:00Z" }
}
```

A failed probe returns `{ "ok": false, "errorCode": "AUTH_FAILED" }`. Do not echo the provider body.

### 10.4 Rotate Integration Secret
**Method:** `POST`  
**URL:** `/settings/integrations/{providerKey}/rotate-secret`  
**Authorization:** Bearer token  
**Permission:** `integrations:rotate-secret`

**Headers:** `X-MFA-Assertion`, `Idempotency-Key`

**Response:** `200` — the new secret is returned once. Only a hash or ciphertext is stored. The previous secret stays valid for 24 hours by default.

**Notes:**
- Webhooks verify the signature and reject replays. A bad signature is `401` and can open an incident.
- Audit stores `providerKey`, `rotatedAt`, actor, and `requestId`. Never the secret.

## 11. Settings and Locations

Technical Settings tabs call the Platform settings and location endpoints. Technical does not get `locations:delete` by default.

### 11.1 Get General Settings
**Method:** `GET`  
**URL:** `/settings/general`  
**Authorization:** Bearer token  
**Permission:** `settings:read`

**Response:** The general-settings object in Platform Admin, Settings.

### 11.2 Update General Settings
**Method:** `PATCH`  
**URL:** `/settings/general`  
**Authorization:** Bearer token  
**Permission:** `settings:update`

**Headers:** `If-Match`. `currency` and `timezone` also require `X-MFA-Assertion`.

**Response:** `200` — the updated settings. `invoiceSequence` is never client-writable.

### 11.3 Get Business Settings
**Method:** `GET`  
**URL:** `/settings/business`  
**Authorization:** Bearer token  
**Permission:** `settings:read`

**Response:** The business-settings object in Platform Admin, Settings. GSTIN, invoice prefix, and currency are viewable. Changing business identity may later require `settings:update-business`.

### 11.4 Update Business Settings
**Method:** `PATCH`  
**URL:** `/settings/business`  
**Authorization:** Bearer token  
**Permission:** `settings:update`

**Headers:** `If-Match`, `X-MFA-Assertion`

**Response:** `200` — the updated business settings.

### 11.5 List Locations
**Method:** `GET`  
**URL:** `/locations`  
**Authorization:** Bearer token  
**Permission:** `locations:read`

**Response:** The location list in Platform Admin, Settings.

### 11.6 Create Location
**Method:** `POST`  
**URL:** `/locations`  
**Authorization:** Bearer token  
**Permission:** `locations:create`

**Response:** `201` — the created location.

### 11.7 Update Location
**Method:** `PATCH`  
**URL:** `/locations/{locationId}`  
**Authorization:** Bearer token  
**Permission:** `locations:update`

**Headers:** `If-Match`

**Response:** `200` — the updated location.

## 12. Audit

### 12.1 List Audit Logs
**Method:** `GET`  
**URL:** `/audit-logs`  
**Authorization:** Bearer token  
**Permission:** `audit:read`

**Query:** `actorId`, `action`, `resourceType`, `resourceId`, `from`, `to`, `requestId`, `cursor`, `limit`

**Response:** Cursor list. Record shape is in Platform Admin, Audit logs. Newest first. No update or delete.

### 12.2 Get Audit Log
**Method:** `GET`  
**URL:** `/audit-logs/{auditId}`  
**Authorization:** Bearer token  
**Permission:** `audit:read`

**Response:** The full audit record.

**Notes:**
- Audit banner publish, rule and template changes, user invite, role change, deactivation, zone and pincode changes, integration updates, secret rotation, incident updates, settings changes, and permission-set updates.
- Secret values are never written to the record.

## 13. Error Response

**Example:**
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "The request contains invalid data",
    "details": [
      { "field": "cutoffTime", "code": "INVALID_VALUE", "message": "Use HH:mm" }
    ],
    "requestId": "req_01J8Z4K2M9"
  }
}
```

| Status | Code | When |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Bad pincode, cutoff, or missing incident note |
| 403 | `FORBIDDEN`, `PRIVILEGE_ESCALATION`, `SELF_ACTION_FORBIDDEN` | Orders read, extra permission, or self-deactivate |
| 409 | `PINCODE_CONFLICT`, `ZONE_IN_USE`, `BANNER_SLOT_CONFLICT`, `BUILT_IN_ROLE_IMMUTABLE`, `LAST_SUPER_ADMIN`, `DUPLICATE`, `PROVIDER_UNAVAILABLE`, `VERSION_MISMATCH` | Conflict |
| 422 | `UNKNOWN_TEMPLATE_VARIABLE`, `LIVE_CONFIRMATION_REQUIRED`, `TARGET_UNAVAILABLE`, `CONSENT_REQUIRED`, `AUDIENCE_TOO_LARGE` | Rule failed |

## 14. Reference

#### Permissions

```
dashboard:read           users:read              users:invite
users:update             users:deactivate        roles:read
roles:assign             cms:read                cms:write
cms:publish              notifications:read      notifications:write
notifications:send       zones:read              zones:create
zones:update             zones:delete            settings:read
settings:update          integrations:read       integrations:update
integrations:rotate-secret
service-health:read      incidents:read          incidents:update
audit:read               locations:read          locations:create
locations:update
```

Technical cannot read orders, customers, payments, refunds, credit cases, or finance reports, and cannot edit products, inventory, suppliers, or purchase orders. Technical cannot read a secret after it is saved, and cannot change another user's password.

A caller may grant only permissions they hold.

#### State

```
Banner:  DRAFT → SCHEDULED → LIVE → EXPIRED
         DRAFT | SCHEDULED | LIVE → PAUSED → LIVE
Incident: OPEN → ACKNOWLEDGED → MONITORING → RESOLVED
User:    INVITED → ACTIVE → DEACTIVATED
```

One live banner per slot. A pincode belongs to one active zone in a location. A secret is readable only in the rotate response. Deactivation revokes tokens and must reassign open work.

#### Cases to test

| Case | Expected |
|---|---|
| Pincode already in another active zone | `409 PINCODE_CONFLICT` |
| Pincode `50034` or cutoff `25:00` | `400 VALIDATION_ERROR` |
| Delete a zone with active orders | `409 ZONE_IN_USE` |
| Duplicate banner slot | `409 BANNER_SLOT_CONFLICT` |
| Publish a banner with no image | `422` |
| Inactive banner target | `422 TARGET_UNAVAILABLE` |
| Edit a built-in role | `409 BUILT_IN_ROLE_IMMUTABLE` |
| Grant a permission the caller lacks | `403 PRIVILEGE_ESCALATION` |
| Deactivate the last super admin | `409 LAST_SUPER_ADMIN` |
| Deactivate yourself | `403 SELF_ACTION_FORBIDDEN` |
| Invite a duplicate email | `409 DUPLICATE` |
| Unknown template variable | `422 UNKNOWN_TEMPLATE_VARIABLE` |
| Enable SMS while MSG91 is down | `409 PROVIDER_UNAVAILABLE` |
| Switch to LIVE without confirm | `422 LIVE_CONFIRMATION_REQUIRED` |
| Read a secret after save | Field absent |
| Stale `If-Match` | `409 VERSION_MISMATCH` |
| Technical reads orders | `403 FORBIDDEN` |
| Resolve an incident with no note | `400 VALIDATION_ERROR` |
| Campaign without marketing consent | `422 CONSENT_REQUIRED` |

#### Open decisions

1. Technical may be view-only on GSTIN, invoice prefix, and currency unless `settings:update-business` is granted.
2. Confirm push and WhatsApp providers before those toggles are shown. SMS OTP is MSG91.
3. Campaigns are not on the prototype screen. Confirm before building bulk send.
4. Zones are pincode lists only.
5. Incidents are updated by hand. Automatic creation is not in this contract.
6. Store secrets in a managed secret store. The database must not hold plaintext.
7. Confirm whether warehouse and relationship-manager permissions are edited here.
8. MFA is proposed as required for Platform and Finance, and recommended for Technical.
