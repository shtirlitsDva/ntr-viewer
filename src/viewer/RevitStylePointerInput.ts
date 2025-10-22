import type { Nullable } from "@babylonjs/core/types";
import { ArcRotateCameraPointersInput } from "@babylonjs/core/Cameras/Inputs/arcRotateCameraPointersInput";
import type { PointerTouch } from "@babylonjs/core/Events/pointerEvents";

/**
 * Custom pointer handler that mimics Revit-style navigation:
 * - Middle mouse drag pans
 * - Shift (or Alt/Ctrl/Meta) + middle mouse drag rotates
 */
export class RevitStylePointerInput extends ArcRotateCameraPointersInput {
  public constructor() {
    super();
    this.buttons = [1];
    this.angularSensibilityX = 1000;
    this.angularSensibilityY = 1000;
    this.panningSensibility = 0.5;
  }

  public override getClassName(): string {
    return "RevitStylePointerInput";
  }

  public override onTouch(_point: Nullable<PointerTouch>, offsetX: number, offsetY: number): void {
    const rotateHeld =
      this._shiftKey ||
      this._altKey ||
      this._metaKey ||
      (this._ctrlKey && !this.camera._useCtrlForPanning);

    if (rotateHeld) {
      this.camera.inertialAlphaOffset -= offsetX / this.angularSensibilityX;
      this.camera.inertialBetaOffset -= offsetY / this.angularSensibilityY;
      return;
    }

    if (this.panningSensibility === 0) {
      return;
    }

    this.camera.inertialPanningX += -offsetX / this.panningSensibility;
    this.camera.inertialPanningY += offsetY / this.panningSensibility;
  }
}
