# Event kinds as a kind of existing moves

Decided on 9 Nov 2026. Supplements `0004-story-as-the-only-input.md`.

In the medium to long term, more BPMN events should reach the diagram: message, time, condition, "whichever comes first", non-interrupting exceptions. The story is aimed at laypeople. If every event kind got a move of its own, the list of options would become cluttered, and with it the language: words like "intermediate message event" are taboo in the story (see **Move** in `CONTEXT.md`).

## Decision

An event kind is not a new move but the **kind** of a move that already exists. The model is the `subtype` field of the exception path (`error` / `deadline`). In addition there is exactly one new move, **Wait ...** (`wait`).

Rules:

1. **The simple kind is preselected.** Anyone who selects nothing gets what is drawn today. The kind is an optional field like system and deadline.
2. **Everyday words only.** The question is "By what?", the answers are "A message arrives", "At a point in time", "A condition occurs".
3. **Offer only what is possible at that point**, as with all moves.
4. **Sending is a task.** There are no throwing intermediate events. "[@Accounting] shall [send reminder]" stays a task.

| Move | Kinds | BPMN |
|---|---|---|
| `start` | simple, message, time, condition | Start: none, Message, Timer, Conditional |
| new `wait` | message, time, condition | catching intermediate event |
| `decision` | check (today) or **whichever comes first** | exclusive or event-based gateway |
| `exceptionPath` | error, deadline (today), plus message. For deadline and message the question "Does the task continue?" is asked | boundary event Error, Timer, Message; interrupting or not |
| `end` | simple, message, **cancel everything** (only with open parallel branches) | End: none, Message, Terminate |

**Whichever comes first:** every path gets a kind (message, time or condition). The label of the path is the catching event. This way the BPMN rule "behind the event-based gateway comes a catching event" is already satisfied by the story, without a form of its own.

**Story text:** two new signal words, `WARTEN AUF` and `WAS ZUERST PASSIERT` (en `WAIT FOR`, `WHAT COMES FIRST`). The kind appears as a word in the sentence, for example „ES BEGINNT mit Nachricht: [Antrag geht ein]“ or „FALLS nach [2 Tagen], Schritt läuft weiter:“.

## Not planned

These event kinds do not enter the basic route: signal, escalation, compensation, link, multiple events, cancel, error end and throwing intermediate events. They are rare in documentation diagrams, and laypeople can hardly tell them apart. If they come later, then as a switch for experts.

## Order

Each stage is usable on its own:

1. Start kinds message and time
2. Move `wait` with message and time
3. "Whichever comes first" (needs stage 2)
4. Non-interrupting exception, for example a reminder while the task continues
5. End with message, "cancel everything"

Condition (Conditional) is added last in each case. It is the rarest, and a layperson easily confuses it with "It depends".

## Consequences

- Each stage needs a term in `CONTEXT.md`, a legend entry (`legend()` in `src/core/render.ts`) and a symbol according to the rules in `docs/design-handoff/referenz/uebergabe/BRIEF.md`.
- The layout needs room for boundary events that do not interrupt. BPMN draws them dashed, so the renderer needs a new line style.
- The IR needs event kinds on start, end and intermediate event. `toBpmn` and `fromBpmn` must write and read the event definitions. Storytelling continues from the moves, but a file without a story should still be read in correctly.
- In the working file the moves stay backward compatible: a move without `subtype` counts as the simple kind.
