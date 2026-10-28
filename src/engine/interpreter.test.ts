import { afterEach, describe, expect, it, vi } from 'vitest';
import { examples } from '../examples';
import { FETCH_DELAY, simulate } from './interpreter';

const simulatedLogs = (code: string) => {
  const result = simulate(code);
  expect(result.error).toBeUndefined();
  return result.steps.at(-1)!.console.map((l) => l.text);
};

/** Runs the code for real in Node with fake timers and returns what it printed. */
async function realLogs(code: string): Promise<string[]> {
  vi.useFakeTimers({ toFake: ['setTimeout', 'setInterval', 'clearTimeout', 'clearInterval'] });
  const out: string[] = [];
  const format = (v: unknown) => (typeof v === 'object' && v !== null ? JSON.stringify(v) : String(v));
  const print = (...args: unknown[]) => out.push(args.map(format).join(' '));
  const fakeConsole = { log: print, info: print, warn: print, error: print };
  const fakeFetch = (url: string) =>
    new Promise((resolve) =>
      setTimeout(() => {
        const body = { url, message: 'Hello!' };
        resolve({ ok: true, status: 200, url, json: () => Promise.resolve(body) });
      }, FETCH_DELAY),
    );
  const rejections: unknown[] = [];
  const onRejection = (reason: unknown) => rejections.push(reason);
  process.on('unhandledRejection', onRejection);
  try {
    new Function('console', 'fetch', code)(fakeConsole, fakeFetch);
    await vi.runAllTimersAsync();
    await new Promise((r) => setImmediate(r));
  } finally {
    process.off('unhandledRejection', onRejection);
  }
  for (const reason of rejections) out.push(`Uncaught (in promise) Error: ${(reason as Error).message}`);
  return out;
}

afterEach(() => {
  vi.useRealTimers();
});

describe('log order matches Node', () => {
  for (const example of examples.filter((e) => !e.browserOnly)) {
    it(example.id, async () => {
      expect(simulatedLogs(example.code)).toEqual(await realLogs(example.code));
    });
  }

  it('async return of a promise takes extra ticks', async () => {
    const code = `
async function a() { return Promise.resolve(1) }
a().then(() => console.log('a'))
Promise.resolve().then(() => console.log('1')).then(() => console.log('2')).then(() => console.log('3'))
`;
    expect(simulatedLogs(code)).toEqual(await realLogs(code));
  });

  it('handles closures, destructuring and array helpers', async () => {
    const code = `
const counter = (() => { let n = 0; return { inc: () => ++n } })()
counter.inc(); counter.inc()
const { a, b: [x, ...rest] } = { a: 1, b: [2, 3, 4] }
console.log(counter.inc(), a, x, rest.length)
console.log([1, 2, 3].map(v => v * 2).filter(v => v > 2).reduce((s, v) => s + v, 0))
try { null.foo } catch (e) { console.log(e instanceof TypeError) }
`;
    expect(simulatedLogs(code)).toEqual(await realLogs(code));
  });

  it('Promise.all resolves after all inputs', async () => {
    const code = `
Promise.all([1, Promise.resolve(2), new Promise(r => setTimeout(() => r(3), 10))])
  .then(values => console.log(values.join('+')))
Promise.resolve().then(() => console.log('first'))
`;
    expect(simulatedLogs(code)).toEqual(await realLogs(code));
  });
});

describe('browser-only features', () => {
  it('runs every browser-only example without error', () => {
    for (const example of examples.filter((e) => e.browserOnly)) expect(simulate(example.code).error).toBeUndefined();
  });

  const logs = (code: string, clicks?: number[]) =>
    simulate(code, { clicks })
      .steps.at(-1)!
      .console.map((l) => l.text);

  it('runs animation frames after microtasks and due timers, before later timers', () => {
    const code = `
setTimeout(() => console.log('timeout 0'), 0)
setTimeout(() => console.log('timeout 50'), 50)
requestAnimationFrame(() => console.log('frame'))
Promise.resolve().then(() => console.log('micro'))
`;
    expect(logs(code)).toEqual(['micro', 'timeout 0', 'frame', 'timeout 50']);
  });

  it('queues a click as a task that waits for the busy stack', () => {
    const code = `
button.addEventListener('click', function onClick() { console.log('clicked') })
setTimeout(() => console.log('timeout'), 0)
console.log('a')
console.log('b')
`;
    const steps = simulate(code).steps;
    const clickAt = steps.findIndex((s) => s.console.length === 1);
    expect(logs(code, [clickAt])).toEqual(['a', 'b', 'clicked', 'timeout']);
  });

  it('dispatches clicks recorded once the program is idle', () => {
    const code = `button.addEventListener('click', () => console.log('clicked'))`;
    const last = simulate(code).steps.length - 1;
    expect(logs(code, [last])).toEqual(['clicked']);
  });

  it('ignores clicks without listeners', () => {
    const result = simulate(`console.log('x')`, { clicks: [1] });
    expect(result.steps.some((s) => s.explanation.key === 'event.clickIgnored')).toBe(true);
  });
});

describe('engine guards', () => {
  it('reports syntax errors', () => {
    expect(simulate('function (').error?.key).toBe('error.syntax');
  });

  it('stops infinite loops', () => {
    expect(simulate('while (true) {}').error?.key).toBe('error.tooManyOps');
    expect(simulate('function f() { f(); } f();').error?.key).toBe('error.stackOverflow');
  });

  it('reports unsupported syntax', () => {
    expect(simulate('class A {}').error).toMatchObject({
      key: 'error.unsupported',
      params: { type: 'ClassDeclaration' },
    });
  });
});
