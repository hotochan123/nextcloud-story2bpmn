# Blocks as a second way to a process description

> **Superseded** by `0004-story-as-the-only-input.md` (9 Nov 2026): blocks, running text and AI are removed; the only input is the story.

Settled on 12 Sep 2026. So far there was exactly one input: existing running text, from which the AI derives the whole diagram. The measurements show where it gets stuck: not in the content, but in the structure. Every correction so far concerned structure: missing lanes at start, end and decision (`inferLanes`), exception paths as an appendage instead of a command of their own (`splitStrayException`), missing arrows, the else path without a condition. Who, with what and by when, on the other hand, almost always came out cleanly.

The decision: besides running text there is a second input in which the author clicks **blocks** together and fills them with free text. The block type carries the structure, the free text carries the content. The type is translated into ops **deterministically**, entirely without AI (`src/bausteine.ts`); afterwards the AI only reads the free text of each block and adds lane, system and deadline.

A **form** for the whole process was rejected. Anyone who enters lanes, predecessors, branches and merges into fields has already modeled the process; drawing was never the hard part. A form demands exactly the BPMN thinking this tool is meant to spare, and for existing process texts it would be pure duplicate work. Also rejected was **replacing** the running text: the processes exist as text in the CRM, and that route must stay.

## Consequences

- The AI's error surface shrinks from "build the whole graph" to "read the fields from one sentence". That is the real gain, not the clicking.
- No block is named after a BPMN element: "If ... then ... else" instead of gateway, "In case something goes wrong" instead of boundary event. Otherwise the toolkit demands the same knowledge as a modeling tool.
- **Branches merge again automatically at the next block.** Nobody has to understand "merge". Anyone who wants something different cannot get there with blocks; this is a deliberate trade-off.
- **Nesting ends at two levels** (`MAX_TIEFE`). Deeper, the toolkit becomes unusable and is usually a process of its own from a business point of view.
- The format is built **before** the interface and can be tested without it; it therefore does not depend on the web interface, which still rests with IT.
- `CONTEXT.md` changes: **process description** is no longer only "existing running text", but running text **or** a sequence of **blocks**. New term: **block**.
- Both inputs lead into the same draft and the same ops. There is no second core and no second check.
- **The second step got a tiny schema of its own** (`src/felder.ts`): on the block route the model no longer outputs commands but fills in a table per node (role, system, deadline). The ops are then created from it in code. Measured 36.9 s instead of 49.6 s; and error classes such as "command without required field" or "extra detail on the trigger" are ruled out by construction rather than merely unlikely.
- **Measured on 12 Sep 2026**, the same process in three versions, 10 runs each with `qwen3.8:27b`: well written 113.5 s / 18 ops / 0 open points; badly written 132.8 s / 21 ops / 3 open points and never a reading copy; as blocks 49.6 s / 11 ops / 0 open points. All three build a valid diagram; the difference lies in time and rework, not in validity.
