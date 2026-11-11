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
| **Process owner** | occasionally | looks at the draft; the **Approval** itself happens outside |
| **Involved party** | not at all | contributes knowledge, later looks things up in the CRM |

What matters: only the **Author** really works with it. Everything that needs
more than one person at the same time is therefore out.

## In scope

- **Story in, draft out**: after each **Move**, only the options that are possible
  at that point; undo at any time.
- **Readable arrangement**: lanes in a fixed order, main path straight,
  as few crossings and bends as possible.
- **Handing out**: the BPMN **working file** as the original, plus the
  **reading copy** as a PDF with the same name next to the `.bpmn` in Files
  (an existing one becomes its new version); PDF and image (SVG) can also be
  downloaded. With **open points**, both carry the note DRAFT.
- **Opening and saving** the working file as `.bpmn` in the account's Nextcloud
  Files (also by clicking it in Files); storytelling continues from the story in
  the file, so a later session shifts nothing. Saving warns if
  the file was changed elsewhere since it was opened.

## Out of scope

Not for lack of time, but on purpose:

- **Approval, versions, proposals.** These are standard features of finished
  products (ADONIS, SAP Signavio, ARIS) and would be the biggest chunk of a
  self-build, without value of their own. Happens organizationally outside.
  See `docs/adr/0002-workshop-not-process-portal.md`.
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
