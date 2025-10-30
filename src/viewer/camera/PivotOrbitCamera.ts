import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { Matrix, Quaternion, Vector2, Vector3 } from "@babylonjs/core/Maths/math.vector";

/**
 * ArcRotateCamera extension that lets callers temporarily override the pivot
 * point (rotation centre) without disturbing the current camera position.
 */
export class PivotOrbitCamera extends ArcRotateCamera {
  private static readonly EPSILON = 1e-6;
  private overridePivot: Vector3 | null = null;
  private storedScreenOffset: Vector2 | null = null;

  /**
   * Returns the currently active pivot: either the override (if any) or the
   * camera's target.
   */
  public getActivePivot(): Vector3 {
    return this.overridePivot ?? this.target;
  }

  /**
   * Sets or clears the override pivot. When an override is applied, the camera
   * keeps its current view; the pivot only affects subsequent orbit gestures.
   */
  public setOverridePivot(pivot: Vector3 | null): void {
    if (pivot) {
      this.applyOverridePivot(pivot);
      return;
    }
    this.clearOverridePivot();
  }

  /**
   * Applies an orbital rotation using yaw/pitch deltas (in radians). Yaw always
   * uses world-space +Y as the up axis to keep the view level. Pitch is clamped
   * to the camera's beta limits to avoid flipping.
   */
  public orbit(deltaYaw: number, deltaPitch: number): void {
    if (Math.abs(deltaYaw) < PivotOrbitCamera.EPSILON && Math.abs(deltaPitch) < PivotOrbitCamera.EPSILON) {
      return;
    }

    const pivot = this.overridePivot ?? this.target;
    const pivotToPosition = this.position.subtract(pivot);
    const pivotToTarget = this.target.subtract(pivot);
    const radius = pivotToPosition.length();

    if (radius < PivotOrbitCamera.EPSILON) {
      return;
    }

    const currentAlpha = Math.atan2(pivotToPosition.z, pivotToPosition.x);
    const normalizedY = pivotToPosition.y / radius;
    const currentBeta = Math.acos(Math.min(Math.max(normalizedY, -1), 1));

    const lowerBeta = this.lowerBetaLimit ?? PivotOrbitCamera.EPSILON;
    const upperBeta = this.upperBetaLimit ?? Math.PI - PivotOrbitCamera.EPSILON;

    const newAlpha = currentAlpha - deltaYaw;
    const unclampedBeta = currentBeta + deltaPitch;
    const newBeta = Math.min(Math.max(unclampedBeta, lowerBeta), upperBeta);

    const alphaDelta = newAlpha - currentAlpha;
    const betaDelta = newBeta - currentBeta;

    const yawMatrix = Matrix.Identity();
    Quaternion.RotationAxis(Vector3.UpReadOnly, alphaDelta).toRotationMatrix(yawMatrix);
    let rotatedPosition = Vector3.TransformCoordinates(pivotToPosition, yawMatrix);
    let rotatedTarget = Vector3.TransformCoordinates(pivotToTarget, yawMatrix);

    if (Math.abs(betaDelta) > PivotOrbitCamera.EPSILON) {
      let right = Vector3.Cross(rotatedPosition, Vector3.UpReadOnly);
      if (right.lengthSquared() < PivotOrbitCamera.EPSILON) {
        right = new Vector3(1, 0, 0);
      } else {
        right.normalize();
      }
      const pitchMatrix = Matrix.Identity();
      Quaternion.RotationAxis(right, betaDelta).toRotationMatrix(pitchMatrix);
      rotatedPosition = Vector3.TransformCoordinates(rotatedPosition, pitchMatrix);
      rotatedTarget = Vector3.TransformCoordinates(rotatedTarget, pitchMatrix);
    }

    const newPosition = pivot.add(rotatedPosition);
    const newTarget = this.overridePivot ? pivot : pivot.add(rotatedTarget);

    this.inertialAlphaOffset = 0;
    this.inertialBetaOffset = 0;
    this.inertialRadiusOffset = 0;
    this.inertialPanningX = 0;
    this.inertialPanningY = 0;

    this.setTarget(newTarget);
    this.setPosition(newPosition);
  }

  /**
   * Returns the current override pivot (if any).
   */
  public getOverridePivot(): Vector3 | null {
    return this.overridePivot ? this.overridePivot.clone() : null;
  }

  /**
   * Utility that exposes the orbit pivot for consumers that need read-only
   * access.
   */
  public getOrbitPivot(): Vector3 {
    return this.overridePivot ?? this.target.clone();
  }

  /**
   * Ensures that beta limits are always defined, mirroring ArcRotate defaults.
   */
  public enforceBetaLimits(defaultPadding = 0.01): void {
    if (this.lowerBetaLimit === null || this.lowerBetaLimit === undefined) {
      this.lowerBetaLimit = defaultPadding;
    }
    if (this.upperBetaLimit === null || this.upperBetaLimit === undefined) {
      this.upperBetaLimit = Math.PI - defaultPadding;
    }
  }

  private applyOverridePivot(pivot: Vector3): void {
    const pivotClone = pivot.clone();
    const preservedPosition = this.position.clone();
    const previousTarget = this.target.clone();
    const scene = this.getScene();
    const engine = scene.getEngine();
    const viewport = this.viewport.toGlobal(engine.getRenderWidth(), engine.getRenderHeight());
    const transformMatrix = scene.getTransformMatrix();

    if (!this.storedScreenOffset) {
      this.storedScreenOffset = this.targetScreenOffset.clone();
    }

    let screenOffset = Vector2.Zero();
    try {
      const projectedPivot = Vector3.Project(
        pivotClone,
        Matrix.Identity(),
        transformMatrix,
        viewport,
      );
      const projectedTarget = Vector3.Project(
        previousTarget,
        Matrix.Identity(),
        transformMatrix,
        viewport,
      );
      screenOffset = new Vector2(
        projectedTarget.x - projectedPivot.x,
        projectedTarget.y - projectedPivot.y,
      );
    } catch (error) {
      console.warn("[PivotOrbitCamera] failed to compute screen offset", error);
      screenOffset = Vector2.Zero();
    }

    this.overridePivot = pivotClone;
    this.targetScreenOffset.copyFrom(this.storedScreenOffset);
    this.targetScreenOffset.addInPlace(screenOffset);
    this.setTarget(pivotClone);
    this.setPosition(this.ensureSafePosition(preservedPosition));
  }

  private clearOverridePivot(): void {
    this.overridePivot = null;
    if (this.storedScreenOffset) {
      this.targetScreenOffset.copyFrom(this.storedScreenOffset);
    } else {
      this.targetScreenOffset.set(0, 0);
    }
    this.storedScreenOffset = null;
  }

  private ensureSafePosition(position: Vector3): Vector3 {
    const safe = position.clone();
    if (safe.equalsWithEpsilon(this.target, 1e-6)) {
      safe.y += 1e-3;
    }
    return safe;
  }
}
