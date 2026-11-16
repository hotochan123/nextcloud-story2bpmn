<!--
  - SPDX-FileCopyrightText: 2026 hotochan123
  - SPDX-License-Identifier: AGPL-3.0-or-later
-->
# Story2BPMN – Tell a process, get a BPMN diagram

<!-- factory:ai-banner -->
> **Vibe-coded:** Story2BPMN is written by AI coding agents (Anthropic's Claude Code),
> not by hand. The maintainer sets the goals, makes the product decisions and tries
> the app out in the browser; there has been no independent human code review and
> no security audit. Details: [How this app is built](#how-this-app-is-built-ai-disclosure).
<!-- /factory:ai-banner -->

Story2BPMN is a Nextcloud app for documenting business processes. You tell the
process as a story, one move at a time: how it starts, who does which task,
where it branches, what it waits for and how it ends. After every move the app
offers only what is possible at that point, so the diagram is a formally correct,
readable BPMN 2.0 diagram at every stage. No language model is involved:
everything is computed in your browser.

The result is documentation, not an executable process: a BPMN 2.0 working file
in your Nextcloud Files and a readable PDF copy next to it.

## Why a story

The aim was a tool that everyone finds simple and intuitive to use, and that
is still deterministic and gives formally correct results. Telling the process
as a story does both: being close to natural language makes it simple, and
going step by step with defined text blocks makes the result correct. The same
story always gives the
same diagram, and the same diagram should always lead back to the same process
description.

## Features

- **Tell, don't draw:** the story on the left offers the next possible moves
  (start, also several equal triggers, task, decision, whichever comes first, in parallel, wait, exception
  path, end, continue at an earlier task, also within a branch of in parallel, signals: a notice to everyone, awaited
  or given); a decision, whichever comes first and in parallel can have more
  than two paths; the diagram on the right grows with
  every move, laid out automatically, with lanes for the roles.
- **Example process:** "See an example" on the empty start page (on a phone
  also "Open example" in the ⋯ menu) opens a short invoice approval told to its end,
  in German or English after the account language; change it and tell it on,
  it lands in Files only with "Save as".
- **Subprocesses:** a task can have a flow of its own behind it, told in the
  same working file on a level of its own (with its own lanes) and drawn as a
  box with a plus; open it from the line or by double-clicking or tapping the
  box, breadcrumbs lead back. The reading copy gives each subprocess a page.
  One level only (except what can come at any time while it runs).
- **At any time:** tell what can come during the whole flow, whatever step it
  is at (e.g. the customer cancels), with its own flow; it stops everything or
  runs alongside. Also inside a subprocess, while it runs: there it stops only
  the subprocess. Drawn as a BPMN event subprocess, a dotted box.
- **For each item:** a task (also one with a subprocess) can run once per item,
  one after another or all at the same time, e.g. "check each invoice item";
  drawn with the three bars of BPMN multi-instance.
- **Edit the story:** change any line, insert a step, a wait, a signal, a branch or "in parallel" before it (a branch takes what follows into its first path, the others stay open), give a step an exception or the process another trigger later, delete it,
  delete a branch keeping one of its paths, delete one path of three or more,
  give a branch another path later
  (it stays open until you tell it), reopen a path that merges, continues elsewhere or ends, undo the last change, or begin a new process with New. Or edit the whole story as plain text, checked while you type.
- **Working files in Files:** new, open, save and save as `.bpmn` with the
  Nextcloud file picker; a click on a `.bpmn` in Files opens it in the app.
  Saving never silently overwrites a file someone changed meanwhile, and a file
  edited in another BPMN modeler shows a note. Unsaved changes are kept in the
  browser, so reloading or closing the tab loses nothing: the next opening offers
  to restore them.
- **Diagram area:** the story stays on the left, the diagram fills the rest of
  the window at a readable zoom and follows the story: choosing a line pans to
  its shape, tapping a shape chooses its line. Two fingers, a trackpad pinch or
  Ctrl + wheel zoom only the diagram, around the fingers or the pointer. By keyboard, Tab reaches the diagram: arrows pan, + and − zoom, 0 fits, Enter shows the chosen line. An overview map and standing
  lane names keep you oriented in long processes; on a tablet held upright the
  diagram is a band above the story.
- **Phone view:** below 700 px width or 500 px height one view at a time,
  story or diagram, switched in a bar at the bottom (a rail at the left edge
  when held sideways) with Undo and the next move, or Fit and Follow. A tapped
  line offers "Show in the diagram", a tapped shape "To the line"; after a move
  the story stays and a point on "Diagram" says it has grown, nothing switches
  by itself. Moves, the ⋯ of a line and the head actions open as sheets from
  below, the sidebar and "Edit as text" fill the screen.
- **Reading copy:** once the story is complete, one click on "Publish" (head
  of the diagram card) saves any unsaved changes and puts a PDF with the
  diagram, a legend and the story text next to the working file; if the file
  was changed elsewhere, the usual warning appears and nothing is published.
  PDF and SVG (with legend) can be downloaded with the "Download" button next to it as
  soon as there is a diagram (on a phone from the ⋯ menu; on a subprocess level "Download the whole process" gives the same files); everything but a valid version carries a DRAFT mark. The
  preview shows no legend.
- **Approval through Nextcloud:** ask the process owner for approval (Nextcloud
  names the state as a version and notifies them by a comment); they compare it
  line by line with the last valid version, with changed shapes framed in the
  preview, and approve it as "Valid version n": a named file version plus the
  reading copy without DRAFT. Everyone who can read the file makes proposals on
  a line as a comment; the process owner accepts or rejects them in the sidebar
  (proposals, versions, sharing). The state can also show as a tag in Files.
  When the chosen process owner cannot edit the file yet, the request dialog
  shares it with them with edit rights in one click (never on its own).
- **Two diagram languages:** each process is told in German or English
  (questions, signal words, labels); the user interface follows the account
  language (English and German, informal and formal).
- Works on desktop, laptop, tablet (touch and pen) and phone, light and dark theme.

## Requirements

Nextcloud 34 or 35. The app stores nothing in the database; processes are
`.bpmn` files in the user's Files.

## Installation

Story2BPMN is not in the App Store yet. To install a release:

1. Download the archive from a release of the
   [GitHub repository](https://github.com/hotochan123/nextcloud-story2bpmn/releases).
2. Extract it into the `apps/` (or `custom_apps/`) folder of your Nextcloud, so
   the app sits in a folder named `story2bpmn`.
3. Enable it: `php occ app:enable story2bpmn` (or on the Apps page).

From source, build the frontend first: `npm ci && npm run build`.

## Known limits

- **Documentation only:** the diagrams are not meant to be executed by a
  process engine, and the app offers only the BPMN elements a story can tell
  (see [`docs/SCOPE.md`](docs/SCOPE.md)).
- **One author at a time:** there is no live collaboration. If someone else
  saved the file meanwhile, saving warns instead of overwriting.
- **Diagrams edited elsewhere:** a working file keeps the story; changes made
  to the diagram in another modeler are not carried over when the story is
  told further.
- **PDF fonts:** the reading copy uses the PDF standard font Helvetica;
  characters outside the Western European set are replaced.
- **Approval is recognised, not enforced:** anyone who may edit the working
  file can change it in Files or another modeler; the app then shows "Changed
  since vN" but cannot prevent it. The app believes an approval only when the
  file's comments confirm it (a request by another account, then the
  approver's comment with a check code); otherwise the file counts as a draft.
  Someone who was once asked for approval by another account can still name
  themselves process owner in the file. Who may save is decided by Nextcloud's
  sharing rights; the tag in Files is only a hint.
- **Size:** a story has at most 500 moves (subprocesses and what can come at
  any time included), a line of the story text at most 500 characters; larger
  working files are not opened.
- **Tags:** showing the state as a tag needs the tag to exist or the right to
  create tags (on some servers only administrators may).

## Development

```
npm ci && npm run build     # the bundle in js/ and css/
npm test                    # unit tests of the core and the client
DB=all dev/it/run.sh        # API integration tests on four databases (Docker)
dev/store/check.sh          # build, sign and verify a store archive (Docker)
```

The core (`src/core/`: story → operations → checks → layout → BPMN XML, SVG
and PDF) has no Nextcloud dependency. The domain terms are in
[`CONTEXT.md`](CONTEXT.md), the scope in [`docs/SCOPE.md`](docs/SCOPE.md) and
the decisions in [`docs/adr/`](docs/adr/).

## How this app is built (AI disclosure)
<!-- factory:ai-about -->
Story2BPMN is vibe-coded. The maintainer ([hotochan123](https://github.com/hotochan123))
does not write the code by hand. They set the goals, make the product decisions
and try the app out in the browser. Everything else is written by AI coding
agents:

- all code – PHP, JavaScript/Vue, CSS and the database migrations;
- the tests and the development tools;
- the documentation, including this README, and the translations.

**Tool and models.** The agents run in Anthropic's Claude Code. The private
development history up to this release has 243 commits (merges not
counted), from 9 November 2026 to 15 November 2026. Each commit written by an agent carries a
`Co-Authored-By` trailer naming the model: Claude Opus 5.5 (233 commits). 10 commits without such a trailer came from people by hand (contributions through the public repository). The first 38 commits are the history of the standalone tool bpmn-core that the app grew out of: it was cut down to telling a story (building blocks, a chat input and the AI connection were removed) and gained the marked story text, English as a second language, the event kinds and its workshop design, before it was wrapped into this Nextcloud app.

**How a change is made.** The maintainer decides what goes in, in question
rounds with an agent. Each change then runs as one job of an automated
pipeline: an agent writes a short specification with acceptance criteria,
builds the change with tests, runs the checks and reviews its own change; a
second agent that has not seen the work reviews it again for correctness,
security and usability, and only then is it merged. The maintainer tries the
result in the browser before a release.
<!-- /factory:ai-about -->

**Verification.** Story2BPMN is checked by JavaScript unit tests (`npm test`:
the story engine, layout, BPMN export and re-import, the story text, the PDF
and SVG output, a golden master of complete example stories, and a check that
every text is translated in both German variants), PHP unit tests with PHPUnit
for the file access, and API integration scenarios against a throwaway
Nextcloud on SQLite, PostgreSQL, MariaDB and MySQL, on Nextcloud 34 and 35.
Besides these, every round type-checks the code, builds the bundle, lints all
PHP files, validates `info.xml` against the App Store schema and builds a store
archive, signs it with a throwaway certificate and has Nextcloud's integrity
check verify it. The development pipeline runs all of these checks
automatically in every job; there is no CI in this public repository, and some
tests need Docker, so outside the pipeline they are run by hand.

<!-- factory:ai-outro -->
**History.** This public repository gets one commit per release, exported from
the private development repository; the development history, with the job
files of the pipeline, stays private. The code is the same.

**What this means for you.** All tests and reviews above were written or done
by AI agents of the same kind, so they check the code against the agents' own
reading of the requirements. There has been **no independent human code review
and no security audit.** Evaluate Story2BPMN yourself before you rely on it,
especially for anything sensitive or open to the internet. Issues and reviews
are welcome ([issue tracker](https://github.com/hotochan123/nextcloud-story2bpmn/issues)); how to report a
security problem: [`SECURITY.md`](SECURITY.md).
<!-- /factory:ai-outro -->

## Licence

AGPL-3.0-or-later, see [`LICENSE`](LICENSE); third-party code in the bundle is
listed in [`THIRD-PARTY.md`](THIRD-PARTY.md). Story2BPMN comes without any
warranty.

Story2BPMN is an independent project and is not affiliated with any other
product or company of a similar name. BPMN is a standard of the Object
Management Group.
