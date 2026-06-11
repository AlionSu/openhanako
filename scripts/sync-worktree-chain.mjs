#!/usr/bin/env node
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export class SyncWorktreeChainError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "SyncWorktreeChainError";
    this.details = details;
  }
}

export function defaultConfig(rootDir = REPO_ROOT) {
  const root = path.resolve(rootDir);
  return {
    rootDir: root,
    interactiveDir: path.join(root, ".claude", "worktrees", "interactive-card"),
    workbenchDir: path.join(root, ".claude", "worktrees", "canvas-workbench"),
    mainBranch: "main",
    interactiveBranch: "worktree-interactive-card",
    workbenchBranch: "worktree-canvas-workbench",
    fetch: false,
    dryRun: false,
  };
}

function requireValue(argv, index, optionName) {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) {
    throw new SyncWorktreeChainError(`${optionName} requires a value`);
  }
  return value;
}

export function parseArgs(argv = process.argv.slice(2)) {
  const config = defaultConfig();
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") return { ...config, help: true };
    if (arg === "--fetch") {
      config.fetch = true;
      continue;
    }
    if (arg === "--dry-run") {
      config.dryRun = true;
      continue;
    }
    if (arg === "--root") {
      config.rootDir = path.resolve(requireValue(argv, i, arg));
      i += 1;
      continue;
    }
    if (arg === "--interactive") {
      config.interactiveDir = path.resolve(requireValue(argv, i, arg));
      i += 1;
      continue;
    }
    if (arg === "--workbench") {
      config.workbenchDir = path.resolve(requireValue(argv, i, arg));
      i += 1;
      continue;
    }
    if (arg === "--main-branch") {
      config.mainBranch = requireValue(argv, i, arg);
      i += 1;
      continue;
    }
    if (arg === "--interactive-branch") {
      config.interactiveBranch = requireValue(argv, i, arg);
      i += 1;
      continue;
    }
    if (arg === "--workbench-branch") {
      config.workbenchBranch = requireValue(argv, i, arg);
      i += 1;
      continue;
    }
    throw new SyncWorktreeChainError(`Unknown option: ${arg}`);
  }
  return config;
}

export function helpText() {
  return [
    "sync-worktree-chain: sync local worktree branches in one direction",
    "",
    "Order:",
    "  main -> worktree-interactive-card -> worktree-canvas-workbench",
    "",
    "Usage:",
    "  npm run sync:worktrees",
    "  node scripts/sync-worktree-chain.mjs [--fetch] [--dry-run]",
    "",
    "Options:",
    "  --fetch                  Run git fetch origin main --prune before checks",
    "  --dry-run                Print planned merges without changing branches",
    "  --root <path>            Repository root checkout path",
    "  --interactive <path>     interactive-card worktree path",
    "  --workbench <path>       canvas-workbench worktree path",
    "  --main-branch <name>     Source branch, default main",
    "  --interactive-branch <name>",
    "  --workbench-branch <name>",
    "",
    "Remote safety:",
    "  This script never pushes branches or tags.",
  ].join("\n");
}

