import { describe, expect, it } from "vitest";

import type { Arm, NtrFile, Reducer, StraightPipe, Tee } from "@ntr/model";
import { buildSceneGraph } from "@viewer/sceneGraph";
import {
  asIdentifier,
  asKilograms,
  asMillimeters,
  asNominalDiameterCode,
  createCoordinatePoint,
  createNamedPoint,
} from "@ntr/types";

const coordinate = (x: number, y: number, z: number) => (
  createCoordinatePoint({ x, y, z })
);

describe("buildSceneGraph", () => {
  it("produces scene elements with resolved coordinates and bounds", () => {
    const straight: StraightPipe = {
      kind: "RO",
      rawFields: {
        P1: "0,0,0",
        P2: "5,0,0",
        DN: "DN150",
      },
      start: coordinate(0, 0, 0),
      end: coordinate(5, 0, 0),
      nominalDiameter: asNominalDiameterCode("DN150"),
      loadCases: [],
      material: undefined,
      description: undefined,
      reference: undefined,
      pipeline: undefined,
      componentTag: undefined,
      norm: undefined,
      series: undefined,
      schedule: undefined,
    };

    const tee: Tee = {
      kind: "TEE",
      rawFields: {
        PH1: "5,0,0",
        PH2: "5,4,0",
        PA1: "5,2,0",
        PA2: "5,2,3",
        DNH: "DN200",
        DNA: "DN100",
        TYP: "H",
      },
      mainStart: coordinate(5, 0, 0),
      mainEnd: coordinate(5, 4, 0),
      branchStart: coordinate(5, 2, 0),
      branchEnd: coordinate(5, 2, 3),
      mainNominalDiameter: asNominalDiameterCode("DN200"),
      branchNominalDiameter: asNominalDiameterCode("DN100"),
      teeType: "H",
      loadCases: [],
      material: undefined,
      description: undefined,
      reference: undefined,
      pipeline: undefined,
      componentTag: undefined,
      norm: undefined,
      series: undefined,
      schedule: undefined,
    };

    const valve: Arm = {
      kind: "ARM",
      rawFields: {
        P1: "2,0,0",
        P2: "2,1,0",
        PM: "2,0.5,0",
        DN1: "DN80",
        DN2: "DN80",
        GEW: "10",
      },
      start: coordinate(2, 0, 0),
      end: coordinate(2, 1, 0),
      center: coordinate(2, 0.5, 0),
      inletDiameter: asNominalDiameterCode("DN80"),
      outletDiameter: asNominalDiameterCode("DN80"),
      weight: asKilograms(10),
      loadCases: [],
      material: undefined,
      description: undefined,
      reference: undefined,
      pipeline: undefined,
      componentTag: undefined,
      norm: undefined,
      series: undefined,
      schedule: undefined,
    };

    const reducer: Reducer = {
      kind: "RED",
      rawFields: {
        P1: "4,4,1",
        P2: "NODE-1",
        DN1: "DN200",
        DN2: "DN150",
      },
      start: coordinate(4, 4, 1),
      end: createNamedPoint("NODE-1"),
      inletDiameter: asNominalDiameterCode("DN200"),
      outletDiameter: asNominalDiameterCode("DN150"),
      loadCases: [],
      material: undefined,
      description: undefined,
      reference: undefined,
      pipeline: undefined,
      componentTag: undefined,
      norm: undefined,
      series: undefined,
      schedule: undefined,
    };

    const file: NtrFile = {
      id: asIdentifier("scene-test"),
      metadata: {},
      definitions: {
        nominalDiameters: {
          [asNominalDiameterCode("DN150")]: { outsideDiameter: asMillimeters(168.3) },
          [asNominalDiameterCode("DN200")]: { outsideDiameter: asMillimeters(219.1) },
          [asNominalDiameterCode("DN100")]: { outsideDiameter: asMillimeters(114.3) },
          [asNominalDiameterCode("DN80")]: { outsideDiameter: asMillimeters(88.9) },
        },
      },
      elements: [straight, tee, valve, reducer],
      issues: [],
    };

    const graph = buildSceneGraph(file);
    expect(graph.elements).toHaveLength(4);

    const [sceneStraight, sceneTee, sceneValve, sceneReducer] = graph.elements;

    expect(sceneStraight.id).toBe("element-0");
    if (sceneStraight.kind !== "RO") expect.fail("expected RO scene element");
    expect(sceneStraight.start.kind).toBe("coordinate");
    if (sceneReducer.kind !== "RED") expect.fail("expected RED scene element");
    expect(sceneReducer.end.kind).toBe("unresolved");

    expect(graph.bounds).not.toBeNull();
    if (!graph.bounds) {
      expect.fail("expected bounds to be defined");
      return;
    }
    expect(graph.bounds.min).toEqual({ x: 0, y: 0, z: -4 });
    expect(graph.bounds.max.x).toBe(5);
    expect(graph.bounds.max.y).toBe(3);
    expect(graph.bounds.max.z).toBeCloseTo(0, 6);

    expect(sceneTee.loadCases).toEqual([]);
    if (sceneValve.kind !== "ARM") expect.fail("expected ARM scene element");
    expect(sceneValve.weight).toBe(10);
  });
});
