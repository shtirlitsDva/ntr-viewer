import type {
  AxisCode,
  ComponentTag,
  Identifier,
  Kilograms,
  Millimeters,
  LoadCaseCode,
  MaterialCode,
  NominalDiameterCode,
  NormCode,
  PipelineCode,
  PointReference,
  ProfileTypeCode,
  ReferenceCode,
  ScheduleCode,
  SeriesCode,
} from "./types.ts";

export type IssueSeverity = "error" | "warning";

export interface ParseIssue {
  readonly severity: IssueSeverity;
  readonly message: string;
  readonly recordCode: string;
  readonly lineNumber: number;
  readonly details?: Record<string, unknown>;
}

export interface ElementBase {
  readonly kind: ElementKind;
  readonly material?: MaterialCode;
  readonly loadCases: readonly LoadCaseCode[];
  readonly description?: string;
  readonly reference?: ReferenceCode;
  readonly pipeline?: PipelineCode;
  readonly componentTag?: ComponentTag;
  readonly norm?: NormCode;
  readonly series?: SeriesCode;
  readonly schedule?: ScheduleCode;
  readonly rawFields: Record<string, string>;
}

export type ElementKind = "RO" | "BOG" | "TEE" | "ARM" | "PROF" | "RED";

export interface StraightPipe extends ElementBase {
  readonly kind: "RO";
  readonly start: PointReference;
  readonly end: PointReference;
  readonly nominalDiameter: NominalDiameterCode;
}

export interface Profile extends ElementBase {
  readonly kind: "PROF";
  readonly start: PointReference;
  readonly end: PointReference;
  readonly profileType: ProfileTypeCode;
  readonly axis?: AxisCode;
  readonly axisDirection?: PointReference;
}

export interface Bend extends ElementBase {
  readonly kind: "BOG";
  readonly start: PointReference;
  readonly end: PointReference;
  readonly tangent: PointReference;
  readonly nominalDiameter: NominalDiameterCode;
}

export interface Tee extends ElementBase {
  readonly kind: "TEE";
  readonly mainStart: PointReference;
  readonly mainEnd: PointReference;
  readonly branchStart: PointReference;
  readonly branchEnd: PointReference;
  readonly mainNominalDiameter: NominalDiameterCode;
  readonly branchNominalDiameter: NominalDiameterCode;
  readonly teeType?: string;
}

export interface Arm extends ElementBase {
  readonly kind: "ARM";
  readonly start: PointReference;
  readonly end: PointReference;
  readonly center: PointReference;
  readonly inletDiameter: NominalDiameterCode;
  readonly outletDiameter: NominalDiameterCode;
  readonly weight?: Kilograms;
}

export interface Reducer extends ElementBase {
  readonly kind: "RED";
  readonly start: PointReference;
  readonly end: PointReference;
  readonly inletDiameter: NominalDiameterCode;
  readonly outletDiameter: NominalDiameterCode;
}

export type Element = StraightPipe | Profile | Bend | Tee | Arm | Reducer;

export interface NtrMetadata {
  readonly projectName?: string;
  readonly specification?: string;
}

export interface NominalDiameterDefinition {
  readonly outsideDiameter: Millimeters;
  readonly thickness?: Millimeters;
}

export interface NtrDefinitions {
  readonly nominalDiameters: Record<NominalDiameterCode, NominalDiameterDefinition>;
}

export interface NtrFile {
  readonly id: Identifier;
  readonly metadata: NtrMetadata;
  readonly definitions: NtrDefinitions;
  readonly elements: readonly Element[];
  readonly issues: readonly ParseIssue[];
}
