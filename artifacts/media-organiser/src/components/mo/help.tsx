import { mediaService } from "@/lib/media";

const Block = ({ t, children }: { t: string; children: React.ReactNode }) => (
  <section className="card p-5"><h2 className="font-display text-xl mb-2">{t}</h2><div className="space-y-2 text-sm leading-relaxed text-foreground/85">{children}</div></section>
);
export function HelpView() {
  return (
    <div className="space-y-4 rise">
      <h1 className="font-display text-3xl">Help</h1>
      <p className="text-sm text-muted-foreground">You are using the {mediaService.desktop ? "desktop app." : "browser preview."}</p>
      <div className="grid gap-4 md:grid-cols-2">
        <Block t="Desktop vs. browser">
          <p><b>Desktop</b> has native folder access: it reads real paths, writes straight into your destination folder, and can move files.</p>
          <p><b>Browser preview</b> can only copy. Browsers do not let a page delete your originals, so Move is disabled. Without a writable destination folder, the run produces a downloadable ZIP that keeps your folder structure.</p>
        </Block>
        <Block t="Your files stay yours">
          <p>Nothing is uploaded. Scanning and processing happen on this machine, and there is no account or network call.</p>
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
        <Block t="Build and run the desktop app">
          {!mediaService.desktop && <p><a href={`${import.meta.env.BASE_URL}Media-Organiser-Desktop.zip`} download className="btn btn-primary inline-flex">Download desktop project (.zip)</a></p>}
          <p>The desktop project runs locally on Windows, macOS and Linux. It includes the built interface and application source, not a pre-signed installer.</p>
          <p>Unzip it, install Node.js 22 or newer, then open a terminal in that folder and run <code className="font-mono">npm install</code> followed by <code className="font-mono">npm start</code>. On Linux and macOS, Perl must be available for ExifTool.</p>
          <p>To create an installer for your current platform, run <code className="font-mono">npm run package</code>. Windows produces a setup executable, macOS a DMG, and Linux an AppImage and DEB. These builds are unsigned.</p>
          <p>In the original repository: <code className="font-mono">pnpm --filter @workspace/media-organiser desktop:start</code> or <code className="font-mono">pnpm --filter @workspace/media-organiser desktop:package</code>.</p>
        </Block>
        <Block t="Safe copying and larger archives">
          <p>The desktop app verifies copies using SHA-256 before removing a source in Move mode. Keep a separate backup; Move and Overwrite cannot be undone here.</p>
          <p>The browser ZIP export is limited to 512 MB per batch. Desktop processing streams files and is intended for larger archives. Cancellation finishes the current file safely before stopping.</p>
          <p>Capture dates keep the calendar date stored in metadata. Browser video support covers MP4/MOV container timestamps; the desktop app uses ExifTool for broader format support. Hidden means dot-prefixed names; Windows hidden attributes are not read.</p>
        </Block>
      </div>
    </div>
  );
}
