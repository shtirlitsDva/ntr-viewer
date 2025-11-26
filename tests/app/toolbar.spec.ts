import { describe, expect, it, vi } from "vitest";

import { attachToolbar } from "@app/toolbar";
import type { ToolbarCallbacks } from "@app/toolbar";

const createButton = (): HTMLButtonElement => document.createElement("button");
const createCheckbox = (): HTMLInputElement => {
  const input = document.createElement("input");
  input.type = "checkbox";
  return input;
};
const createSelect = (): HTMLSelectElement => document.createElement("select");

describe("attachToolbar", () => {
  it("notifies when the iso toggle changes", () => {
    const elements = {
      openFileButton: createButton(),
      fitViewButton: createButton(),
      resetViewButton: createButton(),
      optionsToggleButton: createButton(),
      colorModeSelect: createSelect(),
      gridToggle: createCheckbox(),
      isoToggle: createCheckbox(),
      telemetryToggle: createCheckbox(),
    } as const;

    const callbacks: ToolbarCallbacks = {
      onOpenFile: vi.fn(),
      onFitView: vi.fn(),
      onResetView: vi.fn(),
      onOptionsToggle: vi.fn(),
      onColorModeChange: vi.fn(),
      onGridToggle: vi.fn(),
      onIsoToggle: vi.fn(),
      onTelemetryToggle: vi.fn(),
    };

    const controller = attachToolbar(elements, callbacks);

    elements.isoToggle.checked = true;
    elements.isoToggle.dispatchEvent(new Event("change"));
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(callbacks.onIsoToggle).toHaveBeenCalledWith(true);

    elements.isoToggle.checked = false;
    elements.isoToggle.dispatchEvent(new Event("change"));
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(callbacks.onIsoToggle).toHaveBeenCalledWith(false);

    controller.dispose();
  });
});
