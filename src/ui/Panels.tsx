import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { ConsoleLine, FrameView, LoopPhase, QueueItemView, WebApiView } from '../engine/types';

function Panel({
  title,
  hint,
  className = '',
  children,
}: {
  title: string;
  hint?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={`panel ${className}`} aria-label={title}>
      <header className="panel-header">
        <h2>{title}</h2>
        {hint && <p className="panel-hint">{hint}</p>}
      </header>
      <div className="panel-body">{children}</div>
    </section>
  );
}

function useFunctionLabel() {
  const { t } = useTranslation();
  return (name: string) => (name ? `${name}()` : t('frame.anonymous'));
}

export function CallStackPanel({ stack }: { stack: FrameView[] }) {
  const { t } = useTranslation();
  const label = useFunctionLabel();
  return (
    <Panel title={t('panels.callStack')} hint={t('hints.callStack')} className="panel-stack">
      {stack.length === 0 ? (
        <p className="empty">{t('empty.stack')}</p>
      ) : (
        <ol className="stack">
          {[...stack].reverse().map((frame, i) => (
            <li
              key={frame.id}
              className={`card card-frame ${i === 0 ? 'is-top' : ''} ${frame.isScript ? 'is-script' : ''}`}
            >
              {frame.isScript ? t('frame.script') : label(frame.name)}
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}

export function WebApisPanel({ items, onClick }: { items: WebApiView[]; onClick?: () => void }) {
  const { t } = useTranslation();
  const label = useFunctionLabel();
  return (
    <Panel title={t('panels.webApis')} hint={t('hints.webApis')} className="panel-webapis">
      {items.length === 0 ? (
        <p className="empty">{t('empty.webApis')}</p>
      ) : (
        <ul className="webapis">
          {items.map((item) => {
            const progress = item.delay === 0 ? 1 : 1 - item.remaining / item.delay;
            return (
              <li key={item.id} className={`card card-webapi kind-${item.kind}`}>
                <span className="card-tag">{item.kind}</span>
                <span className="card-name">
                  {item.kind === 'fetch'
                    ? item.name
                    : item.kind === 'click'
                      ? `button → ${label(item.name)}`
                      : label(item.name)}
                </span>
                <span className="card-meta">
                  {item.kind === 'click'
                    ? t('webapi.listening')
                    : item.kind === 'requestAnimationFrame'
                      ? t('webapi.nextFrame', { ms: item.remaining })
                      : t('webapi.remaining', { ms: item.remaining })}
                </span>
                {item.kind === 'click' && onClick && (
                  <button type="button" className="btn btn-click" onClick={onClick} title={t('controls.clickTitle')}>
                    {t('controls.click')}
                  </button>
                )}
                {item.kind !== 'click' && (
                  <span className="progress" aria-hidden="true">
                    <span style={{ width: `${Math.round(progress * 100)}%` }} />
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

export function QueuePanel({
  kind,
  items,
  active,
}: {
  kind: 'task' | 'microtask';
  items: QueueItemView[];
  active: boolean;
}) {
  const { t } = useTranslation();
  const label = useFunctionLabel();
  const title = kind === 'task' ? t('panels.taskQueue') : t('panels.microtaskQueue');
  const hint = kind === 'task' ? t('hints.taskQueue') : t('hints.microtaskQueue');
  return (
    <Panel title={title} hint={hint} className={`panel-queue panel-${kind}`}>
      {items.length === 0 ? (
        <p className="empty">{t('empty.queue')}</p>
      ) : (
        <ol className="queue">
          {items.map((item, i) => (
            <li key={item.id} className={`card card-${kind} ${active && i === 0 ? 'is-picked' : ''}`}>
              <span className="card-tag">{t(`source.${item.source}`)}</span>
              {item.source !== 'thenable' && item.source !== 'passThrough' && (
                <span className="card-name">{item.source === 'fetch' ? item.name : label(item.name)}</span>
              )}
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}

/** Where each phase sits on the loop, clockwise from the top (degrees). */
const STATIONS: { phase: Exclude<LoopPhase, 'script' | 'done'>; angle: number }[] = [
  { phase: 'task', angle: 0 },
  { phase: 'microtasks', angle: 90 },
  { phase: 'render', angle: 180 },
  { phase: 'timers', angle: 270 },
];

const RENDER_SPEC_URL = 'https://html.spec.whatwg.org/multipage/webappapis.html#update-the-rendering';

const point = (angle: number, radius: number) => {
  const rad = ((angle - 90) * Math.PI) / 180;
  return { x: 100 + radius * Math.cos(rad), y: 100 + radius * Math.sin(rad) };
};

export function EventLoopPanel({ phase, time }: { phase: LoopPhase; time: number }) {
  const { t } = useTranslation();
  // The main script is the very first task of the loop.
  const current = phase === 'script' ? 'task' : phase;
  return (
    <Panel title={t('panels.eventLoop')} className="panel-loop">
      <div className={`loop phase-${phase}`}>
        <svg viewBox="-60 0 320 200" className="loop-svg" role="img" aria-label={t(`phase.${phase}`)}>
          <circle cx="100" cy="100" r="70" className="loop-track" />
          {/* Chevrons between stations: the loop always turns clockwise. */}
          {STATIONS.map((s) => {
            const p = point(s.angle + 45, 70);
            return (
              <path
                key={`arrow-${s.phase}`}
                d="M-3 -4 L3 0 L-3 4"
                className="loop-arrow"
                transform={`translate(${p.x} ${p.y}) rotate(${s.angle + 45})`}
              />
            );
          })}
          {STATIONS.map((s) => {
            const p = point(s.angle, 70);
            const active = s.phase === current;
            const label = (
              <text
                x={p.x + (s.angle === 90 ? 16 : s.angle === 270 ? -16 : 0)}
                y={p.y + (s.angle === 0 ? -16 : s.angle === 180 ? 24 : 4)}
                textAnchor={s.angle === 90 ? 'start' : s.angle === 270 ? 'end' : 'middle'}
              >
                {t(`phase.${s.phase}`)}
                {s.phase === 'render' && ' ⓘ'}
              </text>
            );
            return (
              <g key={s.phase} className={`loop-station ${active ? 'is-current' : ''}`}>
                <rect
                  x={p.x - (active ? 8 : 5)}
                  y={p.y - (active ? 8 : 5)}
                  width={active ? 16 : 10}
                  height={active ? 16 : 10}
                />
                {s.phase === 'render' ? (
                  <a href={RENDER_SPEC_URL} target="_blank" rel="noreferrer" className="loop-help">
                    <title>{t('phaseHelp.render')}</title>
                    {label}
                  </a>
                ) : (
                  label
                )}
              </g>
            );
          })}
          <text x="100" y={time > 0 ? 98 : 106} className="loop-label" textAnchor="middle">
            {t(`phase.${phase}`)}
          </text>
          {/* Virtual time only moves while waiting for timers: hide it until it does. */}
          {time > 0 && (
            <text x="100" y="118" className="loop-clock" textAnchor="middle">
              {t('clock', { ms: time })}
            </text>
          )}
        </svg>
      </div>
    </Panel>
  );
}

export function ConsolePanel({ lines }: { lines: ConsoleLine[] }) {
  const { t } = useTranslation();
  return (
    <Panel title={t('panels.console')} className="panel-console">
      {lines.length === 0 ? (
        <p className="empty">{t('empty.console')}</p>
      ) : (
        <ol className="console" aria-live="polite">
          {lines.map((line) => (
            <li key={line.id} className={`console-line level-${line.level}`}>
              {line.text}
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}
