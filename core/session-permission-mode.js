export const SESSION_PERMISSION_MODES = Object.freeze({
  OPERATE: "operate",
  ASK: "ask",
  READ_ONLY: "read_only",
});

export const DEFAULT_SESSION_PERMISSION_MODE = SESSION_PERMISSION_MODES.ASK;

const INFORMATION_TOOLS = new Set([
  "read",
  "grep",
  "find",
  "ls",
  "web_search",
  "web_fetch",
  "current_status",
  "search_memory",
  "recall_experience",
]);

const SIDE_EFFECT_TOOLS = new Set([
  "bash",
  "write",
  "edit",
  "computer",
  "cron",
  "dm",
  "channel",
  "install_skill",
  "update_settings",
  "todo_write",
  // Legacy compatibility tools stay classified as side effects so restored
  // sessions keep the same permission boundary until the v0.133 cleanup window.
  "create_artifact",
  "stage_files",
  "present_files",
  "subagent",
  "notify",
  "record_experience",
  "pin_memory",
  "unpin_memory",
]);

// subagent 上下文固定边界（与 permission mode 无关）：防自递归。收口在拦截层而非剥离——
// subagent 工具对模型仍可见，调用时被拦（Codex 式甲）。未来要加更多 subagent 禁用工具加到这里。
const SUBAGENT_BLOCKED_TOOLS = new Set([
  "subagent",
]);

const BROWSER_READ_ACTIONS = new Set([
  "start",
  "navigate",
  "snapshot",
  "screenshot",
  "scroll",
  "wait",
  "show",
  "stop",
]);

const TERMINAL_READ_ACTIONS = new Set([
  "read",
  "list",
]);

export function normalizeSessionPermissionMode(raw) {
  if (typeof raw === "string") return normalizeSessionPermissionMode({ permissionMode: raw });
  if (raw?.permissionMode === SESSION_PERMISSION_MODES.OPERATE) return SESSION_PERMISSION_MODES.OPERATE;
  if (raw?.permissionMode === SESSION_PERMISSION_MODES.ASK) return SESSION_PERMISSION_MODES.ASK;
  if (raw?.permissionMode === SESSION_PERMISSION_MODES.READ_ONLY) return SESSION_PERMISSION_MODES.READ_ONLY;
  if (raw?.accessMode === "operate") return SESSION_PERMISSION_MODES.OPERATE;
  if (raw?.accessMode === "read_only") return SESSION_PERMISSION_MODES.READ_ONLY;
  if (raw?.planMode === true) return SESSION_PERMISSION_MODES.READ_ONLY;
  return DEFAULT_SESSION_PERMISSION_MODE;
}

export function legacyAccessModeFromPermissionMode(mode) {
  return normalizeSessionPermissionMode(mode) === SESSION_PERMISSION_MODES.READ_ONLY ? "read_only" : "operate";
}

export function isReadOnlyPermissionMode(mode) {
  return normalizeSessionPermissionMode(mode) === SESSION_PERMISSION_MODES.READ_ONLY;
}

function blocked(toolName, { code = "ACTION_BLOCKED_BY_READ_ONLY", message } = {}) {
  return {
    action: "deny",
    code,
    message: message || `${toolName} is blocked in read-only mode.`,
    details: { toolName },
  };
}

function prompt(toolName) {
  return {
    action: "prompt",
    kind: "tool_action_approval",
    details: { toolName },
  };
}

function classifyBrowserAction(mode, action) {
  if (BROWSER_READ_ACTIONS.has(action)) return { action: "allow" };
  if (mode === SESSION_PERMISSION_MODES.READ_ONLY) return blocked("browser");
  if (mode === SESSION_PERMISSION_MODES.ASK) return prompt("browser");
  return { action: "allow" };
}

function classifyTerminalAction(mode, action) {
  if (TERMINAL_READ_ACTIONS.has(action)) return { action: "allow" };
  if (mode === SESSION_PERMISSION_MODES.READ_ONLY) return blocked("terminal");
  if (mode === SESSION_PERMISSION_MODES.ASK) return prompt("terminal");
  return { action: "allow" };
}

export function classifySessionPermission({ mode, toolName, params, context } = {}) {
  const normalized = normalizeSessionPermissionMode(mode);
  const name = typeof toolName === "string" ? toolName : "";
  if (!name) return { action: "allow" };
  // subagent 上下文固定边界（与 mode 无关，优先于其它判定）：防自递归。
  if (context?.isSubagent && SUBAGENT_BLOCKED_TOOLS.has(name)) {
    return blocked(name, { code: "ACTION_BLOCKED_IN_SUBAGENT", message: `${name} is not available inside a subagent.` });
  }
  if (INFORMATION_TOOLS.has(name)) return { action: "allow" };
  if (name === "browser") return classifyBrowserAction(normalized, params?.action);
  if (name === "terminal") return classifyTerminalAction(normalized, params?.action);
  if (normalized === SESSION_PERMISSION_MODES.OPERATE) return { action: "allow" };
  if (normalized === SESSION_PERMISSION_MODES.READ_ONLY) return blocked(name);
  if (SIDE_EFFECT_TOOLS.has(name)) return prompt(name);
  return prompt(name);
}
