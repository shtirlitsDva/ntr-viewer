import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { attachViewCube } from "@app/viewCube";
import type { ViewOrientation } from "@viewer/engine";

describe("viewCube", () => {
  beforeEach(() => {
    vi.spyOn(window, "requestAnimationFrame").mockImplementation(() => 0);
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("invokes orientView for each face", () => {
    const container = document.createElement("div");
    const orientView = vi.fn();
    const getCameraAngles = vi.fn(() => ({ alpha: 0, beta: Math.PI / 2 }));
    const controller = attachViewCube({
      container,
      getOrientationTarget: () => ({ orientView, getCameraAngles }),
    });

    const buttons = container.querySelectorAll<HTMLButtonElement>("[data-orientation]");
    expect(buttons).toHaveLength(6);
    buttons.forEach((button) => {
      button.click();
    });

    const orientations = Array.from(buttons).map((button) => button.dataset.orientation as ViewOrientation);
    expect(orientView).toHaveBeenCalledTimes(orientations.length);
    orientations.forEach((orientation, index) => {
      expect(orientView).toHaveBeenNthCalledWith(index + 1, orientation);
    });

    controller.dispose();
    expect(container.querySelector("[data-control=\"view-gizmo\"]")).toBeNull();
  });

  it("resolves the viewer host lazily", () => {
    const container = document.createElement("div");
    const orientView = vi.fn();
    const getCameraAngles = () => ({ alpha: 0, beta: Math.PI / 2 });
    let host: { orientView: typeof orientView; getCameraAngles: typeof getCameraAngles } | null = null;
    const controller = attachViewCube({
      container,
      getOrientationTarget: () => host,
    });

    const firstButton = container.querySelector<HTMLButtonElement>("[data-orientation]");
    expect(firstButton).not.toBeNull();
    firstButton?.click();
    expect(orientView).not.toHaveBeenCalled();

    host = { orientView, getCameraAngles };
    firstButton?.click();
    expect(orientView).toHaveBeenCalledTimes(1);

    controller.dispose();
  });
});
