import { parse } from 'acorn';
import type * as ES from 'estree';
import type {
  ConsoleLine,
  FrameView,
  LoopPhase,
  QueueItemView,
  QueueSource,
  RunResult,
  SimulateOptions,
  Snapshot,
  Span,
  WebApiView,
} from './types';
import {
  BreakSignal,
  type Callable,
  Closure,
  ContinueSignal,
  EngineError,
  type Gen,
  JsError,
  NativeFn,
  type Reaction,
  ReturnSignal,
  Scope,
  SimPromise,
  ThrowSignal,
  formatValue,
  functionName,
  isCallable,
} from './values';

const MAX_STEPS = 2000;
const MAX_OPS = 100_000;
export const FETCH_DELAY = 500;
const FRAME_DURATION = 16;

/** Result of an optional chain that short-circuited (`a?.b` with `a == null`). */
const SHORT = Symbol('short');

type BindKind = 'var' | 'let' | 'const' | 'param' | 'assign';

interface QueueItem extends QueueItemView {
  timerId?: number;
  run: () => Gen;
}

interface Callback {
  id: number;
  name: string;
  cb: Callable;
}

interface WebApi extends Omit<WebApiView, 'remaining'> {
  readyAt: number;
  complete: () => void;
}

const span = (node: ES.Node): Span => {
  const { start, end } = node as unknown as Span;
  return { start, end };
};

const isObjectLike = (v: unknown): v is Record<PropertyKey, unknown> =>
  typeof v === 'object' && v !== null && !(v instanceof SimPromise);

export function simulate(code: string, options: SimulateOptions = {}): RunResult {
  let program: ES.Program;
  try {
    program = parse(code, { ecmaVersion: 'latest', sourceType: 'script' }) as unknown as ES.Program;
  } catch (e) {
    const err = e as SyntaxError & { pos?: number };
    const pos = err.pos ?? 0;
    return {
      steps: [],
      error: { key: 'error.syntax', params: { message: err.message }, span: { start: pos, end: pos + 1 } },
    };
  }
  const interpreter = new Interpreter(code, options);
  try {
    interpreter.run(program);
  } catch (e) {
    // Deep user recursion exhausts the host stack before MAX_OPS is reached.
    if (e instanceof RangeError) return { steps: interpreter.steps, error: { key: 'error.stackOverflow' } };
    if (!(e instanceof EngineError)) throw e;
    return { steps: interpreter.steps, error: { key: e.key, params: e.params, span: e.span } };
  }
  return { steps: interpreter.steps };
}

class Interpreter {
  readonly steps: Snapshot[] = [];
  private readonly code: string;
  private readonly global = new Scope(null, true);
  private frames: FrameView[] = [];
  private tasks: QueueItem[] = [];
  private microtasks: QueueItem[] = [];
  private webApis: WebApi[] = [];
  private consoleLines: ConsoleLine[] = [];
  private pendingRejections = new Set<SimPromise>();
  private phase: LoopPhase = 'script';
  private time = 0;
  private ops = 0;
  private ids = 0;
  private readonly pendingClicks: Set<number>;
  private listeners: Callback[] = [];
  private animationFrames: Callback[] = [];
  private nextFrame = 0;
  private readonly arrayMethods: Record<string, NativeFn>;
  private readonly promiseMethods: Record<string, NativeFn>;
  private readonly functionMethods: Record<string, NativeFn>;
  private readonly button: Record<string, unknown>;

  constructor(code: string, options: SimulateOptions) {
    this.code = code;
    this.pendingClicks = new Set(options.clicks);
    this.arrayMethods = this.createArrayMethods();
    this.promiseMethods = this.createPromiseMethods();
    this.functionMethods = this.createFunctionMethods();
    this.button = this.createButton();
    this.installGlobals();
  }

  // ───────────────────────── Run & event loop ─────────────────────────

  run(program: ES.Program) {
    const statements = program.body as ES.Statement[];
    // Function declarations are hoisted, not executed: start on the first statement that actually runs.
    const first = statements.find((st) => st.type !== 'FunctionDeclaration') ?? statements[0];
    this.pushFrame('', true, first ? span(first) : span(program));
    this.snap('start');
    try {
      this.drive(this.execBody(statements, this.global));
    } catch (e) {
      this.handleUncaught(e);
    }
    this.frames = [];
    this.snap('scriptEnd');
    this.loop();
  }

  private loop() {
    for (;;) {
      this.drainMicrotasks();
      this.reportUnhandledRejections();
      if (this.tasks.length === 0) {
        if (this.webApis.length === 0 && this.animationFrames.length === 0) {
          // Clicks recorded after the program went idle still get dispatched.
          if (this.pendingClicks.size === 0) break;
          this.pendingClicks.clear();
          this.dispatchClick();
          continue;
        }
        const nextTimer = Math.min(...this.webApis.map((w) => w.readyAt));
        if (this.animationFrames.length && this.nextFrame <= nextTimer) this.render();
        else this.advanceTime();
        continue;
      }
      if (this.animationFrames.length && this.time >= this.nextFrame) {
        this.render();
        continue;
      }
      this.phase = 'task';
      this.runQueued(this.tasks, 'loop.runTask');
    }
    this.phase = 'done';
    this.snap('loop.done');
  }

  private drainMicrotasks() {
    while (this.microtasks.length) {
      this.phase = 'microtasks';
      this.runQueued(this.microtasks, 'loop.runMicrotask');
    }
  }

  private runQueued(queue: QueueItem[], key: string) {
    const item = queue[0];
    this.snap(key, { name: item.name, source: item.source });
    queue.shift();
    try {
      this.drive(item.run());
    } catch (e) {
      this.handleUncaught(e);
    }
  }

  private advanceTime() {
    this.phase = 'timers';
    const next = Math.min(...this.webApis.map((w) => w.readyAt));
    if (next > this.time) {
      this.time = next;
      this.snap('loop.waitTimers', { time: next });
    }
    const due = this.webApis.filter((w) => w.readyAt <= this.time).sort((a, b) => a.readyAt - b.readyAt || a.id - b.id);
    for (const api of due) api.complete();
  }

  /** Rendering opportunity: runs every pending requestAnimationFrame callback. */
  private render() {
    if (this.nextFrame > this.time) this.time = this.nextFrame;
    this.phase = 'render';
    this.snap('loop.render', { time: this.time });
    const callbacks = this.animationFrames;
    this.animationFrames = [];
    for (const { name, cb } of callbacks) {
      this.phase = 'render';
      this.snap('loop.runAnimationFrame', { name });
      try {
        this.drive(this.callFunction(cb, undefined, [this.time]));
      } catch (e) {
        this.handleUncaught(e);
      }
      this.drainMicrotasks();
    }
  }

  private dispatchClick() {
    if (this.listeners.length === 0) {
      this.snap('event.clickIgnored');
      return;
    }
    const event = { type: 'click' };
    for (const { name, cb } of this.listeners) {
      this.enqueueTask({
        id: ++this.ids,
        name,
        source: 'click',
        run: () => this.callFunction(cb, this.button, [event]),
      });
    }
    this.snap('event.click', { count: this.listeners.length });
  }

  private handleUncaught(e: unknown) {
    if (!(e instanceof ThrowSignal)) throw e;
    this.frames = [];
    const text = `Uncaught ${formatValue(e.value)}`;
    this.consoleLines.push({ id: ++this.ids, level: 'error', text });
    this.snap('uncaught', { text });
  }

