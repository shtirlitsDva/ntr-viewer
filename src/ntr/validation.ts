import { err, ok, type Result } from "@shared/result";
import { z } from "zod";

import {
  asComponentTag,
  asElementId,
  asIdentifier,
  asKilograms,
  asLoadCaseCode,
  asMillimeters,
  asMaterialCode,
  asNominalDiameterCode,
  asNodeId,
  asNormCode,
  asPipelineCode,
  asProfileTypeCode,
  asReferenceCode,
  asScheduleCode,
  asSeriesCode,
  createCoordinatePoint,
  createNamedPoint,
  type ElementIdentifier,
  type Identifier,
  type MaterialCode,
  type NominalDiameterCode,
  type NodeIdentifier,
  type PointReference,
  type Vector3,
} from "./types.ts";
import type {
  Element,
  NominalDiameterDefinition,
  NtrDefinitions,
  NtrFile,
  ParseIssue,
} from "./model.ts";

const identifierSchema = z
  .string()
  .trim()
  .min(1)
  .transform((value) => asIdentifier(value));

const materialCodeSchema = z
  .string()
  .trim()
  .min(1)
  .transform((value) => asMaterialCode(value));

const nominalDiameterSchema = z
  .string()
  .trim()
  .min(1)
  .transform((value) => asNominalDiameterCode(value));

const loadCaseSchema = z
  .string()
  .trim()
  .min(1)
  .transform((value) => asLoadCaseCode(value));

const componentTagSchema = z
  .string()
  .trim()
  .min(1)
  .transform((value) => asComponentTag(value));

const referenceSchema = z
  .string()
  .trim()
  .min(1)
  .transform((value) => asReferenceCode(value));

const pipelineSchema = z
  .string()
  .trim()
  .min(1)
  .transform((value) => asPipelineCode(value));

const normSchema = z
  .string()
  .trim()
  .min(1)
  .transform((value) => asNormCode(value));

const seriesSchema = z
  .string()
  .trim()
  .min(1)
  .transform((value) => asSeriesCode(value));

const scheduleSchema = z
  .string()
  .trim()
  .min(1)
  .transform((value) => asScheduleCode(value));

const profileTypeSchema = z
  .string()
  .trim()
  .min(1)
  .transform((value) => asProfileTypeCode(value));

const vector3Schema = z
  .object({
    x: z.number().finite(),
    y: z.number().finite(),
    z: z.number().finite(),
  })
  .strict()
  .transform((value) => value as Vector3);

const coordinatePointSchema = z
  .object({
    kind: z.literal("coordinate"),
    position: vector3Schema,
  })
  .strict()
  .transform((value) => createCoordinatePoint(value.position));

const namedPointSchema = z
  .object({
    kind: z.literal("named"),
    id: z.string().trim().min(1),
  })
  .strict()
  .transform((value) => createNamedPoint(value.id));

const pointReferenceSchema = z
  .union([coordinatePointSchema, namedPointSchema])
  .transform((value) => value as PointReference);

const kilogrameSchema = z
  .number()
  .finite()
  .min(0)
  .transform((value) => asKilograms(value));

const millimetersSchema = z
  .number()
  .finite()
  .transform((value) => asMillimeters(value));

const elementBaseSchema = z
  .object({
    kind: z.enum(["RO", "BOG", "TEE", "ARM", "PROF", "RED"]),
    rawFields: z.record(z.string(), z.string()).default({}),
    material: materialCodeSchema.optional(),
    loadCases: z.array(loadCaseSchema).default([]),
    description: z.string().trim().min(1).optional(),
    reference: referenceSchema.optional(),
    pipeline: pipelineSchema.optional(),
    componentTag: componentTagSchema.optional(),
    norm: normSchema.optional(),
    series: seriesSchema.optional(),
    schedule: scheduleSchema.optional(),
  })
  .strict();

const straightPipeSchema = elementBaseSchema
  .extend({
    kind: z.literal("RO"),
    start: pointReferenceSchema,
    end: pointReferenceSchema,
    nominalDiameter: nominalDiameterSchema,
  })
  .transform((value) => value);

const profileSchema = elementBaseSchema
  .extend({
    kind: z.literal("PROF"),
    start: pointReferenceSchema,
    end: pointReferenceSchema,
    profileType: profileTypeSchema,
    axis: z.enum(["Y", "Z"]).optional(),
    axisDirection: pointReferenceSchema.optional(),
  })
  .transform((value) => value);

