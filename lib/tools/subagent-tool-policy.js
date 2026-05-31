/**
 * subagent-tool-policy.js —— subagent 工具访问策略的唯一决策点（收口）
 *
 * 「subagent 能拿哪些工具、按什么权限档跑」只在这里决定。未来要改方向
 * （甲 拦截 ↔ 乙 剥离）或做性能 A/B，只动这一处（build-to-delete）。
 *
 * 甲 intercept（Codex 式，默认）：给全集工具，限制全在拦截层（classify by mode + subagent 上下文）。
 *   工具对模型始终可见、运行时切只读↔操作不动清单 → 一个 agent 的所有 subagent 共享同一缓存前缀。
 * 乙 strip（Claude Code 式）：按角色剥离工具清单（白名单）。模型只看见可用工具，但每角色一份前缀。
 *
 * 性能 A/B：env HANA_SUBAGENT_TOOL_STRATEGY = "intercept"（默认）| "strip"。
 */
import { SESSION_PERMISSION_MODES } from "../../core/session-permission-mode.js";

// 乙策略用的精选集（= 收口前 subagent 的现状）。仅 strip 策略下生效。
const STRIP_CUSTOM_TOOLS = ["web_search", "web_fetch", "todo_write", "browser"];
const STRIP_BUILTIN_TOOLS = ["read", "write", "edit", "bash", "grep", "find", "ls"];
const STRIP_BUILTIN_READONLY = ["read", "grep", "find", "ls"];

/** 当前策略：env 覆盖，默认甲（intercept）。便于性能 A/B。 */
export function resolveSubagentToolStrategy() {
  return process.env.HANA_SUBAGENT_TOOL_STRATEGY === "strip" ? "strip" : "intercept";
}

/**
 * 解析一次 subagent 派单的工具访问策略。
 * @param {{ role?: "explore"|"execute", strategy?: "intercept"|"strip" }} [opts]
 * @returns {{
 *   strategy: "intercept"|"strip",
 *   customToolFilter: string[]|null,   // null = 不剥离自定义工具（给全集）
 *   builtinToolFilter: string[]|null,  // null = 不剥离内置工具（给全集）
 *   permissionMode: string,            // explore→READ_ONLY，execute→OPERATE
 *   subagentContext: boolean,          // 拦截层据此做固定边界（防自递归等）
 * }}
 */
export function resolveSubagentToolAccess({ role = "execute", strategy } = {}) {
  const strat = strategy || resolveSubagentToolStrategy();
  const permissionMode = role === "explore"
    ? SESSION_PERMISSION_MODES.READ_ONLY
    : SESSION_PERMISSION_MODES.OPERATE;

  if (strat === "strip") {
    // 乙：剥离工具清单（只读角色再砍到 builtin 只读子集）。
    return {
      strategy: "strip",
      customToolFilter: STRIP_CUSTOM_TOOLS,
      builtinToolFilter: role === "explore" ? STRIP_BUILTIN_READONLY : STRIP_BUILTIN_TOOLS,
      permissionMode,
      subagentContext: true,
    };
  }

  // 甲（默认）：全集 + 拦截。filter=null → executeIsolated 不剥离，限制全交拦截层。
  return {
    strategy: "intercept",
    customToolFilter: null,
    builtinToolFilter: null,
    permissionMode,
    subagentContext: true,
  };
}
