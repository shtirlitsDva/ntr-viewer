import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";

/**
 * ArcRotateCamera extension that lets callers temporarily override the pivot
 * point (rotation centre) without disturbing the current camera position.
 */
export class PivotOrbitCamera extends ArcRotateCamera {
  private overridePivot: Vector3 | null = null;

  /**
   * Returns the currently active pivot: either the override (if any) or the
   * camera's target.
   */
  public getActivePivot(): Vector3 {
    return this.overridePivot ?? this.target;
  }

  /**
   * Sets or clears the override pivot. When an override is applied, the camera
   * keeps its current world-space position so the view does not "jump". When
   * cleared, the camera keeps its latest target (which ArcRotateCamera will
   * continue to evolve through panning).
   */
  public setOverridePivot(pivot: Vector3 | null): void {
    if (pivot) {
      const pivotClone = pivot.clone();
      if (this.overridePivot?.equalsWithEpsilon(pivotClone, 1e-6)) {
        return;
      }

      const preservedPosition = this.position.clone();
      this.overridePivot = pivotClone;
      this.setTarget(pivotClone);
      this.setPosition(this.ensureSafePosition(preservedPosition));
      return;
    }

    if (!this.overridePivot) {
      return;
    }

    const preservedPosition = this.position.clone();
    this.overridePivot = null;
    this.setPosition(this.ensureSafePosition(preservedPosition));
  }

  private ensureSafePosition(position: Vector3): Vector3 {
    const safe = position.clone();
    if (safe.equalsWithEpsilon(this.target, 1e-6)) {
      safe.y += 1e-3;
    }
    return safe;
  }
}
