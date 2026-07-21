// SQL cursor-context analysis - determines which clause the cursor sits in so
// the autocomplete provider can offer only the relevant suggestion kinds
// (columns after WHERE, tables after FROM, nothing inside strings/comments).
//
// The analyzer is a single forward scan over the text that precedes the
// cursor. It is intentionally dialect-neutral and tolerant of partial input:
// an editor buffer is almost always an incomplete statement.

// Every clause context the analyzer can report. Exported as a value list so
// tests (and the suggestion-kind map) can be exhaustive over all cases.
export const SQL_CLAUSES = [
  'start', // beginning of a statement, nothing typed yet
  'select', // inside a SELECT list
  'from', // after FROM
  'join', // after JOIN
  'on', // inside a join condition
  'using', // after USING
  'where', // inside a WHERE condition
  'group-by', // after GROUP BY
  'having', // after HAVING
  'order-by', // after ORDER BY
  'limit', // after LIMIT / OFFSET / FETCH
  'update', // after UPDATE (target table)
  'set', // inside an UPDATE ... SET list
  'delete', // after DELETE, before FROM
  'insert-into', // after INSERT [INTO] (target table)
  'insert-columns', // inside the column list of an INSERT
  'values', // inside VALUES
  'case', // inside a CASE ... END expression
  'function-args', // inside function call parentheses
  'in-list', // inside an IN (...) list
  'window', // after PARTITION BY (window/OVER clause)
  'returning', // after RETURNING
  'union', // right after UNION / INTERSECT / EXCEPT
  'create', // after CREATE (new object: existing names are not useful)
  'drop', // after DROP
  'alter', // after ALTER
  'truncate', // after TRUNCATE
  'with', // after WITH, before the CTE body
  'unknown', // could not be determined - callers should not restrict anything
] as const;

export type SqlClause = (typeof SQL_CLAUSES)[number];

export interface SqlContextInfo {
  clause: SqlClause;
  /** Cursor is inside an unterminated string literal ('...'). */
  inString: boolean;
  /** Cursor is inside an unterminated -- or block comment. */
  inComment: boolean;
  /** Parenthesis depth at the cursor (0 = top level of the statement). */
  nestingLevel: number;
}

export interface SuggestionKinds {
  columns: boolean;
  tables: boolean;
  keywords: boolean;
}

// Which suggestion kinds make sense for each clause. 'unknown' allows
// everything so an analyzer miss degrades to the previous behavior instead of
// hiding suggestions.
const CLAUSE_SUGGESTION_KINDS: Record<SqlClause, SuggestionKinds> = {
  start: { columns: false, tables: false, keywords: true },
  select: { columns: true, tables: false, keywords: true },
  from: { columns: false, tables: true, keywords: true },
  join: { columns: false, tables: true, keywords: true },
  on: { columns: true, tables: false, keywords: true },
  using: { columns: true, tables: false, keywords: true },
  where: { columns: true, tables: false, keywords: true },
  'group-by': { columns: true, tables: false, keywords: true },
  having: { columns: true, tables: false, keywords: true },
  'order-by': { columns: true, tables: false, keywords: true },
  limit: { columns: false, tables: false, keywords: true },
  update: { columns: false, tables: true, keywords: true },
  set: { columns: true, tables: false, keywords: true },
  delete: { columns: false, tables: false, keywords: true },
  'insert-into': { columns: false, tables: true, keywords: true },
  'insert-columns': { columns: true, tables: false, keywords: false },
  values: { columns: false, tables: false, keywords: true },
  case: { columns: true, tables: false, keywords: true },
  'function-args': { columns: true, tables: false, keywords: true },
  'in-list': { columns: true, tables: false, keywords: true },
  window: { columns: true, tables: false, keywords: true },
  returning: { columns: true, tables: false, keywords: true },
  union: { columns: false, tables: false, keywords: true },
  create: { columns: false, tables: false, keywords: true },
  drop: { columns: false, tables: true, keywords: true },
  alter: { columns: false, tables: true, keywords: true },
  truncate: { columns: false, tables: true, keywords: true },
  with: { columns: false, tables: false, keywords: true },
  unknown: { columns: true, tables: true, keywords: true },
};

