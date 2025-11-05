import { initializeTelemetry } from "@app/telemetry";

export const initializeTelemetryToggle = (toggle: HTMLInputElement): boolean => {
  const enabled = initializeTelemetry();
  toggle.checked = enabled;
  return enabled;
};

