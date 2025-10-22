import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { parseNtr } from "@ntr/parser";
import { buildSceneGraph } from "@viewer/sceneGraph";

const dataDir = join(process.cwd(), "data");

describe("Example.ntr parsing", () => {
  it("parses the provided sample without fatal issues", () => {
    const examplePath = join(dataDir, "Example.ntr");
    const contents = readFileSync(examplePath, "utf8");

    const result = parseNtr("example", contents);
    const debugDetails = result.ok ? undefined : JSON.stringify(result.error, null, 2);
    expect(result.ok, debugDetails).toBe(true);
    if (!result.ok) {
      console.error(result.error);
      expect.fail("Expected Example.ntr to parse successfully");
    }

    const { file, issues } = result.value;
    expect(file.elements.length).toBeGreaterThan(0);
    expect(issues.every((issue) => issue.severity !== "error")).toBe(true);
    expect(Object.keys(file.definitions.nominalDiameters)).not.toHaveLength(0);

    const graph = buildSceneGraph(file);
    const firstPipe = graph.elements.find((element) => element.kind === "RO");
    expect(firstPipe && "outerDiameter" in firstPipe ? firstPipe.outerDiameter : undefined).toBeGreaterThan(0);
  });
});
