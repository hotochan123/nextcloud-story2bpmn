<!--
  - SPDX-FileCopyrightText: 2026 hotochan123
  - SPDX-License-Identifier: AGPL-3.0-or-later
-->
# Third-party code in Story2BPMN

Story2BPMN itself is licensed under AGPL-3.0-or-later, see [`LICENSE`](LICENSE).

The JavaScript bundle in `js/` contains third-party code under these licences
(versions as built; the build writes the full notices next to each bundle file
as `*.license`):

| Package | Version | Licence |
|---|---|---|
| @ckpack/vue-color | 1.6.0 | MIT |
| @ctrl/tinycolor | 3.6.1 | MIT |
| @floating-ui/core | 1.8.0 | MIT |
| @floating-ui/dom | 1.8.0 | MIT |
| @floating-ui/utils | 0.2.12 | MIT |
| @mdi/js | 7.4.47 | Apache-2.0 |
| @nextcloud/auth | 2.6.0 | GPL-3.0-or-later |
| @nextcloud/axios | 2.6.0 | GPL-3.0-or-later |
| @nextcloud/browser-storage | 0.5.0 | GPL-3.0-or-later |
| @nextcloud/capabilities | 1.2.1 | GPL-3.0-or-later |
| @nextcloud/dialogs | 7.5.0 | AGPL-3.0-or-later |
| @nextcloud/event-bus | 3.3.3 | GPL-3.0-or-later |
| @nextcloud/files | 4.1.1 | AGPL-3.0-or-later |
| @nextcloud/initial-state | 3.0.0 | GPL-3.0-or-later |
| @nextcloud/l10n | 3.4.1 | GPL-3.0-or-later |
| @nextcloud/logger | 3.0.3 | GPL-3.0-or-later |
| @nextcloud/paths | 3.1.0 | GPL-3.0-or-later |
| @nextcloud/router | 3.2.0 | GPL-3.0-or-later |
| @nextcloud/sharing | 0.4.0 | GPL-3.0-or-later |
| @nextcloud/vue | 9.13.1 | AGPL-3.0-or-later |
| @nextcloud/vue-select | 4.1.0 | MIT |
| @pdf-lib/standard-fonts | 1.0.0 | MIT |
| @pdf-lib/upng | 1.0.1 | MIT |
| @vitejs/plugin-vue | 6.0.10 | MIT |
| @vue/reactivity | 3.5.43 | MIT |
| @vue/runtime-core | 3.5.43 | MIT |
| @vue/runtime-dom | 3.5.43 | MIT |
| @vue/shared | 3.5.43 | MIT |
| vue | 3.5.43 | MIT |
| @vuepic/vue-datepicker | 11.0.3 | MIT |
| @vueuse/core | 14.4.0 | MIT |
| @vueuse/shared | 14.4.0 | MIT |
| axios | 1.21.1 | MIT |
| bpmn-moddle | 10.2.0 | MIT |
| bpmnlint | 11.14.0 | MIT |
| bpmnlint-utils | 1.1.1 | MIT |
| date-fns | 4.4.0 | MIT |
| debounce | 3.0.0 | MIT |
| dompurify | 3.4.17 | (MPL-2.0 OR Apache-2.0) |
| escape-html | 1.0.3 | MIT |
| eventemitter3 | 5.0.4 | MIT |
| floating-vue | 5.4.0 | MIT |
| focus-trap | 8.2.4 | MIT |
| min-dash | 5.1.0 | MIT |
| moddle | 8.2.1 | MIT |
| moddle-xml | 12.2.0 | MIT |
| p-queue | 9.3.5 | MIT |
| p-timeout | 7.0.2 | MIT |
| pako | 1.0.11 | (MIT AND Zlib) |
| pdf-lib | 1.17.1 | MIT |
| saxen | 11.1.1 | MIT |
| semver | 7.8.6 | ISC |
| splitpanes | 4.1.2 | MIT |
| tabbable | 6.5.1 | MIT |
| tslib | 1.14.1 | 0BSD |
| typescript-event-target | 1.1.2 | MIT |
| vite | 7.3.7 | MIT |
| vue-router | 5.5.0 | MIT |
| webdav | 5.11.0 | MIT |

The PDF reading copy uses the PDF standard fonts Helvetica and Helvetica Bold
through pdf-lib (`@pdf-lib/standard-fonts`, MIT): only their metrics ship, no
font files.

The server part (`lib/`) uses only Nextcloud's public PHP API and ships no
third-party PHP code.