  private reportUnhandledRejections() {
    for (const p of this.pendingRejections) {
      const text = `Uncaught (in promise) ${formatValue(p.value)}`;
      this.consoleLines.push({ id: ++this.ids, level: 'error', text });
      this.snap('unhandledRejection', { text });
    }
    this.pendingRejections.clear();
  }

  /** Runs a generator that must not suspend (only async functions may `await`). */
  private drive<T>(gen: Gen<T>): T {
    const r = gen.next();
    if (!r.done) throw new EngineError('error.awaitOutsideAsync');
    return r.value;
  }

  // ───────────────────────── Snapshots ─────────────────────────

  private snap(key: string, params: Record<string, string | number> = {}) {
    if (this.steps.length >= MAX_STEPS) throw new EngineError('error.tooManySteps', { max: MAX_STEPS });
    const queueView = ({ id, name, source }: QueueItem): QueueItemView => ({ id, name, source });
    this.steps.push({
      stack: this.frames.map((f) => ({ ...f })),
      webApis: [
        ...this.listeners.map(({ id, name }) => ({ id, kind: 'click' as const, name, delay: 0, remaining: 0 })),
        ...this.webApis.map(({ id, kind, name, delay, readyAt }) => ({
          id,
          kind,
          name,
          delay,
          remaining: readyAt - this.time,
        })),
        ...this.animationFrames.map(({ id, name }) => ({
          id,
          kind: 'requestAnimationFrame' as const,
          name,
          delay: FRAME_DURATION,
          remaining: Math.max(0, this.nextFrame - this.time),
        })),
      ],
      tasks: this.tasks.map(queueView),
      microtasks: this.microtasks.map(queueView),
      console: [...this.consoleLines],
      highlight: this.frames.at(-1)?.span,
      phase: this.phase,
      time: this.time,
      explanation: { key, params },
    });
    if (this.pendingClicks.delete(this.steps.length - 1)) this.dispatchClick();
  }

  private pushFrame(name: string, isScript: boolean, at?: Span) {
    this.frames.push({ id: ++this.ids, name, isScript, span: at });
  }

  private popFrame() {
    this.frames.pop();
  }

  private setCursor(node: ES.Node) {
    const top = this.frames.at(-1);
    if (top) top.span = span(node);
  }

  private tick() {
    if (++this.ops > MAX_OPS) throw new EngineError('error.tooManyOps');
  }

  // ───────────────────────── Queues & Web APIs ─────────────────────────

  private enqueueTask(item: QueueItem) {
    this.tasks.push(item);
  }

  private enqueueMicrotask(name: string, source: QueueSource, run: () => Gen) {
    this.microtasks.push({ id: ++this.ids, name, source, run });
    this.snap(`enqueue.${source}`, { name });
  }

  private addTimer(kind: 'setTimeout' | 'setInterval', cb: unknown, delayArg: unknown, args: unknown[]) {
    if (!isCallable(cb)) throw this.typeError(`The "callback" argument must be of type function`);
    const delay = Math.max(0, Number(delayArg) || 0);
    const id = ++this.ids;
    const name = cb.name;
    const api: WebApi = {
      id,
      kind,
      name,
      delay,
      readyAt: this.time + delay,
      complete: () => {
        if (kind === 'setTimeout') this.removeWebApi(id);
        else api.readyAt += Math.max(delay, 1);
        this.enqueueTask({
          id: ++this.ids,
          name,
          source: kind,
          timerId: id,
          run: () => this.callFunction(cb, undefined, args),
        });
        this.snap('timerDone', { name, time: this.time });
      },
    };
    this.webApis.push(api);
    this.snap(`webapi.${kind}`, { name, delay });
    return id;
  }

  private clearTimer(id: unknown) {
    const before = this.webApis.length + this.tasks.length;
    this.removeWebApi(id);
    this.tasks = this.tasks.filter((t) => t.timerId !== id);
    if (this.webApis.length + this.tasks.length !== before) this.snap('webapi.clear', { id: String(id) });
  }

  private removeWebApi(id: unknown) {
    this.webApis = this.webApis.filter((w) => w.id !== id);
  }

  private fetch(urlArg: unknown): SimPromise {
    const url = String(urlArg);
    const promise = new SimPromise();
    const id = ++this.ids;
    this.webApis.push({
      id,
      kind: 'fetch',
      name: url,
      delay: FETCH_DELAY,
      readyAt: this.time + FETCH_DELAY,
      complete: () => {
        this.removeWebApi(id);
        const self = this;
        this.enqueueTask({
          id: ++this.ids,
          name: url,
          source: 'fetch',
          *run() {
            self.resolvePromise(promise, self.createResponse(url));
            self.snap('fetchResolved', { url });
          },
        });
        this.snap('fetchDone', { url });
      },
    });
    this.snap('webapi.fetch', { url, delay: FETCH_DELAY });
    return promise;
  }

  private createResponse(url: string) {
    const self = this;
    const body = { url, message: 'Hello!' };
    return {
      ok: true,
      status: 200,
      url,
      json: new NativeFn('json', function* () {
        return self.promiseResolve(body);
      }),
      text: new NativeFn('text', function* () {
        return self.promiseResolve(JSON.stringify(body));
      }),
    };
  }

  // ───────────────────────── Promises ─────────────────────────

  private promiseResolve(value: unknown): SimPromise {
    if (value instanceof SimPromise) return value;
    const p = new SimPromise();
    this.resolvePromise(p, value);
    return p;
  }

  private createResolvingFunctions(p: SimPromise) {
    const self = this;
    let done = false;
    const resolve = new NativeFn('resolve', function* (_, [value]) {
      if (done) return;
      done = true;
      self.resolvePromise(p, value);
    });
    const reject = new NativeFn('reject', function* (_, [reason]) {
      if (done) return;
      done = true;
      self.settle(p, 'rejected', reason);
    });
    return { resolve, reject };
  }

  private resolvePromise(p: SimPromise, value: unknown) {
    if (value === p) {
      this.settle(p, 'rejected', new JsError('TypeError', 'Chaining cycle detected for promise'));
      return;
    }
    const self = this;
    if (value instanceof SimPromise) {
      const fns = this.createResolvingFunctions(p);
      this.enqueueMicrotask('', 'thenable', function* () {
        self.performThen(value, fns.resolve, fns.reject, undefined, 'thenable', '');
      });
      return;
    }
    if (isObjectLike(value) && isCallable(value.then)) {
      const then = value.then;
      const fns = this.createResolvingFunctions(p);
      this.enqueueMicrotask(then.name, 'thenable', function* () {
        try {
          yield* self.callFunction(then, value, [fns.resolve, fns.reject]);
        } catch (e) {
          if (!(e instanceof ThrowSignal)) throw e;
          yield* fns.reject.impl(undefined, [e.value]);
        }
      });
      return;
    }
    this.settle(p, 'fulfilled', value);
  }

  private settle(p: SimPromise, state: 'fulfilled' | 'rejected', value: unknown) {
    if (p.state !== 'pending') return;
    p.state = state;
    p.value = value;
    const reactions = p.reactions;
    p.reactions = [];
    if (state === 'rejected' && !p.handled) this.pendingRejections.add(p);
    for (const r of reactions) this.enqueueReaction(r, state, value);
  }

