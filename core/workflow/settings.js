// core/workflow/settings.js
/**
 * Workflow 工具全局设置默认值与规范化。默认关闭：能力较重，渐进放量；旧用户读时兜底为 off。
 */
export const WORKFLOW_DEFAULT_SETTINGS = Object.freeze({ enabled: false });

/**
 * @param {{ enabled?: any }} [input]
 * @returns {{ enabled: boolean }}
 */
export function normalizeWorkflowSettings(input = {}) {
  return { enabled: input?.enabled === true };
}
