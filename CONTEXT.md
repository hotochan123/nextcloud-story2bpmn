# Telling process diagrams

A tool in which business processes are told piece by piece as a **Story** and become formally correct BPMN **process diagrams** along the way. The diagrams serve documentation, not automated execution. Agreement, **proposals** and **approval** take place outside the tool.

The UI is English with a German translation; each term below is followed by its German UI word.

## Language

**Process diagram** (UI German: „Prozessdiagramm“):
Graphical representation of a business process in BPMN 2.0, meant for understanding and agreeing, not for execution by an engine.
_Avoid_: workflow, executable model

**Task** (UI German: „Schritt“):
An activity in the **process diagram** that is assigned to exactly one **Lane**. Can optionally carry a **System**, **Documents**, a description and a **Deadline**. There is only this one kind of task; whether a person or a program carries it out is stated by the **System**.
_Avoid_: „Aufgabe“, „Aktivität“, activity, job

**Trigger** (UI German: „Auslöser“):
How the process begins. Simple ("it starts"), when a message arrives (letter, mail, application), at a point in time (every first of the month) or as soon as a condition occurs (stock almost empty). In the **story text**: `ES BEGINNT`, `ES BEGINNT mit Nachricht`, `ES BEGINNT zum Zeitpunkt`, `ES BEGINNT sobald` (English `IT STARTS`, `IT STARTS with a message`, `IT STARTS at a point in time`, `IT STARTS once`).
_Avoid_: „Startereignis“, start event

**Wait** (UI German: „Warten“):
The flow stands still until a message arrives (reply, delivery, documents), a time has passed or a date is reached, or something becomes true (stock full again). In the **story text** `WARTEN AUF [Angebot]`, `WARTEN AUF [!3 Tage]` or `WARTEN BIS [Lager wieder voll]` (English `WAIT FOR`, `WAIT UNTIL`); the time carries the deadline sign.
_Avoid_: „Zwischenereignis“, „Wartezustand“, „Timer“, intermediate event, timer

**Whichever comes first** (UI German: „Was zuerst passiert“):
A kind of decision: nothing is checked; instead two things are waited for, and the flow continues on the path whose event occurs first (e.g. "payment arrives" or "14 days"). Every path begins with its **Wait**. In the **story text** `WAS ZUERST PASSIERT:`, below it per path `→ [Zahlung geht ein]:`, `→ [!14 Tage]:` or `→ SOBALD [Lager wieder voll]:` (English `WHAT COMES FIRST:`, `ONCE`).
_Avoid_: „ereignisbasiertes Gateway“, „Event-Gateway“, „Rennen“, event-based gateway, race

**Signal** (UI German: „Signal“):
A message to everyone, not to one particular role, e.g. "prices released" or "delivery stop declared". Drawn as a double circle with an empty triangle (symbol rules). Planned in the **story text** as `WARTEN AUF SIGNAL [Lieferstopp ausgerufen]`; the tool does not offer it yet.
_Avoid_: „Broadcast“, „Ereignis“, broadcast, event

**Subprocess** (UI German: „Teilablauf“):
A **Task** with a flow of its own behind it, drawn collapsed: a box with a plus at the bottom center (symbol rules). The tool does not offer it yet.
_Avoid_: „Teilprozess“, „Subprozess“, „Call Activity“, call activity

**End** (UI German: „Ende“):
Where a path stops, named by a state ("invoice paid"). Simple, with a message (something goes out at the end: notice, confirmation) or **cancel everything**: then whatever is still running at the same time ends too. Cancelling exists only where something runs alongside. In the **story text** `ENDE`, `ENDE mit Nachricht`, `ENDE, alles abbrechen` (English `END`, `END with a message`, `END, cancel everything`).
_Avoid_: „Endereignis“, „Terminate“, „Abbruch“, end event, abort

