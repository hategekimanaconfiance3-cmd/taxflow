# TaxFlow industrial integration contract

This contract describes the currently implemented evidence boundary. It is suitable for the simulator and gateway adapter work; it does not claim that a real machine connector exists.

## Authentication

Manufacturer registration creates a gateway in `pending` status and returns a client secret once. TaxFlow stores only a SHA-256 hash. An authorized RRA officer must activate the gateway. Industrial requests use:

```http
Authorization: Bearer <gateway-client-secret>
```

Credential rotation revokes the prior credential. Revocation prevents further heartbeat and event ingestion. Secrets are not returned from list APIs or frontend source.

TF-managed integrations reuse `industrialGateway` and `industrialGatewayCredential`, with separate factory identities for `sandbox` and `production`. New TF-managed gateways use an Ed25519 signing key in addition to the bearer secret. The private signing key is encrypted in a one-time delivery envelope and is never stored in plaintext.

Signed requests include `X-TF-Timestamp`, `X-TF-Nonce`, `X-TF-Key-Version`, `X-TF-Signature-Version: v1`, and `X-TF-Signature`. The canonical value is the HTTP method, request path, timestamp, nonce, key version, and SHA-256 hash of the exact raw body, separated by newlines. TaxFlow rejects stale timestamps, reused gateway nonces, invalid signatures, revoked credentials, and inactive gateways. Legacy bearer-only gateways remain supported for compatibility.

## Endpoints

- `POST /api/v1/industrial/heartbeat` — authenticated gateway heartbeat and connection evidence.
- `POST /api/v1/industrial/events` — authenticated, rate-limited event ingestion.
- Manufacturer session routes under `/api/equipment` and `/api/industrial/gateways` manage registrations and calibration records.

Manufacturer lifecycle routes are available under `/api/industrial/integration-requests` and `/api/industrial/integrations`. They cover request/status, one-time credential claim, package retrieval, rotation, and evidence history. TF-only review, activation, suspension, revocation, and audit routes live under `/api/admin/industrial/integration-requests` and `/api/admin/industrial/integrations`.

The lifecycle is request -> under review -> approved/rejected. Approval provisions the factory/environment integration, gateway, signed credential, one-time delivery envelope, and equipment allowlist in one transaction. The gateway remains pending until the manufacturer claims credentials and an authorized TF officer activates it. Suspension revokes active credentials and requires reissue; revocation is terminal. Factory suspension or rejection also suspends linked integrations.

## Event contract

Accepted event fields include `eventId`, `gatewayId`, `factoryId`, `lineId`, `equipmentId`, optional `batchId` or `batchReference`, `eventType`, positive `sequenceNumber`, ISO event timestamp, numeric `measurements`, optional unit, source (`industrial_gateway` or `simulator`), and `schemaVersion` (`major.minor`). Stage completion events may include `stageCode` and `stageSequenceNumber`.

TaxFlow validates tenant ownership across gateway, factory, line, equipment, and batch. It stores the received payload, normalized event, payload hash, server receipt time, validation/integrity/synchronization statuses, and sequence/counter statuses. Duplicate gateway/event IDs are acknowledged without creating a second event. Gaps, late events, out-of-order events, and counter decreases are retained as evidence statuses rather than silently corrected. Batch evidence treats the latest accepted production counter as the machine-reported quantity; the verification engine does not silently sum ambiguous readings.

`integrityStatus=verified` means the request passed gateway authentication and the payload hash was captured. A hash does not prove that a physical machine reading is genuine.

## Financial boundary

Industrial ingestion only writes industrial evidence, batch evidence, stage history, verification results, alerts, gateway health, and audit entries. It does not update `stockMovement`, raw-material movements, tax payments, official approvals, or production stock. Existing authorized production review remains the only path for finished-goods inventory posting.

Simulator events use `source=simulator` and are stored with `isSimulated=true`; they must remain distinguishable from real gateway evidence.
