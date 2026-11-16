# Approval through Nextcloud's own means

Decided on 12 Nov 2026. Replaces `0002-workshop-not-process-portal.md` in part.

ADR 0002 left approval, versions and proposals outside the tool, because they are the biggest chunk of a process portal. Inside Nextcloud most of that chunk exists already: sharing with rights and notifications, comments on files, and file versions that can be named. What Nextcloud lacks is a reference from a comment to one line of a process, and a comparison of two states of a BPMN working file.

## Decision

Approval runs through Nextcloud, started from the app, without a database table of its own:

- **A valid version is a named Nextcloud file version** ("Valid version 3" / „Gültige Version 3“). Next to it lies the reading copy without the DRAFT mark. The working file also records the number, date, approver and the moves of the last valid version (attribute `s2b:freigabe`, namespace `urn:story2bpmn:freigabe`), so the comparison works for everyone who can read the file.
- **The current state is the next draft.** If it differs from the valid version, the status is "Changed since vN". Changes the author makes to a valid version count as one proposal; they apply only after the next approval.
- **Ask for approval** names the saved state "For approval <date>", mentions the process owner in a comment (Nextcloud notifies them) and sets the status. Changing the state afterwards withdraws the request.
- **Approve** (only the process owner recorded in the file, who needs the right to edit) names the state "Valid version n+1", files the reading copy and mentions the author.
- **Proposals are Nextcloud comments** in a fixed form: `Vorschlag zu Gültige Version 3, Zeile 3 [label]` (English `Proposal on valid version 3, line 3 [label]`), then the kind, the new wording in story text and why. Everyone who can read the file can comment. The line is the number shown left of the story line (its move on that level, job 417), not a count of text lines. Since a valid version never changes, version, line and label find the line; the main flow comes first when a subprocess has a move with the same number and label. Accepting writes the wording into the working file; the ids of decided comments are kept in the file.
- **The status can also be a Nextcloud tag** ("For approval", "Valid"), switchable per file.
- The CRM transfer stays manual and leaves no mark in the file.

Checked before building: Nextcloud 34.0.5 (the shared try instance) and 35.0.1 skip named versions in both clean-ups of `files_versions` (by age and by space). So no extra copy of a valid version is written. The integration run (`dev/it/scenarios.mjs`, job 385) shows it: with a retention of 0 days every older unnamed version expires, the named one stays.

## Consequences

- Kept from ADR 0002: the tool stores nothing of its own (no database, no backup of its own), there is no lookup portal for all employees, and the CRM transfer is manual.
- Changed: approval, proposals and valid versions no longer happen outside; they happen in Nextcloud, started from the app. The original is the working file in Nextcloud Files.
- New risk: anyone who may edit the file (not only its owner) can change it past the app (in Files, over WebDAV or in another modeler), including the approval details in `s2b:freigabe`. The app recognises "changed since vN" but cannot prevent it; as with "approved but not transferred", the organisation carries this.
- The app believes the approval details only as far as Nextcloud confirms them (job 432; `confirmApproval` in `src/approval.ts`, `lib/Service/ApprovalCheck.php` on the server). A comment carries the account that wrote it, set by the server. The valid version counts only with an approval comment of its approver ("Approved as valid version n." plus "Check code: …", the first 16 hex digits of SHA-256 over number, diagram language and the stored story text) written after another account asked the approver in a request comment. The process owner counts only when another account asked them; "for approval" only with such a request newer than the approval. Names are Nextcloud's display names from the comments. Anything else is left out: the file counts as a draft with a note, and the server files a reading copy under the valid version's name only for a confirmed version (a file without approval details keeps the plain name; its reading copy carries the DRAFT mark). Only the newest 1000 comments are read.
- Who is process owner is still a name in the working file, not a permission, now backed by a request comment. Remaining risk: someone who was once asked by another account can later name themselves process owner in the file and approve; the app then shows truthfully that they approved. Nextcloud's share rights decide who can save; the app only offers approving and deciding proposals to the confirmed process owner.
- The tag in Files ("Valid", "For approval") is only a hint: anyone who may edit the file can set or remove it. Named versions are no proof either: an editor can name any version, and the version keeps its original author.
- Draft reading copies stay (with the DRAFT mark). While a valid version exists, a draft is filed as "<name> (Draft).pdf" so it never replaces the valid reading copy.
