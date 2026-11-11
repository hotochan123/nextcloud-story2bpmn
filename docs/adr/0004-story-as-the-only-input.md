# Story as the only input, AI removed

Decided on 9 Nov 2026, supersedes `0003-blocks-as-second-input.md`.

There were four routes to the draft: clicking blocks (plus AI for lane, system, deadline), pasting running text (AI builds everything), conversation (AI asks follow-up questions) and the story. After each move, the story offers only what is possible at that point and needs no AI; it can do everything blocks and conversation could, plus loops ("back to ...") and parallel branches. The author saw no benefit in the other routes any more.

## Decision

Blocks, conversation and running text are removed, and with them the whole AI integration (`ai.ts`, `ollama.ts`, `felder.ts`, `bausteine.ts`, `interview.ts`, the measurement run `bench.ts`, the writing aid). The core (ops, validation, layout, file, reading copy, read-back) stays unchanged.

## Consequences

- Existing process texts from manuals can no longer be imported; they are retold.
- System, documents and deadline per task used to come from the free text via the AI. The story has to ask for them itself. Addendum 9 Nov 2026: it asks for system and deadline, not for documents.
- **Open points** stay in the core but currently have no producer.
- The IT question about an allowed AI provider no longer applies; no process texts go to a model any more.
- The old state is in the first git commit (`678a83c`), should a route ever come back.