  private performThen(
    p: SimPromise,
    onFulfilled: unknown,
    onRejected: unknown,
    derived: SimPromise | undefined,
    source: Reaction['source'],
    label: string,
  ) {
    const reaction: Reaction = {
      onFulfilled: isCallable(onFulfilled) ? onFulfilled : undefined,
      onRejected: isCallable(onRejected) ? onRejected : undefined,
      derived,
      source,
      label,
    };
    if (p.state === 'pending') p.reactions.push(reaction);
    else this.enqueueReaction(reaction, p.state, p.value);
    p.handled = true;
    this.pendingRejections.delete(p);
  }

  private enqueueReaction(r: Reaction, state: 'fulfilled' | 'rejected', argument: unknown) {
    const self = this;
    const handler = state === 'fulfilled' ? r.onFulfilled : r.onRejected;
    const name = r.label || functionName(handler);
    this.enqueueMicrotask(name, handler ? r.source : 'passThrough', function* () {
      if (!handler) {
        if (r.derived) {
          if (state === 'fulfilled') self.resolvePromise(r.derived, argument);
          else self.settle(r.derived, 'rejected', argument);
        }
        return;
      }
      let result: unknown;
      try {
        result = yield* self.callFunction(handler, undefined, [argument]);
      } catch (e) {
        if (e instanceof ThrowSignal && r.derived) {
          self.settle(r.derived, 'rejected', e.value);
          return;
        }
        throw e;
      }
      if (r.derived) self.resolvePromise(r.derived, result);
    });
  }

  private then(p: SimPromise, onFulfilled: unknown, onRejected: unknown): SimPromise {
    const derived = new SimPromise();
    this.performThen(p, onFulfilled, onRejected, derived, 'then', '');
    return derived;
  }

  // ───────────────────────── Functions ─────────────────────────

  private *callFunction(fn: unknown, thisArg: unknown, args: unknown[]): Gen {
    if (fn instanceof NativeFn) {
      try {
        return yield* fn.impl(thisArg, args);
      } catch (e) {
        throw this.hostError(e);
      }
    }
    if (!(fn instanceof Closure)) throw this.typeError(`${formatValue(fn, true)} is not a function`);
    if (fn.isAsync) return this.startAsync(fn, thisArg, args);
    this.pushFrame(fn.name, false, this.callSite(fn));
    this.snap('call', { name: fn.name });
    let result: unknown;
    try {
      result = yield* this.runBody(fn, thisArg, args);
    } catch (e) {
      this.popFrame();
      throw e;
    }
    this.popFrame();
    this.snap('return', { name: fn.name, value: formatValue(result, true) });
    return result;
  }

  /** Where a call is shown: the caller's current line, or the function itself when called by the event loop. */
  private callSite(fn: Closure): Span | undefined {
    return this.frames.at(-1)?.span ?? span(fn.node);
  }

  private startAsync(fn: Closure, thisArg: unknown, args: unknown[]): SimPromise {
    const promise = new SimPromise();
    this.pushFrame(fn.name, false, this.callSite(fn));
    this.snap('callAsync', { name: fn.name });
    this.stepAsync(fn, this.runBody(fn, thisArg, args), promise, true, undefined);
    return promise;
  }

  /** Drives an async function body until its next `await` or its completion. */
  private stepAsync(fn: Closure, body: Gen, promise: SimPromise, ok: boolean, input: unknown) {
    const self = this;
    let r: IteratorResult<{ value: unknown }, unknown>;
    try {
      r = ok ? body.next(input) : body.throw(new ThrowSignal(input));
    } catch (e) {
      if (!(e instanceof ThrowSignal)) throw e;
      this.popFrame();
      this.settle(promise, 'rejected', e.value);
      this.snap('asyncThrow', { name: fn.name, text: formatValue(e.value, true) });
      return;
    }
    if (r.done) {
      this.popFrame();
      this.resolvePromise(promise, r.value);
      this.snap('asyncDone', { name: fn.name, value: formatValue(r.value, true) });
      return;
    }
    const awaited = this.promiseResolve(r.value.value);
    const at = this.frames.at(-1)?.span;
    const resume = (resumeOk: boolean) =>
      new NativeFn(fn.name, function* (_, [value]) {
        self.pushFrame(fn.name, false, at);
        self.snap(resumeOk ? 'asyncResume' : 'asyncResumeThrow', { name: fn.name, value: formatValue(value, true) });
        self.stepAsync(fn, body, promise, resumeOk, value);
      });
    this.snap('awaitValue', { name: fn.name, value: formatValue(awaited, true) });
    this.performThen(awaited, resume(true), resume(false), undefined, 'await', fn.name);
    this.popFrame();
    this.snap('awaitSuspend', { name: fn.name });
  }

  private *runBody(fn: Closure, thisArg: unknown, args: unknown[]): Gen {
    const node = fn.node;
    if (node.generator) throw this.unsupported(node, 'generator');
    const scope = new Scope(fn.scope, true);
    if (!fn.isArrow) {
      scope.hasThis = true;
      scope.thisValue = thisArg;
    }
    if (node.type === 'FunctionExpression' && node.id) scope.declare(node.id.name, fn, 'function');
    for (let i = 0; i < node.params.length; i++) {
      const param = node.params[i];
      if (param.type === 'RestElement') yield* this.bindPattern(param.argument, args.slice(i), scope, 'param');
      else yield* this.bindPattern(param, args[i], scope, 'param');
    }
    if (node.body.type !== 'BlockStatement') {
      this.setCursor(node.body);
      return yield* this.evalExpr(node.body, scope);
    }
    try {
      yield* this.execBody(node.body.body, scope);
    } catch (e) {
      if (e instanceof ReturnSignal) return e.value;
      throw e;
    }
    return undefined;
  }

  // ───────────────────────── Declarations ─────────────────────────

  private hoist(statements: ES.Node[], scope: Scope) {
    const fnScope = scope.functionScope();
    for (const stmt of statements) {
      if (stmt.type === 'FunctionDeclaration' && stmt.id) {
        scope.declare(stmt.id.name, new Closure(stmt, scope, stmt.id.name), 'function');
      } else {
        this.hoistVars(stmt, fnScope);
      }
    }
  }

  private hoistVars(node: ES.Node | null | undefined, fnScope: Scope) {
    if (!node) return;
    switch (node.type) {
      case 'VariableDeclaration':
        if (node.kind === 'var') {
          for (const d of node.declarations) {
            for (const name of patternNames(d.id)) if (!fnScope.vars.has(name)) fnScope.declare(name, undefined, 'var');
          }
        }
        return;
      case 'IfStatement':
        this.hoistVars(node.consequent, fnScope);
        this.hoistVars(node.alternate, fnScope);
        return;
      case 'BlockStatement':
        node.body.forEach((s) => this.hoistVars(s, fnScope));
        return;
      case 'ForStatement':
        this.hoistVars(node.init, fnScope);
        this.hoistVars(node.body, fnScope);
        return;
      case 'ForInStatement':
      case 'ForOfStatement':
        this.hoistVars(node.left, fnScope);
        this.hoistVars(node.body, fnScope);
        return;
      case 'WhileStatement':
      case 'DoWhileStatement':
      case 'LabeledStatement':
        this.hoistVars(node.body, fnScope);
        return;
      case 'TryStatement':
        this.hoistVars(node.block, fnScope);
        this.hoistVars(node.handler?.body, fnScope);
        this.hoistVars(node.finalizer, fnScope);
        return;
      case 'SwitchStatement':
        node.cases.forEach((c) => c.consequent.forEach((s) => this.hoistVars(s, fnScope)));
        return;
    }
  }

