import test from "node:test";
import assert from "node:assert/strict";
import { confirmRun } from "./confirmation.mjs";

for (const operation of ["copy", "move"]) {
  for (const conflict of ["rename", "skip", "overwrite"]) {
    test(`${operation}/${conflict}: one complete native confirmation only when needed`, async () => {
      const plan = {
        settings: { operation, conflict },
        destination: { path: "/tmp/disposable archive/é" },
        entries: ["ready", "ready", "skipped", "conflict", "excluded", "error"].map((status) => ({ public: { status } })),
      };
      const prompts = [];
      const dialog = { showMessageBox: async (_window, options) => { prompts.push(options); return { response: 1 }; } };
      await confirmRun(dialog, null, plan);
      const destructive = operation === "move" || conflict === "overwrite";
      assert.equal(prompts.length, destructive ? 1 : 0);
      if (!destructive) return;
      const prompt = prompts[0];
      assert.match(prompt.message, /2 files/);
      assert.ok(prompt.detail.includes(plan.destination.path));
      assert.match(prompt.detail, /backup/);
      assert.match(prompt.detail, /no undo/);
      assert.match(prompt.detail, operation === "move" ? /SHA-256 verified/ : /Original source files will be kept/);
      assert.match(prompt.detail, conflict === "overwrite" ? /permanently replaced/ : conflict === "skip" ? /will be skipped/ : /will be renamed/);
      assert.equal(prompt.defaultId, 0);
      assert.equal(prompt.cancelId, 0);
      for (const response of [0, -1]) {
        await assert.rejects(confirmRun({ showMessageBox: async () => ({ response }) }, null, plan), /Operation cancelled/);
      }
    });
  }
}
