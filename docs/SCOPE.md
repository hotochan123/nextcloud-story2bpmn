# Scope

What this tool is, who it is for, and where it stops. One page, deliberately without
technology: that lives in `README.md`, the terms in `CONTEXT.md`, the
reasons in `docs/adr/`.

## Purpose

A business process is told as a **Story**, piece by piece, and becomes a
**process diagram** in BPMN 2.0 along the way, without AI, formally correct at every
stage (`docs/adr/0004-story-as-the-only-input.md`). What comes out is
documentation for understanding and agreeing on a process, **not an executable process**: no
engine, no workflow system.

The value lies in the first version. Setting up a diagram by hand is the
tedious hour; correcting it afterwards is quick. The tool takes over exactly
that hour.

## Users

| Role | Uses the tool | For |
|---|---|---|
| **Author** | regularly | tells the **Draft** |
| **Process owner** | occasionally | compares the state with the last valid version, approves it, decides proposals |
| **Involved party** | now and then | reads a valid version, makes proposals as comments, looks things up in the CRM |

What matters: only the **Author** really works with it. Everything that needs
more than one person at the same time is therefore out.

## In scope

- **Story in, draft out**: after each **Move**, only the options that are possible
  at that point; undo the last change at any time, a branch can be deleted
  by keeping one of its paths, and it can get another path later, which stays a
  path still open until it is told.
- **Subprocesses** (`docs/adr/0007-subprocess-in-the-same-working-file.md`): a task
  with a flow of its own behind it, told in the same working file on a level of its
  own, one level deep.
- **Readable arrangement**: lanes in a fixed order, main path straight,
  as few crossings and bends as possible.
- **Handing out**: the BPMN **working file** as the original, plus the
  **reading copy** as a PDF with the same name next to the `.bpmn` in Files
  (an existing one becomes its new version), for a fully told story; "Publish"
  saves unsaved changes first and files nothing if saving meets a conflict.
  Unsaved changes, also text typed in "Edit as text" and not applied yet, are
  kept in the browser only (offered back after a reload),
  never written into the file on their own.
  PDF and image (SVG) can be downloaded as soon as there is a diagram. Everything but a
  **valid version** carries the note DRAFT.
- **Approval through Nextcloud** (`docs/adr/0006-approval-through-nextcloud.md`): ask
  the process owner for approval, compare with the last valid version line by line and in
  the preview, approve as a named Nextcloud version with a reading copy without DRAFT;
  proposals on a line as comments, accepted or rejected by the process owner (a second
  press confirms; locked while the story has unsaved changes, which are never saved along).
- **Opening and saving** the working file as `.bpmn` in the account's Nextcloud
  Files (also by clicking it in Files); storytelling continues from the story in
  the file, so a later session shifts nothing. Saving warns if
  the file was changed elsewhere since it was opened.

## Out of scope

Not for lack of time, but on purpose:

- **An approval workflow of its own.** Beyond what Nextcloud's sharing, comments and
  named versions carry (`docs/adr/0006-approval-through-nextcloud.md`), there are no
  workflow steps, deadlines or protected versions: whoever owns the file can change it,
  the app only recognises that.
- **Lookup for all employees.** That is what the CRM is for; the
  approved version is transferred by hand.
- **Storage of its own.** No database table, no backup of its own:
  the working file lives in Nextcloud Files, and permissions, versions and backup
  come from there. No real-time collaboration.
- **Executable BPMN.** No engine attributes, no forms, no
  system tasks. See `docs/adr/0001-documentation-not-execution.md`.
- **Importing running text** (e.g. from a manual) and **AI support**.
  Removed on 9 Nov 2026, see `docs/adr/0004-story-as-the-only-input.md`.
- **Parts of the BPMN notation** that a business side does not read: references to
  other processes, external partners, waiting events.

The idea behind it: the tool is a **workshop**, not a process portal.

## Open questions for IT

Without these commitments nothing goes into production. They cannot be solved technically:

1. **Server in the company network.** Where the web interface runs, who operates it.
   The interface has **no sign-in**; anyone who can reach it on the network can use it.
   In the company network this must be agreed beforehand.
2. **Sign-in through the company account.**
3. **Which CRM**, and where exactly the **working files** live.
4. To be clarified on the business side: can a **Task** have more than one **System**?
   Today: at most one.
