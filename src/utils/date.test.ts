import { describe, expect, it } from "vitest";
import {
  addDays,
  addMonths,
  clampDayToMonth,
  compareDateStrings,
  differenceInDays,
  enumerateMonthlyDatesByDay,
  enumerateMonthlyDatesFromTemplate,
  getDaysInMonth,
  getMonthEnd,
  getNextMonthStart,
  getNextOccurrenceAfter,
  getNextOccurrenceOnOrAfter,
  isDateInRange,
  parseDateString,
  shiftYearMonth,
} from "./date";

describe("parseDateString", () => {
  it("不正な形式は例外にする", () => {
    expect(() => parseDateString("2026-7-1")).toThrow();
    expect(() => parseDateString("")).toThrow();
    expect(() => parseDateString("2026/07/01")).toThrow();
  });
});

describe("clampDayToMonth", () => {
  it("その月に存在しない日は月末に丸める", () => {
    expect(clampDayToMonth(2026, 1, 31)).toBe(28); // 2026年2月（平年）
    expect(clampDayToMonth(2024, 1, 31)).toBe(29); // 2024年2月（うるう年）
    expect(clampDayToMonth(2026, 3, 31)).toBe(30); // 4月
  });

  it("0以下は1日に丸める", () => {
    expect(clampDayToMonth(2026, 6, 0)).toBe(1);
    expect(clampDayToMonth(2026, 6, -5)).toBe(1);
  });

  it("存在する日はそのまま", () => {
    expect(clampDayToMonth(2026, 6, 15)).toBe(15);
    expect(clampDayToMonth(2026, 6, 31)).toBe(31);
  });
});

describe("getDaysInMonth", () => {
  it("うるう年の2月を正しく数える", () => {
    expect(getDaysInMonth(2024, 1)).toBe(29);
    expect(getDaysInMonth(2026, 1)).toBe(28);
    expect(getDaysInMonth(2000, 1)).toBe(29); // 400年ルール
    expect(getDaysInMonth(1900, 1)).toBe(28); // 100年ルール
  });
});

describe("addMonths", () => {
  it("月末をまたぐとき日付を丸める", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2024-01-31", 1)).toBe("2024-02-29");
    expect(addMonths("2026-03-31", 1)).toBe("2026-04-30");
  });

  it("年をまたぐ", () => {
    expect(addMonths("2026-12-15", 1)).toBe("2027-01-15");
    expect(addMonths("2026-01-15", -1)).toBe("2025-12-15");
  });
});

describe("addDays", () => {
  it("月と年をまたぐ", () => {
    expect(addDays("2026-01-31", 1)).toBe("2026-02-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2024-02-28", 1)).toBe("2024-02-29");
  });

  it("90日先を出せる（予測期間の実際の使われ方）", () => {
    expect(addDays("2026-07-15", 89)).toBe("2026-10-12");
  });
});

describe("getMonthEnd / getNextMonthStart", () => {
  it("月末を返す", () => {
    expect(getMonthEnd("2026-02-10")).toBe("2026-02-28");
    expect(getMonthEnd("2024-02-10")).toBe("2024-02-29");
    expect(getMonthEnd("2026-12-01")).toBe("2026-12-31");
  });

  it("翌月1日を返す", () => {
    expect(getNextMonthStart("2026-12-31")).toBe("2027-01-01");
    expect(getNextMonthStart("2026-01-31")).toBe("2026-02-01");
  });
});

describe("getNextOccurrenceOnOrAfter / getNextOccurrenceAfter", () => {
  it("同日は on-or-after では当日、after では翌月", () => {
    expect(getNextOccurrenceOnOrAfter("2026-07-10", 10)).toBe("2026-07-10");
    expect(getNextOccurrenceAfter("2026-07-10", 10)).toBe("2026-08-10");
  });

  it("指定日を過ぎていれば翌月", () => {
    expect(getNextOccurrenceOnOrAfter("2026-07-15", 10)).toBe("2026-08-10");
  });

  it("存在しない日は月末に丸める", () => {
    expect(getNextOccurrenceOnOrAfter("2026-02-01", 31)).toBe("2026-02-28");
  });

  it("年をまたぐ", () => {
    expect(getNextOccurrenceOnOrAfter("2026-12-20", 10)).toBe("2027-01-10");
  });
});

