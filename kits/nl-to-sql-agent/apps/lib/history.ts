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

const STORAGE_KEY = 'nl-to-sql-history';

export function useHistory() {
  const [history, setHistory] = useState<HistoryEntry[]>(() => {
    if (typeof window === 'undefined') return [];
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : [];
  });

  // Persist to localStorage whenever history changes
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
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