/**
 * automation-tool.js — Agent-created scheduled automations
 *
 * User-facing automations are modeled as Agent runs. Fixed notification and
 * plugin requests are wrapped into a background Agent session prompt so the
 * scheduler exposes one execution model.
 */

import { Type, StringEnum } from "../pi-sdk/index.ts";
import { getToolSessionCwd, getToolSessionPath } from "./tool-session.ts";
import {
  buildNotifyAgentRunPrompt,
  buildPluginActionAgentRunPrompt,
  createAgentSessionAutomationExecutor,
  normalizeNotifyAutomationParams,
} from "../desk/agent-run-automation.ts";
import { applyConfirmedAutomationDraft } from "./automation-draft.ts";

function normalizeSchedule(params, existing: any = null) {
  const type = params.scheduleType || params.type || existing?.type;
  let schedule = params.schedule ?? existing?.schedule;
  if (!type || schedule === undefined || schedule === null || schedule === "") {
    throw new Error("scheduleType and schedule are required");
  }
  if (type === "every" && params.schedule !== undefined) {
    const minutes = parseInt(schedule, 10);
    if (isNaN(minutes) || minutes <= 0) {
      throw new Error("every schedule must be a positive number of minutes");
    }
    schedule = minutes * 60_000;
  }
  return { type, schedule };
}

function contextForTool(ctx, {
  getSessionPath,
  getAgentId,
  getSessionCwd,
  getSessionWorkspaceFolders,
  getHomeCwd,
  targetAgentId,
}: {
  getSessionPath?: any;
  getAgentId?: any;
  getSessionCwd?: any;
  getSessionWorkspaceFolders?: any;
  getHomeCwd?: any;
  targetAgentId?: any;
} = {}) {
  const sessionPath = getToolSessionPath(ctx) || getSessionPath?.() || null;
  const sourceAgentId = getAgentId?.() || null;
  const actorAgentId = typeof targetAgentId === "string" && targetAgentId.trim()
    ? targetAgentId.trim()
    : sourceAgentId;
  const usesDifferentAgent = !!actorAgentId && !!sourceAgentId && actorAgentId !== sourceAgentId;
  const sessionCwd = getToolSessionCwd(ctx)
    || (sessionPath ? getSessionCwd?.(sessionPath) : null)
    || null;
  const agentHomeCwd = actorAgentId ? getHomeCwd?.(actorAgentId) : null;
  const cwd = usesDifferentAgent
    ? (agentHomeCwd || null)
    : (sessionCwd || agentHomeCwd || null);
  const workspaceFolders = sessionPath
    ? (usesDifferentAgent ? [] : (getSessionWorkspaceFolders?.(sessionPath) || []))
    : [];
  return {
    sessionPath,
    actorAgentId,
    executionContext: {
      kind: "session_workspace",
      cwd,
      workspaceFolders,
      sourceSessionPath: sessionPath,
      createdByAgentId: actorAgentId,
    },
  };
}

function targetAgentIdFor(params, fallbackAgentId) {
  return typeof params.agentId === "string" && params.agentId.trim()
    ? params.agentId.trim()
    : fallbackAgentId;
}

function pickArray(value) {
  return Array.isArray(value) ? value : undefined;
}

function pendingConfirmationText(label, confirmId) {
  const base = `Automation pending confirmation: ${label}`;
  if (!confirmId) return base;
  return `${base}\nConfirmation ID: ${confirmId}\nDesktop users can confirm from the card. Remote Bridge users can reply /confirm ${confirmId} or /reject ${confirmId}.`;
}

function notifyAgentRun(params, context) {
  if (!params.title && !params.body) throw new Error("title or body is required");
  const notifyParams = normalizeNotifyAutomationParams({
    title: params.title,
    body: params.body,
    ...(pickArray(params.channels) ? { channels: params.channels } : {}),
    ...(pickArray(params.bridgePlatforms) ? { bridgePlatforms: params.bridgePlatforms } : {}),
    ...(typeof params.contextPolicy === "string" ? { contextPolicy: params.contextPolicy } : {}),
  });
  const prompt = buildNotifyAgentRunPrompt(notifyParams);
  return {
    prompt,
    executor: createAgentSessionAutomationExecutor({
      agentId: context.actorAgentId,
      prompt,
      model: "",
      executionContext: context.executionContext,
      migratedFrom: {
        kind: "direct_action",
        action: "notify",
      },
    }),
    legacyAction: {
      kind: "direct_action",
      action: "notify",
      params: notifyParams,
    },
  };
}

