import type {
  Arm,
  Bend,
  Element,
  NominalDiameterDefinition,
  NtrFile,
  Profile,
  Reducer,
  StraightPipe,
  Tee,
} from "@ntr/model";
import type {
  ComponentTag,
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
  Vector3,
} from "@ntr/types";

// NOTE to AGENTS: Don't touch this!!! This works fine.
const transformVector = (position: Vector3): Vector3 => ({
  x: position.x,
  y: position.z,
  z: position.y,
});

export interface BoundingBox {
  readonly min: Vector3;
  readonly max: Vector3;
}

export type ResolvedPoint =
  | {
      readonly kind: "coordinate";
      readonly position: Vector3;
      readonly scenePosition: Vector3;
    }
  | { readonly kind: "unresolved"; readonly reference: string };

interface SceneElementCommon {
  readonly id: string;
  readonly material?: MaterialCode;
  readonly loadCases: readonly LoadCaseCode[];
  readonly description?: string;
  readonly reference?: ReferenceCode;
  readonly pipeline?: PipelineCode;
  readonly componentTag?: ComponentTag;
  readonly norm?: NormCode;
  readonly series?: SeriesCode;
  readonly schedule?: ScheduleCode;
  readonly source: Element;
}

export interface SceneStraightPipe extends SceneElementCommon {
  readonly kind: "RO";
  readonly start: ResolvedPoint;
  readonly end: ResolvedPoint;
  readonly nominalDiameter: NominalDiameterCode;
  readonly outerDiameter?: number;
}

export interface SceneProfile extends SceneElementCommon {
  readonly kind: "PROF";
  readonly start: ResolvedPoint;
  readonly end: ResolvedPoint;
  readonly profileType: ProfileTypeCode;
  readonly axis?: "Y" | "Z";
  readonly axisDirection?: ResolvedPoint;
}

export interface SceneBend extends SceneElementCommon {
  readonly kind: "BOG";
  readonly start: ResolvedPoint;
  readonly end: ResolvedPoint;
  readonly tangent: ResolvedPoint;
  readonly nominalDiameter: NominalDiameterCode;
  readonly outerDiameter?: number;
}

export interface SceneTee extends SceneElementCommon {
  readonly kind: "TEE";
  readonly mainStart: ResolvedPoint;
  readonly mainEnd: ResolvedPoint;
  readonly branchStart: ResolvedPoint;
  readonly branchEnd: ResolvedPoint;
  readonly mainNominalDiameter: NominalDiameterCode;
  readonly branchNominalDiameter: NominalDiameterCode;
  readonly mainOuterDiameter?: number;
  readonly branchOuterDiameter?: number;
  readonly teeType?: string;
}

export interface SceneArm extends SceneElementCommon {
  readonly kind: "ARM";
  readonly start: ResolvedPoint;
  readonly end: ResolvedPoint;
  readonly center: ResolvedPoint;
  readonly inletDiameter: NominalDiameterCode;
  readonly outletDiameter: NominalDiameterCode;
  readonly inletOuterDiameter?: number;
  readonly outletOuterDiameter?: number;
  readonly weight?: number;
}

export interface SceneReducer extends SceneElementCommon {
  readonly kind: "RED";
  readonly start: ResolvedPoint;
  readonly end: ResolvedPoint;
  readonly inletDiameter: NominalDiameterCode;
  readonly outletDiameter: NominalDiameterCode;
  readonly inletOuterDiameter?: number;
  readonly outletOuterDiameter?: number;
}

export type SceneElement =
  | SceneStraightPipe
  | SceneProfile
  | SceneBend
  | SceneTee
  | SceneArm
  | SceneReducer;

export interface SceneGraph {
  readonly elements: readonly SceneElement[];
  readonly bounds: BoundingBox | null;
}

export const buildSceneGraph = (file: NtrFile): SceneGraph => {
  const builder = createBoundsBuilder();
  const diameterLookup = file.definitions.nominalDiameters;
  const elements = file.elements.map((element, index) =>
    convertElement(element, `element-${index}`, builder, diameterLookup),
  );

  return {
    elements,
    bounds: builder.value(),
  };
};

