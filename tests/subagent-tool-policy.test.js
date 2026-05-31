import { describe, expect, it, afterEach } from "vitest";
import { resolveSubagentToolAccess, resolveSubagentToolStrategy } from "../lib/tools/subagent-tool-policy.js";

describe("subagent 工具访问策略收口", () => {
  afterEach(() => { delete process.env.HANA_SUBAGENT_TOOL_STRATEGY; });

  it("默认 intercept（甲）：不剥离工具（filter=null）+ 角色档位", () => {
    const exec = resolveSubagentToolAccess({ role: "execute" });
    expect(exec).toMatchObject({
      strategy: "intercept",
      customToolFilter: null,
      builtinToolFilter: null,
      permissionMode: "operate",
      subagentContext: true,
    });
    const expl = resolveSubagentToolAccess({ role: "explore" });
    expect(expl).toMatchObject({
      strategy: "intercept",
      customToolFilter: null,
      builtinToolFilter: null,
      permissionMode: "read_only",
    });
  });

  it("strip（乙）：按角色剥离工具清单 + 角色档位", () => {
    const exec = resolveSubagentToolAccess({ role: "execute", strategy: "strip" });
    expect(exec.strategy).toBe("strip");
    expect(exec.builtinToolFilter).toEqual(["read", "write", "edit", "bash", "grep", "find", "ls"]);
    expect(exec.customToolFilter).toEqual(["web_search", "web_fetch", "todo_write", "browser"]);
    expect(exec.permissionMode).toBe("operate");

    const expl = resolveSubagentToolAccess({ role: "explore", strategy: "strip" });
    expect(expl.builtinToolFilter).toEqual(["read", "grep", "find", "ls"]); // 只读 subset
    expect(expl.permissionMode).toBe("read_only");
  });

  it("env HANA_SUBAGENT_TOOL_STRATEGY=strip 切到乙（性能 A/B 开关）", () => {
    process.env.HANA_SUBAGENT_TOOL_STRATEGY = "strip";
    expect(resolveSubagentToolStrategy()).toBe("strip");
    expect(resolveSubagentToolAccess({ role: "execute" }).strategy).toBe("strip");
  });

  it("默认 role=execute（OPERATE）", () => {
    expect(resolveSubagentToolAccess().permissionMode).toBe("operate");
    expect(resolveSubagentToolStrategy()).toBe("intercept");
  });
});