export const getSuggestionKinds = (clause: SqlClause): SuggestionKinds =>
  CLAUSE_SUGGESTION_KINDS[clause];

// Words that can never be a table/function identifier. Used to tell a
// function call `count(` or a table name `users (` apart from a plain
// expression group `WHERE (`.
const KEYWORDS = new Set([
  'SELECT', 'FROM', 'WHERE', 'JOIN', 'LEFT', 'RIGHT', 'INNER', 'OUTER',
  'CROSS', 'NATURAL', 'FULL', 'LATERAL', 'ON', 'USING', 'AND', 'OR', 'NOT',
  'IN', 'IS', 'NULL', 'BETWEEN', 'LIKE', 'ILIKE', 'EXISTS', 'AS', 'DISTINCT',
  'ALL', 'ANY', 'SOME', 'GROUP', 'ORDER', 'PARTITION', 'BY', 'HAVING',
  'LIMIT', 'OFFSET', 'FETCH', 'UPDATE', 'SET', 'DELETE', 'INSERT', 'INTO',
  'VALUES', 'VALUE', 'CASE', 'WHEN', 'THEN', 'ELSE', 'END', 'UNION',
  'INTERSECT', 'EXCEPT', 'MINUS', 'CREATE', 'DROP', 'ALTER', 'TRUNCATE',
  'TABLE', 'VIEW', 'INDEX', 'IF', 'RETURNING', 'WITH', 'OVER', 'WINDOW',
  'ASC', 'DESC', 'RECURSIVE',
]);

interface Frame {
  clause: SqlClause;
  // Clauses saved when entering CASE expressions (they nest), restored on END.
  caseSaved: SqlClause[];
}

interface WordToken {
  upper: string;
  isKeyword: boolean;
}

const isWordChar = (ch: string): boolean => /[A-Za-z0-9_$]/.test(ch);

// Applies one keyword to the innermost frame. Words that are not clause
// keywords (identifiers, no-op keywords like AND/NOT) leave the clause as-is.
const applyWord = (frame: Frame, upper: string, prev: WordToken | null): void => {
  switch (upper) {
    case 'SELECT': frame.clause = 'select'; break;
    case 'FROM': frame.clause = 'from'; break;
    case 'JOIN':
    case 'STRAIGHT_JOIN': frame.clause = 'join'; break;
    case 'ON': frame.clause = 'on'; break;
    case 'USING': frame.clause = 'using'; break;
    case 'WHERE': frame.clause = 'where'; break;
    case 'BY':
      if (prev?.upper === 'GROUP') frame.clause = 'group-by';
      else if (prev?.upper === 'ORDER') frame.clause = 'order-by';
      else if (prev?.upper === 'PARTITION') frame.clause = 'window';
      break;
    case 'HAVING': frame.clause = 'having'; break;
    case 'LIMIT':
    case 'OFFSET':
    case 'FETCH': frame.clause = 'limit'; break;
    case 'UPDATE': frame.clause = 'update'; break;
    case 'SET': frame.clause = 'set'; break;
    case 'DELETE': frame.clause = 'delete'; break;
    case 'INSERT':
    case 'REPLACE':
    case 'INTO': frame.clause = 'insert-into'; break;
    case 'VALUES':
    case 'VALUE': frame.clause = 'values'; break;
    case 'CASE':
      frame.caseSaved.push(frame.clause);
      frame.clause = 'case';
      break;
    case 'END':
      frame.clause = frame.caseSaved.pop() ?? frame.clause;
      break;
    case 'UNION':
    case 'INTERSECT':
    case 'EXCEPT':
    case 'MINUS': frame.clause = 'union'; break;
    case 'CREATE': frame.clause = 'create'; break;
    case 'DROP': frame.clause = 'drop'; break;
    case 'ALTER': frame.clause = 'alter'; break;
    case 'TRUNCATE': frame.clause = 'truncate'; break;
    case 'RETURNING': frame.clause = 'returning'; break;
    case 'WITH': frame.clause = 'with'; break;
    default: break;
  }
};

