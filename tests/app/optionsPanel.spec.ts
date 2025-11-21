import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";

import {
  createOptionsPanelController,
  DEFAULT_SETTINGS,
  readViewerSettings,
  type OptionsPanelController,
} from "@app/optionsPanel";
import type { ViewerHost } from "@app/viewerHost";
import type { SceneRenderer } from "@viewer/engine";

const STORAGE_KEY = "test:viewer-settings";

const createElement = <T extends HTMLElement>(tag: string, attrs: Record<string, string> = {}): T => {
  const el = document.createElement(tag) as T;
  Object.entries(attrs).forEach(([key, value]) => {
    el.setAttribute(key, value);
  });
  return el;
};

const createViewerHostStub = (): ViewerHost => {
  let rotationValue = 1;
  let panValue = 1;

  const setRotationSensitivity = vi.fn((value: number) => {
    rotationValue = value;
  });
  const setPanSensitivity = vi.fn((value: number) => {
    panValue = value;
  });

  const renderer: SceneRenderer = {
    load: vi.fn(),
    setColorMode: vi.fn(),
    setSelection: vi.fn(),
    onSelectionChanged: vi.fn(() => vi.fn()),
    setGridVisible: vi.fn(),
    fitToBounds: vi.fn(),
    getRotationSensitivity: () => rotationValue,
    setRotationSensitivity,
    getPanSensitivity: () => panValue,
    setPanSensitivity,
    getCameraAngles: () => ({ alpha: 0, beta: Math.PI / 2 }),
    setIsometricView: vi.fn(),
    isIsometricView: vi.fn(() => false),
    orientView: vi.fn(),
    dispose: vi.fn(),
  };

  return {
    resetScene: vi.fn(),
    load: vi.fn(),
    setColorMode: vi.fn(),
    setSelection: vi.fn(),
    setGridVisible: vi.fn(),
    fitToBounds: vi.fn(),
    getRotationSensitivity: () => rotationValue,
    setRotationSensitivity,
    getPanSensitivity: () => panValue,
    setPanSensitivity,
    getCameraAngles: () => ({ alpha: 0, beta: Math.PI / 2 }),
    setIsometricView: vi.fn(),
    isIsometricView: () => false,
    orientView: vi.fn(),
    addSelectionListener: vi.fn(() => vi.fn()),
    dispose: vi.fn(),
    renderer,
  };
};

describe("createOptionsPanelController", () => {
  let panel: HTMLElement;
  let closeButton: HTMLButtonElement;
  let rotationInput: HTMLInputElement;
  let panInput: HTMLInputElement;
  let manualPathForm: HTMLFormElement;
  let manualPathInput: HTMLInputElement;
  let controller: OptionsPanelController;
  let viewerHost: ViewerHost | null;

  const getViewerHost = () => viewerHost;

  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = "";

    panel = createElement("div", { hidden: "" });
    closeButton = createElement<HTMLButtonElement>("button");
    rotationInput = createElement<HTMLInputElement>("input");
    panInput = createElement<HTMLInputElement>("input");
    manualPathForm = createElement<HTMLFormElement>("form");
    manualPathInput = createElement<HTMLInputElement>("input");

    manualPathForm.append(manualPathInput);
    panel.append(closeButton, rotationInput, panInput, manualPathForm);
    document.body.append(panel);

    viewerHost = createViewerHostStub();

    controller = createOptionsPanelController({
      panel,
      closeButton,
      rotationInput,
      panInput,
      manualPathForm,
      manualPathInput,
      storageKey: STORAGE_KEY,
      defaultSettings: DEFAULT_SETTINGS,
      getViewerHost,
      loadFileFromPath: vi.fn().mockResolvedValue(true),
      notifyWarning: vi.fn(),
    });
  });

  afterEach(() => {
    controller.dispose();
    viewerHost = null;
  });

  it("shows and hides the panel with focus management", () => {
    expect(controller.isVisible()).toBe(false);
    controller.show();
    expect(controller.isVisible()).toBe(true);
    expect(panel.classList.contains("visible")).toBe(true);
    expect(panel.hasAttribute("hidden")).toBe(false);
    expect(document.activeElement).toBe(closeButton);

    controller.hide();
    expect(controller.isVisible()).toBe(false);
    expect(panel.classList.contains("visible")).toBe(false);
    expect(panel.hasAttribute("hidden")).toBe(true);
  });

  it("applies sensitivity inputs and persists to storage", () => {
    controller.show();

    rotationInput.value = "2.5";
    rotationInput.dispatchEvent(new Event("change"));
    expect(viewerHost?.setRotationSensitivity).toHaveBeenCalledWith(2.5);

    panInput.value = "3.1";
    panInput.dispatchEvent(new Event("blur"));
    expect(viewerHost?.setPanSensitivity).toHaveBeenCalledWith(3.1);

    controller.hide();

    const persisted = readViewerSettings(STORAGE_KEY, DEFAULT_SETTINGS);
    expect(persisted.rotationSensitivity).toBe(2.5);
    expect(persisted.panSensitivity).toBe(3.1);
  });

  it("shows warning when manual path is empty and loads file when provided", async () => {
    const loadFileFromPath = vi.fn().mockResolvedValue(true);
    const notifyWarning = vi.fn();

    controller.dispose();
    controller = createOptionsPanelController({
      panel,
      closeButton,
      rotationInput,
      panInput,
      manualPathForm,
      manualPathInput,
      storageKey: STORAGE_KEY,
      defaultSettings: DEFAULT_SETTINGS,
      getViewerHost,
      loadFileFromPath,
      notifyWarning,
    });

    controller.show();
    manualPathInput.value = "";
    manualPathForm.dispatchEvent(new Event("submit", { cancelable: true }));
    expect(notifyWarning).toHaveBeenCalledWith("Enter a file path to load.");
    expect(loadFileFromPath).not.toHaveBeenCalled();

    manualPathInput.value = "/tmp/sample.ntr";
    manualPathForm.dispatchEvent(new Event("submit", { cancelable: true }));
    await Promise.resolve();
    expect(loadFileFromPath).toHaveBeenCalledWith("/tmp/sample.ntr");
    expect(controller.isVisible()).toBe(false);
    expect(manualPathInput.value).toBe("");
  });
});
