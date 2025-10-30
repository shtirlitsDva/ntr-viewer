import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { Matrix, Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";

/**
 * ArcRotateCamera extension that keeps track of an override pivot when rotating.
 * The override does not modify the current view; it only affects subsequent orbit
 * operations so the camera position and target are rotated around the provided pivot.
 */
export class PivotOrbitCamera extends ArcRotateCamera {
  private static readonly EPSILON = 1e-6;
  private overridePivot: Vector3 | null = null;

  public getActivePivot(): Vector3 {
    return this.overridePivot ?? this.target;
  }

  public setOverridePivot(pivot: Vector3 | null): void {
    if (pivot) {
      this.overridePivot = pivot.clone();
      return;
    }
    this.overridePivot = null;
  }

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
}
