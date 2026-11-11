# Changelog

## [Unreleased]

## [0.1.0] – 2026-11-11

First release.

### Added
- Tell a business process as a story, one move at a time: the story offers only the moves possible at that point, and the BPMN 2.0 diagram grows with every move, laid out automatically with lanes for the roles (zoom, fit).
- Edit the story: change any line, insert a step before it, delete it, undo or start over; or edit the whole story as text, checked while you type.
- Working files in Nextcloud Files: new, open, save and save as `.bpmn` with the file picker; a click on a `.bpmn` in Files opens it. Saving never silently overwrites a file changed elsewhere; a file edited in another modeler shows a note.
- Reading copy: "Publish" puts a PDF (diagram with legend, then the story text) next to the working file; PDF and SVG can also be downloaded. Unfinished processes carry a DRAFT mark.
- Diagram language per process (German or English), saved in the working file; the interface follows the account language (English, German informal and formal).
- Works on desktop, laptop and tablet (touch and pen), light and dark theme. Everything is computed in the browser; no language model.
