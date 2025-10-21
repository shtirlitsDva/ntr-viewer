import { enumerateLines, tokenize } from "@shared/iter";

import type { ParseIssue } from "./model.ts";

export interface RawField {
  readonly key: string;
  readonly value: string;
  readonly rawValue: string;
  readonly quoted: boolean;
  readonly lineNumber: number;
}

export interface RawRecord {
  readonly code: string;
  readonly lineNumber: number;
  readonly raw: string;
  readonly fields: readonly RawField[];
}

const COMMENT_RECORD = "C";

export interface LexResult {
  readonly records: readonly RawRecord[];
  readonly issues: readonly ParseIssue[];
}

export const lexNtr = (source: string): LexResult => {
  const lines = enumerateLines(source);
  const tokenized = tokenize(lines);
  const issues: ParseIssue[] = [];
  const records: RawRecord[] = [];

  for (const line of tokenized) {
    const [codeToken, ...rest] = line.tokens;
    if (!codeToken) {
      continue;
    }

    const recordCode = codeToken.trim().toUpperCase();
    if (recordCode === COMMENT_RECORD) {
      continue;
    }

    const fields: RawField[] = [];
    for (const token of rest) {
      const field = parseField(token, recordCode, line.lineNumber, issues);
      if (field) {
        fields.push(field);
      }
    }

    records.push({
      code: recordCode,
      lineNumber: line.lineNumber,
      raw: line.content,
      fields,
    });
  }

  return { records, issues };
};

const parseField = (
  token: string,
  recordCode: string,
  lineNumber: number,
  issues: ParseIssue[],
): RawField | null => {
  const equalsIndex = token.indexOf("=");
  if (equalsIndex === -1) {
    issues.push(createIssue(recordCode, lineNumber, `Expected key=value pair, received "${token}"`));
    return null;
  }

  const key = token.slice(0, equalsIndex).trim();
  const rawValue = token.slice(equalsIndex + 1);

  if (key.length === 0) {
    issues.push(createIssue(recordCode, lineNumber, "Missing field key"));
    return null;
  }

  const normalizedKey = key.toUpperCase();
  const { value, quoted } = normalizeValue(rawValue);

  return {
    key: normalizedKey,
    value,
    rawValue: rawValue.trim(),
    quoted,
    lineNumber,
  };
};

const normalizeValue = (value: string): { value: string; quoted: boolean } => {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return { value: "", quoted: false };
  }

  const firstChar = trimmed.charAt(0);
  const lastChar = trimmed.charAt(trimmed.length - 1);

  if ((firstChar === "'" && lastChar === "'") || (firstChar === "\"" && lastChar === "\"")) {
    return {
      value: trimmed.slice(1, -1),
      quoted: true,
    };
  }

  return { value: trimmed, quoted: false };
};

const createIssue = (
  recordCode: string,
  lineNumber: number,
  message: string,
): ParseIssue => ({
  severity: "error",
  message,
  recordCode,
  lineNumber,
});
