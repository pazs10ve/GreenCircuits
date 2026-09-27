import { SECTORS } from "@greencircuits/market/catalog"
import { FIELDS, resolveField, type FieldDef, type LiveRow } from "./fields"

/**
 * The screener's query language, in the spirit of screener.in:
 *
 *   roe > 15 AND pe < 30 AND (debt_equity < 0.5 OR sector = "Financials")
 *
 * - comparisons: > >= < <= = != (also == and <>), chainable: 10 < pe < 25
 * - logic: AND, OR, NOT and parentheses, case-insensitive (&&, || and ! work too)
 * - arithmetic: + − * / and unary minus: price > sma_200 * 1.05
 * - numbers: 15, 0.5, 1e5, 1,00,000 or 100_000; a trailing % is allowed (roe > 15%)
 * - text: "IT" or 'IT', for the sector field
 *
 * A hand-written tokenizer and recursive-descent parser build a small AST that
 * is type-checked and then evaluated per row. There is no eval or Function.
 *
 * Missing values (D/E for banks, prices before the feed starts) follow SQL's
 * three-valued logic: a comparison with a missing value is unknown, NOT unknown
 * is still unknown, and a row matches only when the whole query is true.
 */

// ------------------------------------------------------------------ tokens

export type TokenKind =
  | "number"
  | "string"
  | "ident"
  | "and"
  | "or"
  | "not"
  | "compare"
  | "arith"
  | "lparen"
  | "rparen"
  | "invalid"
  | "eof"

export type CompareOp = ">" | ">=" | "<" | "<=" | "=" | "!="
export type ArithOp = "+" | "-" | "*" | "/"

export interface Token {
  kind: TokenKind
  /** Exact source text. */
  text: string
  start: number
  end: number
  /** Parsed number or string, or the normalised operator. */
  value?: number | string
  /** Why an invalid token is invalid, and what to do about it. */
  problem?: string
  hint?: string
}

const COMPARE_OPS: Record<string, CompareOp> = {
  ">": ">",
  ">=": ">=",
  "≥": ">=",
  "<": "<",
  "<=": "<=",
  "≤": "<=",
  "=": "=",
  "==": "=",
  "!=": "!=",
  "<>": "!=",
  "≠": "!=",
  "=>": ">=",
  "=<": "<=",
}

const ARITH_OPS: Record<string, ArithOp> = { "+": "+", "-": "-", "−": "-", "*": "*", "×": "*", "/": "/", "÷": "/" }

const QUOTES: Record<string, string> = { '"': '"', "'": "'", "“": "”", "‘": "’", "”": "”", "’": "’" }

