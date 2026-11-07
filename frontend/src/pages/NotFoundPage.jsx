import { ArrowLeft, Compass } from 'lucide-react';
import { Link } from 'react-router-dom';
import PageContainer from '../components/common/PageContainer.jsx';

export default function NotFoundPage() {
  return (
    <PageContainer>
      <div className="mx-auto flex max-w-md flex-col items-center py-16 text-center">
        <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
          <Compass size={32} aria-hidden="true" />
        </span>
        <h1 className="mt-6 text-3xl font-bold text-slate-900">Page not found</h1>
        <p className="mt-3 text-slate-600">The page you are looking for does not exist or has moved.</p>
        <Link
          to="/"
          className="mt-8 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-violet-600 px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-blue-600/20"
        >
          <ArrowLeft size={16} aria-hidden="true" />
          Back to home
        </Link>
      </div>
    </PageContainer>
  );
}
