export interface Example {
  id: string;
  title: { fr: string; en: string };
  /** Shown before running, e.g. to tell the user when to click. */
  hint?: { fr: string; en: string };
  /** Uses APIs that Node lacks (button, requestAnimationFrame): not compared against Node in tests. */
  browserOnly?: boolean;
  code: string;
}

export const examples: Example[] = [
  {
    id: 'sync',
    title: { fr: 'Pile d’appels synchrone', en: 'Synchronous call stack' },
    code: `function multiply(a, b) {
  return a * b;
}

function square(n) {
  return multiply(n, n);
}

function printSquare(n) {
  const result = square(n);
  console.log(result);
}

printSquare(4);
console.log('Done');
`,
  },
  {
    id: 'timeout',
    title: { fr: 'setTimeout(…, 0)', en: 'setTimeout(…, 0)' },
    code: `console.log('A');

setTimeout(function timeout() {
  console.log('B');
}, 0);

console.log('C');
`,
  },
  {
    id: 'promise-vs-timeout',
    title: { fr: 'Les microtâches passent avant tout', en: 'Microtasks always go first' },
    code: `console.log('script start');

setTimeout(function timeout() {
  console.log('setTimeout');
}, 0);

Promise.resolve()
  .then(function first() {
    console.log('promise 1');
  })
  .then(function second() {
    console.log('promise 2');
  });

queueMicrotask(function micro1() {
  console.log('micro 1');
  queueMicrotask(function micro2() {
    console.log('micro 2 (added by micro 1)');
  });
});

console.log('script end');
`,
  },
  {
    id: 'async-await',
    title: { fr: 'async / await décortiqué', en: 'async / await unpacked' },
    code: `async function main() {
  console.log('main: start');
  await sayHello();
  console.log('main: after await');
}

async function sayHello() {
  console.log('hello');
}

main();
console.log('outside main');
`,
  },
  {
    id: 'var-vs-let',
    title: { fr: 'Boucle : var contre let', en: 'Loop: var vs let' },
    code: `for (var i = 0; i < 3; i++) {
  setTimeout(() => console.log('var', i), 0);
}

for (let j = 0; j < 3; j++) {
  setTimeout(() => console.log('let', j), 0);
}
`,
  },
  {
    id: 'timers-order',
    title: { fr: 'Délais des minuteurs', en: 'Timer delays' },
    code: `setTimeout(() => console.log('1000 ms'), 1000);
setTimeout(() => console.log('0 ms'), 0);
setTimeout(() => console.log('500 ms'), 500);
console.log('sync');
`,
  },
  {
    id: 'fetch',
    title: { fr: 'fetch et await', en: 'fetch and await' },
    code: `async function loadUser() {
  console.log('loading…');
  const response = await fetch('/api/user');
  const data = await response.json();
  console.log('received', data.message);
}

loadUser();
setTimeout(() => console.log('timeout 0'), 0);
console.log('sync code keeps running');
`,
  },
  {
    id: 'interval',
    title: { fr: 'setInterval', en: 'setInterval' },
    code: `let count = 0;

const id = setInterval(function tick() {
  count++;
  console.log('tick', count);
  if (count === 3) clearInterval(id);
}, 1000);
`,
  },
  {
    id: 'errors',
    title: { fr: 'Erreurs et rejets', en: 'Errors and rejections' },
    code: `async function failing() {
  throw new Error('boom');
}

failing()
  .catch((err) => console.log('caught:', err.message))
  .finally(() => console.log('finally'));

Promise.reject(new Error('nobody catches me'));
console.log('sync');
`,
  },
  {
    id: 'click',
    title: { fr: 'Clic pendant une tâche longue', en: 'Click during a long task' },
    hint: {
      fr: 'Le code écoute les clics sur un bouton de la page. Pendant que heavyWork tourne, cliquez sur « Cliquer » dans le panneau Web APIs : le clic attend que la pile se vide.',
      en: 'The code listens for clicks on a page button. While heavyWork runs, press “Click” in the Web APIs panel: the click waits for the stack to empty.',
    },
    browserOnly: true,
    code: `button.addEventListener('click', function onClick() {
  console.log('clicked!');
});

function heavyWork(n) {
  let total = 0;
  for (let i = 0; i < 1000; i++) total += i;
  console.log('chunk', n, 'done');
}

heavyWork(1);
heavyWork(2);
heavyWork(3);
setTimeout(function later() {
  console.log('timeout');
}, 0);
`,
  },
  {
    id: 'animation-frame',
    title: { fr: 'requestAnimationFrame', en: 'requestAnimationFrame' },
    hint: {
      fr: 'Les callbacks de requestAnimationFrame s’exécutent juste avant que le navigateur dessine une image (environ toutes les 16 ms).',
      en: 'requestAnimationFrame callbacks run right before the browser paints a frame (roughly every 16 ms).',
    },
    browserOnly: true,
    code: `let frames = 0;

function draw(time) {
  frames++;
  console.log('frame', frames, 'at', time, 'ms');
  if (frames < 3) requestAnimationFrame(draw);
}

requestAnimationFrame(draw);
setTimeout(() => console.log('timeout 0'), 0);
setTimeout(() => console.log('timeout 20'), 20);
Promise.resolve().then(() => console.log('microtask'));
`,
  },
];