const NUMBER_RE = /(?:\d+(?:[,_]\d+)*(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/y
const IDENT_RE = /[A-Za-z_][A-Za-z0-9_]*/y
const IDENT_START = /[A-Za-z_]/
const SPACE = /\s/

/** Split a query into tokens. Never throws: bad input becomes "invalid" tokens that the parser reports. */
export function lex(src: string): Token[] {
  const tokens: Token[] = []
  let i = 0
  const push = (kind: TokenKind, start: number, end: number, extra?: Partial<Token>) =>
    tokens.push({ kind, text: src.slice(start, end), start, end, ...extra })

  while (i < src.length) {
    const ch = src[i]!
    if (SPACE.test(ch)) {
      i++
      continue
    }
    const start = i

    // Numbers, with optional digit grouping and a trailing %.
    if (/[0-9]/.test(ch) || (ch === "." && /[0-9]/.test(src[i + 1] ?? ""))) {
      NUMBER_RE.lastIndex = i
      const m = NUMBER_RE.exec(src)!
      let end = i + m[0].length
      const value = Number(m[0].replace(/[,_]/g, ""))
      if (src[end] === "%") end++
      push("number", start, end, { value })
      i = end
      // A unit glued to the number ("5000cr", "20x") is a common slip. "15AND" is just a missing space.
      if (i < src.length && IDENT_START.test(src[i]!)) {
        IDENT_RE.lastIndex = i
        const suffix = IDENT_RE.exec(src)![0]
        if (!/^(and|or|not)$/i.test(suffix)) {
          push("invalid", i, i + suffix.length, {
            problem: `Unexpected ‘${suffix}’ after ${m[0]}`,
            hint: "Write plain numbers; the field reference lists each field's unit.",
          })
          i += suffix.length
        }
      }
      continue
    }

    // Text in straight or curly quotes.
    if (ch in QUOTES) {
      const close = QUOTES[ch]!
      let j = i + 1
      while (j < src.length && src[j] !== close && !(close === "”" && src[j] === '"') && src[j] !== "\n") j++
      if (j >= src.length || src[j] === "\n") {
        push("invalid", start, j, { problem: "Missing closing quote for the text", hint: `Close it with ${close}.` })
        i = j
        continue
      }
      push("string", start, j + 1, { value: src.slice(i + 1, j) })
      i = j + 1
      continue
    }

    // Field names and the AND / OR / NOT keywords.
    if (IDENT_START.test(ch)) {
      IDENT_RE.lastIndex = i
      const word = IDENT_RE.exec(src)![0]
      const lower = word.toLowerCase()
      const kind: TokenKind = lower === "and" ? "and" : lower === "or" ? "or" : lower === "not" ? "not" : "ident"
      push(kind, start, start + word.length)
      i += word.length
      continue
    }

    const two = src.slice(i, i + 2)
    if (two in COMPARE_OPS) {
      push("compare", start, start + 2, { value: COMPARE_OPS[two] })
      i += 2
      continue
    }
    if (two === "&&" || two === "||") {
      push(two === "&&" ? "and" : "or", start, start + 2)
      i += 2
      continue
    }
    if (ch in COMPARE_OPS) {
      push("compare", start, start + 1, { value: COMPARE_OPS[ch] })
      i++
      continue
    }
    if (ch in ARITH_OPS) {
      push("arith", start, start + 1, { value: ARITH_OPS[ch] })
      i++
      continue
    }
    if (ch === "!") {
      push("not", start, start + 1)
      i++
      continue
    }
    if (ch === "(" || ch === ")") {
      push(ch === "(" ? "lparen" : "rparen", start, start + 1)
      i++
      continue
    }
    const hint = ch === "&" ? "Use AND." : ch === "|" ? "Use OR." : ch === "," ? "Join conditions with AND or OR." : undefined
    push("invalid", start, start + 1, { problem: `Unexpected character ‘${ch}’`, hint })
    i++
  }
  tokens.push({ kind: "eof", text: "", start: src.length, end: src.length })
  return tokens
}

// ------------------------------------------------------------------ errors

export interface QueryFix {
  start: number
  end: number
  text: string
  label: string
}

export interface QueryError {
  message: string
  start: number
  end: number
  line: number
  column: number
  fix?: QueryFix
}

class QueryFailure extends Error {
  readonly error: QueryError
  constructor(error: QueryError) {
    super(error.message)
    this.error = error
  }
}

function locate(src: string, offset: number): { line: number; column: number } {
  let line = 1
  let column = 1
  for (let i = 0; i < offset && i < src.length; i++) {
    if (src[i] === "\n") {
      line++
      column = 1
    } else column++
  }
  return { line, column }
}

/** Build an error whose message reads "…at column 12. …" (or "line 2, column 5" for multi-line queries). */
function fail(src: string, start: number, end: number, lead: string, tail?: string, fix?: QueryFix): never {
  const { line, column } = locate(src, start)
  const where = src.includes("\n") ? `at line ${line}, column ${column}` : `at column ${column}`
  const message = `${lead} ${where}.${tail ? ` ${tail}` : ""}`
  throw new QueryFailure({ message, start, end: Math.max(end, start + 1), line, column, fix })
}

/** Edit distance with adjacent transpositions (optimal string alignment). */
function distance(a: string, b: string): number {
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array<number>(b.length).fill(0)])
  for (let j = 1; j <= b.length; j++) d[0]![j] = j
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      let v = Math.min(d[i - 1]![j]! + 1, d[i]![j - 1]! + 1, d[i - 1]![j - 1]! + cost)
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, d[i - 2]![j - 2]! + 1)
      d[i]![j] = v
    }
  }
  return d[a.length]![b.length]!
}

