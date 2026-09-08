import { useState, useEffect, useCallback } from 'react';

export interface HistoryEntry {
  id: string;
  question: string;
  sql: string;
  explanation: string;
  isSafe: string;
  timestamp: string; // ISO string
  favorite: boolean;
}

export const HISTORY_STORAGE_PREFIX = 'nl-to-sql-history';

/**
 * Resolve the browser-storage key for a given authenticated user so saved
 * questions, SQL, and explanations are never shared between accounts on the
 * same browser. A missing/anonymous user falls back to the shared prefix key
 * (only reachable before a session is known).
 */
export function historyStorageKey(userId?: string | null): string {
  return userId ? `${HISTORY_STORAGE_PREFIX}:${userId}` : HISTORY_STORAGE_PREFIX;
}

/**
 * Parse persisted history defensively: malformed JSON, valid non-array values,
 * and array entries missing the required fields all fall back to [] so stored
 * data can never throw or surface structurally invalid entries.
 */
export function parseStoredHistory(saved: string | null): HistoryEntry[] {
  if (!saved) return [];
  try {
    const parsed: unknown = JSON.parse(saved);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry): entry is HistoryEntry => {
      if (!entry || typeof entry !== 'object') return false;
      const candidate = entry as Partial<HistoryEntry>;
      return (
        typeof candidate.id === 'string' &&
        typeof candidate.question === 'string' &&
        typeof candidate.sql === 'string' &&
        typeof candidate.explanation === 'string' &&
        typeof candidate.isSafe === 'string' &&
        typeof candidate.timestamp === 'string' &&
        typeof candidate.favorite === 'boolean'
      );
    });
  } catch {
    return [];
  }
}

/**
 * Removes the persisted NL-to-SQL history for the given user from browser
 * storage. Used on logout so a later login/session on the same browser does not
 * surface the previous session's history. Only the user's namespaced key is
 * removed; unrelated keys (for example other users' history or the theme
 * preference) are left untouched.
 */
export function clearStoredHistory(userId?: string | null): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(historyStorageKey(userId));
}

export function useHistory(userId?: string | null) {
  const storageKey = historyStorageKey(userId);
  const [history, setHistory] = useState<HistoryEntry[]>(() => {
    if (typeof window === 'undefined') return [];
    return parseStoredHistory(localStorage.getItem(storageKey));
  });

  // Reload when the authenticated user changes (login as a different account).
  useEffect(() => {
    if (typeof window === 'undefined') return;
    setHistory(parseStoredHistory(localStorage.getItem(storageKey)));
  }, [storageKey]);

  // Persist to localStorage whenever history changes.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    localStorage.setItem(storageKey, JSON.stringify(history));
  }, [storageKey, history]);

  const addEntry = useCallback((entry: Omit<HistoryEntry, 'id' | 'timestamp' | 'favorite'>) => {
    const newEntry: HistoryEntry = {
      id: Math.random().toString(36).substr(2, 9),
      ...entry,
      timestamp: new Date().toISOString(),
      favorite: false,
    };
    setHistory(prev => [newEntry, ...prev].slice(0, 50)); // Keep only last 50
    return newEntry;
  }, []);

  const toggleFavorite = useCallback((id: string) => {
    setHistory(prev =>
      prev.map(entry =>
        entry.id === id ? { ...entry, favorite: !entry.favorite } : entry
      )
    );
  }, []);

  const clearHistory = useCallback(() => {
    setHistory([]);
  }, []);

  return { history, addEntry, toggleFavorite, clearHistory };
}