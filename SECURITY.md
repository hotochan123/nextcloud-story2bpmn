<!--
  - SPDX-FileCopyrightText: 2026 hotochan123
  - SPDX-License-Identifier: AGPL-3.0-or-later
-->

# Security policy

## Status of the code

Story2BPMN is written by AI coding agents (Anthropic's Claude Code), not by
hand. It has had no independent human code review and no security audit.
Please evaluate it yourself before you rely on it. Details:
[How this app is built](README.md#how-this-app-is-built-ai-disclosure).

## Reporting a vulnerability

Please do not describe a security problem in a public issue.

- **Preferred:** GitHub's private vulnerability reporting – "Report a
  vulnerability" on the repository's
  [Security tab](https://github.com/hotochan123/nextcloud-story2bpmn/security).
- **If that button is not there** (for example because private reporting has
  been switched off): open an
  [issue](https://github.com/hotochan123/nextcloud-story2bpmn/issues) that only
  says you have found a security problem and asks for a private way to send the
  details – no description, no proof of concept. The maintainer will answer
  with a contact.

Helpful in a report: the Story2BPMN version or commit, the Nextcloud version,
what an attacker needs (a Nextcloud account, a crafted `.bpmn` file, a shared
file or folder, administrator rights, …), the steps to reproduce and the effect.

Story2BPMN is maintained by one person. There is no bug bounty and no
guaranteed response time; fixes go into the next release, and only the newest
release is supported.

## Scope

In scope:

- the app in this repository: the PHP code, the templates, the JavaScript
  bundle and its sources;
- the file API of the app (opening, saving and publishing files): access to a
  file the account may not read or write, or overwriting a file without the
  conflict check;
- crafted `.bpmn` files: script or markup that ends up in the page, the SVG or
  the PDF, or a file that makes the browser or the server hang.

Out of scope:

- Nextcloud server itself and other apps – please report those to Nextcloud
  (<https://nextcloud.com/security/>);
- the configuration of your web server or proxy;
- the limits listed under "Known limits" in [`README.md`](README.md#known-limits);
- the tools under `dev/` and `tests/`, which are not part of a release.
