import { describe, expect, it, vi } from "vitest";

import { syncWorktreeChain, SyncWorktreeChainError } from "../scripts/sync-worktree-chain.mjs";

const config = {
  rootDir: "/repo",
  interactiveDir: "/repo/.claude/worktrees/interactive-card",
  workbenchDir: "/repo/.claude/worktrees/canvas-workbench",
  mainBranch: "main",
  interactiveBranch: "worktree-interactive-card",
  workbenchBranch: "worktree-canvas-workbench",
  fetch: false,
  dryRun: false,
};

function makeGit(overrides = {}) {
  const calls: Array<{ cwd: string; args: string[] }> = [];
  const git = vi.fn(({ cwd, args }) => {
    calls.push({ cwd, args });
    const key = `${cwd}::${args.join(" ")}`;
    const value = overrides[key];
    if (value) return value;
    if (args.join(" ") === "status --porcelain") return { status: 0, stdout: "" };
    if (args.join(" ") === "rev-parse --abbrev-ref HEAD") {
      if (cwd === config.rootDir) return { status: 0, stdout: "main\n" };
      if (cwd === config.interactiveDir) return { status: 0, stdout: "worktree-interactive-card\n" };
      if (cwd === config.workbenchDir) return { status: 0, stdout: "worktree-canvas-workbench\n" };
    }
    if (args[0] === "merge-base") return { status: 0, stdout: "" };
    if (args[0] === "merge") return { status: 0, stdout: "merged\n" };
    return { status: 0, stdout: "" };
  });
  return { git, calls };
}

describe("syncWorktreeChain", () => {
  it("refuses to merge when any worktree is dirty", () => {
    const { git, calls } = makeGit({
      "/repo/.claude/worktrees/interactive-card::status --porcelain": {
        status: 0,
        stdout: " M package.json\n",
      },
    });

    expect(() => syncWorktreeChain(config, { git })).toThrow(SyncWorktreeChainError);
    expect(calls.some((call) => call.args[0] === "merge")).toBe(false);
  });

  it("merges main into interactive before merging interactive into workbench", () => {
    const { git, calls } = makeGit();

    const result = syncWorktreeChain(config, { git });

    const mergeCalls = calls.filter((call) => call.args[0] === "merge");
    expect(mergeCalls).toEqual([
      {
        cwd: config.interactiveDir,
        args: ["merge", config.mainBranch, "--no-edit"],
      },
      {
        cwd: config.workbenchDir,
        args: ["merge", config.interactiveBranch, "--no-edit"],
      },
    ]);
    expect(result.topology).toEqual({
      mainToInteractive: true,
      interactiveToWorkbench: true,
    });
  });

  it("stops after an interactive merge conflict and leaves workbench untouched", () => {
    const { git, calls } = makeGit({
      "/repo/.claude/worktrees/interactive-card::merge main --no-edit": {
        status: 1,
        stdout: "",
        stderr: "CONFLICT (content): Merge conflict in package.json\n",
      },
    });

    expect(() => syncWorktreeChain(config, { git })).toThrow(/interactive-card merge failed/);
    expect(calls.some((call) => call.cwd === config.workbenchDir && call.args[0] === "merge")).toBe(false);
  });

  it("fails if the final ancestry chain is not main < interactive < workbench", () => {
    const { git } = makeGit({
      "/repo::merge-base --is-ancestor main worktree-interactive-card": {
        status: 1,
        stdout: "",
        stderr: "",
      },
    });

    expect(() => syncWorktreeChain(config, { git })).toThrow(/main is not an ancestor/);
  });
});
