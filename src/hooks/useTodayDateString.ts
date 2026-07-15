import { useEffect, useState } from "react";
import type { IsoDateString } from "../types/models";
import { getTodayDateString } from "../utils/date";

/**
 * 基準日を返す。タブを開きっぱなしにしても日付が変われば追従するので、
 * 翌朝に前日基準の予測を見せてしまうことがない。
 */
export function useTodayDateString(): IsoDateString {
  const [today, setToday] = useState(getTodayDateString);

  useEffect(() => {
    function sync() {
      setToday((current) => {
        const next = getTodayDateString();

        return next === current ? current : next;
      });
    }

    const intervalId = window.setInterval(sync, 60_000);
    window.addEventListener("focus", sync);
    document.addEventListener("visibilitychange", sync);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", sync);
      document.removeEventListener("visibilitychange", sync);
    };
  }, []);

  return today;
}
