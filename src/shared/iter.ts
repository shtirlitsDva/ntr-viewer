export interface SourceLine {
  readonly lineNumber: number;
  readonly content: string;
}

export interface TokenizedLine extends SourceLine {
  readonly tokens: readonly string[];
}

const COMMENT_MARKER = "!";

/**
 * Splits a source string into enumerated, trimmed lines while preserving
 * the original line numbers for diagnostics.
 */
export function enumerateLines(source: string): SourceLine[] {
  const lines: SourceLine[] = [];
  const rawLines = source.replace(/\r\n/g, "\n").split("\n");

  rawLines.forEach((content, index) => {
    lines.push({
      lineNumber: index + 1,
      content,
    });
  });

  return lines;
}

/**
 * Removes trailing comment segments using the NTR comment marker.
 */
export function stripInlineComment(line: string): string {
  const commentIndex = line.indexOf(COMMENT_MARKER);
  if (commentIndex === -1) {
    return line;
  }
  return line.slice(0, commentIndex);
}

/**
 * Collapses contiguous whitespace into single spaces, simplifying tokenisation.
 */
export function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

/**
 * Tokenises a source line, producing an array of `TokenizedLine` ready for record parsing.
 */
export function tokenize(lines: Iterable<SourceLine>): TokenizedLine[] {
  const result: TokenizedLine[] = [];
  for (const line of lines) {
    const withoutComment = stripInlineComment(line.content);
    const trimmed = withoutComment.trim();
    if (trimmed.length === 0) {
      continue;
    }
    const tokens = splitTokens(trimmed);
    if (tokens.length === 0) {
      continue;
    }
    result.push({
      lineNumber: line.lineNumber,
      content: line.content,
      tokens,
    });
  }
  return result;
}

function splitTokens(line: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let inQuote = false;
  let quoteChar: string | null = null;

  for (let i = 0; i < line.length; i += 1) {
    const char = line.charAt(i);
    if (char.length === 0) {
      continue;
    }

    if ((char === "'" || char === '"') && (quoteChar === null || quoteChar === char)) {
      if (inQuote) {
        inQuote = false;
        quoteChar = null;
      } else {
        inQuote = true;
        quoteChar = char;
      }
      current += char;
      continue;
    }

    if (/\s/.test(char) && !inQuote) {
      if (current.length > 0) {
        tokens.push(current);
        current = "";
      }
      continue;
    }

    current += char;
  }

  if (current.length > 0) {
    tokens.push(current);
  }

  return tokens;
}
