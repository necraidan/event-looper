import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { simulate } from './engine/interpreter';
import type { RunResult, Snapshot } from './engine/types';
import { examples } from './examples';
import { LANGUAGES, type Language } from './i18n';
import { THEMES, useTheme } from './theme';
import { CallStackPanel, ConsolePanel, EventLoopPanel, QueuePanel, WebApisPanel } from './ui/Panels';
import { Quiz } from './ui/Quiz';
import { ExplanationText } from './ui/RichText';
import { SPEEDS, usePlayer } from './ui/usePlayer';

// CodeMirror is the heaviest dependency: load it after the first paint.
const CodeEditor = lazy(() => import('./ui/CodeEditor').then((m) => ({ default: m.CodeEditor })));

const HASH_PREFIX = '#code=';

function codeFromHash(): string | undefined {
  if (!location.hash.startsWith(HASH_PREFIX)) return undefined;
  try {
    const bytes = Uint8Array.from(atob(decodeURIComponent(location.hash.slice(HASH_PREFIX.length))), (c) =>
      c.charCodeAt(0),
    );
    return new TextDecoder().decode(bytes);
  } catch {
    return undefined;
  }
}

function writeHash(code: string) {
  const binary = String.fromCharCode(...new TextEncoder().encode(code));
  history.replaceState(null, '', HASH_PREFIX + encodeURIComponent(btoa(binary)));
}

const EMPTY_STEP: Snapshot = {
  stack: [],
  webApis: [],
  tasks: [],
  microtasks: [],
  console: [],
  phase: 'script',
  time: 0,
  explanation: { key: '' },
};

