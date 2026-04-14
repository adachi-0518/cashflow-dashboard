import type { AppData } from "../../types/models";
import type { ForecastResult } from "../../types/forecast";
import { generateForecastEvents } from "./generateForecastEvents";
import { calculateForecast } from "./calculateForecast";

export function buildForecast(data: AppData, today: string): ForecastResult {
  const generated = generateForecastEvents(data, today);

  return calculateForecast({
    data,
    today,
    horizonEnd: generated.horizonEnd,
    events: generated.events,
    baseAlerts: generated.alerts,
  });
}