  private *bindPattern(pattern: ES.Pattern, value: unknown, scope: Scope, kind: BindKind): Gen<void> {
    switch (pattern.type) {
      case 'Identifier':
        this.bindName(scope, pattern.name, value, kind);
        return;
      case 'AssignmentPattern': {
        let v = value;
        if (v === undefined) {
          v = yield* this.evalExpr(pattern.right, scope);
          nameAnonymous(v, pattern.left);
        }
        yield* this.bindPattern(pattern.left, v, scope, kind);
        return;
      }
      case 'ArrayPattern': {
        const items = this.iterate(value);
        for (let i = 0; i < pattern.elements.length; i++) {
          const el = pattern.elements[i];
          if (!el) continue;
          if (el.type === 'RestElement') yield* this.bindPattern(el.argument, items.slice(i), scope, kind);
          else yield* this.bindPattern(el, items[i], scope, kind);
        }
        return;
      }
      case 'ObjectPattern': {
        if (value == null)
          throw this.typeError(`Cannot destructure '${formatValue(value)}' as it is ${formatValue(value)}.`);
        const used = new Set<PropertyKey>();
        for (const prop of pattern.properties) {
          if (prop.type === 'RestElement') {
            const rest: Record<PropertyKey, unknown> = {};
            for (const [k, v] of Object.entries(value)) if (!used.has(k)) rest[k] = v;
            yield* this.bindPattern(prop.argument, rest, scope, kind);
            continue;
          }
          const key = prop.computed ? toKey(yield* this.evalExpr(prop.key, scope)) : propertyName(prop.key);
          used.add(key);
          yield* this.bindPattern(prop.value, this.getProperty(value, key), scope, kind);
        }
        return;
      }
      case 'MemberExpression': {
        if (kind !== 'assign') throw this.unsupported(pattern);
        const obj = yield* this.evalExpr(pattern.object, scope);
        const key = yield* this.memberKey(pattern, scope);
        this.setProperty(obj, key, value);
        return;
      }
      default:
        throw this.unsupported(pattern);
    }
  }

  private bindName(scope: Scope, name: string, value: unknown, kind: BindKind) {
    if (kind === 'assign') {
      const binding = scope.lookup(name);
      if (!binding) this.global.declare(name, value, 'var');
      else if (binding.kind === 'const') throw this.typeError('Assignment to constant variable.');
      else binding.value = value;
    } else if (kind === 'var') {
      const binding = scope.lookup(name);
      if (binding) binding.value = value;
      else scope.functionScope().declare(name, value, 'var');
    } else {
      scope.declare(name, value, kind);
    }
  }

  // ───────────────────────── Statements ─────────────────────────

  private *execBody(statements: ES.Node[], scope: Scope): Gen<void> {
    this.hoist(statements, scope);
    for (const stmt of statements) yield* this.execStmt(stmt, scope);
  }

  private *execStmt(node: ES.Node, scope: Scope): Gen<void> {
    this.tick();
    switch (node.type) {
      case 'ExpressionStatement':
        this.setCursor(node);
        yield* this.evalExpr(node.expression, scope);
        return;
      case 'VariableDeclaration':
        this.setCursor(node);
        for (const d of node.declarations) {
          if (!d.init && node.kind === 'var') continue;
          const value = d.init ? yield* this.evalExpr(d.init, scope) : undefined;
          nameAnonymous(value, d.id);
          yield* this.bindPattern(d.id, value, scope, node.kind as BindKind);
        }
        return;
      case 'FunctionDeclaration':
      case 'EmptyStatement':
        return;
      case 'ReturnStatement':
        this.setCursor(node);
        throw new ReturnSignal(node.argument ? yield* this.evalExpr(node.argument, scope) : undefined);
      case 'IfStatement':
        this.setCursor(node.test);
        if (yield* this.evalExpr(node.test, scope)) yield* this.execStmt(node.consequent, scope);
        else if (node.alternate) yield* this.execStmt(node.alternate, scope);
        return;
      case 'BlockStatement':
        yield* this.execBody(node.body, new Scope(scope));
        return;
      case 'ForStatement':
        yield* this.execFor(node, scope);
        return;
      case 'ForOfStatement':
      case 'ForInStatement':
        yield* this.execForEach(node, scope);
        return;
      case 'WhileStatement':
      case 'DoWhileStatement': {
        let first = node.type === 'DoWhileStatement';
        for (;;) {
          this.tick();
          if (!first) {
            this.setCursor(node.test);
            if (!(yield* this.evalExpr(node.test, scope))) break;
          }
          first = false;
          try {
            yield* this.execStmt(node.body, scope);
          } catch (e) {
            if (e instanceof BreakSignal) break;
            if (!(e instanceof ContinueSignal)) throw e;
          }
        }
        return;
      }
      case 'BreakStatement':
      case 'ContinueStatement':
        if (node.label) throw this.unsupported(node, 'label');
        throw node.type === 'BreakStatement' ? new BreakSignal() : new ContinueSignal();
      case 'ThrowStatement':
        this.setCursor(node);
        throw new ThrowSignal(yield* this.evalExpr(node.argument, scope));
      case 'TryStatement':
        try {
          yield* this.execStmt(node.block, scope);
        } catch (e) {
          if (!(e instanceof ThrowSignal) || !node.handler) throw e;
          const catchScope = new Scope(scope);
          if (node.handler.param) yield* this.bindPattern(node.handler.param, e.value, catchScope, 'let');
          yield* this.execStmt(node.handler.body, catchScope);
        } finally {
          if (node.finalizer) yield* this.execStmt(node.finalizer, scope);
        }
        return;
      case 'SwitchStatement': {
        this.setCursor(node.discriminant);
        const value = yield* this.evalExpr(node.discriminant, scope);
        const switchScope = new Scope(scope);
        let start = -1;
        for (let i = 0; i < node.cases.length && start < 0; i++) {
          const test = node.cases[i].test;
          if (test && (yield* this.evalExpr(test, switchScope)) === value) start = i;
        }
        if (start < 0) start = node.cases.findIndex((c) => !c.test);
        if (start < 0) return;
        try {
          for (const c of node.cases.slice(start)) {
            for (const stmt of c.consequent) yield* this.execStmt(stmt, switchScope);
          }
        } catch (e) {
          if (!(e instanceof BreakSignal)) throw e;
        }
        return;
      }
      default:
        throw this.unsupported(node);
    }
  }

  private *execFor(node: ES.ForStatement, scope: Scope): Gen<void> {
    const loopScope = new Scope(scope);
    if (node.init) {
      this.setCursor(node.init);
      if (node.init.type === 'VariableDeclaration') yield* this.execStmt(node.init, loopScope);
      else yield* this.evalExpr(node.init, loopScope);
    }
    // `let` loops get a fresh copy of their bindings on each iteration, so closures capture distinct values.
    const perIteration = node.init?.type === 'VariableDeclaration' && node.init.kind !== 'var';
    let iterScope = loopScope;
    const nextScope = () => {
      if (!perIteration) return iterScope;
      const s = new Scope(scope);
      for (const [name, b] of iterScope.vars) s.declare(name, b.value, b.kind);
      return s;
    };
    iterScope = nextScope();
    for (;;) {
      this.tick();
      if (node.test) {
        this.setCursor(node.test);
        if (!(yield* this.evalExpr(node.test, iterScope))) break;
      }
      try {
        yield* this.execStmt(node.body, iterScope);
      } catch (e) {
        if (e instanceof BreakSignal) break;
        if (!(e instanceof ContinueSignal)) throw e;
      }
      iterScope = nextScope();
      if (node.update) {
        this.setCursor(node.update);
        yield* this.evalExpr(node.update, iterScope);
      }
    }
  }

