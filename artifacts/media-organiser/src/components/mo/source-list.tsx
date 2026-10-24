import { useState } from "react";
import { X } from "lucide-react";
import type { MediaSource } from "@/lib/media-types";

const PAGE_SIZE = 50;

export function SourceList({ sources, busy, onRemove, onClear }: {
  sources: MediaSource[];
  busy: boolean;
  onRemove: (id: string) => void;
  onClear: () => void;
}) {
  const [page, setPage] = useState(0);
  const lastPage = Math.max(0, Math.ceil(sources.length / PAGE_SIZE) - 1);
  const currentPage = Math.min(page, lastPage);
  const start = currentPage * PAGE_SIZE;

  return (
    <div className="mt-4">
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="text-sm font-medium" aria-live="polite">{sources.length.toLocaleString()} selected files or folders</p>
        <button className="text-xs text-muted-foreground underline" disabled={busy} onClick={onClear}>Clear all</button>
      </div>
      <ul className="max-h-56 overflow-y-auto rounded-xl border bg-secondary/30" aria-label="Selected sources" data-testid="list-sources">
        {sources.slice(start, start + PAGE_SIZE).map((source) => (
          <li key={source.id} className="flex min-w-0 items-center gap-3 border-b px-3 py-2 last:border-b-0">
            <div className="min-w-0 flex-1" title={source.path || source.label}>
              <p className="truncate text-sm font-medium">{source.label}</p>
              {source.path && <p className="truncate font-mono text-xs text-muted-foreground">{source.path}</p>}
            </div>
            <button disabled={busy} onClick={() => onRemove(source.id)} aria-label={`Remove ${source.path || source.label}`}
              className="grid h-8 w-8 shrink-0 place-items-center rounded-lg hover:bg-foreground/10"><X size={14} /></button>
          </li>
        ))}
      </ul>
      {sources.length > PAGE_SIZE && (
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs">
          <p>Showing {start + 1}–{Math.min(start + PAGE_SIZE, sources.length)} of {sources.length.toLocaleString()}</p>
          <div className="flex gap-3">
            <button className="underline disabled:opacity-40" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>Previous sources</button>
            <button className="underline disabled:opacity-40" disabled={currentPage === lastPage} onClick={() => setPage(currentPage + 1)}>Next sources</button>
          </div>
        </div>
      )}
    </div>
  );
}
