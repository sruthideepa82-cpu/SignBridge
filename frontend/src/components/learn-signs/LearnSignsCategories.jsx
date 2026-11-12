import { Hash, MessageSquareText, Target, Type } from 'lucide-react';
import { SIGN_CATEGORIES } from '../../data/signLibrary.js';

const ICONS = {
  alphabet: Type,
  numbers: Hash,
  words: MessageSquareText,
  practice: Target,
};

export default function LearnSignsCategories({ selected, counts, onSelect }) {
  return (
    <div role="group" aria-label="Learning categories" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {SIGN_CATEGORIES.map((category) => {
        const Icon = ICONS[category.id];
        const isSelected = category.id === selected;
        return (
          <button
            key={category.id}
            type="button"
            aria-pressed={isSelected}
            onClick={() => onSelect(category.id)}
            className={`flex flex-col gap-3 rounded-xl border p-4 text-left transition-colors focus-visible:outline-2 focus-visible:outline-accent ${
              isSelected ? 'border-accent/60 bg-accent/10' : 'border-app-border bg-app-surface/60 hover:bg-app-raised'
            }`}
          >
            <span className="flex items-center justify-between gap-3">
              <span
                className={`flex h-9 w-9 items-center justify-center rounded-lg ${
                  isSelected ? 'bg-accent/20 text-accent-hover' : 'border border-app-border text-app-muted'
                }`}
              >
                <Icon size={17} strokeWidth={1.8} aria-hidden="true" />
              </span>
              <span className="text-xs tabular-nums text-app-muted">{counts[category.id]}</span>
            </span>
            <span className="text-sm font-semibold text-app-text">{category.label}</span>
            <span className="text-xs leading-relaxed text-app-muted">{category.description}</span>
          </button>
        );
      })}
    </div>
  );
}
