import { err, ok, type Result } from "@shared/result";

import { lexNtr, type RawField, type RawRecord } from "./lexer.ts";
import type { Element, NtrFile, ParseIssue } from "./model.ts";
import {
  asComponentTag,
  asKilograms,
  asLoadCaseCode,
  asMaterialCode,
  asNominalDiameterCode,
  asNormCode,
  asPipelineCode,
  asProfileTypeCode,
  asReferenceCode,
  asScheduleCode,
  asSeriesCode,
  asString,
  createCoordinatePoint,
  createNamedPoint,
  type Kilograms,
  type LoadCaseCode,
  type PointReference,
  type Vector3,
} from "./types.ts";
import { validateNtrFile } from "./validation.ts";

export interface ParseResult {
  readonly file: NtrFile;
  readonly issues: readonly ParseIssue[];
}

export const parseNtr = (
  id: string,
  source: string,
): Result<ParseResult, ParseIssue[]> => {
  const { records, issues } = lexNtr(source);
  const elements: Element[] = [];
  const collectedIssues: ParseIssue[] = [...issues];

  for (const record of records) {
    const result = parseRecord(record);
    if (result.ok) {
      elements.push(result.value);
    } else {
      collectedIssues.push(result.error);
    }
  }

  if (collectedIssues.some((issue) => issue.severity === "error")) {
    return err(collectedIssues);
  }

  const validation = validateNtrFile({
    id,
    metadata: {},
    elements,
    issues: collectedIssues,
  });

  if (!validation.ok) {
    const validationIssues = validation.error.issues.map((issue) =>
      createIssue("VALIDATION", 0, issue.message),
    );
    return err([...collectedIssues, ...validationIssues]);
  }

  return ok({
    file: validation.value,
    issues: collectedIssues,
  });
};

const parseRecord = (record: RawRecord): Result<Element, ParseIssue> => {
  switch (record.code) {
    case "RO":
      return parseStraightPipe(record);
    case "BOG":
      return parseBend(record);
    case "TEE":
      return parseTee(record);
    case "ARM":
      return parseArm(record);
    case "PROF":
      return parseProfile(record);
    case "RED":
      return parseReducer(record);
    default:
      return err(
        createIssue(
          record.code,
          record.lineNumber,
          `Unsupported record code "${record.code}"`,
          "warning",
        ),
      );
  }
};

type FieldMap = Map<string, RawField>;

const parseStraightPipe = (record: RawRecord): Result<Element, ParseIssue> => {
  const map = createFieldMap(record);

  const startResult = requirePoint(record, map, "P1");
  if (!startResult.ok) return startResult;
  const endResult = requirePoint(record, map, "P2");
  if (!endResult.ok) return endResult;
  const dnResult = requireField(record, map, "DN");
  if (!dnResult.ok) return dnResult;

  return ok({
    kind: "RO",
    start: startResult.value,
    end: endResult.value,
    nominalDiameter: asNominalDiameterCode(dnResult.value.value),
    material: optionalMapped(map, "MAT", asMaterialCode),
    loadCases: parseLoadCases(map.get("LAST")),
    description: optionalString(map, "TEXT"),
    reference: optionalMapped(map, "REF", asReferenceCode),
    pipeline: optionalMapped(map, "LTG", asPipelineCode),
    componentTag: optionalMapped(map, "BTK", asComponentTag),
    norm: optionalMapped(map, "NORM", asNormCode),
    series: optionalMapped(map, "SERIES", asSeriesCode),
    schedule: optionalMapped(map, "SCHED", asScheduleCode),
  });
};

const parseBend = (record: RawRecord): Result<Element, ParseIssue> => {
  const map = createFieldMap(record);

  const startResult = requirePoint(record, map, "P1");
  if (!startResult.ok) return startResult;
  const endResult = requirePoint(record, map, "P2");
  if (!endResult.ok) return endResult;
  const tangentResult = requirePoint(record, map, "PT");
  if (!tangentResult.ok) return tangentResult;
  const dnResult = requireField(record, map, "DN");
  if (!dnResult.ok) return dnResult;

  return ok({
    kind: "BOG",
    start: startResult.value,
    end: endResult.value,
    tangent: tangentResult.value,
    nominalDiameter: asNominalDiameterCode(dnResult.value.value),
    material: optionalMapped(map, "MAT", asMaterialCode),
    loadCases: parseLoadCases(map.get("LAST")),
    description: optionalString(map, "TEXT"),
    reference: optionalMapped(map, "REF", asReferenceCode),
    pipeline: optionalMapped(map, "LTG", asPipelineCode),
    componentTag: optionalMapped(map, "BTK", asComponentTag),
    norm: optionalMapped(map, "NORM", asNormCode),
    series: optionalMapped(map, "SERIES", asSeriesCode),
    schedule: optionalMapped(map, "SCHED", asScheduleCode),
  });
};

