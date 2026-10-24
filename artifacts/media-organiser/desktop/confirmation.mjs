// Uses the engine-owned plan, never renderer-supplied operation details.
export async function confirmRun(dialog, window, plan) {
  const move = plan.settings.operation === "move";
  const overwrite = plan.settings.conflict === "overwrite";
  if (!move && !overwrite) return;
  const ready = plan.entries.filter((entry) => entry.public.status === "ready").length;
  const result = await dialog.showMessageBox(window, {
    type: "warning",
    title: "Confirm file changes",
    message: `${move ? "Move" : "Copy"} ${ready} files from the reviewed plan?`,
    detail: [
      move ? "MOVE: Originals will be deleted only after each copy is SHA-256 verified." : "COPY: Original source files will be kept.",
      overwrite ? "OVERWRITE: Existing destination files with matching names will be permanently replaced. This cannot be undone." : plan.settings.conflict === "skip" ? "SKIP: Files with matching names at the destination will be skipped." : "RENAME: Existing destination files will be kept. New copies with matching names will be renamed.",
      `Destination: ${plan.destination.path}`,
      "Only ready files in this reviewed plan will be processed. Keep an independent backup; there is no undo.",
    ].join("\n\n"),
    buttons: ["Cancel", "Organise files"], defaultId: 0, cancelId: 0, noLink: true,
  });
  if (result.response !== 1) throw new Error("Operation cancelled. No files were changed.");
}
