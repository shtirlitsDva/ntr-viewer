const STORAGE_KEY = "ntr-viewer:telemetry-enabled";

let enabled = false;

export const initializeTelemetry = (): boolean => {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    enabled = stored === "1";
  } catch (error) {
    console.warn("Telemetry storage unavailable", error);
    enabled = false;
  }
  return enabled;
};

export const isTelemetryEnabled = (): boolean => enabled;

export const setTelemetryEnabled = (value: boolean): void => {
  enabled = value;
  try {
    window.localStorage.setItem(STORAGE_KEY, value ? "1" : "0");
  } catch (error) {
    console.warn("Failed to persist telemetry preference", error);
  }
};

export const recordTelemetry = (event: string, payload: Record<string, unknown>): void => {
  if (!enabled) {
    return;
  }
  console.info(`[telemetry] ${event}`, payload);
};