// Decides the clause of a new parenthesized frame from what precedes `(`.
const openFrameClause = (outer: Frame, prev: WordToken | null): SqlClause => {
  if (prev) {
    // `IN (` opens a value/subquery list.
    if (prev.upper === 'IN') return 'in-list';
    // `AS (` opens a CTE (or derived) body: a fresh statement scope.
    if (prev.upper === 'AS') return 'start';
    if (!prev.isKeyword) {
      // `INSERT INTO users (` opens the target column list.
      if (outer.clause === 'insert-into') return 'insert-columns';
      // Any other identifier directly before `(` reads as a function call.
      return 'function-args';
    }
  }
  // Expression group or subquery: inherit until a keyword (e.g. SELECT)
  // inside the parentheses says otherwise.
  return outer.clause;
};

/**
 * Analyzes the SQL text that precedes the cursor and reports the clause the
 * cursor sits in, plus string/comment/nesting state.
 *
 * Pass everything from the start of the buffer up to the cursor; statement
 * separators (`;`) reset the state, so previous statements cannot leak into
 * the current one.
 */
export const analyzeSqlContext = (textBeforeCursor: string): SqlContextInfo => {
  let stack: Frame[] = [{ clause: 'start', caseSaved: [] }];
  let stringDelim: '\'' | null = null;
  let inLineComment = false;
  let inBlockComment = false;
  let prev: WordToken | null = null;

  const s = textBeforeCursor;
  const n = s.length;
  let i = 0;
  let wordStart = -1;

  const top = () => stack[stack.length - 1];

  const flushWord = (end: number): void => {
    if (wordStart < 0) return;
    const upper = s.slice(wordStart, end).toUpperCase();
    wordStart = -1;
    applyWord(top(), upper, prev);
    prev = { upper, isKeyword: KEYWORDS.has(upper) };
  };

  while (i < n) {
    const ch = s[i];

    if (inLineComment) {
      if (ch === '\n') inLineComment = false;
      i++;
      continue;
    }
    if (inBlockComment) {
      if (ch === '*' && s[i + 1] === '/') { inBlockComment = false; i += 2; continue; }
      i++;
      continue;
    }
    if (stringDelim) {
      if (ch === '\\') { i += 2; continue; } // backslash escape (MySQL)
      if (ch === stringDelim) {
        if (s[i + 1] === stringDelim) { i += 2; continue; } // doubled-quote escape
        stringDelim = null;
      }
      i++;
      continue;
    }

    // Quoted identifiers are opaque single tokens; they count as identifiers
    // for the `identifier(`-detection but never as keywords.
    if (ch === '"' || ch === '`' || ch === '[') {
      flushWord(i);
      const close = ch === '[' ? ']' : ch;
      i++;
      while (i < n && s[i] !== close) i++;
      if (i < n) i++; // skip the closing delimiter when present
      prev = { upper: '', isKeyword: false };
      continue;
    }

    if (ch === '\'') { flushWord(i); stringDelim = '\''; prev = null; i++; continue; }
    if (ch === '-' && s[i + 1] === '-') { flushWord(i); inLineComment = true; i += 2; continue; }
    if (ch === '/' && s[i + 1] === '*') { flushWord(i); inBlockComment = true; i += 2; continue; }

    if (isWordChar(ch)) {
      if (wordStart < 0) wordStart = i;
      i++;
      continue;
    }

    flushWord(i);

    if (ch === '(') {
      stack.push({ clause: openFrameClause(top(), prev), caseSaved: [] });
      prev = null;
    } else if (ch === ')') {
      if (stack.length > 1) stack.pop();
      prev = null;
    } else if (ch === ';') {
      stack = [{ clause: 'start', caseSaved: [] }];
      prev = null;
    } else if (ch === '.' || /\s/.test(ch)) {
      // Whitespace and the qualifier dot keep the previous word visible so
      // two-word keywords (GROUP BY) and `name (` detection keep working.
    } else {
      // Operators, commas, etc. end any identifier context.
      prev = null;
    }
    i++;
  }

  flushWord(n);

  return {
    clause: top().clause,
    inString: stringDelim !== null,
    inComment: inLineComment || inBlockComment,
    nestingLevel: stack.length - 1,
  };
};
