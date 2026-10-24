import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ErrorBoundary } from "@/components/error-boundary";
import { mediaService, formatFolder, validateTemplate } from "@/lib/media";
import type { ActivityLog, MediaDestination, MediaEntry, MediaPlan, MediaSource, OrganiseSettings, RunSummary } from "@/lib/media-types";
import { defaultSettings } from "@/lib/media-types";
import { derivedStatus, download, fmtBytes, loadHistory, loadSettings, logsToText, saveHistory, saveSettings } from "@/lib/mo-utils";
import { Modal, Segmented, Step, Switch } from "@/components/mo/bits";
import { HistoryView } from "@/components/mo/history";
import { HelpView } from "@/components/mo/help";
import { AlertTriangle, Archive, FileDown, FilePlus2, FolderInput, FolderOpen, FolderTree, Play, Plus, ScanSearch, Search, Sparkles, Square, UploadCloud, X } from "lucide-react";

type View = "organise" | "history" | "help";
type Stage = "idle" | "scanning" | "running";
const PRESETS = ["YYYY/MM", "YYYY/MM/DD", "YYYY/MMMM"];
const FILTERS = ["all", "ready", "missing-date", "excluded", "conflict", "error", "done"] as const;
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e || "Something went wrong"));
const nowLog = (level: ActivityLog["level"], message: string): ActivityLog => ({ time: new Date().toISOString(), level, message });