  private *execForEach(node: ES.ForOfStatement | ES.ForInStatement, scope: Scope): Gen<void> {
    if (node.type === 'ForOfStatement' && node.await) throw this.unsupported(node, 'for await');
    this.setCursor(node.right);
    const source = yield* this.evalExpr(node.right, scope);
    const items = node.type === 'ForOfStatement' ? this.iterate(source) : source == null ? [] : Object.keys(source);
    for (const item of items) {
      this.tick();
      const iterScope = new Scope(scope);
      if (node.left.type === 'VariableDeclaration') {
        yield* this.bindPattern(node.left.declarations[0].id, item, iterScope, node.left.kind as BindKind);
      } else {
        yield* this.bindPattern(node.left, item, iterScope, 'assign');
      }
      try {
        yield* this.execStmt(node.body, iterScope);
      } catch (e) {
        if (e instanceof BreakSignal) break;
        if (!(e instanceof ContinueSignal)) throw e;
      }
    }
  }

  // ───────────────────────── Expressions ─────────────────────────

  private *evalExpr(node: ES.Node, scope: Scope): Gen {
    this.tick();
    switch (node.type) {
      case 'Literal':
        if ('regex' in node && node.regex) throw this.unsupported(node, 'RegExp');
        return node.value;
      case 'Identifier': {
        if (node.name === 'undefined') return undefined;
        const binding = scope.lookup(node.name);
        if (!binding) throw this.jsError('ReferenceError', `${node.name} is not defined`);
        return binding.value;
      }
      case 'ThisExpression':
        return scope.resolveThis();
      case 'TemplateLiteral': {
        let out = node.quasis[0].value.cooked ?? '';
        for (let i = 0; i < node.expressions.length; i++) {
          out += toStr(yield* this.evalExpr(node.expressions[i], scope));
          out += node.quasis[i + 1].value.cooked ?? '';
        }
        return out;
      }
      case 'ArrayExpression': {
        const out: unknown[] = [];
        for (const el of node.elements) {
          if (!el) out.length++;
          else if (el.type === 'SpreadElement') out.push(...this.iterate(yield* this.evalExpr(el.argument, scope)));
          else out.push(yield* this.evalExpr(el, scope));
        }
        return out;
      }
      case 'ObjectExpression': {
        const obj: Record<PropertyKey, unknown> = {};
        for (const prop of node.properties) {
          if (prop.type === 'SpreadElement') {
            const v = yield* this.evalExpr(prop.argument, scope);
            if (isObjectLike(v)) Object.assign(obj, v);
            continue;
          }
          if (prop.kind !== 'init') throw this.unsupported(prop, 'getter/setter');
          const key = prop.computed ? toKey(yield* this.evalExpr(prop.key, scope)) : propertyName(prop.key);
          const value = yield* this.evalExpr(prop.value, scope);
          if (value instanceof Closure && !value.name) value.name = String(key);
          obj[key] = value;
        }
        return obj;
      }
      case 'FunctionExpression':
      case 'ArrowFunctionExpression':
        if (node.generator) throw this.unsupported(node, 'generator');
        return new Closure(node, scope, node.type === 'FunctionExpression' && node.id ? node.id.name : '');
      case 'UnaryExpression': {
        if (node.operator === 'typeof' && node.argument.type === 'Identifier' && !scope.lookup(node.argument.name)) {
          return 'undefined';
        }
        if (node.operator === 'delete') {
          if (node.argument.type !== 'MemberExpression') return true;
          const obj = yield* this.evalExpr(node.argument.object, scope);
          const key = yield* this.memberKey(node.argument, scope);
          if (isObjectLike(obj)) delete obj[key];
          return true;
        }
        const v = yield* this.evalExpr(node.argument, scope);
        switch (node.operator) {
          case 'typeof':
            return typeOf(v);
          case '!':
            return !v;
          case '-':
            return -(v as number);
          case '+':
            return +(v as number);
          case '~':
            return ~(v as number);
          case 'void':
            return undefined;
        }
        throw this.unsupported(node);
      }
      case 'UpdateExpression': {
        const delta = node.operator === '++' ? 1 : -1;
        if (node.argument.type === 'Identifier') {
          const old = Number(yield* this.evalExpr(node.argument, scope));
          this.bindName(scope, node.argument.name, old + delta, 'assign');
          return node.prefix ? old + delta : old;
        }
        if (node.argument.type === 'MemberExpression') {
          const obj = yield* this.evalExpr(node.argument.object, scope);
          const key = yield* this.memberKey(node.argument, scope);
          const old = Number(this.getProperty(obj, key));
          this.setProperty(obj, key, old + delta);
          return node.prefix ? old + delta : old;
        }
        throw this.unsupported(node);
      }
      case 'BinaryExpression': {
        if (node.left.type === 'PrivateIdentifier') throw this.unsupported(node.left);
        const left = yield* this.evalExpr(node.left, scope);
        const right = yield* this.evalExpr(node.right, scope);
        return this.binary(node.operator, left, right);
      }
      case 'LogicalExpression': {
        const left = yield* this.evalExpr(node.left, scope);
        if (node.operator === '&&' ? !left : node.operator === '||' ? left : left != null) return left;
        return yield* this.evalExpr(node.right, scope);
      }
      case 'ConditionalExpression':
        return (yield* this.evalExpr(node.test, scope))
          ? yield* this.evalExpr(node.consequent, scope)
          : yield* this.evalExpr(node.alternate, scope);
      case 'AssignmentExpression':
        return yield* this.evalAssignment(node, scope);
      case 'MemberExpression': {
        const obj = yield* this.evalExpr(node.object, scope);
        if (obj === SHORT || (node.optional && obj == null)) return SHORT;
        const key = yield* this.memberKey(node, scope);
        return this.getProperty(obj, key);
      }
      case 'ChainExpression': {
        const v = yield* this.evalExpr(node.expression, scope);
        return v === SHORT ? undefined : v;
      }
      case 'CallExpression':
        return yield* this.evalCall(node, scope);
      case 'NewExpression': {
        const ctor = yield* this.evalExpr(node.callee, scope);
        const args = yield* this.evalArgs(node.arguments, scope);
        this.setCursor(node);
        if (ctor instanceof NativeFn && ctor.construct) return yield* ctor.construct(args);
        if (ctor instanceof Closure && !ctor.isArrow && !ctor.isAsync) {
          const obj = {};
          const result = yield* this.callFunction(ctor, obj, args);
          return isObjectLike(result) ? result : obj;
        }
        throw this.typeError(`${this.source(node.callee)} is not a constructor`);
      }
      case 'AwaitExpression': {
        const value = yield* this.evalExpr(node.argument, scope);
        this.setCursor(node);
        return yield { value };
      }
      case 'SequenceExpression': {
        let last: unknown;
        for (const e of node.expressions) last = yield* this.evalExpr(e, scope);
        return last;
      }
      default:
        throw this.unsupported(node);
    }
  }

