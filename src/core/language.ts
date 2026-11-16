/**
 * Language of the fixed texts: questions, messages, signal words, DRAFT, pool name.
 * What someone types themselves (tasks, roles) stays as it was entered.
 * It belongs to the process (`ir.language`); if missing, it is German.
 *
 * ponytail: text pairs right at the spot instead of a dictionary with keys - with
 * two languages no key can be orphaned this way. Switch over at the third.
 */
export type Language = 'de' | 'en';

export const LANGUAGES: Language[] = ['de', 'en'];

export const tx = (s: Language | undefined, de: string, en: string): string => (s === 'en' ? en : de);

/** A day as 14.11.2026 (German) or 14/11/2026 (English). */
export const shortDate = (at: string | Date, language: Language | undefined): string =>
  new Date(at).toLocaleDateString(language === 'en' ? 'en-GB' : 'de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
