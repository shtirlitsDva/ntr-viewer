import { describe, expect, it } from "vitest";

import {
  enumerateLines,
  normalizeWhitespace,
  stripInlineComment,
  tokenize,
} from "@shared/iter";

describe("line utilities", () => {
  it("enumerates lines with numbers", () => {
    const lines = enumerateLines("A\nB\r\nC");
    expect(lines).toHaveLength(3);
    expect(lines[0]).toEqual({ lineNumber: 1, content: "A" });
    expect(lines[1]).toEqual({ lineNumber: 2, content: "B" });
    expect(lines[2]).toEqual({ lineNumber: 3, content: "C" });
  });

  it("removes inline comments", () => {
    expect(stripInlineComment("RO 1 ! comment")).toBe("RO 1 ");
    expect(stripInlineComment("RO 1")).toBe("RO 1");
  });

  it("normalizes whitespace", () => {
    expect(normalizeWhitespace(" RO   1\t2 ")).toBe("RO 1 2");
  });

  it("tokenises enumerated lines while respecting quoted segments", () => {
    const tokens = tokenize(
      enumerateLines(
        "RO P1='1, 2, 3' P2=NODE1\n! comment only\nTEE TEXT='Hello world' KEY=\"A B\" ! with comment",
      ),
    );
    expect(tokens).toHaveLength(2);
    expect(tokens[0].tokens).toEqual(["RO", "P1='1, 2, 3'", "P2=NODE1"]);
    expect(tokens[1].tokens).toEqual([
      "TEE",
      "TEXT='Hello world'",
      'KEY="A B"',
    ]);
    expect(tokens[1].lineNumber).toBe(3);
  });
});
