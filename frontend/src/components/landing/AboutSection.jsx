import { ABOUT_POINTS } from '../../data/landingContent.js';
import SectionHeading from '../common/SectionHeading.jsx';

export default function AboutSection() {
  return (
    <section id="about" className="scroll-mt-20 py-20 sm:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
          <SectionHeading
            align="left"
            eyebrow="About SignBridge"
            title="Technology that makes conversation easier for everyone"
            description="Sign language is a complete, expressive language, yet most public spaces are not designed for it. SignBridge is an academic capstone project exploring how computer vision and AI can close that gap, starting with Indian Sign Language."
          />

          <ul className="grid gap-4">
            {ABOUT_POINTS.map((point) => {
              const Icon = point.icon;
              return (
                <li
                  key={point.title}
                  className="flex gap-4 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-900/5"
                >
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                    <Icon size={22} aria-hidden="true" />
                  </span>
                  <div>
                    <h3 className="font-semibold text-slate-900">{point.title}</h3>
                    <p className="mt-1 text-sm leading-relaxed text-slate-600">{point.description}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </section>
  );
}
