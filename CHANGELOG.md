# Changelog

## [Unreleased]

## [0.3.0] – 2026-11-16

### Added
- Rebuild a story without the text mode, all from the ⋯ of a line or path (on a phone in its sheet), each one change that Undo takes back, refused with the reason where it does not fit:
  - "Move …": a step, wait, signal or branch, with the lines after it if you like, goes behind another line or to the start of a path, also on another path.
  - Swap paths: "Move path up" and "Move path down" on the heading of a path.
  - "From here on for all paths": a path merges right before the line, and the rest comes after the merge for all paths.
  - Switch the kind of a branch ("It depends", "What comes first", "In parallel") in its edit form; the paths and what is told on them stay.
- Rename a role everywhere: changing the role in an edit form asks "Only here" or "Everywhere (n steps)"; its lane in the diagram follows, and two roles can become one.
- "Edit as text" in the ⋯ of every line opens the text at that line.

### Changed
- New look in the style of the other apps of this Nextcloud: colours and fonts follow the instance (primary colour, light, dark and high contrast). Process name as title, state as a chip (● Fully told, ■ Draft, Valid version n), story and diagram as framed panels. The diagram stays black on white paper in dark mode; PDF and SVG are unchanged.
- The story reads more clearly: line numbers in one column, the paths of a question drawn as a tree, a later path names its question ("Defect confirmed? → no"), sentence parts tinted, the ⋯ menu grouped.
- "Edit as text" uses the instance font and the same line numbers as the story, so "line 7" means the same line everywhere; a line that cannot be read is marked "Not taken over" with the reason.
- Approval and phone in the new look: proposals as entries with a chip (Accepted, Rejected, Done), a tab "Approvals", the comparison with the last valid version as a list with new / changed / removed; on a phone Undo and "Story · Diagram" sit in the bar at the bottom.
- Clearer signal words in the story text (German `AUSNAHME`, `ZUSAMMENFÜHREN.`, `WIEDER AUF DEM HAUPTWEG:`, `JE [item]`; English `EXCEPTION`). "Edit as text" still reads the old words; working files and approvals stay valid.

### Fixed
- Deleting no longer leaves a flow without an end; the notice names the "continue at" line that leads back.
- "Edit as text" reads stories again whose normal path was told before an exception path ("other path first"), so such texts and proposals can be applied.
- Captions in the first column keep clear of the lane header with the role name (preview, SVG and PDF).

## [0.2.0] – 2026-11-14

### Added
- Approval through Nextcloud: ask the process owner for approval (named file version and a comment), compare a state with the last valid version, approve it as "Valid version n" with a reading copy without DRAFT; proposals on single lines as comments, decided in a sidebar with proposals, versions and shares; the state can also be a Files tag. "Share with edit rights" in the request dialog when the process owner cannot edit the file yet.
- Subprocesses: a task can have a flow of its own, told in the same working file, with its own diagram level and a page in the reading copy (one level).
- "Something can come at any time" (event subprocess), also inside a subprocess; signals (start with, wait for, send, end with); "for each item" tasks (one after another or at the same time); more than one trigger.
- Branches with more than two paths; add a path later, delete one path, keep only one path, reopen a merge, "continue at" or end; insert a wait, signal, branch or exception before a line; loops inside "at the same time".
- Phone view: story or diagram, switched in a bar at the bottom, sheets from below for menus.
- Unsaved work survives reloading or closing the tab ("Restore" / "Discard").
- Example process on the empty start page.
- Diagram by keyboard (pan, zoom, fit, show the chosen line); pinch zoom on the diagram only.

### Changed
- Workbench: the story on the left, the diagram fills the rest and follows the story, with an overview map; a "Download" button for PDF and SVG.
- PDF and SVG carry DRAFT unless the state is a valid version; head and foot name version and approver. While a valid version exists, "Publish" files a draft beside it and never replaces it.
- "Undo" goes back to the state before the last change of any kind; refusals name the line to change; "Really …?" buttons fall back after 4 seconds.
- Branches whose paths have no step yet are allowed; empty paths into a merge are drawn as one arrow.
- German wording is consistent ("du" in de, "Sie" in de_DE).
- "Start over" is gone; "New" does the same without keeping the old file connected.

### Fixed
- Security: approval details in a working file count only when Nextcloud comments confirm them; people named in a file are used only as verified Nextcloud accounts; "Share with edit rights" never raises a public link or mail share; shares that forbid downloads are respected.
- Working files from 0.1.0 whose "continue at" jumps back into a branch of "at the same time" after it merged open again: that jump becomes a path still open, and a note names the line to tell again. Files from 0.1.0 with a line told on an extra path after nested branches open too: that line is left out and named in a note; the file changes only on the next save.
- Crafted story text or very large files no longer freeze the browser tab.
- "Overwrite" in the conflict dialog keeps the approval; "Edit as text" no longer discards typed text without asking.
- Proposals point to the right line; exceptions stay on their step; "continue at" stays with its step; keys 1–9 act only where you are; captions no longer lie under arrows; no zoom controls before there is a diagram; several fixes in nested branches.

## [0.1.0] – 2026-11-11

First release.

### Added
- Tell a business process as a story, one move at a time: the story offers only the moves possible at that point, and the BPMN 2.0 diagram grows with every move, laid out automatically with lanes for the roles (zoom, fit).
- Edit the story: change any line, insert a step before it, delete it, undo or start over; or edit the whole story as text, checked while you type.
- Working files in Nextcloud Files: new, open, save and save as `.bpmn` with the file picker; a click on a `.bpmn` in Files opens it. Saving never silently overwrites a file changed elsewhere; a file edited in another modeler shows a note.
- Reading copy: "Publish" puts a PDF (diagram with legend, then the story text) next to the working file; PDF and SVG can also be downloaded. Unfinished processes carry a DRAFT mark.
- Diagram language per process (German or English), saved in the working file; the interface follows the account language (English, German informal and formal).
- Works on desktop, laptop and tablet (touch and pen), light and dark theme. Everything is computed in the browser; no language model.