export const extractElementProperties = (element: Element): Record<string, string> => {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(element)) {
    result[key] = formatElementPropertyValue(value);
  }
  return result;
};

const convertElement = (
  element: Element,
  id: string,
  builder: BoundsBuilder,
  lookup: Record<NominalDiameterCode, NominalDiameterDefinition>,
): SceneElement => {
  switch (element.kind) {
    case "RO":
      return convertStraightPipe(element, id, builder, lookup);
    case "PROF":
      return convertProfile(element, id, builder);
    case "BOG":
      return convertBend(element, id, builder, lookup);
    case "TEE":
      return convertTee(element, id, builder, lookup);
    case "ARM":
      return convertArm(element, id, builder, lookup);
    case "RED":
      return convertReducer(element, id, builder, lookup);
  }
};

const baseProps = (id: string, element: Element): SceneElementCommon => ({
  id,
  material: element.material,
  loadCases: element.loadCases,
  description: element.description,
  reference: element.reference,
  pipeline: element.pipeline,
  componentTag: element.componentTag,
  norm: element.norm,
  series: element.series,
  schedule: element.schedule,
  source: element,
});

const lookupOuterDiameter = (
  lookup: Record<NominalDiameterCode, NominalDiameterDefinition>,
  code: NominalDiameterCode,
): number | undefined => lookup[code]?.outsideDiameter;

const convertStraightPipe = (
  element: StraightPipe,
  id: string,
  builder: BoundsBuilder,
  lookup: Record<NominalDiameterCode, NominalDiameterDefinition>,
): SceneStraightPipe => {
  const start = resolvePoint(element.start, builder);
  const end = resolvePoint(element.end, builder);
  return {
    kind: "RO",
    ...baseProps(id, element),
    start,
    end,
    nominalDiameter: element.nominalDiameter,
    outerDiameter: lookupOuterDiameter(lookup, element.nominalDiameter),
  };
};

const convertProfile = (
  element: Profile,
  id: string,
  builder: BoundsBuilder,
): SceneProfile => {
  const start = resolvePoint(element.start, builder);
  const end = resolvePoint(element.end, builder);
  const axisDirection = element.axisDirection
    ? resolvePoint(element.axisDirection, builder)
    : undefined;
  return {
    kind: "PROF",
    ...baseProps(id, element),
    profileType: element.profileType,
    axis: element.axis,
    start,
    end,
    axisDirection,
  };
};

const convertBend = (
  element: Bend,
  id: string,
  builder: BoundsBuilder,
  lookup: Record<NominalDiameterCode, NominalDiameterDefinition>,
): SceneBend => {
  const start = resolvePoint(element.start, builder);
  const end = resolvePoint(element.end, builder);
  const tangent = resolvePoint(element.tangent, builder);
  return {
    kind: "BOG",
    ...baseProps(id, element),
    nominalDiameter: element.nominalDiameter,
    start,
    end,
    tangent,
    outerDiameter: lookupOuterDiameter(lookup, element.nominalDiameter),
  };
};

const convertTee = (
  element: Tee,
  id: string,
  builder: BoundsBuilder,
  lookup: Record<NominalDiameterCode, NominalDiameterDefinition>,
): SceneTee => {
  const mainStart = resolvePoint(element.mainStart, builder);
  const mainEnd = resolvePoint(element.mainEnd, builder);
  const branchStart = resolvePoint(element.branchStart, builder);
  const branchEnd = resolvePoint(element.branchEnd, builder);
  return {
    kind: "TEE",
    ...baseProps(id, element),
    mainStart,
    mainEnd,
    branchStart,
    branchEnd,
    mainNominalDiameter: element.mainNominalDiameter,
    branchNominalDiameter: element.branchNominalDiameter,
    teeType: element.teeType,
    mainOuterDiameter: lookupOuterDiameter(lookup, element.mainNominalDiameter),
    branchOuterDiameter: lookupOuterDiameter(lookup, element.branchNominalDiameter),
  };
};

