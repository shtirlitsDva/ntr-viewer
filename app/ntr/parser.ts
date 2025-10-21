import { BendComponent, ComponentBase, NtrComponent, NtrDocument, NtrIssue, NtrMetadata, NominalDiameter, ReducerComponent, StraightPipeComponent, TeeComponent, UnitLength, Vector3 } from "./model";
import { Result, ok } from "./result";

export interface FatalParseError {
  readonly message: string;
  readonly line?: number;
}

interface ParsedRecord {
  readonly type: string;
  readonly line: number;
  readonly raw: string;
  readonly fields: Map<string, readonly string[]>;
}

interface ParserContext {
  readonly dns: Map<string, NominalDiameter>;
  readonly issues: NtrIssue[];
  readonly components: NtrComponent[];
  metadata: NtrMetadata;
}

const defaultMetadata: NtrMetadata = {
  units: "MM"
};

export const parseNtr = (text: string): Result<NtrDocument, FatalParseError> => {
  const lines = text.split(/\r?\n/);
  const context: ParserContext = {
    dns: new Map<string, NominalDiameter>(),
    issues: [],
    components: [],
    metadata: defaultMetadata
  };

  for (let index = 0; index < lines.length; index += 1) {
    const lineNumber = index + 1;
    const rawLine = lines[index];
    const trimmed = rawLine.trim();

    if (trimmed.length === 0 || trimmed.startsWith("C")) {
      continue;
    }

    const record = parseRecord(trimmed, lineNumber, rawLine);

    if (!record) {
      context.issues.push({
        line: lineNumber,
        message: "Unable to understand record layout",
        raw: rawLine,
        severity: "error"
      });
      continue;
    }

    switch (record.type) {
      case "GEN":
        mutateMetadata(record, context);
        break;
      case "AUFT":
        setProjectName(record, context);
        break;
      case "DN":
        registerDiameter(record, context);
        break;
      case "RO":
        handleStraight(record, context);
        break;
      case "RED":
        handleReducer(record, context);
        break;
      case "BOG":
        handleBend(record, context);
        break;
      case "TEE":
        handleTee(record, context);
        break;
      default:
        context.issues.push({
          line: lineNumber,
          message: `Unsupported record type \"${record.type}\" ignored`,
          raw: rawLine,
          severity: "warning"
        });
    }
  }

  return ok({
    metadata: context.metadata,
    components: context.components,
    issues: context.issues
  });
};

const parseRecord = (trimmedLine: string, lineNumber: number, rawLine: string): ParsedRecord | null => {
  const [typeToken, ...rest] = trimmedLine.split(/\s+/);
  if (!typeToken) {
    return null;
  }

  const restText = trimmedLine.slice(typeToken.length).trim();
  const fields = extractKeyValuePairs(restText);

  return {
    type: typeToken.toUpperCase(),
    line: lineNumber,
    raw: rawLine,
    fields
  };
};

const extractKeyValuePairs = (text: string): Map<string, readonly string[]> => {
  const map = new Map<string, readonly string[]>();
  const regex = /([A-Z0-9_]+)\s*=\s*(?:'([^']*)'|([^'\s]+))/gi;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    const key = match[1].toUpperCase();
    const value = (match[2] ?? match[3] ?? "").trim();
    const existing = map.get(key);
    if (existing) {
      map.set(key, [...existing, value]);
    } else {
      map.set(key, [value]);
    }
  }

  return map;
};

const mutateMetadata = (record: ParsedRecord, context: ParserContext) => {
  const unitsToken = firstValue(record.fields, "UNITKT");
  const code = firstValue(record.fields, "CODE") ?? context.metadata.code;
  const units = normalizeUnits(unitsToken);

  if (!units) {
    if (unitsToken) {
      context.issues.push({
        line: record.line,
        message: `Unknown UNITKT value \"${unitsToken}\"; defaulting to millimeters`,
        raw: record.raw,
        severity: "warning"
      });
    }
    context.metadata = { ...context.metadata, code };
    return;
  }

  context.metadata = {
    units,
    code,
    projectName: context.metadata.projectName
  };
};

const setProjectName = (record: ParsedRecord, context: ParserContext) => {
  const project = firstValue(record.fields, "TEXT");
  if (!project) {
    context.issues.push({
      line: record.line,
      message: "Project record missing TEXT attribute",
      raw: record.raw,
      severity: "warning"
    });
    return;
  }

  context.metadata = {
    ...context.metadata,
    projectName: project
  };
};

const registerDiameter = (record: ParsedRecord, context: ParserContext) => {
  const name = firstValue(record.fields, "NAME");
  const outside = parseNumberField(record, "DA");
  const thickness = parseOptionalNumberField(record, "S");
  const insulation = firstValue(record.fields, "ISOTYP");

  if (!name || outside === null) {
    context.issues.push({
      line: record.line,
      message: "DN record missing required fields",
      raw: record.raw,
      severity: "error"
    });
    return;
  }

  context.dns.set(name, {
    name,
    outsideDiameter: outside,
    wallThickness: thickness ?? undefined,
    insulationType: insulation ?? undefined
  });
};

