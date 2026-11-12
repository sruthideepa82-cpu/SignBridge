import { Check, ChevronLeft, ChevronRight, Star } from 'lucide-react';
import { useEffect, useMemo } from 'react';
import SignAnimationPlayer from '../animation/SignAnimationPlayer.jsx';
import { Panel, StatusDot, buttonClass } from '../app/ui.jsx';

// Shows a set of signs as a grid with a detail panel. The alphabet explorer and any future word list use it.
export default function SignBrowser({
  signs,
  categoryId,
  selectedId,
  onSelect,
  clipStatus,
  completedIds,
  favouriteIds,
  onPlay,
  onToggleCompleted,
  onToggleFavourite,
}) {
  const completed = useMemo(() => new Set(completedIds), [completedIds]);
  const favourites = useMemo(() => new Set(favouriteIds), [favouriteIds]);
  const index = Math.max(0, signs.findIndex((item) => item.id === selectedId));
  const sign = signs[index];
  const isLetters = categoryId === 'alphabet';
  const noun = isLetters ? 'letter' : 'sign';
  const learnedCount = signs.filter((item) => completed.has(item.id)).length;

  useEffect(() => {
    const move = (step) => {
      const next = signs[index + step];
      if (next) onSelect(next.id);
    };
    const onKey = (event) => {
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes(event.target?.tagName)) return;
      if (event.key === 'ArrowLeft') move(-1);
      if (event.key === 'ArrowRight') move(1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index, signs, onSelect]);

  if (!sign) return null;

  const isFavourite = favourites.has(sign.id);
  const isLearned = completed.has(sign.id);
  const hasClip = clipStatus[sign.clipPath] === true;

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]">
      <Panel
        labelledBy="sign-grid-title"
        title={isLetters ? 'Letters' : 'Signs'}
        description={`${learnedCount} of ${signs.length} learned. Green dot: animation available.`}
      >
        <ul
          aria-labelledby="sign-grid-title"
          className={`grid gap-2 ${isLetters ? 'grid-cols-4 sm:grid-cols-6 xl:grid-cols-5' : 'grid-cols-1 sm:grid-cols-2'}`}
        >
          {signs.map((item) => {
            const selected = item.id === sign.id;
            const learned = completed.has(item.id);
            const favourite = favourites.has(item.id);
            const available = clipStatus[item.clipPath] === true;
            const name = `${item.title}${learned ? ', learned' : ''}${favourite ? ', favourite' : ''}${
              available ? '' : ', animation not available yet'
            }`;
            return (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => onSelect(item.id)}
                  aria-pressed={selected}
                  aria-label={name}
                  className={`relative flex w-full items-center justify-center rounded-lg border transition-colors focus-visible:outline-2 focus-visible:outline-accent ${
                    isLetters ? 'aspect-square text-2xl font-semibold' : 'min-h-11 px-3 py-2 text-left text-sm'
                  } ${
                    selected
                      ? 'border-accent/60 bg-accent/15 text-app-text'
                      : 'border-app-border bg-app-bg text-app-muted hover:text-app-text'
                  }`}
                >
                  {item.label}
                  {learned && <Check size={12} aria-hidden="true" className="absolute right-1.5 top-1.5 text-success" />}
                  {favourite && (
                    <Star size={11} aria-hidden="true" className="absolute left-1.5 top-1.5 fill-accent text-accent" />
                  )}
                  {available && (
                    <span aria-hidden="true" className="absolute bottom-1.5 right-1.5">
                      <StatusDot tone="ok" />
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </Panel>

      <Panel labelledBy="sign-detail-title" className="flex min-w-0 flex-col gap-5">
        <SignAnimationPlayer
          key={sign.id}
          src={sign.clipPath}
          label={sign.title}
          available={clipStatus[sign.clipPath] ?? null}
          onPlay={() => onPlay(sign.id)}
        />

        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-app-muted">
            {sign.motion === 'moving' ? 'Moving sign' : 'Static sign'}
          </p>
          <h2 id="sign-detail-title" className="mt-1 text-xl font-semibold tracking-tight text-app-text">
            {sign.title}
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-app-muted">{sign.description}</p>
          <p className="mt-3 flex items-start gap-1.5 text-xs leading-relaxed text-app-muted">
            <span className="mt-1.5">
              <StatusDot tone={sign.signerConfirmed ? 'ok' : 'warn'} />
            </span>
            <span>
              Reference: {sign.reference}. {sign.signerConfirmed ? 'Confirmed by a signer.' : 'Signer confirmation pending.'}
              {!hasClip && ' No animation yet.'}
            </span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => onSelect(signs[index - 1].id)}
            disabled={index === 0}
            aria-label={`Previous ${noun}`}
            className={buttonClass('secondary', 'px-3')}
          >
            <ChevronLeft size={16} aria-hidden="true" />
            Previous
          </button>
          <button
            type="button"
            onClick={() => onSelect(signs[index + 1].id)}
            disabled={index === signs.length - 1}
            aria-label={`Next ${noun}`}
            className={buttonClass('secondary', 'px-3')}
          >
            Next
            <ChevronRight size={16} aria-hidden="true" />
          </button>
          <p className="ml-auto text-xs tabular-nums text-app-muted" aria-live="polite">
            {index + 1} of {signs.length}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2 border-t border-app-border pt-4">
          <button
            type="button"
            onClick={() => onToggleFavourite(sign.id)}
            aria-pressed={isFavourite}
            aria-label={`${isFavourite ? 'Remove' : 'Add'} ${sign.title} ${isFavourite ? 'from' : 'to'} favourites`}
            className={buttonClass(isFavourite ? 'secondary' : 'ghost', 'w-full border border-app-border')}
          >
            <Star size={15} aria-hidden="true" className={isFavourite ? 'fill-accent text-accent' : ''} />
            {isFavourite ? 'Favourited' : 'Favourite'}
          </button>
          <button
            type="button"
            onClick={() => onToggleCompleted(sign.id)}
            aria-pressed={isLearned}
            aria-label={`${isLearned ? 'Unmark' : 'Mark'} ${sign.title} as learned`}
            className={buttonClass(isLearned ? 'secondary' : 'primary', 'w-full')}
          >
            <Check size={15} aria-hidden="true" />
            {isLearned ? 'Learned' : 'Mark as learned'}
          </button>
        </div>
      </Panel>
    </div>
  );
}
