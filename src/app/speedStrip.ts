import type { ViewerHost } from "./viewerHost.ts";

export interface SpeedSettings {
  readonly zoomSpeed: number;
  readonly panSpeed: number;
}

export const DEFAULT_SPEED_SETTINGS: SpeedSettings = {
  zoomSpeed: 50,
  panSpeed: 50,
};

export interface SpeedStripController {
  refresh(): void;
  dispose(): void;
}

export interface SpeedStripConfig {
  readonly container: HTMLElement;
  readonly zoomInput: HTMLInputElement;
  readonly panInput: HTMLInputElement;
  readonly storageKey: string;
  readonly getViewerHost: () => ViewerHost | null;
}

const clampSpeed = (value: number): number => {
  if (!Number.isFinite(value)) {
    return 50;
  }
  const rounded = Math.round(value);
  return Math.min(100, Math.max(1, rounded));
};

export const readSpeedSettings = (
  storageKey: string,
  fallback: SpeedSettings = DEFAULT_SPEED_SETTINGS,
): SpeedSettings => {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) {
      return fallback;
    }
    const parsed = JSON.parse(raw) as Partial<SpeedSettings>;
    const zoom = clampSpeed(parsed.zoomSpeed ?? fallback.zoomSpeed);
    const pan = clampSpeed(parsed.panSpeed ?? fallback.panSpeed);
    return { zoomSpeed: zoom, panSpeed: pan };
  } catch (error) {
    console.warn("Failed to read speed settings", error);
    return fallback;
  }
};

export const writeSpeedSettings = (storageKey: string, settings: SpeedSettings): void => {
  try {
    localStorage.setItem(storageKey, JSON.stringify(settings));
  } catch (error) {
    console.warn("Failed to persist speed settings", error);
  }
};

export const createSpeedStripController = (config: SpeedStripConfig): SpeedStripController => {
  const { zoomInput, panInput, storageKey, getViewerHost } = config;

  const persist = (): void => {
    writeSpeedSettings(storageKey, {
      zoomSpeed: clampSpeed(Number(zoomInput.value)),
      panSpeed: clampSpeed(Number(panInput.value)),
    });
  };

  const applyZoom = (value: number): void => {
    const speed = clampSpeed(value);
    zoomInput.value = `${speed}`;
    const host = getViewerHost();
    host?.setZoomSpeed(speed);
    persist();
  };

  const applyPan = (value: number): void => {
    const speed = clampSpeed(value);
    panInput.value = `${speed}`;
    const host = getViewerHost();
    host?.setPanSpeed(speed);
    persist();
  };

  const refresh = (): void => {
    const host = getViewerHost();
    if (host) {
      zoomInput.value = `${clampSpeed(host.getZoomSpeed())}`;
      panInput.value = `${clampSpeed(host.getPanSpeed())}`;
      return;
    }
    const stored = readSpeedSettings(storageKey);
    zoomInput.value = `${stored.zoomSpeed}`;
    panInput.value = `${stored.panSpeed}`;
  };

  const handleZoom = (event: Event): void => {
    const value = Number((event.target as HTMLInputElement).value);
    applyZoom(value);
  };

  const handlePan = (event: Event): void => {
    const value = Number((event.target as HTMLInputElement).value);
    applyPan(value);
  };

  zoomInput.addEventListener("input", handleZoom);
  panInput.addEventListener("input", handlePan);

  // Apply persisted values to the host on creation.
  const initial = readSpeedSettings(storageKey);
  applyZoom(initial.zoomSpeed);
  applyPan(initial.panSpeed);

  return {
    refresh,
    dispose: () => {
      zoomInput.removeEventListener("input", handleZoom);
      panInput.removeEventListener("input", handlePan);
    },
  };
};
