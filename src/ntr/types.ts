export type RecordCode = "RO" | "BOG" | "TEE" | "ARM" | "PROF" | "RED";

export type Identifier = string & { readonly __brand: "Identifier" };
export type NodeIdentifier = Identifier & { readonly __kind: "Node" };
export type ElementIdentifier = Identifier & { readonly __kind: "Element" };

export type MaterialCode = string & { readonly __brand: "MaterialCode" };
export type NominalDiameterCode = string & {
  readonly __brand: "NominalDiameterCode";
};
export type LoadCaseCode = string & { readonly __brand: "LoadCaseCode" };
export type PipelineCode = string & { readonly __brand: "PipelineCode" };
export type ReferenceCode = string & { readonly __brand: "ReferenceCode" };
export type ComponentTag = string & { readonly __brand: "ComponentTag" };
export type ProfileTypeCode = string & { readonly __brand: "ProfileTypeCode" };
export type AxisCode = "Y" | "Z";
export type NormCode = string & { readonly __brand: "NormCode" };
export type ScheduleCode = string & { readonly __brand: "ScheduleCode" };
export type SeriesCode = string & { readonly __brand: "SeriesCode" };

export type Millimeters = number & { readonly __brand: "Millimeters" };
export type Degrees = number & { readonly __brand: "Degrees" };
export type Ratio = number & { readonly __brand: "Ratio" };
export type Kilograms = number & { readonly __brand: "Kilograms" };

export interface Vector3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export type CoordinatePoint = {
  readonly kind: "coordinate";
  readonly position: Vector3;
};

export type NamedPoint = {
  readonly kind: "named";
  readonly id: NodeIdentifier;
};

export type PointReference = CoordinatePoint | NamedPoint;

export const asIdentifier = (value: string): Identifier =>
  value.trim() as Identifier;

export const asNodeId = (value: string): NodeIdentifier =>
  asIdentifier(value) as NodeIdentifier;

export const asElementId = (value: string): ElementIdentifier =>
  asIdentifier(value) as ElementIdentifier;

export const asMaterialCode = (value: string): MaterialCode =>
  value.trim() as MaterialCode;

export const asNominalDiameterCode = (value: string): NominalDiameterCode =>
  value.trim() as NominalDiameterCode;

export const asLoadCaseCode = (value: string): LoadCaseCode =>
  value.trim() as LoadCaseCode;

export const asPipelineCode = (value: string): PipelineCode =>
  value.trim() as PipelineCode;

export const asReferenceCode = (value: string): ReferenceCode =>
  value.trim() as ReferenceCode;

export const asComponentTag = (value: string): ComponentTag =>
  value.trim() as ComponentTag;

export const asProfileTypeCode = (value: string): ProfileTypeCode =>
  value.trim() as ProfileTypeCode;

export const asNormCode = (value: string): NormCode =>
  value.trim() as NormCode;

export const asSeriesCode = (value: string): SeriesCode =>
  value.trim() as SeriesCode;

export const asScheduleCode = (value: string): ScheduleCode =>
  value.trim() as ScheduleCode;

export const asMillimeters = (value: number): Millimeters =>
  value as Millimeters;

export const asDegrees = (value: number): Degrees => value as Degrees;

export const asRatio = (value: number): Ratio => value as Ratio;

export const asKilograms = (value: number): Kilograms =>
  value as Kilograms;

export const createCoordinatePoint = (position: Vector3): CoordinatePoint => ({
  kind: "coordinate",
  position,
});

export const createNamedPoint = (id: string): NamedPoint => ({
  kind: "named",
  id: asNodeId(id),
});

export const asString = (value: string): string => value.trim();