export default function App() {
  const { t, i18n } = useTranslation();
  const { theme, setTheme, dark } = useTheme();
  const [code, setCode] = useState(() => codeFromHash() ?? examples[0].code);
  const [exampleId, setExampleId] = useState(() => (codeFromHash() ? '' : examples[0].id));
  const [result, setResult] = useState<RunResult | null>(null);
  const [clicks, setClicks] = useState<number[]>([]);
  const [quizMode, setQuizMode] = useState(false);
  const [quizActive, setQuizActive] = useState(false);
  const [shared, setShared] = useState(false);
  const steps = result?.steps ?? [];
  const player = usePlayer(steps.length);
  const step = steps[player.index] ?? EMPTY_STEP;
  const running = result !== null;
  const example = examples.find((e) => e.id === exampleId);
  const lang = (LANGUAGES as readonly string[]).includes(i18n.language) ? (i18n.language as Language) : 'fr';

  const run = () => {
    writeHash(code);
    setClicks([]);
    const next = simulate(code);
    setResult(next);
    setQuizActive(quizMode && !next.error);
    player.reset();
  };

  const edit = () => {
    setResult(null);
    setQuizActive(false);
    player.reset();
  };

  // The simulation is deterministic, so replaying it with the click injected
  // after the current step keeps every earlier step identical.
  const click = () => {
    const next = [...clicks, player.index];
    setClicks(next);
    setResult(simulate(code, { clicks: next }));
    player.go(player.index + 1);
  };

  const share = async () => {
    writeHash(code);
    try {
      await navigator.clipboard.writeText(location.href);
      setShared(true);
      setTimeout(() => setShared(false), 2000);
    } catch {
      // Clipboard denied: the URL in the address bar is still up to date.
    }
  };

  const pickExample = (id: string) => {
    const example = examples.find((e) => e.id === id);
    if (!example) return;
    setExampleId(id);
    setCode(example.code);
    edit();
  };

  useEffect(() => {
    if (!running || quizActive) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && e.target.closest('input, select, textarea, button, .cm-editor')) return;
      if (e.key === 'ArrowRight') player.next();
      else if (e.key === 'ArrowLeft') player.prev();
      else if (e.key === ' ') player.togglePlay();
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [running, quizActive, player]);

  const pickedQueue =
    step.explanation.key === 'loop.runTask'
      ? 'task'
      : step.explanation.key === 'loop.runMicrotask'
        ? 'microtask'
        : null;
  const errorSpan =
    result?.error && (steps.length === 0 || player.index === steps.length - 1) ? result.error.span : undefined;
  const highlight = errorSpan ?? (running ? step.highlight : undefined);

  const finalLogs = useMemo(() => result?.steps.at(-1)?.console.map((l) => l.text) ?? [], [result]);

  const errorMessage = useMemo(() => {
    if (!result?.error) return null;
    const key = result.error.key.replace(/^error\./, '');
    return t(`error.${key}`, result.error.params);
  }, [result, t]);

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="logo" aria-hidden="true">
            <svg
              viewBox="0 0 24 24"
              width="28"
              height="28"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="2.5" y="6.5" width="19" height="11" rx="5.5" />
              <path d="M11 3.5l3 3-3 3" />
            </svg>
          </span>
          <div>
            <h1>
              {t('app.title')}
              <span className="beta-tag">beta</span>
            </h1>
            <p>{t('app.tagline')}</p>
          </div>
        </div>
        <div className="topbar-actions">
          <label className="field">
            <span>{t('app.examples')}</span>
            <select value={exampleId} onChange={(e) => pickExample(e.target.value)}>
              {exampleId === '' && <option value="">—</option>}
              {examples.map((example) => (
                <option key={example.id} value={example.id}>
                  {example.title[lang]}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className="btn" onClick={() => void share()} aria-live="polite">
            🔗 {shared ? t('app.shared') : t('app.share')}
          </button>
          <label className="field">
            <span>{t('app.theme')}</span>
            <select value={theme} onChange={(e) => setTheme(e.target.value as typeof theme)}>
              {THEMES.map(({ id }) => (
                <option key={id} value={id}>
                  {t(`themes.${id}`)}
                </option>
              ))}
            </select>
          </label>
          <div className="lang-switch" role="group" aria-label={t('app.language')}>
            {LANGUAGES.map((l) => (
              <button
                key={l}
                type="button"
                className={l === lang ? 'is-active' : ''}
                aria-pressed={l === lang}
                onClick={() => void i18n.changeLanguage(l)}
              >
                {l.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="layout">
        <div className="column column-code">
          <section className="panel panel-code" aria-label={t('panels.code')}>
            <header className="panel-header panel-header-row">
              <h2>{t('panels.code')}</h2>
              {running ? (
                <button type="button" className="btn" onClick={edit}>
                  ✎ {t('controls.edit')}
                </button>
              ) : (
                <div className="code-actions">
                  <label className="toggle" title={t('quiz.toggleHint')}>
                    <input type="checkbox" checked={quizMode} onChange={(e) => setQuizMode(e.target.checked)} />
                    {t('quiz.toggle')}
                  </label>
                  <button type="button" className="btn btn-primary" onClick={run}>
                    ▶ {t('controls.run')}
                  </button>
                </div>
              )}
            </header>
            <Suspense fallback={<pre className="editor editor-fallback">{code}</pre>}>
              <CodeEditor
                code={code}
                onChange={(value) => {
                  setCode(value);
                  setExampleId('');
                }}
                readOnly={running}
                highlight={highlight}
                highlightKind={errorSpan ? 'error' : 'step'}
                label={t('panels.code')}
                dark={dark}
              />
            </Suspense>
          </section>

          {quizActive && <Quiz answer={finalLogs} onDone={() => setQuizActive(false)} />}

          {running && !quizActive && steps.length > 0 && (
            <section className="panel panel-controls" aria-label={t('controls.play')}>
              <div className="controls">
                <button
                  type="button"
                  className="btn btn-icon"
                  onClick={player.first}
                  title={t('controls.first')}
                  aria-label={t('controls.first')}
                >
                  ⏮
                </button>
                <button
                  type="button"
                  className="btn btn-icon"
                  onClick={player.prev}
                  title={t('controls.prev')}
                  aria-label={t('controls.prev')}
                >
                  ◀
                </button>
                <button type="button" className="btn btn-primary btn-play" onClick={player.togglePlay}>
                  {player.playing ? `⏸ ${t('controls.pause')}` : `▶ ${t('controls.play')}`}
                </button>
                <button
                  type="button"
                  className="btn btn-icon"
                  onClick={player.next}
                  title={t('controls.next')}
                  aria-label={t('controls.next')}
                >
                  ▶
                </button>
                <button
                  type="button"
                  className="btn btn-icon"
                  onClick={player.last}
                  title={t('controls.last')}
                  aria-label={t('controls.last')}
                >
                  ⏭
                </button>
                <label className="field field-inline">
                  <span>{t('controls.speed')}</span>
                  <select value={player.speed} onChange={(e) => player.setSpeed(Number(e.target.value))}>
                    {SPEEDS.map((s) => (
                      <option key={s} value={s}>
                        ×{s}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <input
                type="range"
                className="timeline"
                min={0}
                max={steps.length - 1}
                value={player.index}
                onChange={(e) => {
                  player.pause();
                  player.go(Number(e.target.value));
                }}
                aria-label={t('controls.step', { current: player.index + 1, total: steps.length })}
              />
              <div className="controls-footer">
                <span>{t('controls.step', { current: player.index + 1, total: steps.length })}</span>
                <span className="shortcuts">{t('controls.shortcuts')}</span>
              </div>
            </section>
          )}

          {!quizActive && (
            <section className="panel panel-explanation" aria-label={t('panels.explanation')} aria-live="polite">
              <header className="panel-header">
                <h2>{t('panels.explanation')}</h2>
              </header>
              <div className="panel-body explanation">
                {errorMessage && (
                  <p className="error" role="alert">
                    <strong>{t('error.title')}</strong> — {errorMessage}
                  </p>
                )}
                {running && steps.length > 0 ? (
                  <p>
                    <ExplanationText explanation={step.explanation} />
                  </p>
                ) : (
                  !running && <p className="empty">{example?.hint?.[lang] ?? t('empty.idle')}</p>
                )}
              </div>
            </section>
          )}
        </div>

        <div className="column column-runtime">
          <CallStackPanel stack={step.stack} />
          <WebApisPanel items={step.webApis} onClick={running && !quizActive ? click : undefined} />
          <EventLoopPanel phase={step.phase} time={step.time} />
          <div className="queues">
            <QueuePanel kind="microtask" items={step.microtasks} active={pickedQueue === 'microtask'} />
            <QueuePanel kind="task" items={step.tasks} active={pickedQueue === 'task'} />
          </div>
          <ConsolePanel lines={step.console} />
        </div>
      </main>
    </div>
  );
}
