import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";

export function Modal({ title, children, onClose, actions }: { title: string; children: ReactNode; onClose: () => void; actions: ReactNode }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4 bg-[hsl(190_40%_10%/.45)] backdrop-blur-sm" onClick={onClose} role="dialog" aria-modal="true">
      <div className="card pop w-full max-w-md p-6" onClick={(e) => e.stopPropagation()} data-testid="modal">
        <div className="flex items-start justify-between gap-4">
          <h3 className="font-display text-xl">{title}</h3>
          <button onClick={onClose} aria-label="Close" className="opacity-60 hover:opacity-100"><X size={18} /></button>
        </div>
        <div className="mt-3 text-sm leading-relaxed space-y-3">{children}</div>
        <div className="mt-6 flex justify-end gap-2">{actions}</div>
      </div>
    </div>
  );
}

export function Switch({ on, onChange, label, hint, disabled, id }: { on: boolean; onChange: (v: boolean) => void; label: string; hint?: string; disabled?: boolean; id: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} disabled={disabled} onClick={() => onChange(!on)} data-testid={`switch-${id}`}
      className="flex w-full items-center gap-3 text-left disabled:opacity-50">
      <span className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${on ? "bg-primary" : "bg-input"}`}>
        <span className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-card shadow transition-transform duration-200 ${on ? "translate-x-5" : ""}`} />
      </span>
      <span><span className="block text-sm font-medium">{label}</span>{hint && <span className="block text-xs text-muted-foreground">{hint}</span>}</span>
    </button>
  );
}

export function Segmented<T extends string>({ value, options, onChange, id }: { value: T; options: { v: T; label: string; disabled?: boolean }[]; onChange: (v: T) => void; id: string }) {
  return (
    <div className="inline-flex rounded-xl bg-muted p-1 gap-1" role="radiogroup">
      {options.map((o) => (
        <button key={o.v} type="button" role="radio" aria-checked={value === o.v} disabled={o.disabled} onClick={() => onChange(o.v)} data-testid={`${id}-${o.v}`}
          className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-all disabled:opacity-40 ${value === o.v ? "bg-card shadow-sm text-primary" : "text-muted-foreground hover:text-foreground"}`}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Step({ n, title, note, children }: { n: number; title: string; note?: string; children: ReactNode }) {
  return (
    <section className="card rise p-5 md:p-6" style={{ animationDelay: `${n * 60}ms` }}>
      <header className="mb-4 flex items-baseline gap-3">
        <span className="font-display grid h-8 w-8 place-items-center rounded-full bg-accent text-accent-foreground text-sm font-semibold">{n}</span>
        <h2 className="font-display text-xl">{title}</h2>
        {note && <span className="ml-auto text-xs text-muted-foreground hidden sm:block">{note}</span>}
      </header>
      {children}
    </section>
  );
}
