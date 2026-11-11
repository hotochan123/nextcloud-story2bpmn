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
going step by step makes the result correct. The same story always gives the
same diagram, and the same diagram should always lead back to the same process
description.

## Features

- **Tell, don't draw:** the story on the left offers the next possible moves
  (start, task, decision, whichever comes first, in parallel, wait, exception
  path, end, continue at an earlier task); the diagram on the right grows with
  every move, laid out automatically, with lanes for the roles.
- **Edit the story:** change any line, insert a move before it, delete it, undo
  or start over. Or edit the whole story as plain text, checked while you type.
- **Working files in Files:** new, open, save and save as `.bpmn` with the
  Nextcloud file picker; a click on a `.bpmn` in Files opens it in the app.
  Saving never silently overwrites a file someone changed meanwhile, and a file
  edited in another BPMN modeler shows a note.
- **Reading copy:** once the story is complete, "Publish" puts a PDF with the
  diagram, a legend and the story text next to the working file; PDF and SVG
  can also be downloaded. Unfinished processes carry a DRAFT mark.
- **Two diagram languages:** each process is told in German or English
  (questions, signal words, labels); the user interface follows the account
  language (English and German, informal and formal).
- Works on desktop, laptop and tablet (touch and pen), light and dark theme.

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
- **Not yet:** approval workflow and proposals by other people.

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
development history up to this release has 69 commits (merges not
counted), from 9 November 2026 to 11 November 2026. Each commit written by an agent carries a
`Co-Authored-By` trailer naming the model: Claude Opus 5.5 (69 commits). The first 38 commits are the history of the standalone tool bpmn-core that the app grew out of: it was cut down to telling a story (building blocks, a chat input and the AI connection were removed) and gained the marked story text, English as a second language, the event kinds and its workshop design, before it was wrapped into this Nextcloud app.

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
