import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

function shuffle<T>(items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Asks the user to put the program's console output in order before watching it run. */
export function Quiz({ answer, onDone }: { answer: string[]; onDone: () => void }) {
  const { t } = useTranslation();
  // Indexes into `answer`, so duplicated lines stay distinct.
  const pool = useMemo(() => shuffle(answer.map((_, i) => i)), [answer]);
  const [picked, setPicked] = useState<number[]>([]);
  const [checked, setChecked] = useState(false);

  const remaining = pool.filter((i) => !picked.includes(i));
  const score = picked.filter((i, pos) => answer[i] === answer[pos]).length;
  const complete = picked.length === answer.length;

  if (answer.length === 0) {
    return (
      <section className="panel panel-quiz" aria-label={t('quiz.title')}>
        <div className="panel-body">
          <p className="empty">{t('quiz.noOutput')}</p>
          <button type="button" className="btn btn-primary" onClick={onDone}>
            ▶ {t('quiz.watch')}
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="panel panel-quiz" aria-label={t('quiz.title')}>
      <header className="panel-header">
        <h2>{t('quiz.title')}</h2>
        <p className="panel-hint">{t('quiz.instructions')}</p>
      </header>
      <div className="panel-body quiz">
        <ol className="quiz-answer" aria-label={t('quiz.yourOrder')}>
          {picked.map((i, pos) => {
            const state = checked ? (answer[i] === answer[pos] ? 'is-right' : 'is-wrong') : '';
            return (
              <li key={i} className={`quiz-chip ${state}`}>
                <span className="quiz-pos">{pos + 1}</span>
                {answer[i]}
              </li>
            );
          })}
          {!complete && <li className="quiz-slot">…</li>}
        </ol>

        {!checked && remaining.length > 0 && (
          <div className="quiz-pool" role="group" aria-label={t('quiz.pool')}>
            {remaining.map((i) => (
              <button key={i} type="button" className="quiz-chip quiz-option" onClick={() => setPicked([...picked, i])}>
                {answer[i]}
              </button>
            ))}
          </div>
        )}

        {checked && (
          <p className={`quiz-result ${score === answer.length ? 'is-right' : 'is-wrong'}`} role="status">
            {score === answer.length ? t('quiz.perfect') : t('quiz.score', { score, total: answer.length })}
          </p>
        )}
        {checked && score !== answer.length && (
          <p className="quiz-solution">
            {t('quiz.solution')} <code>{answer.join(' → ')}</code>
          </p>
        )}

        <div className="quiz-actions">
          {!checked && (
            <>
              <button
                type="button"
                className="btn"
                onClick={() => setPicked(picked.slice(0, -1))}
                disabled={picked.length === 0}
              >
                ↶ {t('quiz.undo')}
              </button>
              <button type="button" className="btn btn-primary" onClick={() => setChecked(true)} disabled={!complete}>
                ✓ {t('quiz.check')}
              </button>
            </>
          )}
          <button type="button" className={checked ? 'btn btn-primary' : 'btn btn-ghost'} onClick={onDone}>
            ▶ {checked ? t('quiz.watch') : t('quiz.skip')}
          </button>
        </div>
      </div>
    </section>
  );
}
