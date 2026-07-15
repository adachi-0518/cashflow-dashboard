import { useEffect, useState } from "react";
import type { Dispatch, SetStateAction } from "react";

export function useLocalStorageState<T>(
  key: string,
  createInitialValue: () => T,
  hydrate?: (value: unknown) => T,
  backupKey?: string,
): [T, Dispatch<SetStateAction<T>>, boolean] {
  const [hasLoaded, setHasLoaded] = useState(false);
  const [state, setState] = useState<T>(() => createInitialValue());

  useEffect(() => {
    function readStoredValue(storageKey: string): T | null {
      const raw = window.localStorage.getItem(storageKey);

      if (!raw) {
        return null;
      }

      const parsed = JSON.parse(raw) as unknown;

      return hydrate ? hydrate(parsed) : (parsed as T);
    }

    try {
      const primaryValue = readStoredValue(key);

      if (primaryValue !== null) {
        setState(primaryValue);
      } else if (backupKey) {
        const backupValue = readStoredValue(backupKey);

        if (backupValue !== null) {
          setState(backupValue);
        }
      }
    } catch (error) {
      console.error(`Failed to read LocalStorage key "${key}"`, error);

      if (backupKey) {
        try {
          const backupValue = readStoredValue(backupKey);

          if (backupValue !== null) {
            setState(backupValue);
          }
        } catch (backupError) {
          console.error(`Failed to read LocalStorage backup key "${backupKey}"`, backupError);
        }
      }
    } finally {
      setHasLoaded(true);
    }
  }, [backupKey, hydrate, key]);

  useEffect(() => {
    if (!hasLoaded) {
      return;
    }

    try {
      const serializedState = JSON.stringify(state);
      const previousValue = window.localStorage.getItem(key);

      if (backupKey && previousValue && previousValue !== serializedState) {
        window.localStorage.setItem(backupKey, previousValue);
      }

      window.localStorage.setItem(key, serializedState);
    } catch (error) {
      console.error(`Failed to write LocalStorage key "${key}"`, error);
    }
  }, [backupKey, hasLoaded, key, state]);

  return [state, setState, hasLoaded];
}
