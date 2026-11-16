# Symbol rules

How the process diagram draws its symbols, and how to draw a new one without a new design round.
More of the BPMN 2.0 catalogue will come (task types, subprocesses, data, message flows, more event
and gateway kinds); these rules decide how each of them looks. Terms are those of `CONTEXT.md`.
Unit: px in the diagram, 1 : 1 to the PDF.

## Fixed

- **The shapes are BPMN 2.0.** Circle, box, diamond with × or +, double circle, letter, clock and
  sheet stay as the standard draws them. Only line, type, grey and spacing are designed.
- **Monochrome and printable.** The reading copy is also printed in black and white. The one
  exception is the blue "continue here" frame of the preview; it never goes into the PDF.
- **Preview and PDF look the same.** Both come from the same geometry in `src/core/render.ts`.
- **Type:** Helvetica, WinAnsi characters only (other fonts would need embedded TTF files).

A new symbol needs four decisions: its **shape family**, its **line style**, its **mark in the
grid** and its **legend entry**. A new shape never gets a line of its own; it takes one below.

## 1 · Lines

| Style | Value | Used for |
|---|---|---|
| normal | 1.5 | start, task, diamond, document |
| thick | 3.2 | end, also with a mark |
| double | 1.5 outer (r 18) + 1.2 inner (r 14.5), gap 3.5 | intermediate event: wait, exception path |
| dashed | 1.5, dash 4 / gap 3 | exception path where the task continues; later message flow, event subprocess |
| dotted | 1.5, dot / gap 3.5, round cap | association (document to task); later data flow |
| arrow | 1.25, filled head 9 × 7.2 | sequence; open head only on a dotted association with a direction |
| lane | 0.75 | pool, lanes, headers |
| mark | 1.25, round corners and caps | everything inside the mark grid |

## 2 · Marks inside shapes

- **Field:** every mark sits in a 16 × 16 field, centred in the shape. In an event at least 3 stay
  free towards the inner ring.
- **Four base areas:** circle Ø 15 (clock, loop, gear); square 14 (plus, pentagon); upright
  11 × 14 (sheet, person, lightning); wide 16 × 11 (letter, signal).
- **Stroke:** 1.25; fine inner lines (like those of the sheet) 1.0. Never thicker than the shape.
- **Empty means catching, filled means throwing.** Empty for start, wait and exception path;
  filled for example for an end with a message. A filled mark has white inner lines. The two
  versions of a mark differ only in the fill, never in shape or size.
- **In a task:** flow marks (plus, loop, parallel, sequential) sit bottom centre, field 14, 6 from
  the bottom edge; the text moves up by 6. Two of them (the bars of "for each item" and the plus)
  sit side by side, 4 apart and centred together, the bars on the left. The bars: three lines of 12,
  4 apart, lying = one after another, standing = at the same time. The kind of task (gear, person) sits top left, field 16,
  indent 8.
- **In a diamond:** field 22; × and + with stroke 2.6. The pentagon sits in a double circle r 11 / 9.
- The letter has a flap; the clock has ticks at 12, 3, 6 and 9.

## 3 · Labels

The place belongs to the shape family; a new symbol inherits it.

| Family | Place | Type, wrapping |
|---|---|---|
| task, subprocess | inside, centred | 12.5 · up to 4 lines of 19 characters; the shape grows by 15 per line beyond 3 |
| start, wait, end, document | below, 14 under the shape | 10.5 · up to 3 lines of 18 characters, line height 12.5 |
| exception path on a task | left of the circle, right-aligned, 4 apart, on the side the exception path sits (bottom or top of the task); if a line runs there: right of the circle, then the other height | 10.5 |
| diamond | above, 8 over the tip; if a line runs there: above left or above right of the axis, then the same three below the diamond | 10.5 · up to 2 lines of 22 characters |
| arrow | at its start, 8 apart | 10.5, grey |

Greys: line and mark `#262626`, text `#1a1a1a`, secondary text `#595959`, headers `#ebebeb`,
every second lane `#f7f7f7`, shapes `#ffffff`. Lane name 11.5 bold, pool name 12 bold.

## 4 · Legend entry

- **Layout:** symbol field 44 × 36 with the symbol at 75 %; beside it the term from `CONTEXT.md`
  in 11.5 bold, no BPMN words; below it one or two sentences for laypeople in 10.5 grey, at most
  90 characters and 2 lines.
- **Content:** only what the diagram shows (`legend()` in `src/core/render.ts`).
- **Order:** start, task, diamond, wait / exception path, end, then lane, arrow, association.
- **How many:** up to 8 entries in 4 columns × 2 rows under the diagram; 9 to 12 in 4 columns × 3
  rows, the most page 1 of the reading copy (A4 landscape) can hold. Beyond 12, families are merged
  into one entry with several small symbols and one sentence about the mark, for example
  "Start: the mark says what starts it: by itself, a message, a point in time, a condition."

## Example

Symbols drawn by rules 1 to 4 only (the tool offers the signal):

1. **Signal:** a triangle 16 wide and 14 high, 0.5 lower, line 1.25. Empty where the signal is
   awaited (start, wait: same shape as for a message, only the mark changes), filled where it is
   given (send on the way: double circle; end: thick circle). Beyond 12 legend entries the signal
   family becomes one entry "Signal" with an empty and a filled triangle.
2. **Subprocess, collapsed:** a task with a plus in square 14, bottom centre, 6 from the edge; the
   text moves up.
2a. **At any time (event subprocess), collapsed:** a task box with a dotted frame (strokes 2, gaps
   2.5) and a plus like the subprocess; top left, 15 from the top and left edge, the start circle of
   its trigger at 75 % with the mark of its kind (envelope, clock, condition sheet, empty triangle).
   The circle is solid when it stops everything and dashed (4 / 3) when the flow continues. The box
   is 18 taller, the text moves down by 9. It has no arrows and sits below the other shapes of its lane.
   Inside a subprocess it is drawn the same; there the solid circle stops only the subprocess (legend
   "At any time, stops the subprocess").
3. **Document with association:** a free shape 30 × 38 with a folded corner 9 and a normal line,
   tied to its task by a dotted association with an open head. It differs from the condition sheet,
   which is a mark of 11 × 14 always inside a circle and has no folded corner.