/** The closest field to a misspelt name, if any is close enough to be a sensible guess. */
export function suggestField(input: string): FieldDef | undefined {
  const q = input.toLowerCase()
  const squashed = q.replace(/_/g, "")
  let best: { field: FieldDef; d: number } | undefined
  for (const f of FIELDS) {
    for (const name of [f.name, ...(f.aliases ?? [])]) {
      let d = distance(q, name)
      if (squashed === name.replace(/_/g, "")) d = 0
      else if (q.length >= 3 && (name.startsWith(q) || q.startsWith(name))) d = Math.min(d, 1)
      if (!best || d < best.d) best = { field: f, d }
    }
  }
  const limit = q.length <= 3 ? 1 : q.length <= 7 ? 2 : 3
  return best && best.d <= limit ? best.field : undefined
}

function suggestKeyword(word: string): "AND" | "OR" | "NOT" | undefined {
  const w = word.toLowerCase()
  const options = [
    ["AND", distance(w, "and")],
    ["OR", distance(w, "or")],
    ["NOT", distance(w, "not")],
  ] as const
  const best = [...options].sort((a, b) => a[1] - b[1])[0]!
  return best[1] <= 1 && w.length >= 2 ? best[0] : undefined
}

function suggestSector(input: string): string | undefined {
  const q = input.toLowerCase()
  let best: { s: string; d: number } | undefined
  for (const s of SECTORS) {
    const name = s.toLowerCase()
    // "Finance" should find "Financials": compare against the name's prefix too.
    const prefix = q.length >= 4 && distance(q, name.slice(0, q.length)) <= 1
    const d = prefix || q.startsWith(name) ? 1 : distance(q, name)
    if (!best || d < best.d) best = { s, d }
  }
  return best && best.d <= Math.max(2, Math.floor(q.length / 3)) ? best.s : undefined
}

// --------------------------------------------------------------------- AST

interface Span {
  start: number
  end: number
}

export type Node =
  | ({ kind: "number"; value: number } & Span)
  | ({ kind: "string"; value: string } & Span)
  | ({ kind: "field"; field: FieldDef; text: string } & Span)
  | ({ kind: "neg"; arg: Node } & Span)
  | ({ kind: "arith"; op: ArithOp; opAt: number; left: Node; right: Node } & Span)
  | ({ kind: "compare"; ops: CompareOp[]; opAt: number[]; operands: Node[] } & Span)
  | ({ kind: "and" | "or"; left: Node; right: Node } & Span)
  | ({ kind: "not"; arg: Node } & Span)

const describe = (t: Token): string => (t.kind === "eof" ? "the end of the query" : `‘${t.text}’`)

class Parser {
  private pos = 0
  private readonly src: string
  private readonly tokens: Token[]
  readonly fields: FieldDef[] = []

  constructor(src: string, tokens: Token[]) {
    this.src = src
    this.tokens = tokens
  }

  private peek(): Token {
    return this.tokens[this.pos]!
  }

  private next(): Token {
    return this.tokens[this.pos++]!
  }

  parse(): Node {
    const node = this.parseOr()
    const t = this.peek()
    if (t.kind !== "eof") this.unexpectedAfter(t)
    return node
  }

  private parseOr(): Node {
    let left = this.parseAnd()
    while (this.peek().kind === "or") {
      const op = this.next()
      this.expectCondition(op)
      const right = this.parseAnd()
      left = { kind: "or", left, right, start: left.start, end: right.end }
    }
    return left
  }

  private parseAnd(): Node {
    let left = this.parseNot()
    while (this.peek().kind === "and") {
      const op = this.next()
      this.expectCondition(op)
      const right = this.parseNot()
      left = { kind: "and", left, right, start: left.start, end: right.end }
    }
    return left
  }

  private parseNot(): Node {
    if (this.peek().kind === "not") {
      const op = this.next()
      this.expectCondition(op)
      const arg = this.parseNot()
      return { kind: "not", arg, start: op.start, end: arg.end }
    }
    return this.parseComparison()
  }