  private *evalAssignment(node: ES.AssignmentExpression, scope: Scope): Gen {
    const target = node.left;
    const op = node.operator;
    if (op === '=') {
      const value = yield* this.evalExpr(node.right, scope);
      nameAnonymous(value, target);
      yield* this.bindPattern(target, value, scope, 'assign');
      return value;
    }
    let obj: unknown;
    let key: PropertyKey = '';
    let current: unknown;
    if (target.type === 'Identifier') {
      current = yield* this.evalExpr(target, scope);
    } else if (target.type === 'MemberExpression') {
      obj = yield* this.evalExpr(target.object, scope);
      key = yield* this.memberKey(target, scope);
      current = this.getProperty(obj, key);
    } else {
      throw this.unsupported(target);
    }
    let value: unknown;
    if (op === '&&=' || op === '||=' || op === '??=') {
      const keep = op === '&&=' ? !current : op === '||=' ? current : current != null;
      if (keep) return current;
      value = yield* this.evalExpr(node.right, scope);
    } else {
      value = this.binary(op.slice(0, -1) as ES.BinaryOperator, current, yield* this.evalExpr(node.right, scope));
    }
    if (target.type === 'Identifier') this.bindName(scope, target.name, value, 'assign');
    else this.setProperty(obj, key, value);
    return value;
  }

  private *evalCall(node: ES.CallExpression, scope: Scope): Gen {
    const callee = node.callee;
    let fn: unknown;
    let thisArg: unknown;
    if (callee.type === 'MemberExpression') {
      const obj = yield* this.evalExpr(callee.object, scope);
      if (obj === SHORT || (callee.optional && obj == null)) return SHORT;
      const key = yield* this.memberKey(callee, scope);
      fn = this.getProperty(obj, key);
      thisArg = obj;
    } else if (callee.type === 'Super') {
      throw this.unsupported(callee);
    } else {
      fn = yield* this.evalExpr(callee, scope);
      if (fn === SHORT) return SHORT;
    }
    if ('optional' in node && node.optional && fn == null) return SHORT;
    const args = yield* this.evalArgs(node.arguments, scope);
    if (!isCallable(fn)) throw this.typeError(`${this.source(callee)} is not a function`);
    this.setCursor(node);
    return yield* this.callFunction(fn, thisArg, args);
  }

  private *evalArgs(nodes: (ES.Expression | ES.SpreadElement)[], scope: Scope): Gen<unknown[]> {
    const args: unknown[] = [];
    for (const arg of nodes) {
      if (arg.type === 'SpreadElement') args.push(...this.iterate(yield* this.evalExpr(arg.argument, scope)));
      else args.push(yield* this.evalExpr(arg, scope));
    }
    return args;
  }

  private *memberKey(node: ES.MemberExpression, scope: Scope): Gen<PropertyKey> {
    if (node.property.type === 'PrivateIdentifier') throw this.unsupported(node.property);
    if (node.computed) return toKey(yield* this.evalExpr(node.property, scope));
    return (node.property as ES.Identifier).name;
  }

  private binary(op: ES.BinaryOperator, l: unknown, r: unknown): unknown {
    const a = l as any;
    const b = r as any;
    switch (op) {
      case '+':
        return a + b;
      case '-':
        return a - b;
      case '*':
        return a * b;
      case '/':
        return a / b;
      case '%':
        return a % b;
      case '**':
        return a ** b;
      case '==':
        return a == b;
      case '!=':
        return a != b;
      case '===':
        return a === b;
      case '!==':
        return a !== b;
      case '<':
        return a < b;
      case '<=':
        return a <= b;
      case '>':
        return a > b;
      case '>=':
        return a >= b;
      case '&':
        return a & b;
      case '|':
        return a | b;
      case '^':
        return a ^ b;
      case '<<':
        return a << b;
      case '>>':
        return a >> b;
      case '>>>':
        return a >>> b;
      case 'in':
        if (!isObjectLike(b))
          throw this.typeError(`Cannot use 'in' operator to search for '${String(a)}' in ${formatValue(b)}`);
        return toKey(a) in b;
      case 'instanceof':
        return this.instanceOf(l, r);
    }
    throw new EngineError('error.unsupported', { type: op });
  }

  private instanceOf(value: unknown, ctor: unknown): boolean {
    if (!(ctor instanceof NativeFn)) return false;
    if (ctor.name === 'Promise') return value instanceof SimPromise;
    if (ctor.name === 'Array') return Array.isArray(value);
    if (ctor.name === 'Object') return typeof value === 'object' && value !== null;
    if (ctor.name === 'Function') return isCallable(value);
    if (ctor.name.endsWith('Error'))
      return value instanceof JsError && (ctor.name === 'Error' || value.name === ctor.name);
    return false;
  }

  // ───────────────────────── Properties ─────────────────────────

  private getProperty(obj: unknown, key: PropertyKey): unknown {
    if (obj == null) throw this.typeError(`Cannot read properties of ${obj} (reading '${String(key)}')`);
    const k = String(key);
    if (obj instanceof SimPromise) return Object.hasOwn(this.promiseMethods, k) ? this.promiseMethods[k] : undefined;
    if (obj instanceof NativeFn || obj instanceof Closure) {
      if (k === 'name') return obj.name;
      if (obj instanceof NativeFn && Object.hasOwn(obj.props, k)) return obj.props[k];
      return Object.hasOwn(this.functionMethods, k) ? this.functionMethods[k] : undefined;
    }
    if (Array.isArray(obj)) {
      if (Object.hasOwn(this.arrayMethods, k)) return this.arrayMethods[k];
      const native = (Array.prototype as unknown as Record<string, unknown>)[k];
      if (typeof native === 'function' && !Object.hasOwn(obj, k)) return this.hostMethod(k, native);
      return (obj as unknown as Record<string, unknown>)[k];
    }
    if (typeof obj !== 'object') {
      const boxed = Object(obj) as Record<string, unknown>;
      const v = boxed[k];
      return typeof v === 'function' ? this.hostMethod(k, v) : v;
    }
    const record = obj as Record<PropertyKey, unknown>;
    if (Object.hasOwn(record, key)) return record[key];
    if (k === 'hasOwnProperty') {
      return new NativeFn('hasOwnProperty', function* (thisArg, [name]) {
        return isObjectLike(thisArg) && Object.hasOwn(thisArg, toKey(name));
      });
    }
    return undefined;
  }

  private setProperty(obj: unknown, key: PropertyKey, value: unknown) {
    if (obj == null) throw this.typeError(`Cannot set properties of ${obj} (setting '${String(key)}')`);
    if (typeof obj === 'object' && !(obj instanceof SimPromise)) (obj as Record<PropertyKey, unknown>)[key] = value;
  }

  private iterate(value: unknown): unknown[] {
    if (Array.isArray(value)) return value;
    if (typeof value === 'string') return [...value];
    throw this.typeError(`${formatValue(value, true)} is not iterable`);
  }

  // ───────────────────────── Errors ─────────────────────────

  private jsError(name: string, message: string) {
    return new ThrowSignal(new JsError(name, message));
  }

  private typeError(message: string) {
    return this.jsError('TypeError', message);
  }

  private hostError(e: unknown) {
    if (e instanceof Error) return this.jsError(e.name, e.message);
    return e;
  }

  private unsupported(node: ES.Node, type: string = node.type) {
    return new EngineError('error.unsupported', { type }, span(node));
  }

  private source(node: ES.Node) {
    const { start, end } = span(node);
    return this.code.slice(start, end);
  }

  // ───────────────────────── Built-ins ─────────────────────────