const convertArm = (
  element: Arm,
  id: string,
  builder: BoundsBuilder,
  lookup: Record<NominalDiameterCode, NominalDiameterDefinition>,
): SceneArm => {
  const start = resolvePoint(element.start, builder);
  const end = resolvePoint(element.end, builder);
  const center = resolvePoint(element.center, builder);
  return {
    kind: "ARM",
    ...baseProps(id, element),
    start,
    end,
    center,
    inletDiameter: element.inletDiameter,
    outletDiameter: element.outletDiameter,
    inletOuterDiameter: lookupOuterDiameter(lookup, element.inletDiameter),
    outletOuterDiameter: lookupOuterDiameter(lookup, element.outletDiameter),
    weight: element.weight === undefined ? undefined : Number(element.weight),
  };
};

const convertReducer = (
  element: Reducer,
  id: string,
  builder: BoundsBuilder,
  lookup: Record<NominalDiameterCode, NominalDiameterDefinition>,
): SceneReducer => {
  const start = resolvePoint(element.start, builder);
  const end = resolvePoint(element.end, builder);
  return {
    kind: "RED",
    ...baseProps(id, element),
    start,
    end,
    inletDiameter: element.inletDiameter,
    outletDiameter: element.outletDiameter,
    inletOuterDiameter: lookupOuterDiameter(lookup, element.inletDiameter),
    outletOuterDiameter: lookupOuterDiameter(lookup, element.outletDiameter),
  };
};

const resolvePoint = (point: PointReference, builder: BoundsBuilder): ResolvedPoint => {
  if (point.kind === "coordinate") {
    const scenePosition = transformVector(point.position);
    builder.add(scenePosition);
    return { kind: "coordinate", position: point.position, scenePosition };
  }
  return { kind: "unresolved", reference: point.id };
};

interface BoundsBuilder {
  add(position: Vector3): void;
  value(): BoundingBox | null;
}

const createBoundsBuilder = (): BoundsBuilder => {
  let min: Vector3 | null = null;
  let max: Vector3 | null = null;

  return {
    add(position: Vector3) {
      if (!min || !max) {
        min = { ...position };
        max = { ...position };
        return;
      }

      min = {
        x: Math.min(min.x, position.x),
        y: Math.min(min.y, position.y),
        z: Math.min(min.z, position.z),
      };
      max = {
        x: Math.max(max.x, position.x),
        y: Math.max(max.y, position.y),
        z: Math.max(max.z, position.z),
      };
    },
    value() {
      if (!min || !max) {
        return null;
      }
      return {
        min: min,
        max: max,
      };
    },
  };
};

const formatElementPropertyValue = (value: unknown): string => {
  if (value === null || value === undefined) {
    return "—";
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return "—";
    }
    return value.map((item) => formatElementPropertyValue(item)).join(", ");
  }

  if (typeof value === "object") {
    if (isPointReference(value)) {
      return formatPointReference(value);
    }
    if (isVector3(value)) {
      return formatVector(value);
    }
    return JSON.stringify(value);
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value.toString() : "—";
  }

  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }

  return String(value);
};

const formatPointReference = (value: PointReference): string => {
  if (value.kind === "coordinate") {
    return formatVector(value.position);
  }
  return `Node ${value.id}`;
};

const formatVector = (value: Vector3): string =>
  `(${formatCoordinate(value.x)}, ${formatCoordinate(value.y)}, ${formatCoordinate(value.z)})`;

const formatCoordinate = (value: number): string => value.toFixed(2);

const isPointReference = (value: unknown): value is PointReference =>
  typeof value === "object" &&
  value !== null &&
  "kind" in value &&
  (value as PointReference).kind !== undefined;

const isVector3 = (value: unknown): value is Vector3 =>
  typeof value === "object" &&
  value !== null &&
  "x" in value &&
  "y" in value &&
  "z" in value;