function Shell() {
  const [view, setView] = useState<View>(() => new URLSearchParams(window.location.search).get("view") === "help" ? "help" : "organise");
  const [history, setHistory] = useState<RunSummary[]>(loadHistory);
  const addRun = (s: RunSummary) => setHistory((h) => { const n = [s, ...h]; saveHistory(n); return n; });
  const clear = () => { setHistory([]); saveHistory([]); };
  const desktop = mediaService.desktop;
  return (
    <div className="mx-auto min-h-[100dvh] max-w-5xl px-4 pb-16 md:px-8">
      <header className="flex flex-wrap items-center gap-4 py-6">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary text-primary-foreground"><FolderTree size={20} /></span>
          <div className="leading-tight"><p className="font-display text-xl">Media Organiser</p><p className="text-xs text-muted-foreground">Sort first. Trust the archive.</p></div>
        </div>
        <nav className="ml-auto flex gap-1 rounded-xl bg-muted p-1" aria-label="Sections">
          {(["organise", "history", "help"] as View[]).map((v) => (
            <button key={v} onClick={() => setView(v)} data-testid={`nav-${v}`}
              className={`rounded-lg px-4 py-1.5 text-sm font-medium capitalize transition-all ${view === v ? "bg-card text-primary shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
              {v}{v === "history" && history.length > 0 && <span className="ml-1.5 text-xs opacity-60">{history.length}</span>}
            </button>
          ))}
        </nav>
        <span className={`tone ${desktop ? "tone-ready" : "tone-skipped"}`} data-testid="badge-mode" title={desktop ? "Native folders, files never leave this computer" : "Copy only; a ZIP is downloaded"}>
          {desktop ? "Desktop \u00b7 Local only" : "Browser preview"}
        </span>
      </header>
      <main>
        <div hidden={view !== "organise"}><Organise addRun={addRun} /></div>
        {view === "history" && <HistoryView history={history} onClear={clear} />}
        {view === "help" && <HelpView />}
      </main>
    </div>
  );
}

function Organise({ addRun }: { addRun: (s: RunSummary) => void }) {
  const desktop = mediaService.desktop;
  const [settings, setSettings] = useState<OrganiseSettings>(loadSettings);
  const [sources, setSources] = useState<MediaSource[]>([]);
  const [dest, setDest] = useState<MediaDestination | null>(null);
  const [plan, setPlan] = useState<MediaPlan | null>(null);
  const [overrides, setOverrides] = useState<Record<string, MediaEntry>>({});
  const [stage, setStage] = useState<Stage>("idle");
  const [prog, setProg] = useState<{ current: number; total: number; name: string } | null>(null);
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [summary, setSummary] = useState<RunSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("all");
  const [limit, setLimit] = useState(200);
  const [excl, setExcl] = useState("");
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => saveSettings(settings), [settings]);
  useEffect(() => { logRef.current?.scrollTo({ top: 1e9 }); }, [logs]);

  const invalidate = useCallback(() => { setPlan(null); setOverrides({}); setSummary(null); setNotice((n) => (n ? "Settings or folders changed, so the previous plan was discarded. Scan again to review." : n)); }, []);
  const patch = (p: Partial<OrganiseSettings>) => { setSettings((s) => ({ ...s, ...p })); if (plan || summary) { invalidate(); setNotice("Settings changed, so the previous plan was discarded. Scan again to review."); } };
  const busy = stage !== "idle";
  const op = desktop ? settings.operation : "copy";
  const tplError = validateTemplate(settings.folderTemplate);
  const zipMode = !desktop && !dest;

  const addSources = (list: MediaSource[]) => {
    if (!list.length) return;
    setSources((cur) => { const m = new Map(cur.map((s) => [s.id, s])); list.forEach((s) => m.set(s.id, s)); return [...m.values()]; });
    if (plan || summary) { invalidate(); setNotice("Sources changed, so the previous plan was discarded. Scan again to review."); }
    setError(null);
  };
  const pick = async (kind: "folder" | "files") => {
    try { addSources(await mediaService.pickSources(kind)); } catch (e) { setError(errMsg(e)); }
  };
  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault(); setDragging(false);
    if (busy) return;
    try { const l = await mediaService.addDropped(e.dataTransfer); if (!l.length) setError("Nothing usable was found in what you dropped."); addSources(l); } catch (er) { setError(errMsg(er)); }
  };
  const removeSource = (id: string) => { setSources((c) => c.filter((s) => s.id !== id)); if (plan || summary) { invalidate(); setNotice("Sources changed, so the previous plan was discarded. Scan again to review."); } };
  const pickDest = async () => {
    try {
      const d = await mediaService.pickDestination();
      if (d) { setDest(d); setError(null); if (plan || summary) { invalidate(); setNotice("Destination changed, so the previous plan was discarded. Scan again to review."); } }
    } catch (e) { setError(errMsg(e)); }
  };
  const clearDest = () => { setDest(null); if (plan || summary) { invalidate(); setNotice("Destination changed, so the previous plan was discarded. Scan again to review."); } };
  const addExcl = () => {
    const v = excl.trim(); if (!v || settings.exclusions.includes(v)) { setExcl(""); return; }
    patch({ exclusions: [...settings.exclusions, v] }); setExcl("");
  };

  const cantScan = busy || !sources.length || !!tplError || (!settings.photos && !settings.videos) || (desktop && !dest);
  const scanHint = !sources.length ? "Add something to scan" : desktop && !dest ? "Choose a destination folder first" : tplError ? "Fix the folder template" : !settings.photos && !settings.videos ? "Select photos or videos" : "";

  const scan = async () => {
    setError(null); setNotice(null); setSummary(null); setPlan(null); setOverrides({}); setLogs([]); setLimit(200); setFilter("all"); setQ("");
    setStage("scanning"); setProg({ current: 0, total: 0, name: "" });
    try {
      const p = await mediaService.scan(sources, { ...settings, operation: op }, dest, (ev) => {
        setProg({ current: ev.current, total: ev.total, name: ev.name });
        if (ev.log) setLogs((l) => [...l.slice(-299), ev.log!]);
      });
      setPlan(p);
    } catch (e) { setError(`Scan failed: ${errMsg(e)}`); } finally { setStage("idle"); setProg(null); }
  };
  const demo = () => {
    setError(null); setSummary(null); setOverrides({}); setLogs([]);
    const d = (y: number, m: number, dd: number) => new Date(y, m, dd, 12);
    const mk = (i: number, name: string, kind: "photo" | "video", date: Date | null, source: string, status: MediaEntry["status"], reason?: string): MediaEntry => {
      let target: string | undefined;
      if (date && status !== "excluded") { try { target = `${formatFolder(settings.folderTemplate, date, kind)}/${name}`; } catch { target = undefined; } }
      return { id: `demo-${i}`, name, relativePath: `Camera/${name}`, size: 2_400_000 + i * 913_000, kind, date: date?.toISOString(), dateSource: date ? source : undefined, targetRelative: target, status, reason };
    };
    setPlan({ id: "demo", demo: true, createdAt: new Date().toISOString(), settings: { ...settings, operation: op }, destination: dest ?? undefined, entries: [
      mk(1, "IMG_2041.jpg", "photo", d(2019, 6, 14), "EXIF DateTimeOriginal", "ready"),
      mk(2, "IMG_2042.jpg", "photo", d(2019, 6, 14), "EXIF DateTimeOriginal", "conflict", "A file with this name already exists in the target"),
      mk(3, "VID_0310.mp4", "video", d(2021, 2, 9), "QuickTime CreationDate", "ready"),
      mk(4, "scan_receipt.png", "photo", null, "", "skipped", "No date stored in the file"),
      mk(5, "IMG_1999.trashed.jpg", "photo", d(2020, 10, 1), "EXIF DateTimeOriginal", "excluded", "Matches exclusion \".trashed\""),
      mk(6, "IMG_5120.heic", "photo", d(2023, 11, 3), "EXIF DateTimeOriginal", "ready"),
      mk(7, "corrupt.mov", "video", null, "", "error", "Could not read metadata"),
    ] });
    setNotice("This is a demo plan with sample files. It cannot be run.");
  };

  const needsConfirm = op === "move" || settings.conflict === "overwrite";
  const doRun = async () => {
    if (!plan || plan.demo) return;
    setConfirm(false); setError(null); setSummary(null); setOverrides({}); setLogs([]); setStage("running"); setProg({ current: 0, total: 0, name: "" });
    try {
      const s = await mediaService.run(plan, (ev) => {
        setProg({ current: ev.current, total: ev.total, name: ev.name });
        if (ev.entry) setOverrides((o) => ({ ...o, [ev.entry!.id]: ev.entry! }));
        if (ev.log) setLogs((l) => [...l.slice(-499), ev.log!]);
      });
      setSummary(s);
      setOverrides(Object.fromEntries(s.entries.map((e) => [e.id, e])));
      setLogs(s.logs);
      addRun(s);
    } catch (e) {
      const m = errMsg(e); setError(`Run failed: ${m}`); setLogs((l) => [...l, nowLog("error", m)]);
    } finally { setStage("idle"); setProg(null); }
  };

  const entries = useMemo(() => (plan ? plan.entries.map((e) => overrides[e.id] ?? e) : []), [plan, overrides]);
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: entries.length, ready: 0, "missing-date": 0, excluded: 0, conflict: 0, error: 0, done: 0 };
    entries.forEach((e) => { const s = derivedStatus(e); if (s === "copied" || s === "moved" || s === "skipped") c.done++; else c[s] = (c[s] || 0) + 1; });
    return c;
  }, [entries]);
  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return entries.filter((e) => {
      const s = derivedStatus(e);
      if (filter !== "all" && (filter === "done" ? !["copied", "moved", "skipped"].includes(s) : s !== filter)) return false;
      return !t || `${e.name} ${e.relativePath} ${e.targetRelative ?? ""}`.toLowerCase().includes(t);
    });
  }, [entries, q, filter]);

  const samples = useMemo(() => {
    const out: string[] = [];
    if (tplError) return out;
    try {
      out.push(formatFolder(settings.folderTemplate, new Date(2019, 6, 14), "photo"));
      out.push(formatFolder(settings.folderTemplate, new Date(2021, 2, 9), "video"));
      out.push(formatFolder(settings.folderTemplate, new Date(2023, 11, 3), "photo"));
    } catch { /* invalid */ }
    return [...new Set(out)];
  }, [settings.folderTemplate, tplError]);

  const readyCount = counts.ready;
  const pct = prog && prog.total ? Math.round((prog.current / prog.total) * 100) : 0;
  const runLabel = zipMode ? "Download organised ZIP" : op === "move" ? `Move ${readyCount} files` : `Copy ${readyCount} files`;
  const destText = dest ? dest.path || dest.label : zipMode ? "Download as ZIP" : "Not chosen";

  return (
    <div className="space-y-5">
      {!desktop && (
        <p className="rise rounded-xl bg-[hsl(var(--accent)/.16)] px-4 py-3 text-sm" data-testid="text-browser-note">
          You are in the browser preview: files are copied only, and your originals are never changed. The desktop app has native folder access and supports Move.
        </p>
      )}
      {error && (
        <div role="alert" className="pop flex items-start gap-3 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm" data-testid="text-error">
          <AlertTriangle size={18} className="mt-0.5 shrink-0 text-destructive" /><p className="flex-1">{error}</p>
          <button onClick={() => setError(null)} aria-label="Dismiss"><X size={16} /></button>
        </div>
      )}

      <Step n={1} title="Where are your photos?" note={desktop ? "Folders or files, full paths" : "Dropped files and folders"}>
        <div onDragOver={(e) => { e.preventDefault(); if (!busy) setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={onDrop}
          className={`rounded-2xl border-2 border-dashed border-input p-6 text-center transition-all duration-200 ${dragging ? "dropping" : ""}`} data-testid="dropzone">
          <UploadCloud className={`mx-auto text-primary transition-transform ${dragging ? "-translate-y-1 scale-125" : ""}`} size={30} />
          <p className="font-display mt-2 text-lg">{dragging ? "Let go to add" : "Drop files or whole folders here"}</p>
          <p className="text-sm text-muted-foreground">or choose them yourself</p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <button className="btn btn-primary" disabled={busy} onClick={() => pick("folder")} data-testid="button-pick-folder"><FolderInput size={16} />Choose folder</button>
            <button className="btn btn-ghost" disabled={busy} onClick={() => pick("files")} data-testid="button-pick-files"><FilePlus2 size={16} />Choose files</button>
          </div>
        </div>
        {sources.length > 0 && (
          <ul className="mt-4 flex flex-wrap gap-2" data-testid="list-sources">
            {sources.map((s) => (
              <li key={s.id} className="pop flex max-w-full items-center gap-2 rounded-full bg-secondary py-1 pl-3 pr-1.5 text-sm" title={s.path || s.label}>
                <span className="truncate font-mono text-xs">{s.path || s.label}</span>
                <button disabled={busy} onClick={() => removeSource(s.id)} aria-label={`Remove ${s.label}`} className="grid h-5 w-5 place-items-center rounded-full hover:bg-foreground/10"><X size={12} /></button>
              </li>
            ))}
            <li><button className="text-xs text-muted-foreground underline" disabled={busy} onClick={() => { setSources([]); invalidate(); }}>Clear all</button></li>
          </ul>
        )}
      </Step>

      <Step n={2} title="Where should the archive go?" note={desktop ? "Required before scanning" : "Optional in the browser"}>
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1 rounded-xl bg-muted/70 px-4 py-2.5">
            <p className="text-xs text-muted-foreground">Destination</p>
            <p className={`truncate font-mono text-sm ${dest || zipMode ? "" : "text-muted-foreground"}`} data-testid="text-destination">{destText}</p>
          </div>
          <button className="btn btn-primary" disabled={busy} onClick={pickDest} data-testid="button-pick-destination"><FolderOpen size={16} />{dest ? "Change" : "Choose folder"}</button>
          {dest && !desktop && <button className="btn btn-ghost" disabled={busy} onClick={clearDest}>Use ZIP</button>}
        </div>
        {zipMode && <p className="mt-2 text-xs text-muted-foreground">{mediaService.canWriteFolders ? "Pick a folder to write directly, or leave it and download a ZIP." : "This browser cannot write to folders, so the result is downloaded as a ZIP that keeps your structure."}</p>}
      </Step>

      <Step n={3} title="How should it be sorted?">
        <fieldset disabled={busy} className="min-w-0">
        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-4">
            <div>
              <p className="mb-1.5 text-sm font-medium">Folder structure</p>
              <div className="mb-2 flex flex-wrap gap-2">
                {PRESETS.map((p) => (
                  <button key={p} onClick={() => patch({ folderTemplate: p })} data-testid={`preset-${p}`}
                    className={`rounded-full border px-3 py-1 font-mono text-xs transition-all ${settings.folderTemplate === p ? "border-primary bg-primary text-primary-foreground" : "hover:border-primary"}`}>{p}</button>
                ))}
              </div>
              <input className="field font-mono" value={settings.folderTemplate} onChange={(e) => patch({ folderTemplate: e.target.value })} aria-label="Custom folder template" data-testid="input-template" spellCheck={false} />
              <p className={`mt-1 text-xs ${tplError ? "text-destructive" : "text-muted-foreground"}`}>{tplError || "Tokens: YYYY MM MMMM DD {type}"}</p>
            </div>
            <div>
              <p className="mb-1.5 text-sm font-medium">Action</p>
              <Segmented id="op" value={op} onChange={(v) => patch({ operation: v })} options={[{ v: "copy", label: "Copy" }, { v: "move", label: "Move", disabled: !desktop }]} />
              <p className="mt-1 text-xs text-muted-foreground">{desktop ? (op === "move" ? "Originals are removed after they are placed." : "Originals stay where they are.") : "Move is unavailable in a browser, which cannot remove your originals. Use the desktop app."}</p>
            </div>
            <div>
              <p className="mb-1.5 text-sm font-medium">If a file already exists</p>
              <Segmented id="conflict" value={settings.conflict} onChange={(v) => patch({ conflict: v })} options={[{ v: "rename", label: "Rename" }, { v: "skip", label: "Skip" }, { v: "overwrite", label: "Overwrite" }]} />
              {settings.conflict === "overwrite" && <p className="pop mt-2 flex gap-2 rounded-lg bg-destructive/10 p-2.5 text-xs text-destructive" data-testid="warn-overwrite"><AlertTriangle size={14} className="mt-0.5 shrink-0" />Existing files with the same name will be replaced permanently.</p>}
            </div>
          </div>
          <div className="space-y-3">
            <p className="text-sm font-medium">Include</p>
            <Switch id="photos" on={settings.photos} onChange={(v) => patch({ photos: v })} label="Photos" />
            <Switch id="videos" on={settings.videos} onChange={(v) => patch({ videos: v })} label="Videos" />
            <Switch id="recursive" on={settings.recursive} onChange={(v) => patch({ recursive: v })} label="Look inside subfolders" />
            <Switch id="hidden" on={settings.includeHidden} onChange={(v) => patch({ includeHidden: v })} label="Include hidden files" />
            <div className="pt-1">
              <p className="mb-1.5 text-sm font-medium">Skip anything matching</p>
              <div className="flex flex-wrap gap-1.5">
                {settings.exclusions.map((x) => (
                  <span key={x} className="pop flex items-center gap-1 rounded-full bg-secondary py-0.5 pl-2.5 pr-1 font-mono text-xs">{x}
                    <button aria-label={`Remove ${x}`} onClick={() => patch({ exclusions: settings.exclusions.filter((y) => y !== x) })}><X size={12} /></button></span>
                ))}
              </div>
              <div className="mt-2 flex gap-2">
                <input className="field" placeholder="substring or *.wildcard" value={excl} onChange={(e) => setExcl(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addExcl()} data-testid="input-exclusion" />
                <button className="btn btn-ghost" onClick={addExcl} aria-label="Add exclusion" data-testid="button-add-exclusion"><Plus size={16} /></button>
              </div>
              <button className="mt-2 text-xs text-muted-foreground underline" onClick={() => patch({ ...defaultSettings, operation: op })}>Reset to defaults</button>
            </div>
          </div>
        </div>
        <div className="mt-5 rounded-xl bg-primary/[0.06] p-4" data-testid="preview-structure">
          <p className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground"><FolderTree size={14} />Preview</p>
          {samples.length ? (
            <div className="font-mono text-sm"><p>{destText}/</p>
              {samples.map((s) => <p key={s} className="pl-4 text-primary">{"\u2514\u2500 "}{s}/<span className="text-muted-foreground">IMG_0001.jpg</span></p>)}</div>
          ) : <p className="text-sm text-muted-foreground">Fix the template to see a preview.</p>}
          <p className="mt-2 text-xs text-muted-foreground">Dates come only from the media itself. Files without one are flagged, never guessed.</p>
        </div>
        </fieldset>
      </Step>

      <Step n={4} title="Scan, review, then run">
        <div className="flex flex-wrap items-center gap-3">
          <button className="btn btn-primary" disabled={cantScan} onClick={scan} data-testid="button-scan"><ScanSearch size={16} />{plan ? "Scan again" : "Scan and review"}</button>
          <button className="btn btn-ghost" disabled={busy} onClick={demo} data-testid="button-demo"><Sparkles size={16} />Try an example</button>
          {stage !== "idle" && <button className="btn btn-danger" onClick={() => mediaService.cancel()} data-testid="button-cancel"><Square size={14} />Cancel</button>}
          {scanHint && !busy && <span className="text-xs text-muted-foreground">{scanHint}</span>}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">Scanning only reads. Nothing is written until you run the reviewed plan.</p>

        {notice && <p className="pop mt-3 rounded-lg bg-secondary px-3 py-2 text-sm" data-testid="text-notice">{notice}</p>}

        {busy && prog && (
          <div className="mt-5 rise" data-testid="progress">
            <div className="mb-1 flex justify-between text-sm"><span>{stage === "scanning" ? "Scanning" : "Processing"} <span className="font-mono text-xs text-muted-foreground">{prog.name}</span></span><span className="font-mono">{prog.total ? `${prog.current}/${prog.total}` : prog.current}</span></div>
            <div className="h-3 overflow-hidden rounded-full bg-muted"><div className="stripe h-full origin-left rounded-full bg-primary transition-[width] duration-300" style={{ width: prog.total ? `${Math.max(pct, 3)}%` : "30%" }} /></div>
          </div>
        )}

        {(logs.length > 0 || summary) && (
          <div className="mt-4">
            <div className="mb-1 flex items-center justify-between"><p className="text-sm font-medium">Activity</p>
              {logs.length > 0 && <button className="flex items-center gap-1 text-xs underline" onClick={() => download(`media-organiser-log-${Date.now()}.txt`, logsToText(logs))} data-testid="button-export-logs"><FileDown size={13} />Export log (.txt)</button>}</div>
            <div ref={logRef} className="max-h-48 overflow-auto rounded-xl bg-[hsl(190_40%_12%)] p-3 font-mono text-xs leading-relaxed text-[hsl(90_30%_88%)]" data-testid="log-panel">
              {logs.map((l, i) => <p key={i} className={l.level === "error" ? "text-[hsl(8_80%_72%)]" : l.level === "warning" ? "text-[hsl(38_90%_66%)]" : l.level === "success" ? "text-[hsl(150_55%_65%)]" : ""}><span className="opacity-50">{l.time.slice(11, 19)}</span> {l.message}</p>)}
            </div>
          </div>
        )}

        {summary && (
          <div className="pop mt-5 rounded-2xl bg-primary p-5 text-primary-foreground" data-testid="summary">
            <p className="font-display text-2xl">{summary.cancelled ? "Stopped part-way" : summary.errors ? "Finished with some errors" : "All done"}</p>
            <p className="mt-1 text-sm opacity-85">{summary.delivery === "zip" ? "Your organised ZIP was prepared as a download." : `Written to ${summary.destination}`}</p>
            <div className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              {[["Processed", summary.processed], ["Skipped", summary.skipped], ["Excluded", summary.excluded], ["Errors", summary.errors]].map(([k, v]) => <div key={k as string} className="rounded-xl bg-white/10 px-3 py-2"><p className="font-mono text-xl">{v}</p><p className="text-xs opacity-80">{k}</p></div>)}
            </div>
          </div>
        )}

        {plan && (
          <div className="mt-6 rise" data-testid="review">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <h3 className="font-display text-lg">Review plan</h3>
              {plan.demo && <span className="tone tone-skipped">Demo - sample data</span>}
            </div>
            <div className="flex flex-wrap gap-2">
              {FILTERS.map((f) => (
                <button key={f} onClick={() => { setFilter(f); setLimit(200); }} data-testid={`filter-${f}`}
                  className={`rounded-full border px-3 py-1 text-xs font-medium capitalize transition-all ${filter === f ? "border-primary bg-primary text-primary-foreground" : "hover:border-primary"}`}>{f.replace("-", " ")} <span className="font-mono opacity-70">{counts[f] || 0}</span></button>
              ))}
            </div>
            <div className="relative mt-3"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input className="field pl-9" placeholder="Filter by filename or path" value={q} onChange={(e) => { setQ(e.target.value); setLimit(200); }} data-testid="input-search" /></div>
            <div className="mt-3 max-h-[28rem] overflow-auto rounded-xl border">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 bg-card text-xs text-muted-foreground"><tr><th className="p-2.5">File</th><th className="p-2.5">Date</th><th className="hidden p-2.5 md:table-cell">Goes to</th><th className="p-2.5">Status</th></tr></thead>
                <tbody>
                  {shown.slice(0, limit).map((e) => { const s = derivedStatus(e); return (
                    <tr key={e.id} className="border-t align-top hover:bg-muted/50" data-testid={`row-entry-${e.id}`}>
                      <td className="max-w-[14rem] p-2.5"><p className="truncate font-medium" title={e.relativePath}>{e.name}</p><p className="truncate text-xs text-muted-foreground">{fmtBytes(e.size)} / {e.kind}</p></td>
                      <td className="p-2.5 text-xs">{e.date ? new Date(e.date).toLocaleDateString(undefined, { dateStyle: "medium" }) : <span className="text-[hsl(var(--warn))]">none</span>}<p className="text-muted-foreground">{e.dateSource}</p></td>
                      <td className="hidden max-w-[18rem] p-2.5 font-mono text-xs md:table-cell"><p className="truncate" title={e.targetRelative}>{e.targetRelative || "-"}</p></td>
                      <td className="p-2.5"><span className={`tone tone-${s}`}>{s.replace("-", " ")}</span>{e.reason && <p className="mt-1 max-w-[12rem] text-xs text-muted-foreground">{e.reason}</p>}</td>
                    </tr>); })}
                  {shown.length === 0 && <tr><td colSpan={4} className="p-8 text-center text-muted-foreground">{entries.length ? "No files match this filter." : "The scan found no media files."}</td></tr>}
                </tbody>
              </table>
            </div>
            {shown.length > limit && <button className="btn btn-ghost mt-2" onClick={() => setLimit(limit + 300)}>Show more ({shown.length - limit} left)</button>}

            <div className="mt-5 flex flex-wrap items-center gap-3 rounded-xl bg-muted/70 p-4">
              <div className="flex-1 text-sm"><b>{readyCount}</b> will be {op === "move" ? "moved" : "copied"}{counts["missing-date"] ? `, ${counts["missing-date"]} need a date` : ""}{counts.excluded ? `, ${counts.excluded} excluded` : ""}.</div>
              <button className={`btn ${op === "move" || settings.conflict === "overwrite" ? "btn-danger" : "btn-warm"}`} disabled={busy || !!plan.demo || readyCount === 0 || !!summary}
                onClick={() => (needsConfirm ? setConfirm(true) : doRun())} data-testid="button-run">
                {zipMode ? <Archive size={16} /> : <Play size={16} />}{runLabel}</button>
            </div>
            {plan.demo && <p className="mt-2 text-xs text-muted-foreground">Examples cannot be run. Add your own sources and scan for a real plan.</p>}
          </div>
        )}
      </Step>

      {confirm && (
        <Modal title={op === "move" ? "Move files and remove originals?" : "Overwrite existing files?"} onClose={() => setConfirm(false)} actions={<>
          <button className="btn btn-ghost" onClick={() => setConfirm(false)}>Go back</button>
          <button className="btn btn-danger" onClick={doRun} data-testid="button-confirm-run">{op === "move" ? "Yes, move them" : "Yes, overwrite"}</button></>}>
          {op === "move" && <p>Each original is <b>removed from its current folder</b> once it is placed in {destText}. Make sure you have a backup you trust.</p>}
          {settings.conflict === "overwrite" && <p>Where a file with the same name exists in the destination, it will be <b>replaced permanently</b>.</p>}
          <p className="text-muted-foreground">Only the {readyCount} files in the plan you reviewed will be processed.</p>
        </Modal>
      )}
    </div>
  );
}

function App() {
  return <ErrorBoundary><Shell /></ErrorBoundary>;
}
export default App;