  /** Wraps a host function that never calls back into user code (Math.max, 'a'.toUpperCase…). */
  private hostMethod(name: string, fn: unknown) {
    const self = this;
    return new NativeFn(name, function* (thisArg, args) {
      try {
        return (fn as (...a: unknown[]) => unknown).apply(thisArg, args);
      } catch (e) {
        throw self.hostError(e);
      }
    });
  }

  private hostNamespace(source: object, names: string[]) {
    const out: Record<string, unknown> = {};
    for (const name of names) {
      const v = (source as Record<string, unknown>)[name];
      out[name] = typeof v === 'function' ? this.hostMethod(name, v.bind(source)) : v;
    }
    return out;
  }

  private native(name: string, impl: (thisArg: unknown, args: unknown[]) => Gen) {
    return new NativeFn(name, impl);
  }

  private createArrayMethods(): Record<string, NativeFn> {
    const self = this;
    const call = (cb: unknown, args: unknown[]) => self.callFunction(cb, undefined, args);
    return {
      forEach: this.native('forEach', function* (t, [cb]) {
        const a = t as unknown[];
        for (let i = 0; i < a.length; i++) yield* call(cb, [a[i], i, a]);
      }),
      map: this.native('map', function* (t, [cb]) {
        const a = t as unknown[];
        const out: unknown[] = [];
        for (let i = 0; i < a.length; i++) out.push(yield* call(cb, [a[i], i, a]));
        return out;
      }),
      filter: this.native('filter', function* (t, [cb]) {
        const a = t as unknown[];
        const out: unknown[] = [];
        for (let i = 0; i < a.length; i++) if (yield* call(cb, [a[i], i, a])) out.push(a[i]);
        return out;
      }),
      find: this.native('find', function* (t, [cb]) {
        const a = t as unknown[];
        for (let i = 0; i < a.length; i++) if (yield* call(cb, [a[i], i, a])) return a[i];
        return undefined;
      }),
      findIndex: this.native('findIndex', function* (t, [cb]) {
        const a = t as unknown[];
        for (let i = 0; i < a.length; i++) if (yield* call(cb, [a[i], i, a])) return i;
        return -1;
      }),
      some: this.native('some', function* (t, [cb]) {
        const a = t as unknown[];
        for (let i = 0; i < a.length; i++) if (yield* call(cb, [a[i], i, a])) return true;
        return false;
      }),
      every: this.native('every', function* (t, [cb]) {
        const a = t as unknown[];
        for (let i = 0; i < a.length; i++) if (!(yield* call(cb, [a[i], i, a]))) return false;
        return true;
      }),
      reduce: this.native('reduce', function* (t, args) {
        const a = t as unknown[];
        let i = 0;
        let acc = args.length > 1 ? args[1] : a[i++];
        for (; i < a.length; i++) acc = yield* call(args[0], [acc, a[i], i, a]);
        return acc;
      }),
      sort: this.native('sort', function* (t, [cmp]) {
        const a = t as unknown[];
        if (!isCallable(cmp)) return a.sort();
        // Insertion sort so the comparator can run as user code.
        for (let i = 1; i < a.length; i++) {
          let j = i;
          while (j > 0 && Number(yield* call(cmp, [a[j - 1], a[j]])) > 0) {
            [a[j - 1], a[j]] = [a[j], a[j - 1]];
            j--;
          }
        }
        return a;
      }),
    };
  }

  private createPromiseMethods(): Record<string, NativeFn> {
    const self = this;
    const asPromise = (v: unknown) => {
      if (!(v instanceof SimPromise))
        throw self.typeError('Method Promise.prototype.then called on incompatible receiver');
      return v;
    };
    return {
      then: this.native('then', function* (t, [onFulfilled, onRejected]) {
        return self.then(asPromise(t), onFulfilled, onRejected);
      }),
      catch: this.native('catch', function* (t, [onRejected]) {
        return self.then(asPromise(t), undefined, onRejected);
      }),
      finally: this.native('finally', function* (t, [onFinally]) {
        const p = asPromise(t);
        if (!isCallable(onFinally)) return self.then(p, onFinally, onFinally);
        const after = (pass: (v: unknown) => Gen) =>
          self.native(onFinally.name, function* (_, [v]) {
            const result = yield* self.callFunction(onFinally, undefined, []);
            return self.then(
              self.promiseResolve(result),
              self.native('', () => pass(v)),
              undefined,
            );
          });
        return self.then(
          p,
          after(function* (v) {
            return v;
          }),
          after(function* (v) {
            throw new ThrowSignal(v);
          }),
        );
      }),
    };
  }

  private createFunctionMethods(): Record<string, NativeFn> {
    const self = this;
    return {
      call: this.native('call', function* (fn, [thisArg, ...args]) {
        return yield* self.callFunction(fn, thisArg, args);
      }),
      apply: this.native('apply', function* (fn, [thisArg, args]) {
        return yield* self.callFunction(fn, thisArg, Array.isArray(args) ? args : []);
      }),
      bind: this.native('bind', function* (fn, [thisArg, ...bound]) {
        return self.native(functionName(fn), function* (_, args) {
          return yield* self.callFunction(fn, thisArg, [...bound, ...args]);
        });
      }),
    };
  }

  /** The page's single button, which the user can click while the program runs. */
  private createButton() {
    const self = this;
    const checkType = (type: unknown) => {
      if (type !== 'click') throw new EngineError('error.unsupported', { type: `event "${String(type)}"` });
    };
    return {
      id: 'button',
      addEventListener: this.native('addEventListener', function* (_, [type, cb]) {
        checkType(type);
        if (!isCallable(cb) || self.listeners.some((l) => l.cb === cb)) return;
        self.listeners.push({ id: ++self.ids, name: cb.name, cb });
        self.snap('event.listen', { name: cb.name });
      }),
      removeEventListener: this.native('removeEventListener', function* (_, [type, cb]) {
        checkType(type);
        const before = self.listeners.length;
        self.listeners = self.listeners.filter((l) => l.cb !== cb);
        if (self.listeners.length !== before) self.snap('event.unlisten', { name: functionName(cb) });
      }),
    };
  }

