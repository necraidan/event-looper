import type * as ES from 'estree';
import type { Span } from './types';

export type FunctionNode = ES.FunctionDeclaration | ES.FunctionExpression | ES.ArrowFunctionExpression;

/** Value yielded by the evaluator when it reaches an `await`. */
export interface AwaitSignal {
  value: unknown;
}

export type Gen<T = unknown> = Generator<AwaitSignal, T, unknown>;

interface Binding {
  value: unknown;
  kind: 'var' | 'let' | 'const' | 'param' | 'function';
}

export class Scope {
  readonly vars = new Map<string, Binding>();
  readonly parent: Scope | null;
  readonly isFunction: boolean;
  hasThis = false;
  thisValue: unknown = undefined;

  constructor(parent: Scope | null, isFunction = false) {
    this.parent = parent;
    this.isFunction = isFunction;
  }

  declare(name: string, value: unknown, kind: Binding['kind']) {
    this.vars.set(name, { value, kind });
  }

  lookup(name: string): Binding | undefined {
    for (let s: Scope | null = this; s; s = s.parent) {
      const b = s.vars.get(name);
      if (b) return b;
    }
    return undefined;
  }

  functionScope(): Scope {
    let s: Scope = this;
    while (!s.isFunction && s.parent) s = s.parent;
    return s;
  }

  resolveThis(): unknown {
    for (let s: Scope | null = this; s; s = s.parent) {
      if (s.hasThis) return s.thisValue;
    }
    return undefined;
  }
}

export class Closure {
  readonly node: FunctionNode;
  readonly scope: Scope;
  name: string;

  constructor(node: FunctionNode, scope: Scope, name: string) {
    this.node = node;
    this.scope = scope;
    this.name = name;
  }

  get isAsync() {
    return this.node.async;
  }

  get isArrow() {
    return this.node.type === 'ArrowFunctionExpression';
  }
}

export class NativeFn {
  readonly name: string;
  readonly impl: (thisArg: unknown, args: unknown[]) => Gen;
  readonly props: Record<string, unknown>;
  readonly construct?: (args: unknown[]) => Gen;

  constructor(
    name: string,
    impl: (thisArg: unknown, args: unknown[]) => Gen,
    options: { props?: Record<string, unknown>; construct?: (args: unknown[]) => Gen } = {},
  ) {
    this.name = name;
    this.impl = impl;
    this.props = options.props ?? {};
    this.construct = options.construct;
  }
}

export type Callable = Closure | NativeFn;

export const isCallable = (v: unknown): v is Callable => v instanceof Closure || v instanceof NativeFn;

export interface Reaction {
  onFulfilled?: Callable;
  onRejected?: Callable;
  derived?: SimPromise;
  source: 'then' | 'await' | 'thenable';
  label: string;
}

let promiseIds = 0;

export class SimPromise {
  readonly id = ++promiseIds;
  state: 'pending' | 'fulfilled' | 'rejected' = 'pending';
  value: unknown = undefined;
  reactions: Reaction[] = [];
  handled = false;
}

export class JsError {
  readonly name: string;
  readonly message: string;

  constructor(name: string, message: string) {
    this.name = name;
    this.message = message;
  }
}

/** A JS exception thrown by the simulated program. */
export class ThrowSignal {
  readonly value: unknown;

  constructor(value: unknown) {
    this.value = value;
  }
}

export class ReturnSignal {
  readonly value: unknown;

  constructor(value: unknown) {
    this.value = value;
  }
}

export class BreakSignal {}
export class ContinueSignal {}

/** Aborts the whole simulation (unsupported syntax, runaway program…). */
export class EngineError {
  readonly key: string;
  readonly params: Record<string, string | number>;
  readonly span?: Span;

  constructor(key: string, params: Record<string, string | number> = {}, span?: Span) {
    this.key = key;
    this.params = params;
    this.span = span;
  }
}

export const functionName = (fn: unknown): string => (isCallable(fn) ? fn.name : '');

export function formatValue(value: unknown, nested = false, seen = new Set<unknown>()): string {
  if (typeof value === 'string') return nested ? `'${value}'` : value;
  if (value === undefined) return 'undefined';
  if (value === null) return 'null';
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') return String(value);
  if (value instanceof Closure || value instanceof NativeFn) return `ƒ ${value.name || ''}()`;
  if (value instanceof SimPromise) {
    if (value.state === 'pending') return 'Promise {<pending>}';
    const inner = formatValue(value.value, true, seen);
    return value.state === 'fulfilled' ? `Promise {${inner}}` : `Promise {<rejected> ${inner}}`;
  }
  if (value instanceof JsError) return value.message ? `${value.name}: ${value.message}` : value.name;
  if (seen.has(value)) return '[Circular]';
  seen.add(value);
  try {
    if (Array.isArray(value)) return `[${value.map((v) => formatValue(v, true, seen)).join(', ')}]`;
    const entries = Object.entries(value as object).map(([k, v]) => `${k}: ${formatValue(v, true, seen)}`);
    return entries.length ? `{ ${entries.join(', ')} }` : '{}';
  } finally {
    seen.delete(value);
  }
}
