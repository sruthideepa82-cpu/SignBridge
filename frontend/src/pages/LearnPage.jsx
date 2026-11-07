import { GraduationCap, TrendingUp } from 'lucide-react';
import PageContainer from '../components/common/PageContainer.jsx';
import PageHeader from '../components/common/PageHeader.jsx';
import StatusBadge from '../components/common/StatusBadge.jsx';
import LessonTrackCard from '../components/learn/LessonTrackCard.jsx';
import { LESSON_TRACKS } from '../data/moduleContent.js';

export default function LearnPage() {
  return (
    <PageContainer>
      <PageHeader
        eyebrow="Learn"
        title="Interactive sign-language learning"
        description="Guided Indian Sign Language lessons with practice feedback are being designed. The lesson content below is a preview of the planned tracks."
        badge={<StatusBadge label="Under development" tone="warning" />}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="lg:col-span-2" aria-labelledby="lesson-tracks-title">
          <h2 id="lesson-tracks-title" className="sr-only">
            Planned lesson tracks
          </h2>
          <div className="grid gap-6 sm:grid-cols-2">
            {LESSON_TRACKS.map((track) => (
              <LessonTrackCard key={track.title} {...track} />
            ))}
          </div>
        </section>

        <aside className="rounded-3xl bg-gradient-to-br from-blue-600 to-violet-600 p-6 text-white shadow-lg shadow-blue-600/20">
          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/15">
            <TrendingUp size={24} aria-hidden="true" />
          </span>
          <h2 className="mt-5 text-lg font-semibold">Progress tracking</h2>
          <p className="mt-2 text-sm leading-relaxed text-blue-50">
            Lesson completion and practice scores will be saved here once user accounts and the MongoDB database
            are connected.
          </p>
          <div className="mt-6 flex items-center gap-2 rounded-xl bg-white/10 px-4 py-3 text-sm text-blue-50">
            <GraduationCap size={18} aria-hidden="true" />
            No progress recorded yet
          </div>
        </aside>
      </div>
    </PageContainer>
  );
}
