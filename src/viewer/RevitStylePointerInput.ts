import type { Nullable } from "@babylonjs/core/types";
import { ArcRotateCameraPointersInput } from "@babylonjs/core/Cameras/Inputs/arcRotateCameraPointersInput";
import type { PointerTouch } from "@babylonjs/core/Events/pointerEvents";
import { PivotOrbitCamera } from "./camera/PivotOrbitCamera.ts";

/**
 * Custom pointer handler that mimics Revit-style navigation:
 * - Middle mouse drag pans
 * - Shift (or Alt/Ctrl/Meta) + middle mouse drag rotates
 */
export class RevitStylePointerInput extends ArcRotateCameraPointersInput {
  private static readonly MIN_SENSITIVITY = 0.1;
  private readonly baseAngularSensibility = 1000;
  private readonly basePanningSensibility = 0.25;
  private rotationSensitivity = 1;
  private panSensitivity = 1;

  public constructor() {
    super();
    this.buttons = [1];
    this.applyRotationSensitivity();
    this.applyPanSensitivity();
  }

  public override getClassName(): string {
    return "RevitStylePointerInput";
  }

  public override onTouch(_point: Nullable<PointerTouch>, offsetX: number, offsetY: number): void {
    const camera = this.camera as PivotOrbitCamera;
    const rotateHeld =
      this._shiftKey ||
      this._altKey ||
      this._metaKey ||
      (this._ctrlKey && !this.camera._useCtrlForPanning);

    if (rotateHeld) {
      const deltaYaw = -offsetX / this.angularSensibilityX;
      const deltaPitch = offsetY / this.angularSensibilityY;
      camera.orbit(deltaYaw, deltaPitch);
      return;
    }

    if (this.panningSensibility === 0) {
      return;
    }

    this.camera.inertialPanningX += -offsetX / this.panningSensibility;
    this.camera.inertialPanningY += offsetY / this.panningSensibility;
  }

  public getRotationSensitivity(): number {
    return this.rotationSensitivity;
  }

  public setRotationSensitivity(value: number): void {
    const next = Math.max(RevitStylePointerInput.MIN_SENSITIVITY, value);
    if (Math.abs(next - this.rotationSensitivity) < 1e-6) {
      return;
    }
    this.rotationSensitivity = next;
    this.applyRotationSensitivity();
  }

  public getPanSensitivity(): number {
    return this.panSensitivity;
  }

  public setPanSensitivity(value: number): void {
    const next = Math.max(RevitStylePointerInput.MIN_SENSITIVITY, value);
    if (Math.abs(next - this.panSensitivity) < 1e-6) {
      return;
    }
    this.panSensitivity = next;
    this.applyPanSensitivity();
  }

  private applyRotationSensitivity(): void {
    const scale = Math.max(RevitStylePointerInput.MIN_SENSITIVITY, this.rotationSensitivity);
    const sens = this.baseAngularSensibility / scale;
    this.angularSensibilityX = sens;
    this.angularSensibilityY = sens;
  }

  private applyPanSensitivity(): void {
    const scale = Math.max(RevitStylePointerInput.MIN_SENSITIVITY, this.panSensitivity);
    this.panningSensibility = this.basePanningSensibility / scale;
  }
}
