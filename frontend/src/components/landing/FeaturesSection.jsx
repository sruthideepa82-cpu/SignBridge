import { FEATURES } from '../../data/landingContent.js';
import SectionHeading from '../common/SectionHeading.jsx';
import FeatureCard from './FeatureCard.jsx';

export default function FeaturesSection() {
  return (
    <section id="features" className="scroll-mt-20 py-20 sm:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionHeading
          eyebrow="Features"
          title="Everything needed for two-way understanding"
          description="SignBridge brings recognition, translation, speech, and learning into one accessible experience."
        />

        <div className="mt-14 grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
          {FEATURES.map((feature) => (
            <FeatureCard key={feature.title} {...feature} />
          ))}
        </div>
      </div>
    </section>
  );
}
