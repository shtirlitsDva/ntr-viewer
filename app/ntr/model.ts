export type UnitLength = "MM" | "CM" | "M" | "IN" | "FT";

export interface Vector3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface NominalDiameter {
  readonly name: string;
  readonly outsideDiameter: number;
  readonly wallThickness?: number;
  readonly insulationType?: string;
}

export interface NtrMetadata {
  readonly units: UnitLength;
  readonly projectName?: string;
  readonly code?: string;
}

export interface ComponentBase {
  readonly id: string;
  readonly line: number;
  readonly material?: string;
  readonly loadCase?: string;
  readonly group?: string;
  readonly label?: string;
}

export interface StraightPipeComponent extends ComponentBase {
  readonly kind: "straight";
  readonly start: Vector3;
  readonly end: Vector3;
  readonly nominal: NominalDiameter;
}

export interface ReducerComponent extends ComponentBase {
  readonly kind: "reducer";
  readonly start: Vector3;
  readonly end: Vector3;
  readonly nominalStart: NominalDiameter;
  readonly nominalEnd: NominalDiameter;
}

export interface BendComponent extends ComponentBase {
  readonly kind: "bend";
  readonly start: Vector3;
  readonly control: Vector3;
  readonly end: Vector3;
  readonly nominal: NominalDiameter;
}

export interface TeeComponent extends ComponentBase {
  readonly kind: "tee";
  readonly runStart: Vector3;
  readonly runEnd: Vector3;
  readonly branchStart: Vector3;
  readonly branchEnd: Vector3;
  readonly runNominal: NominalDiameter;
  readonly branchNominal: NominalDiameter;
}

export type NtrComponent =
  | StraightPipeComponent
  | ReducerComponent
  | BendComponent
  | TeeComponent;

export type IssueSeverity = "warning" | "error";

export interface NtrIssue {
  readonly line: number;
  readonly message: string;
  readonly raw: string;
  readonly severity: IssueSeverity;
}

export interface NtrDocument {
  readonly metadata: NtrMetadata;
  readonly components: readonly NtrComponent[];
  readonly issues: readonly NtrIssue[];
}
