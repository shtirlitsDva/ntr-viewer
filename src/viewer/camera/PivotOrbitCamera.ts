import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { ArcRotateCameraPointersInput } from "@babylonjs/core/Cameras/Inputs/arcRotateCameraPointersInput";
import { Matrix, Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { Scene } from "@babylonjs/core/scene";

/**
 * ArcRotateCamera extension that keeps track of an override pivot when rotating.
 * The override does not modify the current view; it only affects subsequent orbit
 * operations so the camera position and target are rotated around the provided pivot.
 */
export class PivotOrbitCamera extends ArcRotateCamera {
  private static readonly EPSILON = 1e-6;
  private static readonly MIN_RADIUS_FOR_SENSITIVITY = 2;
  private static readonly MAX_RADIUS_FOR_SENSITIVITY = 2_000;
  private static readonly PAN_FAR_MULTIPLIER = 0.2;
  private static readonly ORBIT_FAR_MULTIPLIER = 0.35;
  private static readonly ZOOM_PERCENT_NEAR = 0.0025;
  private static readonly ZOOM_PERCENT_FAR = 0.02;
  private overridePivot: Vector3 | null = null;
  private panSensitivityBaseline: number | null = null;
  private angularSensitivityBaseline: number | null = null;

  public constructor(
    name: string,
    alpha: number,
    beta: number,
    radius: number,
    target: Vector3,
    scene?: Scene,
    setActiveOnSceneIfNoneActive?: boolean,
  ) {
    super(name, alpha, beta, radius, target, scene, setActiveOnSceneIfNoneActive);

    this.wheelDeltaPercentage = 0.01;
    this.pinchDeltaPercentage = 0.01;
    this.zoomToMouseLocation = true;
    this.enforceBetaLimits();
  }

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

    const up = this.upVector;
    const yawMatrix = Matrix.Identity();
    Quaternion.RotationAxis(up, alphaDelta).toRotationMatrix(yawMatrix);
    let rotatedPosition = Vector3.TransformCoordinates(pivotToPosition, yawMatrix);
    let rotatedTarget = Vector3.TransformCoordinates(pivotToTarget, yawMatrix);

    if (Math.abs(betaDelta) > PivotOrbitCamera.EPSILON) {
      // Use camera forward (target - position) to compute the correct right axis for pitching
      const forward = rotatedTarget.subtract(rotatedPosition);
      let right = Vector3.Cross(forward, up);
      if (right.lengthSquared() < PivotOrbitCamera.EPSILON) {
        // forward is parallel to up; derive a horizontal axis from the current yaw (alpha)
        const alphaAngle = this.alpha;
        const horizontal = new Vector3(Math.cos(alphaAngle), 0, Math.sin(alphaAngle));
        right = Vector3.Cross(horizontal, up);
        if (right.lengthSquared() < PivotOrbitCamera.EPSILON) {
          right = new Vector3(1, 0, 0);
        }
      }
      right.normalize();
      const pitchMatrix = Matrix.Identity();
      Quaternion.RotationAxis(right, -betaDelta).toRotationMatrix(pitchMatrix);
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

  public refreshSensitivityBaselines(): void {
    const pointerInput = this.getPointerInput();
    if (!pointerInput) {
      return;
    }
    this.panSensitivityBaseline = pointerInput.panningSensibility;
    // Keep both axes aligned; average in case a future input tweaks them independently.
    this.angularSensitivityBaseline = (pointerInput.angularSensibilityX + pointerInput.angularSensibilityY) * 0.5;
  }

  public override _checkInputs(): void {
    this.updateDynamicSensitivities();
    super._checkInputs();
  }

  private updateDynamicSensitivities(): void {
    const pointerInput = this.getPointerInput();
    if (!pointerInput) {
      return;
    }

    if (this.panSensitivityBaseline === null || this.angularSensitivityBaseline === null) {
      this.refreshSensitivityBaselines();
      if (this.panSensitivityBaseline === null || this.angularSensitivityBaseline === null) {
        return;
      }
    }

    const normalizedRadius = this.normalizeRadius(this.radius);
    const panNear = this.panSensitivityBaseline;
    const panFar = this.panSensitivityBaseline * PivotOrbitCamera.PAN_FAR_MULTIPLIER;
    pointerInput.panningSensibility = PivotOrbitCamera.lerp(panNear, panFar, normalizedRadius);

    const orbitNear = this.angularSensitivityBaseline;
    const orbitFar = this.angularSensitivityBaseline * PivotOrbitCamera.ORBIT_FAR_MULTIPLIER;
    const orbitSensitivity = PivotOrbitCamera.lerp(orbitNear, orbitFar, normalizedRadius);
    pointerInput.angularSensibilityX = orbitSensitivity;
    pointerInput.angularSensibilityY = orbitSensitivity;

    const zoomPercent = PivotOrbitCamera.lerp(
      PivotOrbitCamera.ZOOM_PERCENT_NEAR,
      PivotOrbitCamera.ZOOM_PERCENT_FAR,
      normalizedRadius,
    );
    this.wheelDeltaPercentage = zoomPercent;
    this.pinchDeltaPercentage = zoomPercent;
  }

  private normalizeRadius(radius: number): number {
    const min = PivotOrbitCamera.MIN_RADIUS_FOR_SENSITIVITY;
    const max = PivotOrbitCamera.MAX_RADIUS_FOR_SENSITIVITY;
    if (radius <= min) {
      return 0;
    }
    if (radius >= max) {
      return 1;
    }
    return (radius - min) / (max - min);
  }

  private getPointerInput(): ArcRotateCameraPointersInput | null {
    const pointerInput = this.inputs.attached["pointers"];
    if (pointerInput instanceof ArcRotateCameraPointersInput) {
      return pointerInput;
    }
    return null;
  }

  private static lerp(a: number, b: number, t: number): number {
    const clamped = Math.min(Math.max(t, 0), 1);
    return a + (b - a) * clamped;
  }
}
