import { Hash, MessageSquareText } from 'lucide-react';
import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import LearnSignsCategories from '../components/learn-signs/LearnSignsCategories.jsx';
import PracticePanel from '../components/learn-signs/PracticePanel.jsx';
import ProgressPanel from '../components/learn-signs/ProgressPanel.jsx';
import SignBrowser from '../components/learn-signs/SignBrowser.jsx';
import { AppPageHeader, EmptyState } from '../components/app/ui.jsx';
import { SIGN_CATEGORIES, SIGNS, displayableSigns, signById } from '../data/signLibrary.js';
import useClipAvailability from '../hooks/useClipAvailability.js';
import useLearnProgress from '../hooks/useLearnProgress.js';

const EMPTY_TEXT = {
  numbers: {
    icon: Hash,
    title: 'No verified number signs yet',
    text: 'Numbers 0–9 are not shown until each sign has a verified mapping and an animation. None has been verified yet, so none are shown.',
  },
  words: {
    icon: MessageSquareText,
    title: 'No verified words or phrases yet',
    text: 'Words and phrases are not shown until each has a verified mapping and an animation. None has been verified yet, so none are shown.',
  },
};

export default function LearnSignsPage() {
  const [params, setParams] = useSearchParams();
  const progress = useLearnProgress();
  const clipStatus = useClipAvailability(SIGNS.map((sign) => sign.clipPath));

  const requested = params.get('category');
  const categoryId = SIGN_CATEGORIES.some((item) => item.id === requested) ? requested : 'alphabet';

  const alphabet = useMemo(() => displayableSigns('alphabet'), []);
  const alphabetLabels = useMemo(() => alphabet.map((sign) => sign.label), [alphabet]);
  const quizPool = useMemo(() => alphabet.filter((sign) => clipStatus[sign.clipPath] === true), [alphabet, clipStatus]);
  const categorySigns = useMemo(() => displayableSigns(categoryId), [categoryId]);

  const requestedSign = signById(params.get('sign'));
  const selectedId =
    requestedSign && requestedSign.category === categoryId ? requestedSign.id : (categorySigns[0]?.id ?? null);

  const selectCategory = (id) => setParams({ category: id });
  const selectSign = useCallback(
    (id) => setParams({ category: categoryId, sign: id }, { replace: true }),
    [categoryId, setParams],
  );

  const completedSet = new Set(progress.completedIds);
  const completedAlphabet = alphabet.filter((sign) => completedSet.has(sign.id)).length;
  const recentItems = progress.recent
    .map((item) => ({ sign: signById(item.id), at: item.at }))
    .filter((item) => item.sign);
  const favouriteSigns = progress.favouriteIds.map((id) => signById(id)).filter(Boolean);

  const counts = {
    alphabet: `${alphabet.length} letters`,
    numbers: `${displayableSigns('numbers').length} verified`,
    words: `${displayableSigns('words').length} verified`,
    practice: `${quizPool.length} clips ready`,
  };

  const sharedBrowserProps = {
    categoryId,
    selectedId,
    onSelect: selectSign,
    clipStatus,
    completedIds: progress.completedIds,
    favouriteIds: progress.favouriteIds,
    onPlay: progress.recordPractice,
    onToggleCompleted: progress.toggleCompleted,
    onToggleFavourite: progress.toggleFavourite,
  };

  let content;
  if (categoryId === 'alphabet') {
    content = <SignBrowser signs={categorySigns} {...sharedBrowserProps} />;
  } else if (categoryId === 'practice') {
    content = (
      <PracticePanel
        alphabetLabels={alphabetLabels}
        quizPool={quizPool}
        recent={recentItems}
        favourites={favouriteSigns}
        onAnswer={progress.recordPractice}
      />
    );
  } else if (categorySigns.length > 0) {
    content = <SignBrowser signs={categorySigns} {...sharedBrowserProps} />;
  } else {
    const empty = EMPTY_TEXT[categoryId];
    content = (
      <EmptyState icon={empty.icon} title={empty.title}>
        {empty.text}
      </EmptyState>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
      <AppPageHeader
        eyebrow="Learn"
        title="Learn Signs"
        description="Learn the manual alphabet, numbers and everyday phrases with short animations. Only signs with a verified mapping are shown."
      />

      <LearnSignsCategories selected={categoryId} counts={counts} onSelect={selectCategory} />

      <ProgressPanel
        completed={completedAlphabet}
        total={alphabet.length}
        favourites={progress.favouriteIds.length}
        recent={recentItems.length}
        syncStatus={progress.syncStatus}
      />

      {content}
    </div>
  );
}
