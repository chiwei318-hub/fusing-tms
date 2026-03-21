import { useState, useCallback, useEffect } from "react";

const HISTORY_KEY_PREFIX = "fy-field-history:";
const MAX_ITEMS = 8;

function loadHistory(fieldKey: string): string[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY_PREFIX + fieldKey);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveHistory(fieldKey: string, value: string) {
  if (!value || value.trim().length < 2) return;
  const history = loadHistory(fieldKey);
  const updated = [value, ...history.filter(v => v !== value)].slice(0, MAX_ITEMS);
  try {
    localStorage.setItem(HISTORY_KEY_PREFIX + fieldKey, JSON.stringify(updated));
  } catch {
    // ignore quota errors
  }
}

/**
 * Returns suggestions (recent inputs) for a given field key.
 * Call `recordValue(value)` when the user finishes typing to save it.
 * Bind `listId` to a <datalist id={listId}> for native autocomplete.
 */
export function useFieldHistory(fieldKey: string) {
  const [suggestions, setSuggestions] = useState<string[]>(() => loadHistory(fieldKey));

  useEffect(() => {
    setSuggestions(loadHistory(fieldKey));
  }, [fieldKey]);

  const recordValue = useCallback((value: string) => {
    if (!value || value.trim().length < 2) return;
    saveHistory(fieldKey, value.trim());
    setSuggestions(loadHistory(fieldKey));
  }, [fieldKey]);

  const listId = `fh-${fieldKey}`;

  return { suggestions, recordValue, listId };
}

/**
 * Clear all history for a given field key.
 */
export function clearFieldHistory(fieldKey: string) {
  localStorage.removeItem(HISTORY_KEY_PREFIX + fieldKey);
}
