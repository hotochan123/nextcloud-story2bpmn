# Subprocess in the same working file

Decided on 12 Nov 2026 (grill on the OpenDesign round "new ideas", T1–T7). Supplements `0005-event-kinds-in-the-story.md`.

A task can have a flow of its own behind it. Where does that flow live, and how is it told?

## Decision

1. **Same working file.** The flow behind a task is told in the same working file as the main flow: one file, one approval, one reading copy. In BPMN it is a collapsed `bpmn:SubProcess` (`isExpanded="false"`) with its own elements, its own lanes and its own diagram plane. A reference to another working file is a later idea of its own.
2. **No new move.** A subprocess is a task: the task form asks "Is there a flow of its own behind it?", and ⋯ on a task line adds one later. In the code the task move carries the moves of that flow (`subprocess`, stored as `teilablauf`); they begin without a start move, because a subprocess begins plainly (BPMN wants a blank start there).
3. **One level.** A task inside a subprocess has no flow behind it.
4. **Story text:** the task line ends with `, MIT TEILABLAUF.`; after the main flow comes one section per subprocess, `TEILABLAUF [task]:`, starting with `ES BEGINNT.` (English `WITH SUBPROCESS`, `SUBPROCESS [task]:`, `IT STARTS.`). Read back like the rest of the text.
5. **Open point until told.** A flow behind a task that is not told to its end is an open point: the reading copy keeps its DRAFT mark.
6. **Reading copy:** one diagram page per subprocess right after the main flow; the box says "see page n" (PDF only).

## Consequences

- IDs of a subprocess carry the prefix `<task id>_`, so both levels share one file and one position map.
- Publishing, approval and the comparison with the valid version cover the whole working file; the comparison works on the whole story text, sections included.
