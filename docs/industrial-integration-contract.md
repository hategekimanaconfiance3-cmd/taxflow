# TaxFlow industrial integration contract

This contract describes the currently implemented evidence boundary. It is suitable for the simulator and gateway adapter work; it does not claim that a real machine connector exists.

## Authentication

Manufacturer registration creates a gateway in `pending` status and returns a client secret once. TaxFlow stores only a SHA-256 hash. An authorized RRA officer must activate the gateway. Industrial requests use:

```http
Authorization: Bearer <gateway-client-secret>
```

Credential rotation revokes the prior credential. Revocation prevents further heartbeat and event ingestion. Secrets are not returned from list APIs or frontend source.

## Endpoints

- `POST /api/v1/industrial/heartbeat` — authenticated gateway heartbeat and connection evidence.
- `POST /api/v1/industrial/events` — authenticated, rate-limited event ingestion.
- Manufacturer session routes under `/api/equipment` and `/api/industrial/gateways` manage registrations and calibration records.

## Event contract

Accepted event fields include `eventId`, `gatewayId`, `factoryId`, `lineId`, `equipmentId`, optional `batchId` or `batchReference`, `eventType`, positive `sequenceNumber`, ISO event timestamp, numeric `measurements`, optional unit, source (`industrial_gateway` or `simulator`), and `schemaVersion` (`major.minor`). Stage completion events may include `stageCode` and `stageSequenceNumber`.

TaxFlow validates tenant ownership across gateway, factory, line, equipment, and batch. It stores the received payload, normalized event, payload hash, server receipt time, validation/integrity/synchronization statuses, and sequence/counter statuses. Duplicate gateway/event IDs are acknowledged without creating a second event. Gaps, late events, out-of-order events, and counter decreases are retained as evidence statuses rather than silently corrected. Batch evidence treats the latest accepted production counter as the machine-reported quantity; the verification engine does not silently sum ambiguous readings.

`integrityStatus=verified` means the request passed gateway authentication and the payload hash was captured. A hash does not prove that a physical machine reading is genuine.

## Financial boundary

Industrial ingestion only writes industrial evidence, batch evidence, stage history, verification results, alerts, gateway health, and audit entries. It does not update `stockMovement`, raw-material movements, tax payments, official approvals, or production stock. Existing authorized production review remains the only path for finished-goods inventory posting.

Simulator events use `source=simulator` and are stored with `isSimulated=true`; they must remain distinguishable from real gateway evidence.
