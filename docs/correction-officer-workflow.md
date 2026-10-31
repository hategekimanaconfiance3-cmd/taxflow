# Correction Officer: implemented review workflow and governance boundary

## Current role

Correction Officer is a legacy stock-correction role. It can search basic taxpayer directory records and access the system-wide stock overview. Its stock actions can change quantity, price, and source or soft-void a stock record with a reason; they preserve stock movements and audit records in a transaction. The `/admin/stock` route already permits this role, so the sidebar now exposes that existing function.

The role does not have taxpayer compliance, tax-record, payment, general audit-trail, staff-management, or taxpayer-record edit/delete permissions. Stock corrections are not taxpayer registration corrections and remain separate.

## Implemented taxpayer correction review workflow

1. A taxpayer requests a change to an eligible profile field. The server snapshots the current value, records the requested value and reason, and assigns a unique reference. The official taxpayer row is not changed.
2. A narrowly permissioned assignment queue assigns an unassigned request to an active Correction Officer. Assignment is currently restricted to the existing Super Admin permission model; it does not grant that role final decision authority.
3. The assigned officer compares the recorded and requested values, reads attached private PDF evidence, records review comments, or asks the taxpayer for more evidence. The taxpayer can add evidence only while the request awaits it.
4. The officer records one reasoned recommendation. It does not approve/reject the request or update the taxpayer record. Recommendation and subsequent final approval are separate stages.
5. A separately authorized independent approver must make any final decision. The official approving role has not been identified, so no final-decision permission, endpoint, or taxpayer-record mutation has been added.

Taxpayers can view only their own requests. Officers can view only assigned cases. Evidence retrieval checks active staff, explicit evidence permission, and current case assignment. Uploads use private Blob storage and server-issued taxpayer-scoped paths; only PDF files up to 10 MB are accepted. Evidence access, submissions, assignments, comments, requests for more evidence, and recommendations create append-only events and audit records.

## Permission boundaries

Correction Officers receive assigned-case read, evidence read, request-evidence, review-comment, and recommendation permissions. They do not receive assignment, final approve/reject, taxpayer edit/delete, confidential tax/payment, general audit-trail, or officer-management permissions. Assignment is a separate permission currently held by Super Admin, after which a Correction Officer controls the review/recommendation stage. No role has been selected as final approver.

## Structures and controls required before implementation

- **Final decisions remain unimplemented:** governance must identify the independent approving role and whether it can be separate from the reviewer. Add a distinct permission only after formal authorization.
- **Evidence safety:** private PDF storage and access audit are implemented. Malware scanning and an evidence-retention schedule are not configured and need operational policy before production use.
- **Assignment scope:** assignment currently uses the existing staff-level permission and active Correction Officer role. If the organization requires regional or office-level caseload restrictions, those scope dimensions must be defined and applied to queries.
- **Organization isolation:** these profile requests are owned by a taxpayer account and every read is owner- or assignment-scoped. No separate organization/tenant scope exists in the current user/profile model to enforce here.
- **Communication:** in-app notifications cover new assignments and additional-evidence requests. A taxpayer-facing decision notification cannot be sent until a final decision workflow exists.
- **Concurrency:** request-level row locks protect review transitions; submission keys and evidence pathname uniqueness protect duplicate submissions. Request rows are not directly writable from client code; append-only event and evidence rows have database triggers.

Migration `0027_taxpayer_correction_management.sql` adds the request, event, and evidence tables. The schema intentionally has no final decision columns and no taxpayer-record update action. Apply and validate this migration only through the project's normal non-production migration process before enabling the workflow.
