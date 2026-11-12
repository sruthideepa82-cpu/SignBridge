import { Link } from 'react-router-dom';
import { History, Star } from 'lucide-react';
import { EmptyState, Panel } from '../app/ui.jsx';
import QuizPanel from './QuizPanel.jsx';

function SignList({ items, emptyTitle, emptyText, icon }) {
  if (items.length === 0) {
    return (
      <EmptyState icon={icon} title={emptyTitle}>
        {emptyText}
      </EmptyState>
    );
  }
  return (
    <ul className="divide-y divide-app-border">
      {items.map((item) => (
        <li key={item.sign.id}>
          <Link
            to={`/learn/signs?category=${item.sign.category}&sign=${encodeURIComponent(item.sign.id)}`}
            className="flex items-center justify-between gap-3 rounded-md px-2 py-2.5 text-sm text-app-text transition-colors hover:bg-white/[0.04] focus-visible:outline-2 focus-visible:outline-accent"
          >
            <span className="min-w-0 truncate">{item.sign.title}</span>
            {item.at && (
              <time className="shrink-0 text-xs tabular-nums text-app-muted" dateTime={new Date(item.at).toISOString()}>
                {new Date(item.at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
              </time>
            )}
          </Link>
        </li>
      ))}
    </ul>
  );
}

// `recent` and `favourites` hold resolved signs, so the lists only show signs that still exist.
export default function PracticePanel({ alphabetLabels, quizPool, recent, favourites, onAnswer }) {
  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
      <QuizPanel pool={quizPool} labels={alphabetLabels} onAnswer={onAnswer} />

      <div className="flex min-w-0 flex-col gap-6">
        <Panel title="Recently practised" description="Signs you have watched or answered in the quiz." labelledBy="recent-signs-title">
          <SignList
            items={recent}
            icon={History}
            emptyTitle="Nothing practised yet"
            emptyText="Play an animation or answer a quiz question and it will appear here."
          />
        </Panel>

        <Panel title="Favourites" description="Signs you starred for later." labelledBy="favourite-signs-title">
          <SignList
            items={favourites.map((sign) => ({ sign, at: null }))}
            icon={Star}
            emptyTitle="No favourites yet"
            emptyText="Use Favourite on any letter to keep it here."
          />
        </Panel>
      </div>
    </div>
  );
}
