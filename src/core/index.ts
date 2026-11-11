// Entry point to the core for the UI: everything it needs in one place.
// The core runs in the browser (tests/core/browser.test.ts builds exactly this module).
export { run, emptyProcess } from './pipeline.js';
export type { PipelineInput, PipelineResult } from './pipeline.js';
export { tell, splice, asText } from './story.js';
export type { Move, Line, Target, StoryState } from './story.js';
export { read, asSourceText } from './readBack.js';
export { fromBpmn } from './fromBpmn.js';
export type { ReadResult } from './fromBpmn.js';
export { renderBoth, toSvg, toPdf } from './render.js';
export type { RenderOptions, PdfOptions } from './render.js';
export { LANGUAGES, tx } from './language.js';
export type { Language } from './language.js';
export type { ProcessIR, PositionMap, Position, Issue, Op, Node, Lane } from './ir.js';