**Exception path** (UI German: „Ausnahme-Pfad“):
A branch off a **Task** for the case that something goes wrong, takes too long or a message intervenes (e.g. "payment declined → clarification case", "not done after 3 days → remind", "application withdrawn"). Normally the task is aborted. For deadline and message it can **keep running**: then the path is only added, drawn dashed, and must end in an End. In the **story text** `FALLS [Betrag falsch]:`, `FALLS [!nach 2 Tagen], Schritt läuft weiter:`, `FALLS NACHRICHT [Antrag zurückgezogen]:` (English `IN CASE OF`).
_Avoid_: „Fehlerpfad“, „Eskalation“, error path, escalation

**Lane** (UI German: „Bahn“):
Horizontal strip in the **process diagram** for an **Involved party**; shows who carries out which **Tasks**. The role chosen for a task in a **Move** determines its lane.
_Avoid_: „Spur“, track

**System** (UI German: „System“):
The program in which a **Task** is carried out (e.g. SAP, CRM).
_Avoid_: „Tool“, „Anwendung“, application

**Document** (UI German: „Dokument“):
A paper or file that a **Task** needs or produces (e.g. invoice, approval form).
_Avoid_: „Datei“, „Datenobjekt“, file, data object

**Deadline** (UI German: „Frist“):
Time limit by which a **Task** must be done (e.g. "within 3 working days").
_Avoid_: „SLA“, „Timer“, SLA, timer

**Story** (UI German: „Geschichte“):
The guided construction of a **Draft**: a sequence of **Moves**; after each one, only the next moves possible at that point are offered. This keeps the **process diagram** formally correct at every stage.
_Avoid_: „Wizard“, „Interview“, „Prompt“, wizard, interview, prompt

**Move** (UI German: „Zug“):
One step of the **Story** in everyday language: tell the trigger, "then someone does something", "it depends", "two things at the same time", "wait ...", "something can go wrong here", "comes together", "continue at / back to ...", "this is the end". No BPMN terms. In the code a move is the type `Move` (`src/core/story.ts`) with the kinds `start`, `task`, `decision`, `concurrent`, `wait`, `exceptionPath`, `merge`, `end`, `goTo` and `switchTo`; the role of a task or trigger is `move.role`.
_Avoid_: „Baustein“, „Element“, „Befehl“, block, element, command

**Story text** (UI German: „Erzähltext“):
The **Story** as readable text, one line per **Move**. It is attached to the finished **Working file** as the description of the process and appears in the **Reading copy** from page 2. The flow is carried by signal words at the start of a line (`ES BEGINNT`, `WENN` / `SONST`, `FALLS`, `GLEICHZEITIG`, `ZUSAMMEN`, `WARTEN AUF` / `WARTEN BIS`, `WAS ZUERST PASSIERT` (paths with `SOBALD`), `WEITER BEI`, `ENDE`; after pulling forward another path `WEITER AUF DEM WEG …` or `WEITER AUF DEM HAUPTWEG`), every object in square brackets; the sign inside states the kind: `[Task]` without a sign, `[@Role]`, `[#System]`, `[+Document]`, `[!Deadline]`, `[?Question]`. The brackets always contain the label from the diagram. Side paths (branches, strands, exception paths) are indented, the normal path after an exception is not. In English the signal words are `IT STARTS`, `IF` / `ELSE`, `IN CASE OF`, `IN PARALLEL`, `MERGE`, `WAIT FOR` / `WAIT UNTIL`, `WHAT COMES FIRST` (`ONCE`), `CONTINUE AT`, `END`, `BACK ON THE PATH` / `BACK ON THE MAIN PATH`. The signs stay the same. The text can be edited and is read back ("Edit as text", German UI „Als Text bearbeiten“); indentation does not matter for this, path headings say which path is meant. The text is generated in `src/core/story.ts` and read back in `src/core/readBack.ts`.
_Avoid_: „Prozessbeschreibung“, „Protokoll“, „Log“, process description, protocol

**Language** (UI German: „Sprache“):
Applies per process, German or English, and is saved in the **Working file** (`xml:lang`). The fixed texts are switched: questions, messages, signal words, DRAFT, the pool name. What the **Author** types in is never translated.

**Draft** (UI German: „Entwurf“):
A **Process diagram** before its first **Approval**; it arises from a **Story** and is edited directly by the **Author**, without **Proposals**.