function pluginActionAgentRun(params, context) {
  if (typeof params.pluginId !== "string" || !params.pluginId.trim()) {
    throw new Error("pluginId is required");
  }
  if (typeof params.actionId !== "string" || !params.actionId.trim()) {
    throw new Error("actionId is required");
  }
  const actionParams = params.params && typeof params.params === "object" && !Array.isArray(params.params)
    ? params.params
    : {};
  const pluginId = params.pluginId.trim();
  const actionId = params.actionId.trim();
  const prompt = buildPluginActionAgentRunPrompt({ pluginId, actionId, params: actionParams });
  return {
    prompt,
    executor: createAgentSessionAutomationExecutor({
      agentId: context.actorAgentId,
      prompt,
      model: "",
      executionContext: context.executionContext,
      migratedFrom: {
        kind: "plugin_action",
        pluginId,
        actionId,
      },
    }),
    legacyAction: {
      kind: "plugin_action",
      pluginId,
      actionId,
      params: actionParams,
    },
  };
}

function legacyActionForLabel(action) {
  if (!action) return null;
  if (action.kind === "direct_action" && action.action === "notify") {
    return {
      action: "notify",
      params: action.params || {},
    };
  }
  return action;
}

function labelFor(params, executor, prompt = "", existing: any = null) {
  if (typeof params.label === "string" && params.label.trim()) return params.label;
  if (typeof params.title === "string" && params.title.trim()) return params.title;
  if (executor?.action === "notify") return executor.params.title || executor.params.body.slice(0, 30);
  if (executor?.kind === "plugin_action") return `${executor.pluginId}:${executor.actionId}`;
  if (typeof existing?.label === "string" && existing.label.trim()) return existing.label;
  return typeof prompt === "string" ? prompt.slice(0, 40) : "";
}

function genericAgentRun(params, context, existing: any = null) {
  const prompt = typeof params.prompt === "string" && params.prompt.trim()
    ? params.prompt
    : (typeof existing?.prompt === "string" ? existing.prompt : "");
  if (!prompt) throw new Error("prompt is required");
  const model = params.model ?? existing?.model ?? "";
  return {
    prompt,
    executor: createAgentSessionAutomationExecutor({
      agentId: context.actorAgentId,
      prompt,
      model,
      executionContext: context.executionContext,
    }),
    legacyAction: null,
  };
}

function jobDataFieldsForMutation(jobData) {
  const {
    id: _id,
    createdAt: _createdAt,
    lastRunAt: _lastRunAt,
    nextRunAt: _nextRunAt,
    consecutiveErrors: _consecutiveErrors,
    legacyRef: _legacyRef,
    ...fields
  } = jobData || {};
  return fields;
}

function commitAutomationDraft({ cronStore, operation, jobData, confirmationValue }: {
  cronStore: any;
  operation: "create" | "update";
  jobData: any;
  confirmationValue?: any;
}) {
  const confirmedJobData = applyConfirmedAutomationDraft(jobData, confirmationValue) as any;
  if (operation === "update") {
    if (!confirmedJobData?.id) throw new Error("id is required");
    return cronStore.updateJob(confirmedJobData.id, jobDataFieldsForMutation(confirmedJobData));
  }
  return cronStore.addJob(confirmedJobData);
}

function attachDeferredMutation({ promise, cronStore, operation, jobData }: {
  promise: Promise<any>;
  cronStore: any;
  operation: "create" | "update";
  jobData: any;
}) {
  void promise.then((result) => {
    if (result?.action !== "confirmed") return;
    commitAutomationDraft({ cronStore, operation, jobData, confirmationValue: result.value });
  }).catch(() => {});
}

