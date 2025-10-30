import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { Matrix, Quaternion, Vector2, Vector3 } from "@babylonjs/core/Maths/math.vector";

interface SavedCameraState {
  readonly target: Vector3;
  readonly screenOffset: Vector2;
  readonly pivotScreenPosition: Vector2;
}

/**
 * ArcRotateCamera extension that supports temporarily orbiting around a custom pivot
 * (for example, the bounding-box centre of a selected mesh) without introducing a
 * visual jump when that pivot changes.
 */
export class PivotOrbitCamera extends ArcRotateCamera {
  private static readonly EPSILON = 1e-6;

  private overridePivot: Vector3 | null = null;
  private savedState: SavedCameraState | null = null;

  public getActivePivot(): Vector3 {
    return this.overridePivot ?? this.target;
  }

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
   * to the camera's beta limits to avoid flipping. Both the camera position and
   * the current target are rotated around the active pivot so the relative view
   * stays consistent.
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

    const yawAxis = Vector3.UpReadOnly;
    const yawMatrix = Matrix.Identity();
    Quaternion.RotationAxis(yawAxis, alphaDelta).toRotationMatrix(yawMatrix);
    let rotatedPosition = Vector3.TransformCoordinates(pivotToPosition, yawMatrix);
    let rotatedTarget = Vector3.TransformCoordinates(pivotToTarget, yawMatrix);

    if (Math.abs(betaDelta) > PivotOrbitCamera.EPSILON) {
      const forward = pivot.subtract(pivot.add(rotatedPosition)).normalize();
      let right = Vector3.Cross(Vector3.UpReadOnly, forward);
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
    const newTarget = pivot.add(rotatedTarget);

    this.inertialAlphaOffset = 0;
    this.inertialBetaOffset = 0;
    this.inertialRadiusOffset = 0;
    this.inertialPanningX = 0;
    this.inertialPanningY = 0;

    this.setTarget(newTarget);
    this.setPosition(newPosition);
  }

  public getOverridePivot(): Vector3 | null {
    return this.overridePivot ? this.overridePivot.clone() : null;
  }

  public getOrbitPivot(): Vector3 {
    return this.overridePivot ?? this.target.clone();
  }

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
    const scene = this.getScene();
    const engine = scene.getEngine();
    const viewport = this.viewport.toGlobal(engine.getRenderWidth(), engine.getRenderHeight());

    const beforeMatrix = scene.getTransformMatrix();
    const projectedBefore = Vector3.Project(pivotClone, Matrix.Identity(), beforeMatrix, viewport);
    const pivotScreenBefore = new Vector2(projectedBefore.x, projectedBefore.y);

    const preservedPosition = this.position.clone();

    if (!this.overridePivot) {
      this.savedState = {
        target: this.target.clone(),
        screenOffset: this.targetScreenOffset.clone(),
        pivotScreenPosition: pivotScreenBefore,
      };
    } else if (this.savedState) {
      this.savedState = {
        target: this.savedState.target,
        screenOffset: this.savedState.screenOffset,
        pivotScreenPosition: pivotScreenBefore,
      };
    }

    this.overridePivot = pivotClone;

    this.inertialAlphaOffset = 0;
    this.inertialBetaOffset = 0;
    this.inertialRadiusOffset = 0;
    this.inertialPanningX = 0;
    this.inertialPanningY = 0;

    this.setTarget(pivotClone);
    this.setPosition(this.ensureSafePosition(preservedPosition));

    if (this.savedState) {
      const afterMatrix = scene.getTransformMatrix();
      const projectedAfter = Vector3.Project(pivotClone, Matrix.Identity(), afterMatrix, viewport);
      const pivotScreenAfter = new Vector2(projectedAfter.x, projectedAfter.y);

      const delta = this.savedState.pivotScreenPosition.subtract(pivotScreenAfter);
      const newOffset = this.savedState.screenOffset.clone();
      newOffset.addInPlace(delta);
      this.targetScreenOffset.copyFrom(newOffset);
    }
  }

  private clearOverridePivot(): void {
    if (!this.overridePivot) {
      return;
    }

    const preservedPosition = this.position.clone();
    const state = this.savedState;

    this.overridePivot = null;
    this.savedState = null;

    if (state) {
      this.inertialAlphaOffset = 0;
      this.inertialBetaOffset = 0;
      this.inertialRadiusOffset = 0;
      this.inertialPanningX = 0;
      this.inertialPanningY = 0;
      this.setTarget(state.target.clone());
      this.setPosition(this.ensureSafePosition(preservedPosition));
      this.targetScreenOffset.copyFrom(state.screenOffset);
    }
  }

  private ensureSafePosition(position: Vector3): Vector3 {
    const safe = position.clone();
    if (safe.equalsWithEpsilon(this.target, 1e-6)) {
      safe.y += 1e-3;
    }
    return safe;
  }
}
