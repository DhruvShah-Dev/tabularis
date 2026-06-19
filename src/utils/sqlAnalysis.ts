// SQL Analysis Utilities - Pure logic functions for parsing and analyzing SQL

export interface ParsedTableRef {
  name: string;
  schema?: string;
}

// Removes wrapping SQL identifier quotes/backticks.
// Unquoted identifiers are normalized to lowercase.
function stripIdentifierQuotes(token: string): string {
  const q = token[0];
  if (q === '"' || q === '`') return token.slice(1, -1).replaceAll(q + q, q);
  return token.toLowerCase();
}

// Isolate the FROM/JOIN section of a SQL statement so clause keywords
// (WHERE, HAVING, etc.) are never present when the alias-capture regex runs.
const extractFromSection = (sql: string): string => {
  const fromIdx = sql.toLowerCase().search(/\bfrom\b/);
  if (fromIdx === -1) return '';

  const fromText = sql.slice(fromIdx);
  // Stop at the first clause that cannot appear inside a FROM/JOIN list
  const boundary = /\b(?:where|group\s+by|order\s+by|having|limit|offset|union|intersect|except)\b/i.exec(fromText);
  const section = boundary ? fromText.slice(0, boundary.index) : fromText;

  // Strip ON <cond> and USING(...) within JOIN clauses so those keywords
  // are not captured as table aliases.
  return section
    .replace(/\bon\b.+?(?=\b(?:join|left|right|inner|outer|cross|natural)\b|$)/gis, ' ')
    .replace(/\busing\s*\([^)]*\)/gi, ' ');
};

// Splits a string by top-level commas — commas not nested inside any parentheses.
// This prevents commas inside function-call argument lists (e.g. func(a, b)) or
// AS alias column lists (e.g. AS alias(col1, col2)) from being treated as table
// separators in a FROM clause.
function splitTopLevelCommas(str: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;

  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    else if (ch === ',' && depth === 0) {
      parts.push(str.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(str.slice(start));
  return parts;
}

// Returns alias → ParsedTableRef. Handles quoted identifiers, schema.table, and comma-separated FROM.
export const parseTablesFromQuery = (sql: string): Map<string, ParsedTableRef> | null => {
  if (!sql || sql.length === 0) return null;

  const fromSection = extractFromSection(sql);
  if (!fromSection) return null;

  const tableMap = new Map<string, ParsedTableRef>();

  // Pattern matches tables/aliases introduced by FROM or JOIN keywords only.
  // Commas are handled by pre-splitting at the top level so that commas inside
  // function calls or alias column lists are never mistaken for table separators.
  const fromPattern =
    /(?:from|join)\s+("(?:[^"]|"")*"|`[^`]+`|[a-zA-Z_][a-zA-Z0-9_]*)(?:\.("(?:[^"]|"")*"|`[^`]+`|[a-zA-Z_][a-zA-Z0-9_]*))?(?:\s+(?:as\s+)?("(?:[^"]|"")*"|`[^`]+`|(?!(?:join|left|right|inner|outer|cross|natural|full|on|using|where|group|order|having|limit|offset|union|intersect|except|for|fetch|window|lateral|tablesample|qualify|straight_join)\b)[a-zA-Z_][a-zA-Z0-9_]*))?/gi;

  // Split fromSection at top-level commas so each segment is either the first
  // FROM item (which already carries the FROM keyword) or a subsequent
  // comma-separated table reference (which we normalise by prepending FROM).
  const segments = splitTopLevelCommas(fromSection).map((seg) =>
    /^\s*(?:from|join)\b/i.test(seg) ? seg : `FROM ${seg.trimStart()}`
  );

  let matchCount = 0;
  const MAX_MATCHES = 10;

  for (const segment of segments) {
    if (matchCount >= MAX_MATCHES) break;
    fromPattern.lastIndex = 0;

    let match;
    while ((match = fromPattern.exec(segment)) !== null && matchCount++ < MAX_MATCHES) {
      const schemaToken = match[2] ? match[1] : undefined;
      const tableToken = match[2] ?? match[1];
      if (!tableToken) continue;

      const tableName = stripIdentifierQuotes(tableToken);
      const schema = schemaToken ? stripIdentifierQuotes(schemaToken) : undefined;
      const aliasToken = match[3];
      const alias = aliasToken ? stripIdentifierQuotes(aliasToken) : tableName;
      tableMap.set(alias, { name: tableName, schema });
    }
  }

  return tableMap.size > 0 ? tableMap : null;
};

// Optimized statement extractor - avoid full text scan when possible
export const getCurrentStatement = (model: { getValue: () => string; getOffsetAt: (position: { lineNumber: number; column: number }) => number }, position: { lineNumber: number; column: number }): string => {
  const fullText = model.getValue();

  // For small files, just return full text
  if (fullText.length < 500) {
    return fullText;
  }

  const offset = model.getOffsetAt(position);
  let start = 0;
  let end = fullText.length;


  // Search within reasonable bounds (±2000 chars from cursor)
  const searchStart = Math.max(0, offset - 2000);
  const searchEnd = Math.min(fullText.length, offset + 2000);

  // Find previous semicolon
  for (let i = offset - 1; i >= searchStart; i--) {
    if (fullText[i] === ';') {
      start = i + 1;
      break;
    }
  }

  // Find next semicolon
  for (let i = offset; i < searchEnd; i++) {
    if (fullText[i] === ';') {
      end = i;
      break;
    }
  }

  return fullText.substring(start, end).trim();
};