  private createPromiseConstructor() {
    const self = this;
    const combinator = (
      name: string,
      settleWith: (
        results: unknown[],
        p: SimPromise,
        items: unknown[],
      ) => {
        onFulfilled: (i: number) => (v: unknown) => void;
        onRejected: (i: number) => (r: unknown) => void;
        empty: () => void;
      },
    ) =>
      this.native(name, function* (_, [iterable]) {
        const items = self.iterate(iterable);
        const p = new SimPromise();
        const results: unknown[] = new Array(items.length);
        const handlers = settleWith(results, p, items);
        if (items.length === 0) handlers.empty();
        items.forEach((item, i) => {
          const fulfilled = handlers.onFulfilled(i);
          const rejected = handlers.onRejected(i);
          self.then(
            self.promiseResolve(item),
            self.native(name, function* (__, [v]) {
              fulfilled(v);
            }),
            self.native(name, function* (__, [r]) {
              rejected(r);
            }),
          );
        });
        return p;
      });

    return new NativeFn(
      'Promise',
      function* () {
        throw self.typeError("Promise constructor cannot be invoked without 'new'");
      },
      {
        construct: function* ([executor]) {
          if (!isCallable(executor))
            throw self.typeError(`Promise resolver ${formatValue(executor)} is not a function`);
          const p = new SimPromise();
          const fns = self.createResolvingFunctions(p);
          try {
            yield* self.callFunction(executor, undefined, [fns.resolve, fns.reject]);
          } catch (e) {
            if (!(e instanceof ThrowSignal)) throw e;
            yield* fns.reject.impl(undefined, [e.value]);
          }
          return p;
        },
        props: {
          resolve: this.native('resolve', function* (_, [v]) {
            return self.promiseResolve(v);
          }),
          reject: this.native('reject', function* (_, [r]) {
            const p = new SimPromise();
            self.settle(p, 'rejected', r);
            return p;
          }),
          all: combinator('Promise.all', (results, p, items) => {
            let remaining = items.length;
            return {
              onFulfilled: (i) => (v) => {
                results[i] = v;
                if (--remaining === 0) self.resolvePromise(p, results);
              },
              onRejected: () => (r) => self.settle(p, 'rejected', r),
              empty: () => self.resolvePromise(p, results),
            };
          }),
          allSettled: combinator('Promise.allSettled', (results, p, items) => {
            let remaining = items.length;
            const done = (i: number, entry: unknown) => {
              results[i] = entry;
              if (--remaining === 0) self.resolvePromise(p, results);
            };
            return {
              onFulfilled: (i) => (value) => done(i, { status: 'fulfilled', value }),
              onRejected: (i) => (reason) => done(i, { status: 'rejected', reason }),
              empty: () => self.resolvePromise(p, results),
            };
          }),
          race: combinator('Promise.race', (_results, p) => ({
            onFulfilled: () => (v) => self.resolvePromise(p, v),
            onRejected: () => (r) => self.settle(p, 'rejected', r),
            empty: () => {},
          })),
        },
      },
    );
  }

  private installGlobals() {
    const self = this;
    const g = this.global;
    const define = (name: string, value: unknown) => g.declare(name, value, 'const');

    const log = (level: ConsoleLine['level']) =>
      this.native(level, function* (_, args) {
        const text = args.map((a) => formatValue(a)).join(' ');
        self.consoleLines.push({ id: ++self.ids, level, text });
        self.snap('log', { text });
      });
    define('console', { log: log('log'), info: log('info'), warn: log('warn'), error: log('error') });

    define(
      'setTimeout',
      this.native('setTimeout', function* (_, [cb, delay, ...args]) {
        return self.addTimer('setTimeout', cb, delay, args);
      }),
    );
    define(
      'setInterval',
      this.native('setInterval', function* (_, [cb, delay, ...args]) {
        return self.addTimer('setInterval', cb, delay, args);
      }),
    );
    const clear = function* (_: unknown, [id]: unknown[]) {
      self.clearTimer(id);
    };
    define('clearTimeout', this.native('clearTimeout', clear));
    define('clearInterval', this.native('clearInterval', clear));
    define(
      'queueMicrotask',
      this.native('queueMicrotask', function* (_, [cb]) {
        if (!isCallable(cb)) throw self.typeError(`The "callback" argument must be of type function`);
        self.enqueueMicrotask(cb.name, 'queueMicrotask', () => self.callFunction(cb, undefined, []));
      }),
    );
    define(
      'requestAnimationFrame',
      this.native('requestAnimationFrame', function* (_, [cb]) {
        if (!isCallable(cb))
          throw self.typeError(
            `Failed to execute 'requestAnimationFrame': The callback provided as parameter 1 is not a function.`,
          );
        if (self.animationFrames.length === 0)
          self.nextFrame = (Math.floor(self.time / FRAME_DURATION) + 1) * FRAME_DURATION;
        const id = ++self.ids;
        self.animationFrames.push({ id, name: cb.name, cb });
        self.snap('webapi.requestAnimationFrame', { name: cb.name });
        return id;
      }),
    );
    define(
      'cancelAnimationFrame',
      this.native('cancelAnimationFrame', function* (_, [id]) {
        self.animationFrames = self.animationFrames.filter((f) => f.id !== id);
      }),
    );
    define('button', this.button);
    define(
      'fetch',
      this.native('fetch', function* (_, [url]) {
        return self.fetch(url);
      }),
    );
    define('Promise', this.createPromiseConstructor());

    for (const name of ['Error', 'TypeError', 'RangeError', 'SyntaxError', 'ReferenceError']) {
      const create = function* (args: unknown[]) {
        return new JsError(name, args[0] === undefined ? '' : String(args[0]));
      };
      define(name, new NativeFn(name, (_, args) => create(args), { construct: create }));
    }

    const now = this.native('now', function* () {
      return self.time;
    });
    define(
      'Date',
      new NativeFn(
        'Date',
        function* () {
          return new Date(self.time).toString();
        },
        { props: { now } },
      ),
    );
    define('performance', { now });
    define('Math', this.hostNamespace(Math, Object.getOwnPropertyNames(Math)));
    define('JSON', this.hostNamespace(JSON, ['stringify', 'parse']));
    define(
      'Object',
      new NativeFn(
        'Object',
        function* (_, [v]) {
          return v;
        },
        { props: this.hostNamespace(Object, ['keys', 'values', 'entries', 'assign', 'freeze', 'fromEntries']) },
      ),
    );
    define(
      'Array',
      new NativeFn(
        'Array',
        function* (_, args) {
          return [...args];
        },
        { props: this.hostNamespace(Array, ['isArray', 'from', 'of']) },
      ),
    );
    define(
      'Function',
      new NativeFn('Function', function* () {
        throw self.typeError('Function constructor is not supported');
      }),
    );
    for (const name of ['String', 'Number', 'Boolean', 'parseInt', 'parseFloat', 'isNaN', 'isFinite']) {
      const host = (globalThis as unknown as Record<string, unknown>)[name];
      define(name, this.hostMethod(name, host));
    }
    define('NaN', NaN);
    define('Infinity', Infinity);
    define('globalThis', {});
  }
}

// ───────────────────────── Helpers ─────────────────────────

function patternNames(p: ES.Pattern): string[] {
  switch (p.type) {
    case 'Identifier':
      return [p.name];
    case 'AssignmentPattern':
      return patternNames(p.left);
    case 'RestElement':
      return patternNames(p.argument);
    case 'ArrayPattern':
      return p.elements.flatMap((e) => (e ? patternNames(e) : []));
    case 'ObjectPattern':
      return p.properties.flatMap((prop) => patternNames(prop.type === 'RestElement' ? prop : prop.value));
    default:
      return [];
  }
}

function propertyName(key: ES.Node): string {
  if (key.type === 'Identifier') return key.name;
  if (key.type === 'Literal') return String(key.value);
  return '';
}

function nameAnonymous(value: unknown, target: ES.Node) {
  if (value instanceof Closure && !value.name && target.type === 'Identifier') value.name = target.name;
}

function toKey(v: unknown): PropertyKey {
  return typeof v === 'symbol' ? v : String(v);
}

function toStr(v: unknown): string {
  if (typeof v === 'string') return v;
  if (v instanceof Closure || v instanceof NativeFn) return formatValue(v);
  if (Array.isArray(v)) return v.map((x) => (x == null ? '' : toStr(x))).join(',');
  if (v instanceof JsError) return formatValue(v);
  if (typeof v === 'object' && v !== null) return '[object Object]';
  return String(v);
}

function typeOf(v: unknown): string {
  if (v instanceof Closure || v instanceof NativeFn) return 'function';
  if (v instanceof SimPromise || v instanceof JsError) return 'object';
  return typeof v;
}