const parseTee = (record: RawRecord): Result<Element, ParseIssue> => {
  const map = createFieldMap(record);

  const mainStart = requirePoint(record, map, "PH1");
  if (!mainStart.ok) return mainStart;
  const mainEnd = requirePoint(record, map, "PH2");
  if (!mainEnd.ok) return mainEnd;
  const branchStart = requirePoint(record, map, "PA1");
  if (!branchStart.ok) return branchStart;
  const branchEnd = requirePoint(record, map, "PA2");
  if (!branchEnd.ok) return branchEnd;
  const mainDn = requireField(record, map, "DNH");
  if (!mainDn.ok) return mainDn;
  const branchDn = requireField(record, map, "DNA");
  if (!branchDn.ok) return branchDn;

  return ok({
    kind: "TEE",
    mainStart: mainStart.value,
    mainEnd: mainEnd.value,
    branchStart: branchStart.value,
    branchEnd: branchEnd.value,
    mainNominalDiameter: asNominalDiameterCode(mainDn.value.value),
    branchNominalDiameter: asNominalDiameterCode(branchDn.value.value),
    material: optionalMapped(map, "MAT", asMaterialCode),
    loadCases: parseLoadCases(map.get("LAST")),
    description: optionalString(map, "TEXT"),
    reference: optionalMapped(map, "REF", asReferenceCode),
    pipeline: optionalMapped(map, "LTG", asPipelineCode),
    componentTag: optionalMapped(map, "BTK", asComponentTag),
    norm: optionalMapped(map, "NORM", asNormCode),
    series: optionalMapped(map, "SERIES", asSeriesCode),
    schedule: optionalMapped(map, "SCHED", asScheduleCode),
    teeType: optionalString(map, "TYP"),
  });
};

const parseArm = (record: RawRecord): Result<Element, ParseIssue> => {
  const map = createFieldMap(record);

  const start = requirePoint(record, map, "P1");
  if (!start.ok) return start;
  const end = requirePoint(record, map, "P2");
  if (!end.ok) return end;
  const center = requirePoint(record, map, "PM");
  if (!center.ok) return center;
  const dn1 = requireField(record, map, "DN1");
  if (!dn1.ok) return dn1;
  const dn2 = requireField(record, map, "DN2");
  if (!dn2.ok) return dn2;

  const weightResult = parseWeight(record, map.get("GEW"));
  if (!weightResult.ok) return weightResult;

  return ok({
    kind: "ARM",
    start: start.value,
    end: end.value,
    center: center.value,
    inletDiameter: asNominalDiameterCode(dn1.value.value),
    outletDiameter: asNominalDiameterCode(dn2.value.value),
    material: optionalMapped(map, "MAT", asMaterialCode),
    loadCases: parseLoadCases(map.get("LAST")),
    description: optionalString(map, "TEXT"),
    reference: optionalMapped(map, "REF", asReferenceCode),
    pipeline: optionalMapped(map, "LTG", asPipelineCode),
    componentTag: optionalMapped(map, "BTK", asComponentTag),
    weight: weightResult.value ?? undefined,
  });
};

const parseProfile = (record: RawRecord): Result<Element, ParseIssue> => {
  const map = createFieldMap(record);

  const start = requirePoint(record, map, "P1");
  if (!start.ok) return start;
  const end = requirePoint(record, map, "P2");
  if (!end.ok) return end;
  const typ = requireField(record, map, "TYP");
  if (!typ.ok) return typ;

  const axis = optionalAxis(record, map.get("ACHSE"));
  if (!axis.ok) return axis;
  const axisDirection = optionalPoint(record, map, "RI");
  if (!axisDirection.ok) return axisDirection;

  return ok({
    kind: "PROF",
    start: start.value,
    end: end.value,
    profileType: asProfileTypeCode(typ.value.value),
    material: optionalMapped(map, "MAT", asMaterialCode),
    loadCases: parseLoadCases(map.get("LAST")),
    description: optionalString(map, "TEXT"),
    reference: optionalMapped(map, "REF", asReferenceCode),
    pipeline: optionalMapped(map, "LTG", asPipelineCode),
    componentTag: optionalMapped(map, "BTK", asComponentTag),
    norm: optionalMapped(map, "NORM", asNormCode),
    axis: axis.value ?? undefined,
    axisDirection: axisDirection.value,
  });
};

