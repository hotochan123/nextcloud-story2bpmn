// SPDX-FileCopyrightText: 2026 hotochan123
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * The approval state of a working file (docs/adr/0006-approval-through-nextcloud.md). It travels in
 * the attribute `s2b:freigabe` (namespace `urn:story2bpmn:freigabe`) as JSON. Like the stored story,
 * its keys stay German; this module maps between the stored form and the form the code uses, and
 * checks a foreign file's data: anything of the wrong type or over the limits makes the whole
 * approval state unreadable (the story still loads).
 */
import { toStored, fromStored } from './storyFormat.js';
import { LANGUAGES } from './language.js';
import type { Language } from './language.js';

export const APPROVAL_NS = 'urn:story2bpmn:freigabe';
const MAX_NAME = 200;
const MAX_DECIDED = 1000;
const MAX_MOVES = 2000;
/** Largest JSON accepted (the working file itself may have 2 MiB). */
const MAX_JSON = 1024 * 1024;

export type Person = { uid: string; name: string };
export type ApprovalState = 'draft' | 'review' | 'valid';
export type ValidVersion = {
  number: number;
  /** ISO date-time of the approval. */
  date: string;
  by: Person;
  language: Language;
  /** The moves of the valid version (code form). */
  moves: unknown[];
  previous?: { number: number; date: string };
};
export type Approval = {
  state: ApprovalState;
  owner?: Person;
  author?: Person;
  request?: { date: string; by: Person };
  valid?: ValidVersion;
  /** IDs of the comments (proposals) that are decided. */
  decided: string[];
  /** Show the state as a Nextcloud tag too. */
  tag: boolean;
};

const STATE_STORED: Record<ApprovalState, string> = { draft: 'entwurf', review: 'zurFreigabe', valid: 'gueltig' };
const STATE_BACK: Record<string, ApprovalState> = { 'entwurf': 'draft', 'zurFreigabe': 'review', 'gueltig': 'valid' };

export const emptyApproval = (): Approval => ({ state: 'draft', decided: [], tag: true });

const person = (p: Person) => ({ uid: p.uid, name: p.name });

/** Code form → stored object (German keys). */
export function toStoredApproval(a: Approval): Record<string, unknown> {
  const out: Record<string, unknown> = { 'status': STATE_STORED[a.state] };
  if (a.owner) out['verantwortlich'] = person(a.owner);
  if (a.author) out['ersteller'] = person(a.author);
  if (a.request) out['bitte'] = { 'datum': a.request.date, 'von': person(a.request.by) };
  if (a.valid) {
    const v = a.valid;
    out['gueltig'] = {
      'nummer': v.number,
      'datum': v.date,
      'von': person(v.by),
      'sprache': v.language,
      'geschichte': toStored(v.moves),
      ...(v.previous ? { 'vorher': { 'nummer': v.previous.number, 'datum': v.previous.date } } : {})
    };
  }
  out['entschieden'] = [...a.decided];
  out['schlagwort'] = a.tag;
  return out;
}

class Unreadable extends Error {}
const need = (ok: unknown): void => {
  if (!ok) throw new Unreadable();
};
const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const text = (v: unknown, max = MAX_NAME): string => {
  need(typeof v === 'string' && v.length <= max);
  return v as string;
};
const date = (v: unknown): string => {
  const s = text(v, 40);
  need(!Number.isNaN(Date.parse(s)));
  return s;
};
/**
 * A Nextcloud user id: 1 to 64 of the characters Nextcloud allows (letters a-z, digits, space and
 * `_ . @ - '`), no space at either end. Anything else in a file is not an account and never reaches
 * a comment or the screen (no line breaks, quotes or control characters).
 */
const UID = /^[A-Za-z0-9_.@'-](?:[A-Za-z0-9 _.@'-]{0,62}[A-Za-z0-9_.@'-])?$/;
export const isUid = (v: unknown): v is string => typeof v === 'string' && UID.test(v);

const readPerson = (v: unknown): Person => {
  need(isObject(v));
  const p = v as Record<string, unknown>;
  need(isUid(p.uid));
  return { uid: p.uid as string, name: text(p.name) };
};
/** An optional person: one whose id is not a Nextcloud user id is dropped, the rest stays readable. */
const optionalPerson = (v: unknown): Person | undefined => {
  need(isObject(v));
  return isUid((v as Record<string, unknown>).uid) ? readPerson(v) : undefined;
};
const count = (v: unknown): number => {
  need(Number.isInteger(v) && (v as number) >= 1 && (v as number) <= 1_000_000);
  return v as number;
};

/** Stored object → code form; throws Unreadable on anything wrong. */
function fromStoredApproval(raw: unknown): Approval {
  need(isObject(raw));
  const o = raw as Record<string, unknown>;
  const state = STATE_BACK[text(o['status'], 20)];
  need(state);
  const a: Approval = { state, decided: [], tag: o['schlagwort'] === undefined ? true : o['schlagwort'] === true };
  need(o['schlagwort'] === undefined || typeof o['schlagwort'] === 'boolean');
  if (o['verantwortlich'] !== undefined) {
    const owner = optionalPerson(o['verantwortlich']);
    if (owner) a.owner = owner;
  }
  if (o['ersteller'] !== undefined) {
    const author = optionalPerson(o['ersteller']);
    if (author) a.author = author;
  }
  if (o['bitte'] !== undefined) {
    need(isObject(o['bitte']));
    const b = o['bitte'] as Record<string, unknown>;
    a.request = { date: date(b['datum']), by: readPerson(b['von']) };
  }
  if (o['gueltig'] !== undefined) {
    need(isObject(o['gueltig']));
    const g = o['gueltig'] as Record<string, unknown>;
    need(Array.isArray(g['geschichte']) && (g['geschichte'] as unknown[]).length > 0 && (g['geschichte'] as unknown[]).length <= MAX_MOVES);
    const language = LANGUAGES.find((l) => l === g['sprache']);
    need(language);
    const moves = fromStored(g['geschichte'] as unknown[]);
    need(moves.every((m) => isObject(m) && typeof (m as Record<string, unknown>).move === 'string'));
    a.valid = { number: count(g['nummer']), date: date(g['datum']), by: readPerson(g['von']), language: language!, moves };
    if (g['vorher'] !== undefined) {
      need(isObject(g['vorher']));
      const p = g['vorher'] as Record<string, unknown>;
      a.valid.previous = { number: count(p['nummer']), date: date(p['datum']) };
    }
  }
  if (o['entschieden'] !== undefined) {
    need(Array.isArray(o['entschieden']) && (o['entschieden'] as unknown[]).length <= MAX_DECIDED);
    a.decided = (o['entschieden'] as unknown[]).map((id) => text(id, 64));
  }
  // A state that claims more than it has: valid without a valid version, for approval without an owner.
  need(state !== 'valid' || a.valid);
  need(state !== 'review' || (a.owner && a.request));
  return a;
}

export type ReadApproval = { approval?: Approval; unreadable?: true };

/** The attribute as read from a working file: missing → no approval state; broken → unreadable. */
export function readApproval(raw: unknown): ReadApproval {
  if (raw === undefined || raw === null) return {};
  if (typeof raw !== 'string' || raw.length > MAX_JSON) return { unreadable: true };
  try {
    return { approval: fromStoredApproval(JSON.parse(raw)) };
  } catch {
    return { unreadable: true };
  }
}
