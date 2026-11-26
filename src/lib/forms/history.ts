// Undo and redo for the form editor: the last 50 changes.
// docs/SPEC.md → "Lead forms add-on → Editor with live preview → Top bar".
// Pure, so the rules can be tested without a browser.

export const HISTORY_LIMIT = 50;
/** Keystrokes in the same input closer together than this are one change. */
export const MERGE_WINDOW_MS = 800;

export type History<T> = {
  past: T[];
  present: T;
  future: T[];
  /** What the last change was to, and when: typing in one input is one step. */
  lastKey: string | null;
  lastAt: number;
};

export function createHistory<T>(present: T): History<T> {
  return { past: [], present, future: [], lastKey: null, lastAt: 0 };
}

/**
 * A new state. Anything undone is forgotten. With a `key`, a change to the
 * same thing within the merge window replaces the last step instead of adding one.
 */
export function commit<T>(history: History<T>, next: T, options: { key?: string; at?: number } = {}): History<T> {
  if (Object.is(next, history.present)) return history;
  const at = options.at ?? Date.now();
  const key = options.key ?? null;
  const merge = key !== null && key === history.lastKey && at - history.lastAt < MERGE_WINDOW_MS && history.past.length > 0;
  const past = merge ? history.past : [...history.past, history.present].slice(-HISTORY_LIMIT);
  return { past, present: next, future: [], lastKey: key, lastAt: at };
}

export const canUndo = <T>(history: History<T>) => history.past.length > 0;
export const canRedo = <T>(history: History<T>) => history.future.length > 0;

export function undo<T>(history: History<T>): History<T> {
  if (!canUndo(history)) return history;
  const past = history.past.slice(0, -1);
  return { past, present: history.past[history.past.length - 1], future: [history.present, ...history.future], lastKey: null, lastAt: 0 };
}

export function redo<T>(history: History<T>): History<T> {
  if (!canRedo(history)) return history;
  const [present, ...future] = history.future;
  return { past: [...history.past, history.present].slice(-HISTORY_LIMIT), present, future, lastKey: null, lastAt: 0 };
}
