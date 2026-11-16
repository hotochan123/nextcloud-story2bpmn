// Entry point to the core for the UI: everything it needs in one place.
// The core runs in the browser (tests/core/browser.test.ts builds exactly this module).
export { run, emptyProcess } from './pipeline.js';
export type { PipelineInput, PipelineResult } from './pipeline.js';
export { tell, asText, MAX_PATHS, descends, sameMoves, EVENT_KINDS, END_KINDS, START_KINDS, MAX_STORY_MOVES, countMoves } from './story.js';
export { stillLeads, noEnd, NOT_ON_OPEN, splice, replaceMove, removeBranch, deletePath, addPaths, tellOpen, reopenPath, reopenLegacyGoTos, retargetGoTos, dropRefused, moveLine, MAX_DROP_ROUNDS, insertBefore, addException, addTrigger, INSERTABLE, pathCount, BRANCHES, swapPaths, joinAllFrom, joinAllOffered, moveOffered, moveEnds, moveTargets, moveSteps, pathLabel } from './storyEdit.js';
export type { Move, Line, Target, StoryState, TellOptions, Sub, Trace } from './story.js';
export type { MoveTarget } from './storyEdit.js';
export { read, lineNumbers, asSourceText, MAX_LINE, MAX_LINES } from './readBack.js';
export { fromBpmn } from './fromBpmn.js';
export type { ReadResult } from './fromBpmn.js';
export { renderBoth, toSvg, preview } from './render.js';
export type { RenderOptions, PdfOptions, Band, ReadingCopyState } from './render.js';
export { LANGUAGES, tx, shortDate } from './language.js';
export type { Language } from './language.js';
export type { ProcessIR, PositionMap, Position, Issue, Op, Node, Lane, SubFlow } from './ir.js';
export { levels, hasSubprocess, subIR } from './ir.js';
export { readApproval, emptyApproval, toStoredApproval, isUid } from './approval.js';
export type { Approval, Person, ValidVersion, ApprovalState } from './approval.js';
export { sha256, storyJson, approvalCode } from './fingerprint.js';
