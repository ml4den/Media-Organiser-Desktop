import { useState } from "react";
import { ChevronDown, Download, History as H, Trash2 } from "lucide-react";
import type { RunSummary } from "@/lib/media-types";
import { download, fmtWhen, logsToText } from "@/lib/mo-utils";
import { Modal } from "./bits";

export function HistoryView({ history, onClear }: { history: RunSummary[]; onClear: () => void }) {
  const [open, setOpen] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  return (
    <div className="space-y-4 rise">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="font-display text-3xl">History</h1>
          <p className="text-sm text-muted-foreground">Real runs only, saved in this app's local storage on this device.</p>
        </div>
        {history.length > 0 && <button className="btn btn-ghost" onClick={() => setConfirm(true)} data-testid="button-clear-history"><Trash2 size={16} />Clear history</button>}
      </div>
      {history.length === 0 && (
        <div className="card grid place-items-center gap-2 p-14 text-center" data-testid="empty-history">
          <H className="text-primary" size={30} />
          <p className="font-display text-xl">Nothing here yet</p>
          <p className="max-w-sm text-sm text-muted-foreground">When you finish a run, its summary and activity log are kept here so you can check what happened later.</p>
        </div>
      )}
      {history.map((r) => {
        const isOpen = open === r.id;
        return (
          <div key={r.id} className="card overflow-hidden" data-testid={`history-${r.id}`}>
            <button className="flex w-full items-center gap-4 p-4 text-left" onClick={() => setOpen(isOpen ? null : r.id)} aria-expanded={isOpen}>
              <div className="min-w-0 flex-1">
                <p className="font-medium">{fmtWhen(r.startedAt)} <span className="ml-2 tone tone-conflict">{r.delivery === "zip" ? "ZIP" : r.operation}</span>{r.cancelled && <span className="ml-2 tone tone-skipped">cancelled</span>}</p>
                <p className="truncate font-mono text-xs text-muted-foreground">{r.destination}</p>
              </div>
              <p className="hidden text-sm sm:block"><b>{r.processed}</b> done / {r.skipped} skipped / {r.excluded} excluded / <span className={r.errors ? "text-destructive font-semibold" : ""}>{r.errors} errors</span></p>
              <ChevronDown size={18} className={`transition-transform ${isOpen ? "rotate-180" : ""}`} />
            </button>
            {isOpen && (
              <div className="border-t p-4 space-y-3 rise">
                <div className="flex flex-wrap gap-2 text-xs sm:hidden"><span>{r.processed} done</span><span>{r.skipped} skipped</span><span>{r.errors} errors</span></div>
                <p className="text-xs text-muted-foreground">Finished {fmtWhen(r.finishedAt)} / {r.total} files in plan</p>
                <div className="max-h-64 overflow-auto rounded-xl bg-muted/60 p-3 font-mono text-xs space-y-1">
                  {r.logs.length === 0 && <p>No log lines recorded.</p>}
                  {r.logs.map((l, i) => <p key={i} className={l.level === "error" ? "text-destructive" : l.level === "warning" ? "text-[hsl(var(--warn))]" : ""}>{l.time.slice(11, 19) || l.time} {l.message}</p>)}
                </div>
                <button className="btn btn-ghost" onClick={() => download(`media-organiser-log-${r.id}.txt`, logsToText(r.logs))}><Download size={15} />Export log (.txt)</button>
              </div>
            )}
          </div>
        );
      })}
      {confirm && (
        <Modal title="Clear all history?" onClose={() => setConfirm(false)} actions={<>
          <button className="btn btn-ghost" onClick={() => setConfirm(false)}>Keep it</button>
          <button className="btn btn-danger" data-testid="button-confirm-clear" onClick={() => { onClear(); setConfirm(false); }}>Clear history</button></>}>
          <p>This removes the saved summaries and logs from this app. Your photos and folders are not touched.</p>
        </Modal>
      )}
    </div>
  );
}