  private parseComparison(): Node {
    const first = this.parseAdditive()
    const ops: CompareOp[] = []
    const opAt: number[] = []
    const operands: Node[] = [first]
    while (this.peek().kind === "compare") {
      const op = this.next()
      this.expectValue(op)
      ops.push(op.value as CompareOp)
      opAt.push(op.start)
      operands.push(this.parseAdditive())
    }
    if (ops.length === 0) return first
    return { kind: "compare", ops, opAt, operands, start: first.start, end: operands.at(-1)!.end }
  }

  private parseAdditive(): Node {
    let left = this.parseMultiplicative()
    while (this.peek().kind === "arith" && (this.peek().value === "+" || this.peek().value === "-")) {
      const op = this.next()
      this.expectValue(op)
      const right = this.parseMultiplicative()
      left = { kind: "arith", op: op.value as ArithOp, opAt: op.start, left, right, start: left.start, end: right.end }
    }
    return left
  }

  private parseMultiplicative(): Node {
    let left = this.parseUnary()
    while (this.peek().kind === "arith" && (this.peek().value === "*" || this.peek().value === "/")) {
      const op = this.next()
      this.expectValue(op)
      const right = this.parseUnary()
      left = { kind: "arith", op: op.value as ArithOp, opAt: op.start, left, right, start: left.start, end: right.end }
    }
    return left
  }

  private parseUnary(): Node {
    const t = this.peek()
    if (t.kind === "arith" && (t.value === "-" || t.value === "+")) {
      this.next()
      this.expectValue(t)
      const arg = this.parseUnary()
      return t.value === "-" ? { kind: "neg", arg, start: t.start, end: arg.end } : { ...arg, start: t.start }
    }
    return this.parsePrimary()
  }

  private parsePrimary(): Node {
    const t = this.peek()
    const src = this.src
    switch (t.kind) {
      case "number":
        this.next()
        return { kind: "number", value: t.value as number, start: t.start, end: t.end }
      case "string":
        this.next()
        return { kind: "string", value: t.value as string, start: t.start, end: t.end }
      case "ident": {
        this.next()
        const field = resolveField(t.text)
        const sector = field ? undefined : SECTORS.find((x) => x.toLowerCase() === t.text.toLowerCase())
        if (sector)
          fail(src, t.start, t.end, `‘${t.text}’ looks like a sector name`, `Put it in quotes: sector = "${sector}".`, {
            start: t.start,
            end: t.end,
            text: `"${sector}"`,
            label: "Add quotes",
          })
        if (!field) {
          const guess = suggestField(t.text)
          fail(
            src,
            t.start,
            t.end,
            `Unknown field ‘${t.text}’`,
            guess ? `Did you mean ‘${guess.name}’?` : "Open the field reference to see every field.",
            guess ? { start: t.start, end: t.end, text: guess.name, label: `Use ${guess.name}` } : undefined,
          )
        }
        if (!this.fields.includes(field)) this.fields.push(field)
        return { kind: "field", field, text: t.text, start: t.start, end: t.end }
      }
      case "lparen": {
        this.next()
        if (this.peek().kind === "rparen") fail(src, t.start, this.peek().end, "Empty parentheses", "Put a condition inside them.")
        const inner = this.parseOr()
        const close = this.peek()
        if (close.kind !== "rparen") {
          if (close.kind === "eof")
            fail(src, t.start, t.end, "Missing ‘)’ to close the ‘(’", undefined, {
              start: src.length,
              end: src.length,
              text: ")",
              label: "Add )",
            })
          this.unexpectedAfter(close)
        }
        this.next()
        return { ...inner, start: t.start, end: close.end }
      }
      case "invalid":
        return fail(src, t.start, t.end, t.problem ?? `Unexpected ‘${t.text}’`, t.hint)
      case "rparen":
        return fail(src, t.start, t.end, "Unexpected ‘)’")
      case "and":
      case "or":
        return fail(src, t.start, t.end, `Expected a condition before ‘${t.text}’`, "Start with a condition like roe > 15.")
      case "not":
        return fail(src, t.start, t.end, `‘${t.text}’ can't go here`, "Put NOT in front of a condition, like NOT sector = \"IT\".")
      case "compare":
      case "arith":
        return fail(src, t.start, t.end, `Expected a field or number before ‘${t.text}’`)
      case "eof":
        return fail(src, t.start, t.end, "The query ends too early")
    }
  }