describe("enumerateMonthlyDatesByDay", () => {
  it("期間内の毎月の該当日を並べる", () => {
    expect(enumerateMonthlyDatesByDay(15, "2026-07-01", "2026-09-30")).toEqual([
      "2026-07-15",
      "2026-08-15",
      "2026-09-15",
    ]);
  });

  it("開始日より前の回は含めない", () => {
    expect(enumerateMonthlyDatesByDay(15, "2026-07-20", "2026-09-30")).toEqual([
      "2026-08-15",
      "2026-09-15",
    ]);
  });

  it("開始日と同じ日は含める", () => {
    expect(enumerateMonthlyDatesByDay(15, "2026-07-15", "2026-08-01")).toEqual(["2026-07-15"]);
  });

  it("31日指定は各月の月末に丸めて毎月出す", () => {
    expect(enumerateMonthlyDatesByDay(31, "2026-01-01", "2026-04-30")).toEqual([
      "2026-01-31",
      "2026-02-28",
      "2026-03-31",
      "2026-04-30",
    ]);
  });

  it("年をまたぐ", () => {
    expect(enumerateMonthlyDatesByDay(5, "2026-11-20", "2027-02-10")).toEqual([
      "2026-12-05",
      "2027-01-05",
      "2027-02-05",
    ]);
  });
});

describe("enumerateMonthlyDatesFromTemplate", () => {
  it("テンプレート日より前の回は出さない", () => {
    expect(enumerateMonthlyDatesFromTemplate("2026-08-25", "2026-07-01", "2026-10-01")).toEqual([
      "2026-08-25",
      "2026-09-25",
    ]);
  });

  it("テンプレートが過去でも開始日以降を出す", () => {
    expect(enumerateMonthlyDatesFromTemplate("2026-01-25", "2026-07-01", "2026-09-01")).toEqual([
      "2026-07-25",
      "2026-08-25",
    ]);
  });
});

describe("compareDateStrings / isDateInRange", () => {
  it("日付の前後を判定する", () => {
    expect(compareDateStrings("2026-07-01", "2026-07-02")).toBe(-1);
    expect(compareDateStrings("2026-07-02", "2026-07-01")).toBe(1);
    expect(compareDateStrings("2026-07-01", "2026-07-01")).toBe(0);
  });

  it("範囲は両端を含む", () => {
    expect(isDateInRange("2026-07-01", "2026-07-01", "2026-07-31")).toBe(true);
    expect(isDateInRange("2026-07-31", "2026-07-01", "2026-07-31")).toBe(true);
    expect(isDateInRange("2026-06-30", "2026-07-01", "2026-07-31")).toBe(false);
  });
});

describe("differenceInDays", () => {
  it("日数差を返す", () => {
    expect(differenceInDays("2026-07-15", "2026-07-15")).toBe(0);
    expect(differenceInDays("2026-07-15", "2026-07-16")).toBe(1);
    expect(differenceInDays("2026-07-15", "2026-10-12")).toBe(89);
  });

  it("逆向きは負になる", () => {
    expect(differenceInDays("2026-07-16", "2026-07-15")).toBe(-1);
  });

  it("うるう日と夏時間の切替をまたいでも1日ずつ数える", () => {
    expect(differenceInDays("2024-02-28", "2024-03-01")).toBe(2);
    expect(differenceInDays("2026-03-01", "2026-04-01")).toBe(31);
  });
});

describe("shiftYearMonth", () => {
  it("前後の年をまたいでも正しい月を返す", () => {
    expect(shiftYearMonth(2026, 11, 1)).toEqual({ year: 2027, monthIndex: 0 });
    expect(shiftYearMonth(2026, 0, -1)).toEqual({ year: 2025, monthIndex: 11 });
    expect(shiftYearMonth(2026, 0, -13)).toEqual({ year: 2024, monthIndex: 11 });
  });
});
