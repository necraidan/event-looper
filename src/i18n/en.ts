import type { Resources } from './fr';

export const en: Resources = {
  app: {
    title: 'Event Looper',
    tagline: 'The event loop, visualized.',
    examples: 'Examples',
    language: 'Language',
    theme: 'Theme',
    share: 'Share',
    shared: 'Link copied!',
  },
  panels: {
    code: 'Code',
    callStack: 'Call stack',
    webApis: 'Web APIs',
    taskQueue: 'Macrotask queue',
    microtaskQueue: 'Microtask queue',
    eventLoop: 'Event loop',
    console: 'Console',
    explanation: 'What is happening?',
  },
  hints: {
    callStack: 'The code currently running. One thing at a time.',
    webApis: 'The browser handles timers and network in parallel.',
    taskQueue: 'setTimeout, setInterval, events… One task per loop turn.',
    microtaskQueue: 'Promises, await, queueMicrotask. Fully drained after each task.',
  },
  controls: {
    run: 'Run',
    edit: 'Edit code',
    play: 'Play',
    pause: 'Pause',
    next: 'Next step',
    prev: 'Previous step',
    first: 'Start',
    last: 'End',
    speed: 'Speed',
    step: 'Step {{current}} / {{total}}',
    shortcuts: 'Shortcuts: ← → to step, space to play/pause',
    click: 'Click',
    clickTitle: 'Simulates a user click on the page button, right now. The handler goes to the macrotask queue.',
  },
  empty: {
    stack: 'Empty stack',
    queue: 'Empty queue',
    webApis: 'Nothing pending',
    console: 'No output',
    idle: 'Write some code or pick an example, then click “Run”.',
  },
  frame: {
    script: 'main script',
    anonymous: '(anonymous)',
  },
  source: {
    setTimeout: 'setTimeout',
    setInterval: 'setInterval',
    fetch: 'fetch',
    then: 'then',
    await: 'resume after await',
    thenable: 'promise adoption',
    passThrough: 'pass-through',
    queueMicrotask: 'queueMicrotask',
    click: 'click',
    requestAnimationFrame: 'requestAnimationFrame',
  },
  phase: {
    script: 'Script',
    microtasks: 'Microtasks',
    task: 'Macrotask',
    render: 'Render',
    timers: 'Waiting',
    done: 'Done',
  },
  phaseHelp: {
    render:
      'Render: at most once per display frame (~16 ms at 60 Hz), never in the middle of a task or of the microtasks. The browser skips it when nothing changed, when the tab is hidden, or when it throttles on purpose. Order: resize/scroll, requestAnimationFrame, style and layout, paint. Click to open the HTML spec.',
  },
  webapi: {
    remaining: '{{ms}} ms left',
    delay: '{{ms}} ms',
    listening: 'listening',
    nextFrame: 'next frame in {{ms}} ms',
  },
  themes: {
    arcade: 'Retro arcade',
    metro: 'Subway map',
    blueprint: 'Blueprint',
    brutalist: 'Neo-brutalist',
    rpg: 'RPG',
  },
  quiz: {
    toggle: 'Quiz mode',
    toggleHint: 'Guess the log order before watching it run',
    title: 'Quiz: in which order are the logs printed?',
    instructions: 'Click the lines in the order you think they will appear in the console.',
    yourOrder: 'Your order',
    pool: 'Lines to place',
    undo: 'Undo',
    check: 'Check',
    skip: 'Skip and watch it run',
    watch: 'Watch it step by step',
    perfect: 'Perfect, everything is in the right order! 🎉',
    score: '{{score}} of {{total}} in the right place.',
    solution: 'Actual order:',
    noOutput: 'This program prints nothing to the console: no quiz this time.',
  },
  clock: 't = {{ms}} ms',
  explain: {
    start: 'The script starts: the global code is placed on the <b>call stack</b> and runs line by line.',
    scriptEnd: 'The global script is done and the stack is empty. The <b>event loop</b> takes over.',
    call: 'The code calls <c>{{name}}</c>: only now does it enter the <b>call stack</b> and run its body. The caller waits for it to finish.',
    return:
      '<c>{{name}}</c> finishes and returns <c>{{value}}</c>: it is removed from the call stack and the caller resumes.',
    callAsync: 'Calling the async function <c>{{name}}</c>: it runs synchronously until its first <c>await</c>.',
    awaitValue: '<c>await</c> in <c>{{name}}</c>: waiting for the promise <c>{{value}}</c>.',
    awaitSuspend:
      '<c>{{name}}</c> is suspended and leaves the stack. It will resume as a microtask once the promise settles. The caller keeps going.',
    asyncResume: '<c>{{name}}</c> resumes after its <c>await</c> with the value <c>{{value}}</c>.',
    asyncResumeThrow:
      '<c>{{name}}</c> resumes after its <c>await</c>, but the promise was rejected: the error is thrown right there.',
    asyncDone: '<c>{{name}}</c> finishes: the promise it returned is resolved with <c>{{value}}</c>.',
    asyncThrow: '<c>{{name}}</c> throws (<c>{{text}}</c>): its promise is rejected.',
    log: '<c>console.log</c> prints “{{text}}” to the console.',
    'webapi.setTimeout':
      '<c>setTimeout</c> hands <c>{{name}}</c> to the browser with a {{delay}} ms delay. The code keeps going <b>without waiting</b>.',
    'webapi.setInterval':
      '<c>setInterval</c> hands <c>{{name}}</c> to the browser: it will be queued every {{delay}} ms.',
    'webapi.fetch':
      '<c>fetch</c> starts the request <c>{{url}}</c> in the background (about {{delay}} ms). It immediately returns a pending promise.',
    'webapi.requestAnimationFrame':
      '<c>requestAnimationFrame</c> asks the browser to call <c>{{name}}</c> right before painting the next frame.',
    'event.listen':
      '<c>addEventListener</c> registers <c>{{name}}</c>: the browser now listens for clicks on the button.',
    'event.unlisten': '<c>{{name}}</c> no longer listens for clicks.',
    'event.click':
      'Click! The browser adds the handler to the <b>macrotask queue</b>. It will only run once the stack is empty.',
    'event.clickIgnored': 'Click! But no handler listens to the button: nothing happens.',
    'loop.render':
      'The browser may paint a new frame (t = {{time}} ms): it first runs the <c>requestAnimationFrame</c> callbacks.',
    'loop.runAnimationFrame': 'Render phase: running <c>{{name}}</c> before painting the frame.',
    'webapi.clear': 'Timer #{{id}} is cancelled and removed from the Web APIs.',
    timerDone:
      'The timer for <c>{{name}}</c> has elapsed: the callback joins the <b>macrotask queue</b>. It does not run right away; it waits its turn.',
    fetchDone: 'The response for <c>{{url}}</c> arrived: a task is queued to settle the promise.',
    fetchResolved:
      'The <c>fetch</c> promise is resolved with the response: waiting callbacks move to the microtask queue.',
    'enqueue.then': 'The promise is settled: the callback <c>{{name}}</c> moves to the <b>microtask queue</b>.',
    'enqueue.await':
      'The promise awaited by <c>{{name}}</c> is settled: its resumption is added to the <b>microtask queue</b>.',
    'enqueue.thenable':
      'A promise is resolved with another promise: it must first be “adopted”, which costs an extra microtask.',
    'enqueue.passThrough':
      'This <c>then</c> has no callback for this case: a microtask just forwards the result to the next promise.',
    'enqueue.queueMicrotask': '<c>queueMicrotask</c> adds <c>{{name}}</c> straight to the <b>microtask queue</b>.',
    'loop.runMicrotask':
      'The stack is empty: the event loop runs the next <b>microtask</b> (<c>{{name}}</c>). All microtasks run before the next task.',
    'loop.runTask': 'No microtasks left: the event loop takes <b>a single task</b> from the queue (<c>{{name}}</c>).',
    'loop.waitTimers': 'Nothing to run: the event loop waits. Time advances to t = {{time}} ms.',
    'loop.done': 'Nothing left on the stack, in the queues or in the Web APIs: the program is done.',
    uncaught: 'Uncaught error: <c>{{text}}</c>. The stack is cleared, but the event loop keeps going.',
    unhandledRejection: 'A promise was rejected without a <c>catch</c>: <c>{{text}}</c>.',
  },
  error: {
    title: 'Unable to run this code',
    syntax: 'Syntax error: {{message}}',
    unsupported: 'This syntax is not supported by the visualizer yet: {{type}}.',
    tooManySteps: 'The program exceeds {{max}} steps: the visualization is truncated.',
    stackOverflow: 'Maximum call stack size exceeded: the recursion is too deep (or never ends).',
    tooManyOps: 'The program seems to loop forever: execution stopped.',
    awaitOutsideAsync: '“await” is only allowed inside an async function.',
  },
};
