import { describe, expect, it } from "vitest";

import { isErr, isOk } from "@shared/result";
import { validateNtrFile } from "@ntr/validation";

describe("validateNtrFile", () => {
  it("accepts a well-formed NTR file structure", () => {
    const raw = {
      id: " file-001 ",
      metadata: {
        projectName: " Demo Plant ",
      },
      elements: [
        {
          kind: "RO",
          start: { kind: "coordinate", position: { x: 0, y: 0, z: 0 } },
          end: { kind: "named", id: " N2 " },
          material: " CS ",
          nominalDiameter: " DN100 ",
          loadCases: [" CASE-A "],
          reference: " REF-1 ",
          pipeline: " PIPE ",
          componentTag: " COMP-1 ",
        },
      ],
      issues: [],
    };

    const result = validateNtrFile(raw);
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value.id).toBe("file-001");
      expect(result.value.metadata.projectName).toBe("Demo Plant");
      expect(result.value.elements).toHaveLength(1);
      const [element] = result.value.elements;
      if (element.kind !== "RO") {
        expect.fail("expected RO element");
        return;
      }
      expect(element.material).toBe("CS");
      expect(element.nominalDiameter).toBe("DN100");
      expect(element.loadCases[0]).toBe("CASE-A");
      expect(element.reference).toBe("REF-1");
      expect(element.pipeline).toBe("PIPE");
      expect(element.componentTag).toBe("COMP-1");
      expect(element.start.kind).toBe("coordinate");
      if (element.start.kind === "coordinate") {
        expect(element.start.position).toEqual({ x: 0, y: 0, z: 0 });
      }
      expect(element.end.kind).toBe("named");
      if (element.end.kind === "named") {
        expect(element.end.id).toBe("N2");
      }
    }
  });

  it("rejects invalid structures", () => {
    const invalid = {
      id: "file-002",
      elements: [
        {
          kind: "RO",
          start: { kind: "coordinate", position: { x: 0, y: 0, z: 0 } },
          end: { kind: "coordinate", position: { x: 1, y: 0, z: 0 } },
          nominalDiameter: "",
        },
      ],
    };

    const result = validateNtrFile(invalid);
    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.issues[0]?.path).toContain("elements");
    }
  });

  it("defaults metadata and issues when omitted", () => {
    const raw = {
      id: "file-003",
      elements: [
        {
          kind: "RO",
          start: { kind: "coordinate", position: { x: 0, y: 0, z: 0 } },
          end: { kind: "coordinate", position: { x: 1, y: 0, z: 0 } },
          nominalDiameter: "DN50",
        },
      ],
    };

    const result = validateNtrFile(raw);
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value.metadata).toEqual({});
      expect(result.value.issues).toEqual([]);
    }
  });
});