export function createAutomationTool(cronStore, {
  getAutoApprove,
  autoApprove = false,
  confirmStore,
  getConfirmStore,
  getSessionPath,
  getAgentId,
  getSessionCwd,
  getSessionWorkspaceFolders,
  getHomeCwd,
}: {
  getAutoApprove?: any;
  autoApprove?: boolean;
  confirmStore?: any;
  getConfirmStore?: any;
  emitEvent?: any;
  getSessionPath?: any;
  getAgentId?: any;
  getSessionCwd?: any;
  getSessionWorkspaceFolders?: any;
  getHomeCwd?: any;
} = {}) {
  return {
    name: "automation",
    label: "Automation",
    description: "Create and update scheduled automation drafts. The tool returns a user-confirmable Automation card; the task is written only after the user confirms the card. Automations run as background Agent sessions.",
    parameters: Type.Object({
      action: StringEnum(["list", "create", "update"], {
        description: "Action to perform. create and update produce a confirmation card instead of directly saving.",
      }),
      id: Type.Optional(Type.String({ description: "Automation job id for update." })),
      agentId: Type.Optional(Type.String({ description: "Target Agent id. Defaults to the current Agent." })),
      scheduleType: Type.Optional(StringEnum(["at", "every", "cron"], {
        description: "Trigger type for create/update actions.",
      })),
      schedule: Type.Optional(Type.String({
        description: "Trigger schedule. For every, use minutes. For cron, use a 5-field cron expression.",
      })),
      label: Type.Optional(Type.String({ description: "Short display label." })),
      prompt: Type.Optional(Type.String({ description: "What the target Agent should do when this automation runs." })),
      model: Type.Optional(Type.Any({ description: "Optional execution model for the background Agent run." })),
      title: Type.Optional(Type.String({ description: "Notification title." })),
      body: Type.Optional(Type.String({ description: "Notification body." })),
      channels: Type.Optional(Type.Array(StringEnum(["auto", "desktop", "bridge_owner"]))),
      bridgePlatforms: Type.Optional(Type.Array(StringEnum(["wechat", "feishu", "telegram", "qq"]))),
      contextPolicy: Type.Optional(StringEnum(["none", "record_when_delivered"])),
      pluginId: Type.Optional(Type.String({ description: "Plugin id for plugin actions." })),
      actionId: Type.Optional(Type.String({ description: "Plugin action id. V0 maps this to the plugin tool name." })),
      params: Type.Optional(Type.Any({ description: "Plugin action parameters." })),
    }),
    execute: async (_toolCallId, params, _signal, _onUpdate, ctx) => {
      try {
        if (params.action === "list") {
          const jobs = cronStore.listJobs();
          return { content: [{ type: "text", text: JSON.stringify(jobs, null, 2) }], details: { action: "list", jobs } };
        }

        if (!["create", "update", "add_notify", "add_plugin_action"].includes(params.action)) {
          throw new Error(`unknown automation action: ${params.action}`);
        }

        const operation = params.action === "update" ? "update" : "create";
        const existingJob = operation === "update"
          ? cronStore.getJob?.(params.id)
          : null;
        if (operation === "update" && !params.id) throw new Error("id is required");
        if (operation === "update" && !existingJob) throw new Error(`Automation not found: ${params.id}`);
        const sourceAgentId = getAgentId?.() || null;
        const targetAgentId = targetAgentIdFor(params, existingJob?.actorAgentId || sourceAgentId);
        const context = contextForTool(ctx, {
          getSessionPath,
          getAgentId,
          getSessionCwd,
          getSessionWorkspaceFolders,
          getHomeCwd,
          targetAgentId,
        });
        const { type, schedule } = normalizeSchedule(params, existingJob);
        const run = params.action === "add_notify"
          ? notifyAgentRun(params, context)
          : params.action === "add_plugin_action"
            ? pluginActionAgentRun(params, context)
            : genericAgentRun(params, context, existingJob);
        const legacyAction = legacyActionForLabel(run.legacyAction);
        const jobData = {
          ...(existingJob || {}),
          type,
          schedule,
          prompt: run.prompt,
          label: labelFor(params, legacyAction, run.prompt, existingJob),
          model: params.model ?? existingJob?.model ?? "",
          actorAgentId: context.actorAgentId,
          executionContext: context.executionContext,
          executor: run.executor,
          createdBy: {
            kind: "agent",
            agentId: context.actorAgentId,
            sourceSessionPath: context.sessionPath,
          },
        };

        if (getAutoApprove ? getAutoApprove() : autoApprove) {
          const job = commitAutomationDraft({ cronStore, operation, jobData });
          return {
            content: [{ type: "text", text: `Automation ${operation === "update" ? "updated" : "created"}: ${job.label} (${job.id})` }],
            details: { action: operation === "update" ? "updated" : "added", operation, job, jobs: cronStore.listJobs(), jobData, confirmed: true },
          };
        }

        const runtimeConfirmStore = getConfirmStore?.() || confirmStore || null;
        if (runtimeConfirmStore && context.sessionPath) {
          const { confirmId, promise } = runtimeConfirmStore.create("cron", { jobData, operation }, context.sessionPath);
          attachDeferredMutation({ promise, cronStore, operation, jobData });
          return {
            content: [{ type: "text", text: pendingConfirmationText(jobData.label, confirmId) }],
            details: { action: operation === "update" ? "pending_update" : "pending_add", operation, jobs: cronStore.listJobs(), jobData, confirmId },
          };
        }

        return {
          content: [{ type: "text", text: pendingConfirmationText(jobData.label, null) }],
          details: { action: operation === "update" ? "pending_update" : "pending_add", operation, jobData },
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: err.message }],
          details: { action: params.action, error: err.message, jobs: cronStore.listJobs() },
        };
      }
    },
  };
}
