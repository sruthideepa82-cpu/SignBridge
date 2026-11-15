import { Hash, MessageSquareText } from 'lucide-react';
import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import LearnSignsCategories from '../components/learn-signs/LearnSignsCategories.jsx';
import PracticePanel from '../components/learn-signs/PracticePanel.jsx';
import ProgressPanel from '../components/learn-signs/ProgressPanel.jsx';
import SignBrowser from '../components/learn-signs/SignBrowser.jsx';
import { AppPageHeader, EmptyState } from '../components/app/ui.jsx';
import { SIGN_CATEGORIES, SIGNS, displayableSigns, isQuizEligible, signById } from '../data/signLibrary.js';
import useClipAvailability from '../hooks/useClipAvailability.js';
import useLearnProgress from '../hooks/useLearnProgress.js';

const EMPTY_TEXT = {
  numbers: {
    icon: Hash,
    title: 'No number signs loaded',
    text: 'The number catalog is empty. Run the catalog export to load the signs for 0–9.',
  },
  words: {
    icon: MessageSquareText,
    title: 'No phrases loaded',
    text: 'The phrase catalog is empty. Run the phrase export to load the everyday phrases.',
  },
};

export default function LearnSignsPage() {
  const [params, setParams] = useSearchParams();
  const progress = useLearnProgress();
  const clipStatus = useClipAvailability(SIGNS.map((sign) => sign.clipPath));

  const requested = params.get('category');
  const categoryId = SIGN_CATEGORIES.some((item) => item.id === requested) ? requested : 'alphabet';

  const alphabet = useMemo(() => displayableSigns('alphabet'), []);
  const alphabetLabels = useMemo(() => alphabet.filter((sign) => sign.verified).map((sign) => sign.label), [alphabet]);
  const quizPool = useMemo(() => alphabet.filter((sign) => isQuizEligible(sign, clipStatus)), [alphabet, clipStatus]);
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
    numbers: `${displayableSigns('numbers').length} numbers`,
    words: `${displayableSigns('words').length} phrases`,
    practice: `${quizPool.length} ready for quiz`,
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
        description="Learn the manual alphabet, numbers and everyday phrases. Each sign shows whether its animation, mapping, signer check and model status are in place. Quizzes use only approved signs that have an animation."
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
