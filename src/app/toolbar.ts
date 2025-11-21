import type { ColorMode } from "@viewer/engine";

export interface ToolbarElements {
  readonly openFileButton: HTMLButtonElement;
  readonly fitViewButton: HTMLButtonElement;
  readonly resetViewButton: HTMLButtonElement;
  readonly optionsToggleButton: HTMLButtonElement;
  readonly colorModeSelect: HTMLSelectElement;
  readonly gridToggle: HTMLInputElement;
  readonly isoToggle: HTMLInputElement;
  readonly telemetryToggle: HTMLInputElement;
}

export interface ToolbarCallbacks {
  onOpenFile(): Promise<void> | void;
  onFitView(): void;
  onResetView(): void;
  onOptionsToggle(): void;
  onColorModeChange(mode: ColorMode): void;
  onGridToggle(visible: boolean): void;
  onIsoToggle(enabled: boolean): void;
  onTelemetryToggle(enabled: boolean): void;
}

export interface ToolbarController {
  dispose(): void;
}

export const attachToolbar = (
  elements: ToolbarElements,
  callbacks: ToolbarCallbacks,
): ToolbarController => {
  const {
    openFileButton,
    fitViewButton,
    resetViewButton,
    optionsToggleButton,
    colorModeSelect,
    gridToggle,
    isoToggle,
    telemetryToggle,
  } = elements;

  const handleOpenClick = () => {
    void callbacks.onOpenFile();
  };
  openFileButton.addEventListener("click", handleOpenClick);

  const handleFitClick = () => {
    callbacks.onFitView();
  };
  fitViewButton.addEventListener("click", handleFitClick);

  const handleResetClick = () => {
    callbacks.onResetView();
  };
  resetViewButton.addEventListener("click", handleResetClick);

  const handleOptionsClick = () => {
    callbacks.onOptionsToggle();
  };
  optionsToggleButton.addEventListener("click", handleOptionsClick);

  const handleColorModeChange = (event: Event) => {
    const select = event.currentTarget as HTMLSelectElement;
    callbacks.onColorModeChange(select.value as ColorMode);
  };
  colorModeSelect.addEventListener("change", handleColorModeChange);

  const handleGridToggle = () => {
    callbacks.onGridToggle(gridToggle.checked);
  };
  gridToggle.addEventListener("change", handleGridToggle);

  const handleIsoToggle = () => {
    callbacks.onIsoToggle(isoToggle.checked);
  };
  isoToggle.addEventListener("change", handleIsoToggle);

  const handleTelemetryToggle = () => {
    callbacks.onTelemetryToggle(telemetryToggle.checked);
  };
  telemetryToggle.addEventListener("change", handleTelemetryToggle);

  return {
    dispose: () => {
      openFileButton.removeEventListener("click", handleOpenClick);
      fitViewButton.removeEventListener("click", handleFitClick);
      resetViewButton.removeEventListener("click", handleResetClick);
      optionsToggleButton.removeEventListener("click", handleOptionsClick);
      colorModeSelect.removeEventListener("change", handleColorModeChange);
      gridToggle.removeEventListener("change", handleGridToggle);
      isoToggle.removeEventListener("change", handleIsoToggle);
      telemetryToggle.removeEventListener("change", handleTelemetryToggle);
    },
  };
};
