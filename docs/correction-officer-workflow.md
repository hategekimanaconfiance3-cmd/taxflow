# Correction Officer: audit findings and future workflow

## Current role

Correction Officer is a legacy stock-correction role. It can search basic taxpayer directory records and access the system-wide stock overview. Its stock actions can change quantity, price, and source or soft-void a stock record with a reason; they preserve stock movements and audit records in a transaction. The `/admin/stock` route already permits this role, so the sidebar now exposes that existing function.

The role does not have taxpayer compliance, tax-record, payment, general audit-trail, staff-management, or taxpayer-record edit/delete permissions. No taxpayer correction-request workflow currently exists. Stock corrections are not taxpayer registration corrections and must remain separate.

## Recommended future taxpayer correction workflow

1. A taxpayer submits a correction request containing a request reference, correction type, original and requested values, reason, submission time, and supporting evidence references.
2. An authorized assignment process assigns a case to a Correction Officer.
3. The officer compares the current record and requested values, reviews only evidence attached to the assigned case, records comments, and can request further evidence through an approved channel.
4. The officer records a recommendation and rationale. The recommendation does not alter the taxpayer record.
5. A separately authorized independent approver makes the final decision. The final approving role must be formally identified; the existing Compliance Officer direct-edit permission is not itself proof of this approval mandate.
6. After approval, a server-side transactional operation applies the change, writes immutable before/after audit history, records the decision, and notifies the taxpayer. Rejection preserves the original record and records the reason and notification.

## Structures and controls required before implementation

- **Request and history:** request table with taxpayer ID, public reference, requested field/value data, reason, status, timestamps, and version/concurrency controls; append-only event/history table for assignment, evidence requests, comments, recommendation, decision, and status transitions.
- **Evidence storage:** private object storage; metadata tied to request and uploader; signed, short-lived access after server authorization; content type/size validation, malware scanning where available, retention policy, and access audit. Evidence URLs must not be public or embedded in ordinary search responses.
- **Assignment:** explicit assignment records and queue rules, with active staff validation and separation-of-duties checks. Do not assign solely by role label if the organization uses scoped caseloads.
- **Permissions:** separate permissions for assigned-case read, evidence read, request-more-evidence, recommend, and final approve/reject. Correction Officers receive review/recommend permissions only. Final approval belongs to a designated independent role after governance confirms it.
- **Record update:** only the final authorized decision action may update taxpayer data; use a transaction to persist the changed record, immutable event/audit entry, and notification outbox item together. Reject stale or duplicate decisions idempotently.
- **Notifications and communication:** use an approved taxpayer communication channel; store delivery status and case linkage. Keep sensitive evidence and unnecessary tax information out of notification text.
- **Audit history:** actor, timestamp, request, action, reason, prior/new values (appropriately protected), evidence access, assignment changes, and final decision. Audit entries are append-only and visible only to authorized roles.
- **Isolation and sessions:** every action checks an active session, current role permissions, case assignment/scope, and taxpayer ownership/organization rules on the server. Direct URLs and API calls must enforce the same checks.

No request schema, evidence workflow, approval permission, or taxpayer-record mutation is implemented by this document.
