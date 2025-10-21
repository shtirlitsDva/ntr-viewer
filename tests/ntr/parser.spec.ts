import { describe, expect, it } from "vitest";

import { parseNtr } from "@ntr/parser";

const SAMPLE = `
RO P1='0,0,0' P2='1,0,0' DN=DN150 MAT=STEEL LAST=CASE1,CASE2 REF=R1 LTG='PIPE 1'
BOG P1='0,0,0' P2='1,1,0' PT='1,0,0' DN=DN200 MAT=STEEL
TEE PH1='0,0,0' PH2='1,0,0' PA1='0.5,0,0' PA2='0.5,0,1' DNH=DN150 DNA=DN80 TYP=H
ARM P1='0,0,0' P2='0,1,0' PM='0,0.5,0' DN1=DN50 DN2=DN50 GEW=12.5
PROF P1='0,0,0' P2='0,0,1' TYP=_RIGID_ ACHSE=Y RI='0,1,0'
RED P1='0,0,0' P2='0,0,1' DN1=DN100 DN2=DN50
`.trim();

describe("parseNtr", () => {
  it("parses supported record types into domain elements", () => {
    const result = parseNtr("test", SAMPLE);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      expect.fail("expected parse to succeed");
    }

    const { file } = result.value;
    expect(file.elements).toHaveLength(6);

    const ro = file.elements.find((element) => element.kind === "RO");
    expect(ro).toBeDefined();
    if (ro?.kind === "RO") {
      expect(ro.nominalDiameter).toBe("DN150");
      expect(ro.loadCases).toEqual(["CASE1", "CASE2"]);
      expect(ro.pipeline).toBe("PIPE 1");
    }

    const arm = file.elements.find((element) => element.kind === "ARM");
    expect(arm).toBeDefined();
    if (arm?.kind === "ARM") {
      expect(arm.weight).toBe(12.5);
    }
  });

  it("returns issues when required fields are missing", () => {
    const source = "RO P1='0,0,0' DN=DN150";
    const result = parseNtr("bad", source);

    expect(result.ok).toBe(false);
    if (result.ok) {
      expect.fail("expected parser errors");
    }

    const [issue] = result.error;
    expect(issue?.message).toContain("Missing required field");
  });
});
