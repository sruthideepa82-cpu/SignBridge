import { HOW_IT_WORKS_STEPS } from '../../data/landingContent.js';
import SectionHeading from '../common/SectionHeading.jsx';

export default function HowItWorksSection() {
  return (
    <section id="how-it-works" className="scroll-mt-20 bg-white py-20 sm:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionHeading
          eyebrow="How it works"
          title="From gesture to conversation in four steps"
          description="This is the target experience. Each step is being built as part of the project roadmap."
        />

        <ol className="mt-14 grid gap-6 md:grid-cols-2 xl:grid-cols-4">
          {HOW_IT_WORKS_STEPS.map((step, index) => {
            const Icon = step.icon;
            return (
              <li
                key={step.title}
                className="relative rounded-2xl bg-slate-50 p-6 ring-1 ring-slate-900/5 transition hover:bg-white hover:shadow-lg"
              >
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-blue-600 to-violet-600 text-sm font-bold text-white shadow-md shadow-blue-600/20">
                    {index + 1}
                  </span>
                  <Icon size={22} className="text-violet-600" aria-hidden="true" />
                </div>
                <h3 className="mt-5 text-base font-semibold text-slate-900">{step.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">{step.description}</p>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
