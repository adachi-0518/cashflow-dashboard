import { useEffect, useState } from "react";
import type { Dispatch, SetStateAction } from "react";

export function useLocalStorageState<T>(
  key: string,
  createInitialValue: () => T,
  hydrate?: (value: unknown) => T,
): [T, Dispatch<SetStateAction<T>>, boolean] {
  const [hasLoaded, setHasLoaded] = useState(false);
  const [state, setState] = useState<T>(() => createInitialValue());

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(key);

      if (raw) {
        const parsed = JSON.parse(raw) as unknown;
        setState(hydrate ? hydrate(parsed) : (parsed as T));
      }
    } catch (error) {
      console.error(`Failed to read LocalStorage key "${key}"`, error);
    } finally {
      setHasLoaded(true);
    }
  }, [hydrate, key]);

  useEffect(() => {
    if (!hasLoaded) {
      return;
    }

    try {
      window.localStorage.setItem(key, JSON.stringify(state));
    } catch (error) {
      console.error(`Failed to write LocalStorage key "${key}"`, error);
    }
  }, [hasLoaded, key, state]);

  return [state, setState, hasLoaded];
}
