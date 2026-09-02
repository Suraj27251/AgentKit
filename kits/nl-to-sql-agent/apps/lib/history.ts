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

export const HISTORY_STORAGE_KEY = 'nl-to-sql-history';

/**
 * Removes the persisted NL-to-SQL history from browser storage. Used on logout
 * so a later login/session on the same browser does not surface the previous
 * session's history. Only this key is removed; unrelated keys (for example the
 * theme preference) are left untouched.
 */
export function clearStoredHistory(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(HISTORY_STORAGE_KEY);
}

export function useHistory() {
  const [history, setHistory] = useState<HistoryEntry[]>(() => {
    if (typeof window === 'undefined') return [];
    const saved = localStorage.getItem(HISTORY_STORAGE_KEY);
    return saved ? JSON.parse(saved) : [];
  });

  // Persist to localStorage whenever history changes
  useEffect(() => {
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(history));
  }, [history]);

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