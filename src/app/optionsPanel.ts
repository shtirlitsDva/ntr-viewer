import type { ViewerHost } from "./viewerHost.ts";

export interface PersistedSettings {
  readonly rotationSensitivity: number;
  readonly panSensitivity: number;
}

export const DEFAULT_SETTINGS: PersistedSettings = {
  rotationSensitivity: 1,
  panSensitivity: 1,
};

export interface OptionsPanelController {
  show(): void;
  hide(): void;
  toggle(): void;
  refresh(): void;
  dispose(): void;
  isVisible(): boolean;
}

export interface OptionsPanelConfig {
  readonly panel: HTMLElement;
  readonly closeButton: HTMLButtonElement;
  readonly rotationInput: HTMLInputElement;
  readonly panInput: HTMLInputElement;
  readonly manualPathForm: HTMLFormElement;
  readonly manualPathInput: HTMLInputElement;
  readonly storageKey: string;
  readonly defaultSettings: PersistedSettings;
  readonly getViewerHost: () => ViewerHost | null;
  readonly loadFileFromPath: (path: string) => Promise<boolean>;
  readonly notifyWarning: (message: string) => void;
}

const formatNumberForInput = (value: number): string => {
  if (!Number.isFinite(value)) {
    return "1";
  }
  const rounded = Math.round(value * 100) / 100;
  return Number.isInteger(rounded) ? `${rounded}` : rounded.toFixed(2).replace(/(?:\\.0+|0+)$/, "");
};

const readPersistedSettings = (
  storageKey: string,
  fallback: PersistedSettings,
): PersistedSettings => {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) {
      return fallback;
    }
    const parsed = JSON.parse(raw) as Partial<PersistedSettings>;
    const rotation = Number(parsed.rotationSensitivity);
    const pan = Number(parsed.panSensitivity);
    return {
      rotationSensitivity:
        Number.isFinite(rotation) && rotation > 0 ? rotation : fallback.rotationSensitivity,
      panSensitivity: Number.isFinite(pan) && pan > 0 ? pan : fallback.panSensitivity,
    };
  } catch (error) {
    console.warn("Failed to read viewer options", error);
    return fallback;
  }
};

const writePersistedSettings = (storageKey: string, settings: PersistedSettings): void => {
  try {
    localStorage.setItem(storageKey, JSON.stringify(settings));
  } catch (error) {
    console.warn("Failed to persist viewer options", error);
  }
};

export const readViewerSettings = (
  storageKey: string,
  fallback: PersistedSettings = DEFAULT_SETTINGS,
): PersistedSettings => readPersistedSettings(storageKey, fallback);

export const writeViewerSettings = (storageKey: string, settings: PersistedSettings): void => {
  writePersistedSettings(storageKey, settings);
};

export const createOptionsPanelController = (
  config: OptionsPanelConfig,
): OptionsPanelController => {
  const {
    panel,
    closeButton,
    rotationInput,
    panInput,
    manualPathForm,
    manualPathInput,
    storageKey,
    defaultSettings,
    getViewerHost,
    loadFileFromPath,
    notifyWarning,
  } = config;

  let visible = false;
  let previousFocus: HTMLElement | null = null;

  const loadSettings = (): PersistedSettings => readPersistedSettings(storageKey, defaultSettings);

  const saveSettingsFromHost = (): void => {
    const host = getViewerHost();
    const settings: PersistedSettings = {
      rotationSensitivity: host?.getRotationSensitivity() ?? defaultSettings.rotationSensitivity,
      panSensitivity: host?.getPanSensitivity() ?? defaultSettings.panSensitivity,
    };
    writePersistedSettings(storageKey, settings);
  };

  const refreshInputs = (): void => {
    const host = getViewerHost();
    const settings = host
      ? {
          rotationSensitivity: host.getRotationSensitivity(),
          panSensitivity: host.getPanSensitivity(),
        }
      : loadSettings();
    rotationInput.value = formatNumberForInput(settings.rotationSensitivity);
    panInput.value = formatNumberForInput(settings.panSensitivity);
  };

  const applyRotationInput = (): void => {
    const host = getViewerHost();
    if (!host) {
      return;
    }
    const current = host.getRotationSensitivity();
    const parsed = Number(rotationInput.value);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      rotationInput.value = formatNumberForInput(current);
      return;
    }
    host.setRotationSensitivity(parsed);
    rotationInput.value = formatNumberForInput(host.getRotationSensitivity());
    saveSettingsFromHost();
  };

  const applyPanInput = (): void => {
    const host = getViewerHost();
    if (!host) {
      return;
    }
    const current = host.getPanSensitivity();
    const parsed = Number(panInput.value);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      panInput.value = formatNumberForInput(current);
      return;
    }
    host.setPanSensitivity(parsed);
    panInput.value = formatNumberForInput(host.getPanSensitivity());
    saveSettingsFromHost();
  };

  const handleManualPathSubmit = async (event: SubmitEvent): Promise<void> => {
    event.preventDefault();
    const path = manualPathInput.value.trim();
    if (!path) {
      notifyWarning("Enter a file path to load.");
      manualPathInput.focus();
      return;
    }
    const success = await loadFileFromPath(path);
    if (success) {
      manualPathInput.value = "";
      hide();
    }
  };

  const handlePanelClick = (event: MouseEvent): void => {
    if (event.target === panel) {
      hide();
    }
  };

  const handleKeydown = (event: KeyboardEvent): void => {
    if (event.key === "Escape") {
      event.preventDefault();
      hide();
    }
  };

  const show = (): void => {
    if (visible) {
      return;
    }
    refreshInputs();
    previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    panel.removeAttribute("hidden");
    panel.classList.add("visible");
    visible = true;
    closeButton.focus();
    document.addEventListener("keydown", handleKeydown);
  };

  const hide = (): void => {
    if (!visible) {
      return;
    }
    saveSettingsFromHost();
    panel.classList.remove("visible");
    panel.setAttribute("hidden", "");
    visible = false;
    document.removeEventListener("keydown", handleKeydown);
    if (previousFocus) {
      previousFocus.focus();
      previousFocus = null;
    }
  };

  const toggle = (): void => {
    if (visible) {
      hide();
    } else {
      show();
    }
  };

  const manualPathSubmitListener = (event: Event) => {
    void handleManualPathSubmit(event as SubmitEvent);
  };

  const dispose = (): void => {
    hide();
    panel.removeEventListener("click", handlePanelClick);
    closeButton.removeEventListener("click", hide);
    rotationInput.removeEventListener("change", applyRotationInput);
    rotationInput.removeEventListener("blur", applyRotationInput);
    panInput.removeEventListener("change", applyPanInput);
    panInput.removeEventListener("blur", applyPanInput);
    manualPathForm.removeEventListener("submit", manualPathSubmitListener);
  };

  panel.addEventListener("click", handlePanelClick);
  closeButton.addEventListener("click", hide);
  rotationInput.addEventListener("change", applyRotationInput);
  rotationInput.addEventListener("blur", applyRotationInput);
  panInput.addEventListener("change", applyPanInput);
  panInput.addEventListener("blur", applyPanInput);
  manualPathForm.addEventListener("submit", manualPathSubmitListener);
  refreshInputs();

  return {
    show,
    hide,
    toggle,
    refresh: refreshInputs,
    dispose,
    isVisible: () => visible,
  };
};
