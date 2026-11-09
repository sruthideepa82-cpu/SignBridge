import { CheckCircle2, Circle, GraduationCap } from 'lucide-react';
import { Link } from 'react-router-dom';
import { AppPageHeader, EmptyState, Panel, StatusDot } from '../components/app/ui.jsx';
import { LESSON_TRACKS } from '../data/moduleContent.js';
import { VOCABULARY } from '../data/datasetStatus.js';
import usePracticeProgress from '../hooks/usePracticeProgress.js';
import { appendHistory } from '../lib/practiceHistory.js';

// Levels are how the lessons are grouped in the app. They are not measured.
const TRACK_LEVELS = {
  'Finger spelling': 'Beginner',
  'Everyday greetings': 'Beginner',
  'Numbers and dates': 'Intermediate',
  'Conversation practice': 'Intermediate',
};

// Lessons exist only where the content is verified. Finger spelling is built from the checked letters.
const LESSONS = {
  'Finger spelling': [
    { id: 'fs-1', title: 'Letters C and L', letters: ['C', 'L'] },
    { id: 'fs-2', title: 'Letters O and S', letters: ['O', 'S'] },
    { id: 'fs-3', title: 'Letters U and V', letters: ['U', 'V'] },
  ],
};

function lessonState(lesson, practised) {
  const done = lesson.letters.filter((letter) => practised.includes(letter)).length;
  if (done === lesson.letters.length) return { label: 'Complete', tone: 'ok', done, total: lesson.letters.length };
  if (done > 0) return { label: 'In progress', tone: 'warn', done, total: lesson.letters.length };
  return { label: 'Not started', tone: 'neutral', done, total: lesson.letters.length };
}

function Track({ track, practised, onMark }) {
  const lessons = LESSONS[track.title] ?? [];
  const letters = lessons.flatMap((lesson) => lesson.letters);
  const trackDone = letters.filter((letter) => practised.includes(letter)).length;
  const percent = letters.length === 0 ? 0 : Math.round((trackDone / letters.length) * 100);

  return (
    <Panel labelledBy={`track-${track.title.replace(/\W+/g, '-').toLowerCase()}`} title={track.title} description={track.description}>
      <div className="mb-4 flex items-center justify-between text-xs text-app-muted">
        <span>{TRACK_LEVELS[track.title]}</span>
        <span>{lessons.length === 0 ? 'Lessons in preparation' : `${trackDone} of ${letters.length} letters marked`}</span>
      </div>

      {lessons.length > 0 && (
        <div className="mb-4 h-1.5 overflow-hidden rounded-full bg-white/5" role="progressbar" aria-valuemin={0} aria-valuemax={letters.length} aria-valuenow={trackDone} aria-label={`${track.title} progress`}>
          <div className="h-full rounded-full bg-lime-signal transition-[width] duration-500" style={{ width: `${percent}%` }} />
        </div>
      )}

      {lessons.length === 0 ? (
        <EmptyState icon={GraduationCap} title="No lessons yet">
          Content for this track has not been written and checked yet.
        </EmptyState>
      ) : (
        <ol className="space-y-3">
          {lessons.map((lesson) => {
            const state = lessonState(lesson, practised);
            return (
              <li key={lesson.id} className="rounded-lg border border-app-border bg-app-bg p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-app-text">{lesson.title}</p>
                    <p className="mt-1 flex items-center gap-1.5 text-xs text-app-muted">
                      <StatusDot tone={state.tone} />
                      {state.label} · {state.done} of {state.total} letters marked
                    </p>
                  </div>
                </div>

                <ul className="mt-3 space-y-2">
                  {lesson.letters.map((letter) => {
                    const entry = VOCABULARY.find((item) => item.label === letter);
                    const done = practised.includes(letter);
                    return (
                      <li key={letter} className="flex items-center justify-between gap-3 rounded-md px-2 py-1.5 hover:bg-white/5">
                        <div className="min-w-0">
                          <span className="text-sm font-semibold text-app-text">{letter}</span>
                          <span className="ml-2 text-xs text-app-muted">{entry?.meaning ?? 'Not yet written'}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => onMark(letter)}
                          aria-pressed={done}
                          aria-label={`Mark letter ${letter} as practised`}
                          className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-app-muted transition-colors hover:text-app-text focus-visible:outline-2 focus-visible:outline-lime-signal"
                        >
                          {done ? <CheckCircle2 size={15} className="text-lime-signal" aria-hidden="true" /> : <Circle size={15} aria-hidden="true" />}
                          {done ? 'Marked' : 'Mark'}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </li>
            );
          })}
        </ol>
      )}
    </Panel>
  );
}

export default function GuidedLearningPage() {
  const { practised, toggle } = usePracticeProgress();

  const mark = (letter) => {
    const wasMarked = practised.includes(letter);
    toggle(letter);
    if (!wasMarked) appendHistory({ letter, kind: 'marked', at: Date.now() });
  };

  const beginner = LESSON_TRACKS.filter((track) => TRACK_LEVELS[track.title] === 'Beginner');
  const intermediate = LESSON_TRACKS.filter((track) => TRACK_LEVELS[track.title] === 'Intermediate');

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-8 sm:px-6 lg:px-8">
      <AppPageHeader
        eyebrow="Learn"
        title="Guided Learning"
        description="Learning paths in order. You mark letters as you work through them. Progress is saved in this browser and is not checked by the app."
      />

      {[
        { heading: 'Beginner', tracks: beginner },
        { heading: 'Intermediate', tracks: intermediate },
      ].map((group) => (
        <section key={group.heading} aria-labelledby={`level-${group.heading.toLowerCase()}`} className="flex flex-col gap-4">
          <h2 id={`level-${group.heading.toLowerCase()}`} className="text-xs font-semibold uppercase tracking-wider text-app-muted">
            {group.heading}
          </h2>
          <div className="grid gap-6 lg:grid-cols-2">
            {group.tracks.map((track) => (
              <Track key={track.title} track={track} practised={practised} onMark={mark} />
            ))}
          </div>
        </section>
      ))}

      <p className="text-xs text-app-muted">
        Letters are marked by you, not checked by the app. Recognition feedback is available in the{' '}
        <Link to="/learn/practice" className="text-lime-signal underline-offset-2 hover:underline">
          Practice Lab
        </Link>
        , and only when a model is loaded.
      </p>
    </div>
  );
}
