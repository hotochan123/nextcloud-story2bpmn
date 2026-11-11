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
