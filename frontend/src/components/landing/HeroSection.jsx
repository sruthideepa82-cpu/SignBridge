import { ArrowRight, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';
import HeroIllustration from './HeroIllustration.jsx';

export default function HeroSection() {
  return (
    <section className="relative overflow-hidden">
      <div
        className="pointer-events-none absolute inset-x-0 -top-40 -z-10 mx-auto h-[32rem] max-w-5xl rounded-full bg-gradient-to-br from-blue-200/60 via-violet-200/40 to-transparent blur-3xl"
        aria-hidden="true"
      />

      <div className="mx-auto grid max-w-7xl items-center gap-12 px-4 py-16 sm:px-6 lg:grid-cols-2 lg:gap-16 lg:px-8 lg:py-24">
        <div className="text-center lg:text-left">
          <span className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-xs font-medium text-slate-600 shadow-sm ring-1 ring-slate-900/5">
            <Sparkles size={14} className="text-violet-600" aria-hidden="true" />
            Foundation release · Sign recognition in development
          </span>

          <h1 className="mt-6 text-4xl font-extrabold leading-tight tracking-tight text-slate-900 sm:text-5xl lg:text-6xl">
            Breaking Barriers. <span className="bg-gradient-to-r from-blue-600 to-violet-600 bg-clip-text text-transparent">Connecting People.</span>
          </h1>

          <p className="mx-auto mt-6 max-w-xl text-base leading-relaxed text-slate-600 sm:text-lg lg:mx-0">
            SignBridge is an AI-powered platform for real-time sign-language communication. It will turn
            sign language into text and speech, so sign-language users and people unfamiliar with it can
            talk naturally.
          </p>

          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row lg:justify-start">
            <Link
              to="/translator"
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-violet-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-600/25 transition hover:-translate-y-0.5 hover:shadow-xl sm:w-auto"
            >
              Start Communicating
              <ArrowRight size={18} aria-hidden="true" />
            </Link>
            <Link
              to="/learn"
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-white px-6 py-3 text-sm font-semibold text-slate-800 shadow-sm ring-1 ring-slate-200 transition hover:-translate-y-0.5 hover:bg-slate-50 hover:shadow-md sm:w-auto"
            >
              Explore Learning
            </Link>
          </div>
        </div>

        <HeroIllustration />
      </div>
    </section>
  );
}
