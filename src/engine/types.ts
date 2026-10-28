export interface Span {
  start: number;
  end: number;
}

export interface FrameView {
  id: number;
  name: string;
  isScript: boolean;
  span?: Span;
}

export type QueueSource =
  | 'setTimeout'
  | 'setInterval'
  | 'fetch'
  | 'then'
  | 'await'
  | 'thenable'
  | 'passThrough'
  | 'queueMicrotask'
  | 'click'
  | 'requestAnimationFrame';

export interface QueueItemView {
  id: number;
  name: string;
  source: QueueSource;
}

export interface WebApiView {
  id: number;
  kind: 'setTimeout' | 'setInterval' | 'fetch' | 'click' | 'requestAnimationFrame';
  name: string;
  delay: number;
  remaining: number;
}

export interface ConsoleLine {
  id: number;
  level: 'log' | 'info' | 'warn' | 'error';
  text: string;
}

export type LoopPhase = 'script' | 'microtasks' | 'task' | 'render' | 'timers' | 'done';

export interface Explanation {
  key: string;
  params?: Record<string, string | number>;
}

export interface Snapshot {
  stack: FrameView[];
  webApis: WebApiView[];
  tasks: QueueItemView[];
  microtasks: QueueItemView[];
  console: ConsoleLine[];
  highlight?: Span;
  phase: LoopPhase;
  time: number;
  explanation: Explanation;
}

export interface SimulateOptions {
  /** Step indexes after which the user clicked the page button. */
  clicks?: number[];
}

export interface RunResult {
  steps: Snapshot[];
  error?: Explanation & { span?: Span };
}
