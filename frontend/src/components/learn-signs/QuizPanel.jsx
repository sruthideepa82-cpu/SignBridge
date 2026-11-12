import { Film } from 'lucide-react';
import { useEffect, useState } from 'react';
import SignAnimationPlayer from '../animation/SignAnimationPlayer.jsx';
import { EmptyState, Panel, buttonClass } from '../app/ui.jsx';
import { QUIZ_MIN_CLIPS, buildQuizQuestion } from '../../lib/quiz.js';

// `pool` lists alphabet signs whose clip exists. `labels` lists every letter, used for the wrong choices.
export default function QuizPanel({ pool, labels, onAnswer }) {
  const ready = pool.length >= QUIZ_MIN_CLIPS;
  const [question, setQuestion] = useState(null);
  const [answer, setAnswer] = useState(null);
  const [score, setScore] = useState({ correct: 0, total: 0 });

  useEffect(() => {
    if (ready && !question) setQuestion(buildQuizQuestion(pool, labels));
  }, [ready, question, pool, labels]);

  if (!ready) {
    return (
      <EmptyState icon={Film} title="Quiz not available yet">
        The quiz needs at least {QUIZ_MIN_CLIPS} alphabet animations. {pool.length} found so far.
      </EmptyState>
    );
  }

  if (!question) return null;

  const correctLabel = question.sign.label;

  const choose = (label) => {
    if (answer) return;
    setAnswer(label);
    setScore((current) => ({
      correct: current.correct + (label === correctLabel ? 1 : 0),
      total: current.total + 1,
    }));
    onAnswer(question.sign.id);
  };

  const next = () => {
    setAnswer(null);
    setQuestion(buildQuizQuestion(pool, labels));
  };

  return (
    <Panel
      labelledBy="quiz-title"
      title="Identify the letter"
      description="Watch the clip, then choose the letter it shows. This tests recognising the animation, not your signing."
    >
      <SignAnimationPlayer
        key={question.sign.id}
        src={question.sign.clipPath}
        label={question.sign.title}
        available
        autoPlay
      />

      <div role="group" aria-label="Answer choices" className="mt-4 grid grid-cols-4 gap-2 sm:grid-cols-6">
        {question.options.map((label) => {
          const isCorrect = label === correctLabel;
          const isChosen = answer === label;
          let tone = 'border-app-border bg-app-bg text-app-text hover:bg-app-raised';
          if (answer && isCorrect) tone = 'border-success/60 bg-success/10 text-success';
          else if (isChosen) tone = 'border-danger/60 bg-danger/10 text-danger';
          return (
            <button
              key={label}
              type="button"
              disabled={answer !== null}
              onClick={() => choose(label)}
              className={`h-11 rounded-lg border text-base font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-default ${tone}`}
            >
              {label}
            </button>
          );
        })}
      </div>

      <div className="mt-4 flex min-h-6 items-center text-sm" role="status">
        {answer && (
          <p className={answer === correctLabel ? 'text-success' : 'text-danger'}>
            {answer === correctLabel ? 'Correct.' : `Not quite. This clip shows ${correctLabel}.`}
          </p>
        )}
      </div>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-3 border-t border-app-border pt-4">
        <p className="text-xs tabular-nums text-app-muted">
          {score.correct} of {score.total} correct
        </p>
        <button type="button" onClick={next} disabled={answer === null} className={buttonClass('primary')}>
          Next question
        </button>
      </div>
    </Panel>
  );
}
