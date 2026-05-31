import { describe, expect, it } from "vitest";
import {
  classifySessionPermission,
  normalizeSessionPermissionMode,
} from "../core/session-permission-mode.js";

describe("session permission modes", () => {
  it("normalizes missing and legacy fields", () => {
    expect(normalizeSessionPermissionMode({})).toBe("ask");
    expect(normalizeSessionPermissionMode({ accessMode: "operate" })).toBe("operate");
    expect(normalizeSessionPermissionMode({ accessMode: "read_only" })).toBe("read_only");
    expect(normalizeSessionPermissionMode({ planMode: true })).toBe("read_only");
  });

  it("classifies information and side-effect tools by mode", () => {
    expect(classifySessionPermission({ mode: "read_only", toolName: "web_search" })).toEqual({ action: "allow" });
    expect(classifySessionPermission({ mode: "read_only", toolName: "write" })).toMatchObject({
      action: "deny",
      code: "ACTION_BLOCKED_BY_READ_ONLY",
    });
    expect(classifySessionPermission({ mode: "ask", toolName: "write" })).toMatchObject({
      action: "prompt",
      kind: "tool_action_approval",
    });
    expect(classifySessionPermission({ mode: "operate", toolName: "write" })).toEqual({ action: "allow" });
  });

  it("treats browser information gathering separately from page actions", () => {
    expect(classifySessionPermission({ mode: "read_only", toolName: "browser", params: { action: "screenshot" } })).toEqual({ action: "allow" });
    expect(classifySessionPermission({ mode: "read_only", toolName: "browser", params: { action: "click" } })).toMatchObject({
      action: "deny",
    });
    expect(classifySessionPermission({ mode: "ask", toolName: "browser", params: { action: "type" } })).toMatchObject({
      action: "prompt",
    });
  });

  it("allows terminal inspection but protects terminal mutation", () => {
    expect(classifySessionPermission({ mode: "read_only", toolName: "terminal", params: { action: "list" } })).toEqual({ action: "allow" });
    expect(classifySessionPermission({ mode: "read_only", toolName: "terminal", params: { action: "read" } })).toEqual({ action: "allow" });
    expect(classifySessionPermission({ mode: "read_only", toolName: "terminal", params: { action: "start" } })).toMatchObject({
      action: "deny",
      code: "ACTION_BLOCKED_BY_READ_ONLY",
    });
    expect(classifySessionPermission({ mode: "ask", toolName: "terminal", params: { action: "write" } })).toMatchObject({
      action: "prompt",
      kind: "tool_action_approval",
    });
    expect(classifySessionPermission({ mode: "operate", toolName: "terminal", params: { action: "close" } })).toEqual({ action: "allow" });
  });

  it("blocks subagent tool inside a subagent (anti-recursion), independent of mode", () => {
    // subagent 上下文：subagent 工具被拦，无论什么 mode（防自递归，拦截层而非剥离）
    expect(classifySessionPermission({ mode: "operate", toolName: "subagent", context: { isSubagent: true } }))
      .toMatchObject({ action: "deny", code: "ACTION_BLOCKED_IN_SUBAGENT" });
    expect(classifySessionPermission({ mode: "read_only", toolName: "subagent", context: { isSubagent: true } }))
      .toMatchObject({ action: "deny", code: "ACTION_BLOCKED_IN_SUBAGENT" });
    // 非 subagent 上下文：subagent 工具按常规（operate 放行）
    expect(classifySessionPermission({ mode: "operate", toolName: "subagent" })).toEqual({ action: "allow" });
    // subagent 上下文里其它工具不受这条影响：read 放行、write 仍按 mode
    expect(classifySessionPermission({ mode: "operate", toolName: "read", context: { isSubagent: true } })).toEqual({ action: "allow" });
    expect(classifySessionPermission({ mode: "operate", toolName: "write", context: { isSubagent: true } })).toEqual({ action: "allow" });
    expect(classifySessionPermission({ mode: "read_only", toolName: "write", context: { isSubagent: true } }))
      .toMatchObject({ action: "deny", code: "ACTION_BLOCKED_BY_READ_ONLY" });
  });
});