**Author** (UI German: „Ersteller(in)“):
The person who creates a **Draft** and edits it freely until it is handed to the **Process owner** for **Approval**.
_Avoid_: „Autor“, „Modellierer“, modeler

**Approval** (UI German: „Freigabe“):
The moment when the **Process owner** declares a state of a **Process diagram** valid; a **Valid version** comes into being.

**Valid version** (UI German: „Gültige Version“):
An approved state of a **Process diagram**. Changes to it are only possible through **Proposals**, even for the **Author**.
_Avoid_: „veröffentlichter Stand“, „Release“, published state

**Working file** (UI German: „Arbeitsdatei“):
The BPMN file of a **Process diagram**. It is the original: only from it can the diagram later be reopened and edited further without unchanged parts moving. It also contains the **Story**; storytelling continues from it.
_Avoid_: „Export“, „Modell“, export, model

**Reading copy** (UI German: „Leseexemplar“):
PDF or image of a **Valid version**, filed by **CRM transfer** for lookup. Cannot be reopened and edited.
_Avoid_: „Ausdruck“, „Export“, printout, export

**CRM transfer** (UI German: „CRM-Übertragung“):
Filing the **Reading copy** of a **Valid version** in the CRM, the place where employees look up processes. Done by hand; until then the version counts as "approved but not transferred".
_Avoid_: „Veröffentlichung“, „Deploy“, „Export“, publication, deploy

**Involved party** (UI German: „Beteiligte Stelle“):
Department or person who does something in the process (e.g. accounting, manager) and contributes their knowledge to the **Process diagram**. In the story the involved party is chosen as the **Role** of a task (`[@Role]`, UI German „Stelle“) and gets its own **Lane**.
_Avoid_: „Instanz“, instance

**Open point** (UI German: „Offener Punkt“):
A detail in the **Draft** that is only assumed; visibly marked until the **Author** confirms or corrects it. As long as a **Process diagram** has open points, no **Reading copy** is produced.
_Avoid_: „Annahme“, „Vermutung“, „Lücke“, assumption, guess, gap

**Process owner** (UI German: „Prozessverantwortliche(r)“):
The person to whom a business process belongs in business terms (e.g. head of accounting); decides how the flow should be and accepts or rejects **Proposals**. Uses the tool only occasionally.
_Avoid_: „verantwortliche Person“, „Owner“, „Admin“, „Pfleger“, responsible person, admin

**Proposal** (UI German: „Vorschlag“):
A change to the **Process diagram** made by someone other than the **Process owner**; it only takes effect when the **Process owner** accepts it.
_Avoid_: „Änderungsantrag“, „Pull Request“, change request

## Relationships

- A **Process diagram** has exactly one **Process owner**.
- A **Process diagram** has many **Involved parties**; each has exactly one **Lane**.
- A **Task** has at most one **System**, any number of **Documents**, at most one description and at most one **Deadline**.
- A **Process diagram** is a **Draft** first; after the first **Approval** it has one or more **Valid versions**.
- A **Story** is a sequence of **Moves**; each **Move** becomes one or more parts of the **Process diagram**. The **Lane** of a **Task** is chosen in the move.
- A **Proposal** always refers to a **Valid version**, never to a **Draft**.
- An **Involved party** can make any number of **Proposals** on a **Process diagram**.

## Example dialogue

> **Dev:** "Accounting split ‚Check invoice' into two tasks. Is that in the diagram now?"
> **Business side:** "Not yet. That is only a **Proposal** so far; it applies once the **Process owner**, the head of accounting, accepts it."

## Flagged ambiguities

- „Annahme“ (assumption / acceptance) is ambiguous: accepting a **Proposal** vs. a merely presumed detail. The latter is called **Open point** exclusively.
- „Freigabe“ also occurs *inside* process diagrams as a process task (e.g. the "four-eyes approval" of an invoice). In the tool, **Approval** exclusively means declaring a state of a diagram valid.
- „Instanz“ (instance) was used for **Involved party**; resolved: **Involved party**. (Assumption, not yet explicitly confirmed.)
- „Verantwortliche Person“ (responsible person) was ambiguous (business owner vs. person who maintains the diagram); resolved: **Process owner** = business owner of the process.