const parseReducer = (record: RawRecord): Result<Element, ParseIssue> => {
  const map = createFieldMap(record);

  const start = requirePoint(record, map, "P1");
  if (!start.ok) return start;
  const end = requirePoint(record, map, "P2");
  if (!end.ok) return end;
  const dn1 = requireField(record, map, "DN1");
  if (!dn1.ok) return dn1;
  const dn2 = requireField(record, map, "DN2");
  if (!dn2.ok) return dn2;

  return ok({
    kind: "RED",
    start: start.value,
    end: end.value,
    inletDiameter: asNominalDiameterCode(dn1.value.value),
    outletDiameter: asNominalDiameterCode(dn2.value.value),
    material: optionalMapped(map, "MAT", asMaterialCode),
    loadCases: parseLoadCases(map.get("LAST")),
    description: optionalString(map, "TEXT"),
    reference: optionalMapped(map, "REF", asReferenceCode),
    pipeline: optionalMapped(map, "LTG", asPipelineCode),
    componentTag: optionalMapped(map, "BTK", asComponentTag),
    norm: optionalMapped(map, "NORM", asNormCode),
    series: optionalMapped(map, "SERIES", asSeriesCode),
    schedule: optionalMapped(map, "SCHED", asScheduleCode),
  });
};

const createFieldMap = (record: RawRecord): FieldMap => {
  const map = new Map<string, RawField>();
  for (const field of record.fields) {
    map.set(field.key, field);
  }
  return map;
};

const requireField = (
  record: RawRecord,
  map: FieldMap,
  key: string,
): Result<RawField, ParseIssue> => {
  const field = map.get(key);
  if (!field) {
    return err(
      createIssue(
        record.code,
        record.lineNumber,
        `Missing required field "${key}"`,
      ),
    );
  }
  return ok(field);
};

const requirePoint = (
  record: RawRecord,
  map: FieldMap,
  key: string,
): Result<PointReference, ParseIssue> => {
  const field = requireField(record, map, key);
  if (!field.ok) {
    return field;
  }
  return parsePointField(record, key, field.value);
};

const optionalPoint = (
  record: RawRecord,
  map: FieldMap,
  key: string,
): Result<PointReference | undefined, ParseIssue> => {
  const field = map.get(key);
  if (!field) {
    return ok(undefined);
  }
  return parsePointField(record, key, field);
};

const parsePointField = (
  record: RawRecord,
  key: string,
  field: RawField,
): Result<PointReference, ParseIssue> => {
  if (field.quoted) {
    const coordinates = parseCoordinate(field.value);
    if (!coordinates) {
      return err(
        createIssue(
          record.code,
          field.lineNumber,
          `Invalid coordinate for field "${key}"`,
        ),
      );
    }
    return ok(createCoordinatePoint(coordinates));
  }

  if (!field.value.trim()) {
    return err(
      createIssue(record.code, field.lineNumber, `Missing coordinate value for "${key}"`),
    );
  }

  return ok(createNamedPoint(field.value));
};

const parseCoordinate = (value: string): Vector3 | undefined => {
  const parts = value.split(",").map((part) => part.trim());
  if (parts.length !== 3) {
    return undefined;
  }
  const [x, y, z] = parts.map((part) => Number.parseFloat(part));
  if (Number.isNaN(x) || Number.isNaN(y) || Number.isNaN(z)) {
    return undefined;
  }
  return { x, y, z };
};

const parseLoadCases = (field?: RawField): LoadCaseCode[] => {
  if (!field) {
    return [];
  }
  return field.value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .map((entry) => asLoadCaseCode(entry));
};

const parseWeight = (
  record: RawRecord,
  field?: RawField,
): Result<Kilograms | undefined, ParseIssue> => {
  if (!field) {
    return ok(undefined);
  }
  const numeric = Number.parseFloat(field.value);
  if (Number.isNaN(numeric)) {
    return err(
      createIssue(
        record.code,
        field.lineNumber,
        `Invalid weight value "${field.value}"`,
      ),
    );
  }
  return ok(asKilograms(numeric));
};

const optionalAxis = (
  record: RawRecord,
  field?: RawField,
): Result<"Y" | "Z" | undefined, ParseIssue> => {
  if (!field) {
    return ok(undefined);
  }
  const value = field.value.trim().toUpperCase();
  if (value === "Y" || value === "Z") {
    return ok(value);
  }
  return err(
    createIssue(
      record.code,
      field.lineNumber,
      `Invalid ACHSE value "${field.value}" (expected Y or Z)`,
    ),
  );
};

const optionalMapped = <T>(
  map: FieldMap,
  key: string,
  mapper: (value: string) => T,
): T | undefined => {
  const field = map.get(key);
  if (!field) {
    return undefined;
  }
  return mapper(field.value);
};

const optionalString = (map: FieldMap, key: string): string | undefined => {
  const field = map.get(key);
  return field ? asString(field.value) : undefined;
};

const createIssue = (
  code: string,
  lineNumber: number,
  message: string,
  severity: ParseIssue["severity"] = "error",
): ParseIssue => ({
  severity,
  message,
  recordCode: code,
  lineNumber,
});