const handleStraight = (record: ParsedRecord, context: ParserContext) => {
  const start = parseVectorField(record, "P1", context);
  const end = parseVectorField(record, "P2", context);
  const nominal = resolveNominal(record, "DN", context);

  if (!start || !end || !nominal) {
    return;
  }

  const component: StraightPipeComponent = {
    ...deriveComponentBase(record),
    kind: "straight",
    start,
    end,
    nominal
  };

  context.components.push(component);
};

const handleReducer = (record: ParsedRecord, context: ParserContext) => {
  const start = parseVectorField(record, "P1", context);
  const end = parseVectorField(record, "P2", context);
  const nominalStart = resolveNominal(record, "DN1", context);
  const nominalEnd = resolveNominal(record, "DN2", context);

  if (!start || !end || !nominalStart || !nominalEnd) {
    return;
  }

  const component: ReducerComponent = {
    ...deriveComponentBase(record),
    kind: "reducer",
    start,
    end,
    nominalStart,
    nominalEnd
  };

  context.components.push(component);
};

const handleBend = (record: ParsedRecord, context: ParserContext) => {
  const start = parseVectorField(record, "P1", context);
  const end = parseVectorField(record, "P2", context);
  const control = parseVectorField(record, "PT", context);
  const nominal = resolveNominal(record, "DN", context);

  if (!start || !end || !control || !nominal) {
    return;
  }

  const component: BendComponent = {
    ...deriveComponentBase(record),
    kind: "bend",
    start,
    control,
    end,
    nominal
  };

  context.components.push(component);
};

const handleTee = (record: ParsedRecord, context: ParserContext) => {
  const runStart = parseVectorField(record, "PH1", context);
  const runEnd = parseVectorField(record, "PH2", context);
  const branchStart = parseVectorField(record, "PA1", context);
  const branchEnd = parseVectorField(record, "PA2", context);
  const runNominal = resolveNominal(record, "DNH", context);
  const branchNominal = resolveNominal(record, "DNA", context);

  if (!runStart || !runEnd || !branchStart || !branchEnd || !runNominal || !branchNominal) {
    return;
  }

  const component: TeeComponent = {
    ...deriveComponentBase(record),
    kind: "tee",
    runStart,
    runEnd,
    branchStart,
    branchEnd,
    runNominal,
    branchNominal
  };

  context.components.push(component);
};

const deriveComponentBase = (record: ParsedRecord): ComponentBase => ({
  id: firstValue(record.fields, "REF") ?? `${record.type}_${record.line}`,
  line: record.line,
  material: firstValue(record.fields, "MAT") ?? undefined,
  loadCase: firstValue(record.fields, "LAST") ?? undefined,
  group: firstValue(record.fields, "LTG") ?? undefined,
  label: firstValue(record.fields, "TEXT") ?? undefined
});

const parseVectorField = (record: ParsedRecord, key: string, context: ParserContext): Vector3 | null => {
  const raw = firstValue(record.fields, key);
  if (!raw) {
    context.issues.push({
      line: record.line,
      message: `${record.type} missing ${key} coordinate`,
      raw: record.raw,
      severity: "error"
    });
    return null;
  }

  const parts = raw.split(",").map((segment) => segment.trim());
  if (parts.length !== 3) {
    context.issues.push({
      line: record.line,
      message: `${key} must contain three comma separated numbers`,
      raw: record.raw,
      severity: "error"
    });
    return null;
  }

  const [xText, yText, zText] = parts;
  const x = Number(xText);
  const y = Number(yText);
  const z = Number(zText);

  if (Number.isNaN(x) || Number.isNaN(y) || Number.isNaN(z)) {
    context.issues.push({
      line: record.line,
      message: `${key} contains non numeric values`,
      raw: record.raw,
      severity: "error"
    });
    return null;
  }

  return { x, y, z };
};

const resolveNominal = (
  record: ParsedRecord,
  key: string,
  context: ParserContext
): NominalDiameter | null => {
  const name = firstValue(record.fields, key);
  if (!name) {
    context.issues.push({
      line: record.line,
      message: `${record.type} missing ${key} nominal reference`,
      raw: record.raw,
      severity: "error"
    });
    return null;
  }

  const nominal = context.dns.get(name);
  if (!nominal) {
    context.issues.push({
      line: record.line,
      message: `Unknown nominal size ${name}`,
      raw: record.raw,
      severity: "error"
    });
    return null;
  }

  return nominal;
};

const parseNumberField = (record: ParsedRecord, key: string): number | null => {
  const token = firstValue(record.fields, key);
  if (!token) {
    return null;
  }

  const value = Number(token);
  return Number.isNaN(value) ? null : value;
};

const parseOptionalNumberField = (record: ParsedRecord, key: string): number | null => {
  const hasKey = record.fields.has(key);
  if (!hasKey) {
    return null;
  }
  return parseNumberField(record, key);
};

const normalizeUnits = (token: string | undefined): UnitLength | null => {
  if (!token) {
    return null;
  }

  switch (token.toUpperCase()) {
    case "MM":
    case "M":
    case "CM":
    case "IN":
    case "FT":
      return token.toUpperCase() as UnitLength;
    default:
      return null;
  }
};

const firstValue = (fields: Map<string, readonly string[]>, key: string): string | undefined => {
  const values = fields.get(key);
  return values && values.length > 0 ? values[0] : undefined;
};
