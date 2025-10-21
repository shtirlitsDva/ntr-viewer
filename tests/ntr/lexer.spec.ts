import { describe, expect, it } from "vitest";

import { lexNtr } from "@ntr/lexer";

const SAMPLE = "RO P1='9953.1, -2492.7, -3586.3' P2=NODE1 DN=DN150 MAT=P235GH\nTEE PH1=MAIN1 PH2=MAIN2 PA1='1, 2, 3' PA2='4, 5, 6' DNH=DN200 DNA=DN150\nC This is a comment line\nRED P1='0,0,0' P2='1,1,1' DN1=DN200 DN2=DN150";

describe("lexNtr", () => {
  it("produces raw records with normalized fields", () => {
    const { records, issues } = lexNtr(SAMPLE);

    expect(issues).toHaveLength(0);
    expect(records).toHaveLength(3);

    const [ro, tee, red] = records;

    expect(ro.code).toBe("RO");
    expect(ro.fields).toHaveLength(4);
    expect(ro.fields[0]).toEqual({
      key: "P1",
      value: "9953.1, -2492.7, -3586.3",
      rawValue: "'9953.1, -2492.7, -3586.3'",
      quoted: true,
      lineNumber: 1,
    });
    expect(ro.fields[1]?.value).toBe("NODE1");

    expect(tee.code).toBe("TEE");
    expect(tee.fields.find((field) => field.key === "DNA")?.value).toBe("DN150");

    expect(red.code).toBe("RED");
    expect(red.fields.find((field) => field.key === "DN1")?.value).toBe("DN200");
  });

  it("records issues for malformed tokens", () => {
    const source = "RO P1 DN=DN150";
    const { issues } = lexNtr(source);
    expect(issues).toHaveLength(1);
    expect(issues[0]?.message).toContain("Expected key=value pair");
  });
});
