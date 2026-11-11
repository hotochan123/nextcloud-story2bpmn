// SPDX-FileCopyrightText: 2026 hotochan123
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * The stored story format. A working file keeps its moves as JSON in the attribute `bpmnc:geschichte`
 * (namespace `urn:bpmn-core:geschichte`). That format was fixed before the code was renamed to English,
 * so its keys and values stay German; this module is the one place that maps between the stored
 * moves and the moves the code works with. Unknown keys and values pass through unchanged, so a file
 * from a newer or foreign tool is not silently altered (loading checks the result).
 */

/** Code name → stored name, for the keys of a move. */
const KEYS: Record<string, string> = {
  move: 'zug', role: 'stelle', process: 'prozess', subtype: 'art', documentName: 'dokument', deadline: 'frist',
  question: 'frage', yes: 'ja', no: 'nein', yesKind: 'jaArt', noKind: 'neinArt', keepsRunning: 'laeuftWeiter',
  target: 'ziel', to: 'zu',
};

const EVENT: Record<string, string> = {
  message: 'nachricht', time: 'zeit', condition: 'zustand', first: 'zuerst', error: 'fehler', deadline: 'frist', cancel: 'abbrechen',
};

/** Code value → stored value, per key (code names). */
const VALUES: Record<string, Record<string, string>> = {
  move: {
    start: 'start', task: 'schritt', decision: 'wenn', concurrent: 'gleichzeitig', wait: 'warten', exceptionPath: 'ausnahme',
    merge: 'zusammen', end: 'ende', goTo: 'weiter', switchTo: 'wechsel',
  },
  subtype: EVENT,
  yesKind: EVENT,
  noKind: EVENT,
  keepsRunning: { yes: 'ja' },
};

const invert = (m: Record<string, string>) => Object.fromEntries(Object.entries(m).map(([k, v]) => [v, k]));
const KEYS_BACK = invert(KEYS);
const VALUES_BACK: Record<string, Record<string, string>> = Object.fromEntries(Object.entries(VALUES).map(([k, m]) => [k, invert(m)]));

function convert(move: unknown, keys: Record<string, string>, values: Record<string, Record<string, string>>, codeKey: (k: string) => string): unknown {
  if (!move || typeof move !== 'object' || Array.isArray(move)) return move;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(move)) {
    const map = values[codeKey(k)];
    out[keys[k] ?? k] = typeof v === 'string' && map && Object.hasOwn(map, v) ? map[v] : v;
  }
  return out;
}

/** Moves of the code → moves as stored in a working file. */
export const toStored = (moves: unknown[]): unknown[] => moves.map((m) => convert(m, KEYS, VALUES, (k) => k));

/** Moves as stored in a working file → moves of the code. */
export const fromStored = (stored: unknown[]): unknown[] => stored.map((m) => convert(m, KEYS_BACK, VALUES_BACK, (k) => KEYS_BACK[k] ?? k));
