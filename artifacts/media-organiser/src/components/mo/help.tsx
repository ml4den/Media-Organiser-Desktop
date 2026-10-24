import { mediaService } from "@/lib/media";
import { Downloads } from "./downloads";

const Block = ({ t, children }: { t: string; children: React.ReactNode }) => (
  <section className="card p-5"><h2 className="font-display text-xl mb-2">{t}</h2><div className="space-y-2 text-sm leading-relaxed text-foreground/85">{children}</div></section>
);
export function HelpView() {
  return (
    <div className="space-y-4 rise">
      <h1 className="font-display text-3xl">Help</h1>
      <p className="text-sm text-muted-foreground">You are using the {mediaService.desktop ? "desktop app." : "web app. All media processing stays on your device."}</p>
      <div className="grid gap-4 md:grid-cols-2">
        <Block t="Desktop vs. browser">
          <p><b>Desktop</b> has native folder access: it reads real paths, writes straight into your destination folder, and can move files.</p>
          <p><b>Web app</b> is copy-only and never deletes originals. In compatible desktop Chrome or Edge, open the site directly and grant folder permission to save copies to a destination. Other browsers can use a downloadable ZIP that keeps your folder structure.</p>
          <p>Cancel a folder picker to leave the current selection unchanged. If permission is denied, try an allowed folder or leave the destination empty for ZIP output. Selected files and folder permissions must be chosen again after a reload.</p>
        </Block>
        <Block t="Your files stay yours">
          <p>Your media is never uploaded. Scanning and processing happen on this machine, with no account or processing server. The website and download information are loaded over the network; choosing a desktop download opens GitHub.</p>
          <p>Scanning never writes. Only the reviewed plan is executed, and changing any setting, source or destination discards that plan so you review again.</p>
        </Block>
        <Block t="Date strictness">
          <p>Folders are built only from dates found in the media itself (such as capture time in metadata). Each entry shows which source was used.</p>
          <p>Files with no media date are flagged <b>missing date</b> and are not guessed from file names or modified times.</p>
        </Block>
        <Block t="Folder templates">
          <p>Tokens: <code className="font-mono">YYYY</code> year, <code className="font-mono">MM</code> month number, <code className="font-mono">MMMM</code> month name, <code className="font-mono">DD</code> day, <code className="font-mono">{"{type}"}</code> photo or video.</p>
          <p>Conflicts: <b>Rename</b> keeps both, <b>Skip</b> leaves the existing file, <b>Overwrite</b> replaces existing files permanently.</p>
          <p>Exclusions match a substring in the file or folder path. Wildcards such as <code className="font-mono">*.tmp</code> work too.</p>
        </Block>
        <Block t="Desktop downloads">
          <Downloads />
        </Block>
        <Block t="Safe copying and larger archives">
          <p>The desktop app verifies copies using SHA-256 before removing a source in Move mode. Keep a separate backup; Move and Overwrite cannot be undone here.</p>
          <p>The browser ZIP export is limited to 512 MB per batch. Desktop processing streams files and is intended for larger archives. Cancellation finishes the current file safely before stopping.</p>
          <p>Browser folder writes do not provide desktop-level atomic creation or SHA-256 disk verification. Use a separate destination and keep backups; use desktop for valuable archives or large batches. If cancelled, a ZIP can contain the files already processed; review the summary before using it.</p>
          <p>Capture dates keep the calendar date stored in metadata. Browser video support covers MP4/MOV container timestamps; the desktop app uses ExifTool for broader format support. Hidden means dot-prefixed names; Windows hidden attributes are not read.</p>
        </Block>
      </div>
    </div>
  );
}
