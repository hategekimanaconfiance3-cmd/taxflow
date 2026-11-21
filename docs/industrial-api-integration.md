# TaxFlow Industrial Machine Integration API

## Overview

The TaxFlow Industrial API allows authorized manufacturer gateways to submit production events, send heartbeats, retrieve diagnostics, and synchronize acknowledgements with the TaxFlow platform. All endpoints require mutual authentication using a Bearer credential secret and Ed25519 request signing.

> **Important:** Gateway credentials are provisioned and managed by TaxFlow administrators. Manufacturers must request integration approval before credentials can be claimed.

---

## Base URLs

| Environment | Base URL |
|-------------|----------|
| Sandbox / Production | `https://taxflow-five.vercel.app` |

> Both sandbox and production gateways are served from the same deployment. Gateway `environment` is a property of the integration record, not of the URL. Sandbox credentials cannot authenticate production gateways.

---

## Authentication

All requests to `/api/v1/industrial/` endpoints require two layers of authentication:

### 1. Bearer credential

Include your gateway client secret in the `Authorization` header:

```
Authorization: Bearer <client_secret>
```

The secret must be at least 32 characters. It is provided when you claim your integration credentials via `POST /api/industrial/integrations/{integrationId}/credentials/claim`.

### 2. Ed25519 request signing (required for event ingestion)

Event ingestion requires a valid Ed25519 signature over a **canonical request representation**. The gateway signs requests using its private key; TaxFlow verifies using the registered public key.

#### Canonical request format

The signed message is a newline-delimited string with exactly 6 fields:

```
METHOD\nPATH\nTIMESTAMP\nNONCE\nKEY_VERSION\nSHA256(RAW_BODY_HEX)
```

| Field | Description |
|-------|-------------|
| `METHOD` | HTTP method in uppercase, e.g. `POST` |
| `PATH` | URL path only, e.g. `/api/v1/industrial/events` |
| `TIMESTAMP` | Unix epoch in seconds (integer, as a string) |
| `NONCE` | UUID v4 string, unique per request per gateway |
| `KEY_VERSION` | Integer key version matching the registered key |
| `SHA256(RAW_BODY_HEX)` | Lowercase hex SHA-256 of the raw request body bytes |

The signature is computed with Ed25519 over the UTF-8 bytes of this canonical string.

#### Required signing headers

| Header | Value |
|--------|-------|
| `X-TF-Timestamp` | Unix seconds (integer as a string) |
| `X-TF-Nonce` | UUID v4, unique per request per gateway |
| `X-TF-Key-Version` | Integer key version (matches registered public key) |
| `X-TF-Signature-Version` | Always `v1` |
| `X-TF-Signature` | Base64url-encoded Ed25519 signature |

#### Timestamp and nonce rules

- **Timestamp tolerance:** ±5 minutes from server time. Requests outside this window are rejected with HTTP 401.
- **Nonce uniqueness:** Each nonce may be used exactly once per gateway. Replayed nonces are rejected with HTTP 401. Use a fresh UUID for every request, including retries.
- **Nonce lifetime:** Nonces are retained for 10 minutes (2× the timestamp window) to cover all valid request timestamps.

> On retry after a 429 or 5xx error, generate a **new timestamp and a new nonce**. Never reuse a nonce across requests.

---

## Credential Management

### Claim integration credentials

```
POST /api/industrial/integrations/{integrationId}/credentials/claim
```

Returns the client secret and the integration package (gateway configuration, signing keys, endpoint URLs). The secret is shown exactly once and cannot be retrieved again. Store it securely.

### Rotate credential

```
POST /api/industrial/integrations/{integrationId}/credentials/rotate
```

Issues a new credential and invalidates the previous one. The integration package will reference the new key version. Update your gateway configuration and re-claim the integration package after rotation.

---

## Endpoints

### POST /api/v1/industrial/events

Submit one or more production events from a gateway.

**Authentication:** Bearer + Ed25519 signature (required)

#### Rate limits

| Scope | Limit |
|-------|-------|
| Per IP address | 120 requests / 60 seconds |
| Per authenticated gateway | 6 000 events / 60 seconds |

#### Request headers

```
Authorization: Bearer <client_secret>
Content-Type: application/json
X-TF-Timestamp: <unix_seconds>
X-TF-Nonce: <uuid_v4>
X-TF-Key-Version: <integer>
X-TF-Signature-Version: v1
X-TF-Signature: <base64url_ed25519_signature>
```

#### Request body

A JSON object (single event) or JSON array (batch of up to 100 events).

```json
{
  "eventId": "uuid-v4",
  "gatewayId": "uuid-v4",
  "factoryId": "uuid-v4",
  "lineId": "uuid-v4",
  "equipmentId": "uuid-v4",
  "eventType": "production_count",
  "sequenceNumber": 1234,
  "eventTimestamp": "2026-11-20T08:00:00.000Z",
  "measurements": {
    "count": 120,
    "unit": "bottles"
  },
  "schemaVersion": "1.0",
  "batchId": "uuid-v4",
  "batchReference": "BATCH-2026-001",
  "stageCode": "FILL"
}
```

