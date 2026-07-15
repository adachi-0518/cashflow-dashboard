import type { AppData } from "../types/models";
import { APP_TITLE } from "./constants";
import { normalizeAppData } from "./normalizeAppData";

const APP_DATA_KEYS = [
  "accounts",
  "cards",
  "subscriptions",
  "incomePlans",
  "accountTransfers",
  "oneTimeExpenses",
] as const;

interface AppDataExportFile {
  app: string;
  version: number;
  exportedAt: string;
  data: AppData;
}

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null;
}

function hasAppDataShape(value: unknown): boolean {
  return isRecord(value) && APP_DATA_KEYS.some((key) => Array.isArray(value[key]));
}

export function createAppDataExportFile(
  data: AppData,
  exportedAt: string = new Date().toISOString(),
): AppDataExportFile {
  return {
    app: APP_TITLE,
    version: 1,
    exportedAt,
    data: normalizeAppData(data),
  };
}

export function parseImportedAppData(value: unknown): AppData | null {
  const candidate = isRecord(value) && "data" in value ? value.data : value;

  if (!hasAppDataShape(candidate)) {
    return null;
  }

  return normalizeAppData(candidate);
}
