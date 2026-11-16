# Changelog

## [Unreleased]

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