#### Required fields

| Field | Type | Description |
|-------|------|-------------|
| `eventType` | string | One of the valid event types (see below) |
| `equipmentId` | UUID | Equipment identifier (must be authorized for this integration) |
| `sequenceNumber` | integer | Monotonically increasing counter per gateway |
| `eventTimestamp` | ISO 8601 | Timestamp of the production event |

#### Valid event types

| Value | Description |
|-------|-------------|
| `production_count` | Units produced on a line |
| `weight_reading` | Weight sensor measurement |
| `line_start` | Production line started |
| `line_stop` | Production line stopped |
| `reject_count` | Rejected / defective units |
| `downtime` | Unplanned or planned downtime |
| `sensor_reading` | Generic sensor measurement |
| `batch_tag` | Batch lifecycle event |

#### Idempotency

- Same `eventId` + same payload → accepted as a duplicate (HTTP 200, no double-write)
- Same `eventId` + different payload → rejected with HTTP 409

#### Response (202 Accepted)

```json
{
  "accepted": 3,
  "rejected": 0,
  "insertedIds": ["uuid", "uuid", "uuid"],
  "errors": []
}
```

---

### POST /api/v1/industrial/heartbeat

Report gateway health and connectivity status.

**Authentication:** Bearer (Ed25519 not required)

#### Rate limits

| Scope | Limit |
|-------|-------|
| Per IP address | 240 requests / 60 seconds |
| Per authenticated gateway | 120 requests / 60 seconds |

#### Request body

```json
{
  "gatewayId": "uuid-v4",
  "status": "online",
  "cpuPercent": 12.5,
  "memoryPercent": 34.1,
  "uptimeSeconds": 86400,
  "firmwareVersion": "2.1.4",
  "timestamp": "2026-11-20T08:00:00.000Z"
}
```

#### Response (200 OK)

```json
{ "ok": true, "serverTime": "2026-11-20T08:00:01.234Z" }
```

---

### GET /api/v1/industrial/diagnostics?gatewayId={id}

Retrieve current diagnostic information for a gateway.

**Authentication:** Bearer (Ed25519 not required)

#### Rate limits

| Scope | Limit |
|-------|-------|
| Per IP address | 120 requests / 60 seconds |
| Per authenticated gateway | 60 requests / 60 seconds |

#### Query parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `gatewayId` | Yes | Gateway UUID |

#### Response (200 OK)

```json
{
  "gatewayId": "uuid-v4",
  "status": "active",
  "lastHeartbeatAt": "2026-11-20T07:59:00.000Z",
  "lastEventAt": "2026-11-20T07:58:30.000Z",
  "eventCountToday": 1024,
  "pendingAcknowledgements": 5
}
```

---

### POST /api/v1/industrial/sync/acknowledge

Acknowledge successful receipt of events that were queued for the gateway.

**Authentication:** Bearer (Ed25519 not required)

#### Rate limits

| Scope | Limit |
|-------|-------|
| Per IP address | 240 requests / 60 seconds |
| Per authenticated gateway | 600 requests / 60 seconds |

#### Request body

```json
{
  "gatewayId": "uuid-v4",
  "eventIds": ["uuid-1", "uuid-2", "uuid-3"]
}
```

#### Response (200 OK)

```json
{ "acknowledged": 3 }
```

---

## Error Responses

All endpoints return structured JSON errors:

```json
{ "error": "Human-readable error message." }
```

| HTTP Status | Meaning |
|-------------|---------|
| 400 | Malformed request, missing required fields, or validation error |
| 401 | Missing, invalid, expired, or revoked credential; invalid or replayed signature |
| 403 | Gateway or integration is not active |
| 409 | Idempotency conflict (same eventId, different payload) |
| 429 | Rate limit exceeded — see `Retry-After` response header |
| 500 | Internal server error |

---

## Retry Guidelines

- **429 Too Many Requests:** Respect the `Retry-After` header (seconds). Apply exponential backoff with jitter.
- **5xx errors:** Retry with exponential backoff. Use a **new timestamp and new nonce** on each retry attempt.
- **401 Signature errors:** Do not retry without correcting the timestamp or generating a new nonce. If the error persists, verify your clock synchronisation (NTP) and signing key.

---

## Simulator Gateways

A gateway is identified as a simulator based on its **server-side `sourceType` configuration** set during gateway registration. Clients cannot declare themselves as simulated. Simulator events are stored with `isSimulated = true` and are excluded from regulatory reports and financial calculations.

---

## API Versioning

All machine-facing endpoints are prefixed with `/api/v1/`. Breaking changes will be released under `/api/v2/` with an advance notice period. Non-breaking additions may be made to `/api/v1/` without a version increment.