export function createGitRunner() {
  return ({ cwd, args }) => {
    const result = spawnSync("git", args, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return {
      status: result.status ?? 1,
      stdout: result.stdout || "",
      stderr: result.stderr || "",
      error: result.error,
    };
  };
}

function gitText(args) {
  return `git ${args.join(" ")}`;
}

function runGit(git, cwd, args, { allowFailure = false } = {}) {
  const result = git({ cwd, args });
  if (result.error) {
    throw new SyncWorktreeChainError(`${gitText(args)} failed to start: ${result.error.message}`, {
      cwd,
      args,
      result,
    });
  }
  if (!allowFailure && result.status !== 0) {
    const detail = (result.stderr || result.stdout || "").trim();
    throw new SyncWorktreeChainError(`${gitText(args)} failed in ${cwd}${detail ? `\n${detail}` : ""}`, {
      cwd,
      args,
      result,
    });
  }
  return result;
}

function assertClean(git, cwd, label) {
  const status = runGit(git, cwd, ["status", "--porcelain"]);
  if (status.stdout.trim()) {
    throw new SyncWorktreeChainError(`${label} worktree is not clean:\n${status.stdout.trim()}`, {
      cwd,
      label,
      status: status.stdout,
    });
  }
}

function assertBranch(git, cwd, label, expectedBranch) {
  const result = runGit(git, cwd, ["rev-parse", "--abbrev-ref", "HEAD"]);
  const actual = result.stdout.trim();
  if (actual !== expectedBranch) {
    throw new SyncWorktreeChainError(`${label} is on ${actual || "(unknown)"}, expected ${expectedBranch}`, {
      cwd,
      label,
      actual,
      expected: expectedBranch,
    });
  }
}

function assertCleanAndOnBranches(config, git) {
  const entries = [
    { cwd: config.rootDir, label: "main", branch: config.mainBranch },
    { cwd: config.interactiveDir, label: "interactive-card", branch: config.interactiveBranch },
    { cwd: config.workbenchDir, label: "canvas-workbench", branch: config.workbenchBranch },
  ];
  for (const entry of entries) {
    assertClean(git, entry.cwd, entry.label);
    assertBranch(git, entry.cwd, entry.label, entry.branch);
  }
}

function mergeOrStop(config, git, cwd, target, label) {
  const args = ["merge", target, "--no-edit"];
  const result = runGit(git, cwd, args, { allowFailure: true });
  if (result.status !== 0) {
    const detail = (result.stderr || result.stdout || "").trim();
    throw new SyncWorktreeChainError(`${label} merge failed. Resolve conflicts in ${cwd}, then rerun after it is clean.${detail ? `\n${detail}` : ""}`, {
      cwd,
      args,
      result,
    });
  }
  return result;
}

function checkAncestor(git, config, ancestor, descendant, message) {
  const result = runGit(
    git,
    config.rootDir,
    ["merge-base", "--is-ancestor", ancestor, descendant],
    { allowFailure: true },
  );
  if (result.status !== 0) {
    throw new SyncWorktreeChainError(message, {
      ancestor,
      descendant,
      result,
    });
  }
}

export function syncWorktreeChain(config = defaultConfig(), { git = createGitRunner(), logger = console } = {}) {
  const commands = [
    { cwd: config.interactiveDir, args: ["merge", config.mainBranch, "--no-edit"] },
    { cwd: config.workbenchDir, args: ["merge", config.interactiveBranch, "--no-edit"] },
  ];

  if (config.fetch) {
    logger.log(`[sync-worktree-chain] fetching origin/${config.mainBranch}`);
    runGit(git, config.rootDir, ["fetch", "origin", config.mainBranch, "--prune"]);
  }

  assertCleanAndOnBranches(config, git);

  if (config.dryRun) {
    logger.log("[sync-worktree-chain] dry run, planned commands:");
    for (const command of commands) {
      logger.log(`  (${command.cwd}) ${gitText(command.args)}`);
    }
    return {
      dryRun: true,
      commands,
      topology: null,
    };
  }

  logger.log(`[sync-worktree-chain] ${config.mainBranch} -> ${config.interactiveBranch}`);
  mergeOrStop(config, git, config.interactiveDir, config.mainBranch, "interactive-card");

  logger.log(`[sync-worktree-chain] ${config.interactiveBranch} -> ${config.workbenchBranch}`);
  mergeOrStop(config, git, config.workbenchDir, config.interactiveBranch, "canvas-workbench");

  checkAncestor(
    git,
    config,
    config.mainBranch,
    config.interactiveBranch,
    `${config.mainBranch} is not an ancestor of ${config.interactiveBranch} after sync`,
  );
  checkAncestor(
    git,
    config,
    config.interactiveBranch,
    config.workbenchBranch,
    `${config.interactiveBranch} is not an ancestor of ${config.workbenchBranch} after sync`,
  );

  assertCleanAndOnBranches(config, git);

  logger.log("[sync-worktree-chain] complete");
  return {
    dryRun: false,
    commands,
    topology: {
      mainToInteractive: true,
      interactiveToWorkbench: true,
    },
  };
}

export function runCli(argv = process.argv.slice(2), io = {}) {
  const stdout = io.stdout || process.stdout;
  const stderr = io.stderr || process.stderr;
  try {
    const config = parseArgs(argv);
    if (config.help) {
      stdout.write(`${helpText()}\n`);
      return 0;
    }
    syncWorktreeChain(config, { logger: console });
    return 0;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    stderr.write(`[sync-worktree-chain] ${message}\n`);
    return 1;
  }
}

const isDirectRun = process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  process.exitCode = runCli();
}