  /** After AND / OR / NOT there must be another condition. */
  private expectCondition(op: Token) {
    const t = this.peek()
    const word = op.text.toUpperCase()
    if (t.kind === "eof") fail(this.src, op.start, op.end, `The query ends after ‘${word}’`, "Add a condition after it, like pe < 30.")
    if (t.kind === "rparen" || t.kind === "and" || t.kind === "or" || t.kind === "compare")
      fail(this.src, t.start, t.end, `Expected a condition after ‘${word}’, found ${describe(t)}`)
  }

  /** After a comparison or arithmetic operator there must be a value. */
  private expectValue(op: Token) {
    const t = this.peek()
    if (t.kind === "eof")
      fail(this.src, op.start, op.end, `The query ends after ‘${op.text}’`, "Add a number or field after it, like 15.")
    if (t.kind === "rparen" || t.kind === "and" || t.kind === "or" || t.kind === "compare" || t.kind === "not")
      fail(this.src, t.start, t.end, `Expected a number or field after ‘${op.text}’, found ${describe(t)}`)
  }

  /** A complete expression was followed by something that doesn't join onto it. */
  private unexpectedAfter(t: Token): never {
    const src = this.src
    if (t.kind === "rparen") fail(src, t.start, t.end, "Unexpected ‘)’", "It has no matching ‘(’.")
    if (t.kind === "invalid") fail(src, t.start, t.end, t.problem ?? `Unexpected ‘${t.text}’`, t.hint)
    if (t.kind === "ident" && !resolveField(t.text)) {
      const keyword = suggestKeyword(t.text)
      if (keyword)
        fail(src, t.start, t.end, `Unexpected ‘${t.text}’`, `Did you mean ‘${keyword}’?`, {
          start: t.start,
          end: t.end,
          text: keyword,
          label: `Use ${keyword}`,
        })
    }
    fail(src, t.start, t.end, `Missing AND or OR before ${describe(t)}`, undefined, {
      start: t.start,
      end: t.start,
      text: "AND ",
      label: "Insert AND",
    })
  }
}

// ---------------------------------------------------------------- checking

type ValueType = "number" | "text" | "bool"

function needsComparison(src: string, node: Node): never {
  if (node.kind === "field") fail(src, node.start, node.end, `‘${node.text}’ needs a comparison`, `For example: ${node.field.example}.`)
  if (node.kind === "number") fail(src, node.start, node.end, `‘${src.slice(node.start, node.end)}’ on its own isn't a condition`, "Compare a field with it, like pe < 15.")
  if (node.kind === "string") fail(src, node.start, node.end, `Text on its own isn't a condition`, 'Compare the sector with it, like sector = "IT".')
  fail(src, node.start, node.end, "This calculation needs a comparison", "For example: price > sma_200 * 1.05.")
}

