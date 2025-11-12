import { describe, expect, it } from "vitest";

import { RevitStylePointerInput } from "@viewer/RevitStylePointerInput";

describe("RevitStylePointerInput", () => {
  it("scales angular and pan sensitivity with scene multiplier", () => {
    const input = new RevitStylePointerInput();
    const baseAngular = input.angularSensibilityX;
    const basePan = input.panningSensibility;

    input.setSceneScaleMultiplier(4);

    expect(input.angularSensibilityX).toBeCloseTo(baseAngular / 4, 6);
    expect(input.panningSensibility).toBeCloseTo(basePan / 4, 6);
  });

  it("combines user sensitivity and scene multiplier", () => {
    const input = new RevitStylePointerInput();

    input.setRotationSensitivity(2);
    input.setPanSensitivity(0.5);
    input.setSceneScaleMultiplier(3);

    expect(input.angularSensibilityX).toBeCloseTo(1000 / (2 * 3), 6);
    expect(input.panningSensibility).toBeCloseTo(0.25 / (0.5 * 3), 6);
  });
});
