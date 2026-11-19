import { EmptyState, Panel } from '../app/ui.jsx';
import useStudioData from './useStudioData.js';

// A table of Studio rows with honest loading, error and empty states. It never shows placeholder rows.
export default function StudioListPanel({ title, description, loader, columns, emptyIcon, emptyTitle, emptyText }) {
  const list = useStudioData(loader, [loader]);
  return (
    <Panel title={title} description={description} className="min-w-0">
      {list.loading && <p className="text-sm text-app-muted" role="status">Loading…</p>}
      {list.error && (
        <p className="text-sm text-danger" role="alert">
          Could not load this data: {list.error}
        </p>
      )}
      {!list.loading && !list.error && list.data && list.data.length === 0 && (
        <EmptyState icon={emptyIcon} title={emptyTitle}>
          {emptyText}
        </EmptyState>
      )}
      {!list.loading && !list.error && list.data && list.data.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[32rem] text-left text-sm">
            <thead className="text-xs uppercase tracking-wider text-app-muted">
              <tr>
                {columns.map((column) => (
                  <th key={column.key} scope="col" className="py-2 pr-4 font-medium">{column.label}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-app-border">
              {list.data.map((row, index) => (
                <tr key={row[columns[0].key] ?? index}>
                  {columns.map((column) => (
                    <td key={column.key} className="py-2.5 pr-4 align-top text-app-text">
                      {column.render ? column.render(row) : (row[column.key] ?? '—')}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}