function check(src: string, node: Node): ValueType {
  switch (node.kind) {
    case "number":
      return "number"
    case "string":
      return "text"
    case "field":
      return node.field.type
    case "neg": {
      const t = check(src, node.arg)
      if (t !== "number") fail(src, node.start, node.end, "A minus sign needs a number after it")
      return "number"
    }
    case "arith": {
      for (const side of [node.left, node.right]) {
        const t = check(src, side)
        if (t === "bool") fail(src, node.opAt, node.opAt + 1, `‘${node.op}’ can't combine conditions`, "Use AND or OR.")
        if (t === "text") fail(src, side.start, side.end, `‘${src.slice(side.start, side.end)}’ is text, so it can't be used in arithmetic`)
      }
      return "number"
    }
    case "compare": {
      const types = node.operands.map((o) => check(src, o))
      node.ops.forEach((op, i) => {
        const [a, b] = [node.operands[i]!, node.operands[i + 1]!]
        const [ta, tb] = [types[i]!, types[i + 1]!]
        const at = node.opAt[i]!
        if (ta === "bool" || tb === "bool")
          fail(src, at, at + op.length, `Can't use ‘${op}’ between conditions`, "Join conditions with AND or OR.")
        if (ta !== tb) {
          const [textSide, numberSide] = ta === "text" ? [a, b] : [b, a]
          if (textSide.kind === "string" && numberSide.kind === "field")
            fail(src, textSide.start, textSide.end, `‘${numberSide.text}’ is a number, not text`, `Compare it with a number, like ${numberSide.field.example}.`)
          if (textSide.kind === "field")
            fail(src, numberSide.start, numberSide.end, `‘${textSide.text}’ is text`, `Compare it with a quoted name, like ${textSide.field.example}.`)
          fail(src, at, at + op.length, `Can't compare text with a number using ‘${op}’`)
        }
        if (ta === "text") {
          if (op !== "=" && op !== "!=")
            fail(src, at, at + op.length, `Text can only be compared with = or !=`, `For example: sector != "Financials".`)
          for (const side of [a, b]) {
            if (side.kind !== "string") continue
            if (SECTORS.some((s) => s.toLowerCase() === side.value.toLowerCase())) continue
            const guess = suggestSector(side.value)
            fail(
              src,
              side.start,
              side.end,
              `Unknown sector ‘${side.value}’`,
              guess ? `Did you mean ‘${guess}’?` : `Sectors: ${SECTORS.join(", ")}.`,
              guess ? { start: side.start, end: side.end, text: `"${guess}"`, label: `Use ${guess}` } : undefined,
            )
          }
        }
      })
      return "bool"
    }
    case "and":
    case "or":
      for (const side of [node.left, node.right]) if (check(src, side) !== "bool") needsComparison(src, side)
      return "bool"
    case "not":
      if (check(src, node.arg) !== "bool") needsComparison(src, node.arg)
      return "bool"
  }
}

// -------------------------------------------------------------- evaluation

type Value = number | string | boolean | null

function compare(a: Value, op: CompareOp, b: Value): boolean | null {
  if (a == null || b == null) return null
  if (typeof a === "string" || typeof b === "string") {
    const same = String(a).toLowerCase() === String(b).toLowerCase()
    return op === "=" ? same : !same
  }
  switch (op) {
    case ">":
      return a > b
    case ">=":
      return a >= b
    case "<":
      return a < b
    case "<=":
      return a <= b
    case "=":
      return Math.abs((a as number) - (b as number)) < 1e-9
    case "!=":
      return Math.abs((a as number) - (b as number)) >= 1e-9
  }
}

function evaluate(node: Node, row: LiveRow): Value {
  switch (node.kind) {
    case "number":
    case "string":
      return node.value
    case "field":
      return node.field.get(row)
    case "neg": {
      const v = evaluate(node.arg, row)
      return v == null ? null : -(v as number)
    }
    case "arith": {
      const a = evaluate(node.left, row) as number | null
      const b = evaluate(node.right, row) as number | null
      if (a == null || b == null) return null
      const v = node.op === "+" ? a + b : node.op === "-" ? a - b : node.op === "*" ? a * b : a / b
      return Number.isFinite(v) ? v : null
    }
    case "compare": {
      // 10 < pe < 25 means 10 < pe AND pe < 25.
      let result: boolean | null = true
      let left = evaluate(node.operands[0]!, row)
      for (let i = 0; i < node.ops.length; i++) {
        const right = evaluate(node.operands[i + 1]!, row)
        const r = compare(left, node.ops[i]!, right)
        if (r === false) return false
        if (r === null) result = null
        left = right
      }
      return result
    }
    case "and": {
      const a = evaluate(node.left, row)
      if (a === false) return false
      const b = evaluate(node.right, row)
      if (b === false) return false
      return a === null || b === null ? null : true
    }
    case "or": {
      const a = evaluate(node.left, row)
      if (a === true) return true
      const b = evaluate(node.right, row)
      if (b === true) return true
      return a === null || b === null ? null : false
    }
    case "not": {
      const v = evaluate(node.arg, row)
      return v === null ? null : !v
    }
  }
}