const bendSchema = elementBaseSchema
  .extend({
    kind: z.literal("BOG"),
    start: pointReferenceSchema,
    end: pointReferenceSchema,
    tangent: pointReferenceSchema,
    nominalDiameter: nominalDiameterSchema,
  })
  .transform((value) => value);

const teeSchema = elementBaseSchema
  .extend({
    kind: z.literal("TEE"),
    mainStart: pointReferenceSchema,
    mainEnd: pointReferenceSchema,
    branchStart: pointReferenceSchema,
    branchEnd: pointReferenceSchema,
    mainNominalDiameter: nominalDiameterSchema,
    branchNominalDiameter: nominalDiameterSchema,
    teeType: z.string().trim().min(1).optional(),
  })
  .transform((value) => value);

const armSchema = elementBaseSchema
  .extend({
    kind: z.literal("ARM"),
    start: pointReferenceSchema,
    end: pointReferenceSchema,
    center: pointReferenceSchema,
    inletDiameter: nominalDiameterSchema,
    outletDiameter: nominalDiameterSchema,
    weight: kilogrameSchema.optional(),
  })
  .transform((value) => value);

const reducerSchema = elementBaseSchema
  .extend({
    kind: z.literal("RED"),
    start: pointReferenceSchema,
    end: pointReferenceSchema,
    inletDiameter: nominalDiameterSchema,
    outletDiameter: nominalDiameterSchema,
  })
  .transform((value) => value);

const nominalDiameterDefinitionSchema = z
  .object({
    outsideDiameter: millimetersSchema,
    thickness: millimetersSchema.optional(),
  })
  .strict()
  .transform((value) => value as NominalDiameterDefinition);

const definitionsSchema = z
  .object({
    nominalDiameters: z
      .record(z.string(), nominalDiameterDefinitionSchema)
      .default({}),
  })
  .strict()
  .default({ nominalDiameters: {} })
  .transform((value) => {
    const result: NtrDefinitions["nominalDiameters"] = {} as NtrDefinitions["nominalDiameters"];
    for (const [key, definition] of Object.entries(value.nominalDiameters)) {
      const code = asNominalDiameterCode(key);
      result[code] = definition;
    }
    return {
      nominalDiameters: result,
    } as NtrDefinitions;
  });

export const elementSchema = z
  .discriminatedUnion("kind", [
    straightPipeSchema,
    profileSchema,
    bendSchema,
    teeSchema,
    armSchema,
    reducerSchema,
  ])
  .transform((value) => value as Element);

export const parseIssueSchema = z
  .object({
    severity: z.union([z.literal("error"), z.literal("warning")]),
    message: z.string().trim().min(1),
    recordCode: z.string().trim().min(1),
    lineNumber: z.number().int().min(1),
    details: z.record(z.string(), z.unknown()).optional(),
  })
  .strict()
  .transform((value) => value as ParseIssue);

const metadataSchema = z
  .object({
    projectName: z.string().trim().min(1).optional(),
    specification: z.string().trim().min(1).optional(),
  })
  .strict()
  .default({});

export const ntrFileSchema = z
  .object({
    id: identifierSchema,
    metadata: metadataSchema,
    definitions: definitionsSchema,
    elements: z.array(elementSchema).default([]),
    issues: z.array(parseIssueSchema).default([]),
  })
  .strict()
  .transform((value) => value as NtrFile);

export type NtrFileInput = z.input<typeof ntrFileSchema>;

export const validateNtrFile = (
  data: unknown,
): Result<NtrFile, z.ZodError<NtrFile>> => {
  const parsed = ntrFileSchema.safeParse(data);
  if (parsed.success) {
    return ok(parsed.data);
  }
  return err(parsed.error);
};

export const coerceIdentifier = (value: string): Identifier =>
  asIdentifier(value);

export const coerceElementId = (value: string): ElementIdentifier =>
  asElementId(value);

export const coerceMaterialCode = (value: string): MaterialCode =>
  asMaterialCode(value);

export const coerceNominalDiameter = (
  value: string,
): NominalDiameterCode => asNominalDiameterCode(value);

export const coerceNodeId = (value: string): NodeIdentifier =>
  asNodeId(value);
