// tests/workflow-settings.test.js
import { describe, expect, it } from "vitest";
import { WORKFLOW_DEFAULT_SETTINGS, normalizeWorkflowSettings } from "../core/workflow/settings.js";

describe("workflow settings", () => {
  it("默认关闭", () => {
    expect(WORKFLOW_DEFAULT_SETTINGS.enabled).toBe(false);
  });
  it("normalize 强制 enabled 为严格布尔", () => {
    expect(normalizeWorkflowSettings({ enabled: true }).enabled).toBe(true);
    expect(normalizeWorkflowSettings({ enabled: "yes" }).enabled).toBe(false);
    expect(normalizeWorkflowSettings({}).enabled).toBe(false);
    expect(normalizeWorkflowSettings(undefined).enabled).toBe(false);
  });
});