// ----------------------------------------------------------------- compile

export interface CompiledOk {
  ok: true
  source: string
  /** Nothing to filter on: every row matches. */
  empty: boolean
  /** Fields the query reads, in order of first use. */
  fields: FieldDef[]
  /** Reads the live price or change, so results move with the feed. */
  usesLive: boolean
  test: (row: LiveRow) => boolean
}

export interface CompiledError {
  ok: false
  source: string
  error: QueryError
}

export type CompiledQuery = CompiledOk | CompiledError

export function compileQuery(source: string): CompiledQuery {
  const tokens = lex(source)
  if (tokens.length === 1) return { ok: true, source, empty: true, fields: [], usesLive: false, test: () => true }
  try {
    const parser = new Parser(source, tokens)
    const ast = parser.parse()
    if (check(source, ast) !== "bool") needsComparison(source, ast)
    return {
      ok: true,
      source,
      empty: false,
      fields: parser.fields,
      usesLive: parser.fields.some((f) => f.live),
      test: (row) => evaluate(ast, row) === true,
    }
  } catch (e) {
    if (e instanceof QueryFailure) return { ok: false, source, error: e.error }
    throw e
  }
}

/** Apply a suggested fix to the query text. */
export function applyFix(source: string, fix: QueryFix): string {
  return source.slice(0, fix.start) + fix.text + source.slice(fix.end)
}

/** Queries that differ only in spacing or keyword case are the same screen. */
export function normalizeQuery(source: string): string {
  return lex(source)
    .filter((t) => t.kind !== "eof")
    .map((t) => (t.kind === "and" || t.kind === "or" || t.kind === "not" || t.kind === "ident" ? t.text.toLowerCase() : t.text))
    .join(" ")
}

// ------------------------------------------------------------ highlighting

export type HighlightKind = "plain" | "field" | "unknown" | "keyword" | "number" | "string" | "operator" | "paren" | "invalid"

export interface HighlightSegment {
  text: string
  kind: HighlightKind
  /** Inside the range of the error being shown. */
  error: boolean
}

/** Coloured segments for the editor's mirror layer. The segments' text concatenates back to the source. */
export function highlight(source: string, errorRange?: { start: number; end: number } | null): HighlightSegment[] {
  const pieces: { start: number; end: number; kind: HighlightKind }[] = []
  let last = 0
  for (const t of lex(source)) {
    if (t.kind === "eof") break
    if (t.start > last) pieces.push({ start: last, end: t.start, kind: "plain" })
    const kind: HighlightKind =
      t.kind === "ident"
        ? resolveField(t.text)
          ? "field"
          : "unknown"
        : t.kind === "and" || t.kind === "or" || t.kind === "not"
          ? "keyword"
          : t.kind === "number"
            ? "number"
            : t.kind === "string"
              ? "string"
              : t.kind === "compare" || t.kind === "arith"
                ? "operator"
                : t.kind === "lparen" || t.kind === "rparen"
                  ? "paren"
                  : "invalid"
    pieces.push({ start: t.start, end: t.end, kind })
    last = t.end
  }
  if (last < source.length) pieces.push({ start: last, end: source.length, kind: "plain" })

  // Split pieces at the error range so it can be underlined exactly.
  const out: HighlightSegment[] = []
  const cuts = errorRange ? [errorRange.start, Math.min(errorRange.end, source.length)] : []
  for (const p of pieces) {
    const bounds = [p.start, ...cuts.filter((c) => c > p.start && c < p.end), p.end]
    for (let i = 0; i < bounds.length - 1; i++) {
      const [s, e] = [bounds[i]!, bounds[i + 1]!]
      out.push({
        text: source.slice(s, e),
        kind: p.kind,
        error: !!errorRange && s >= errorRange.start && e <= Math.max(errorRange.end, errorRange.start + 1),
      })
    }
  }
  return out
}
