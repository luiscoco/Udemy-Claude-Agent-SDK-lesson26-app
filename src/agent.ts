import {
  query,
  type Options,
  type SDKUserMessage,
} from "@anthropic-ai/claude-agent-sdk";
import { mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { createCatalog } from "./catalog.js";
import {
  validateConfig,
  searchEnvironment,
  SETTINGS,
  MODES,
  hostAllows,
} from "./config.js";
import type {
  RunConfig,
  LabEvent,
  Mode,
  HandlerCall,
  Evidence,
} from "./protocol.js";
export { validateConfig, MODES };
export const MODEL = process.env.CLAUDE_MODEL || "claude-sonnet-4-6";
export const DEFAULT_CONFIG: RunConfig = { mode: "search-on" };
const CATEGORY_GUIDANCE =
  "Classroom categories: course lesson notes, support records and operations diagnostics. " +
  "Discover deferred tools through search. These are local read-only teaching fixtures. " +
  "Never simulate execution. Keep the final answer brief.";
const task =
  "Find the tool for querying or searching course notes by lesson number. Discover it if needed, call it with lesson 26, and report the actual title and marker in two short bullet points. Numbered catalog record lookup tools are unrelated: their record indices are not lesson numbers. Never invent a result.";
export const PROMPTS = Object.fromEntries(
  MODES.map((mode) => [
    mode,
    task +
      (mode === "always-load"
        ? " Also call the critical catalog_status tool once and report its actual status."
        : ""),
  ]),
) as Record<Mode, string>;
export function redact(text: string) {
  for (const value of [
    process.env.ANTHROPIC_API_KEY,
    process.env.ANTHROPIC_AUTH_TOKEN,
    process.env.GITHUB_MCP_TOKEN,
  ].filter(Boolean) as string[])
    text = text.split(value).join("[REDACTED]");
  return text
    .replace(/sk-ant-[A-Za-z0-9_-]+/g, "[REDACTED]")
    .replace(/(?:github_pat_|gh[pousr]_)[A-Za-z0-9_]+/g, "[REDACTED]")
    .slice(0, 22000);
}
export async function runAgent(
  config: RunConfig,
  emit: (event: LabEvent) => void,
  controller = new AbortController(),
) {
  const c = validateConfig(config),
    root = join(tmpdir(), "claude-sdk26", randomUUID());
  const cwd = join(root, "project"),
    home = join(root, "home"),
    sdkHome = join(root, "sdk");
  for (const path of [cwd, home, sdkHome])
    await mkdir(path, { recursive: true });
  const calls: HandlerCall[] = [],
    searchCalls: string[] = [],
    completed: string[] = [];
  const catalog = createCatalog(c.mode, (call) => {
    calls.push(call);
    completed.push(call.name);
    emit({ type: "handler", call });
  });
  emit({ type: "catalog", entries: catalog.entries });
  const env = {
    ...searchEnvironment(c.mode),
    HOME: home,
    USERPROFILE: home,
    CLAUDE_CONFIG_DIR: sdkHome,
    CLAUDE_CODE_DISABLE_AUTO_MEMORY: "1",
    ENABLE_CLAUDEAI_MCP_SERVERS: "false",
  };
  const options: Options = {
    model: MODEL,
    cwd,
    tools: ["ToolSearch"],
    mcpServers: catalog.servers,
    allowedTools: [
      "ToolSearch",
      "mcp__courses__*",
      "mcp__support__*",
      "mcp__operations__*",
    ],
    settingSources: [],
    skills: [],
    plugins: [],
    strictMcpConfig: true,
    persistSession: false,
    permissionMode: "default",
    effort: "low",
    thinking: { type: "disabled" },
    maxTurns: 8,
    maxBudgetUsd: 0.65,
    env,
    abortController: controller,
    systemPrompt: {
      type: "preset",
      preset: "claude_code",
      append: CATEGORY_GUIDANCE,
    },
    hooks: {
      PreToolUse: [
        {
          hooks: [
            async (input) => {
              if (input.hook_event_name !== "PreToolUse") return {};
              if (input.tool_name === "ToolSearch")
                searchCalls.push(input.tool_name);
              return {
                hookSpecificOutput: {
                  hookEventName: "PreToolUse",
                  permissionDecision: hostAllows(input.tool_name)
                    ? "allow"
                    : "deny",
                  permissionDecisionReason:
                    "Only the classroom catalog and its built-in discovery tool are allowed.",
                },
              };
            },
          ],
        },
      ],
    },
  };
  emit({
    type: "options",
    config: c,
    options: {
      model: MODEL,
      tools: options.tools,
      allowedTools: options.allowedTools,
      mcpServers: Object.keys(catalog.servers),
      ENABLE_TOOL_SEARCH: SETTINGS[c.mode] ?? "(unset)",
      catalogCount: catalog.entries.length,
      alwaysLoad: catalog.entries
        .filter((e) => e.alwaysLoad)
        .map((e) => e.name),
      measurement:
        "getContextUsage({ detail: full }) after result; fresh session per experiment",
    },
  });
  emit({
    type: "configuration",
    files: [
      {
        name: "Actual non-secret search configuration",
        contents: JSON.stringify(
          {
            ENABLE_TOOL_SEARCH: SETTINGS[c.mode] ?? "(unset)",
            catalogCount: catalog.entries.length,
            target: catalog.target,
            richDiscovery: c.mode === "discovery",
            pinned: catalog.entries.filter((e) => e.alwaysLoad),
          },
          null,
          2,
        ),
      },
    ],
  });
  let release!: () => void;
  const gate = new Promise<void>((ok) => {
    release = ok;
  });
  async function* input(): AsyncGenerator<SDKUserMessage> {
    yield {
      type: "user",
      message: { role: "user", content: PROMPTS[c.mode] },
      parent_tool_use_id: null,
      session_id: "",
    };
    await gate;
  }
  const run = query({ prompt: input(), options });
  let status = "no_result",
    text = "",
    costUsd = 0,
    context: unknown = null,
    measurementError: string | undefined;
  const names = new Map<string, string>();
  try {
    for await (const message of run) {
      emit({
        type: "message",
        sdkType: message.type,
        summary:
          "subtype" in message ? String(message.subtype) : "Actual SDK message",
      });
      if (message.type === "system" && message.subtype === "init")
        emit({
          type: "initialized",
          model: message.model,
          sessionId: message.session_id,
          tools: message.tools,
          servers: message.mcp_servers,
        });
      if (message.type === "assistant")
        for (const block of message.message.content) {
          if (block.type === "text")
            emit({ type: "answer", text: redact(block.text) });
          if (block.type === "tool_use") {
            names.set(block.id, block.name);
            emit({ type: "tool", name: block.name, args: block.input });
          }
        }
      if (message.type === "user" && Array.isArray(message.message.content))
        for (const block of message.message.content)
          if (block.type === "tool_result")
            emit({
              type: "native-result",
              name: names.get(block.tool_use_id) || block.tool_use_id,
              content: JSON.parse(redact(JSON.stringify(block.content))),
            });
      if (message.type === "result") {
        status =
          message.subtype === "success"
            ? message.is_error
              ? "error"
              : "success"
            : message.subtype;
        text = redact(
          message.subtype === "success"
            ? message.result
            : message.errors.join("\n"),
        );
        costUsd = message.total_cost_usd;
        emit({ type: "result", status, text, costUsd });
        try {
          context = await run.getContextUsage({ detail: "full" });
          emit({ type: "context", usage: context });
        } catch (error) {
          measurementError = redact(
            error instanceof Error ? error.message : String(error),
          );
          emit({
            type: "notice",
            text: "Context measurement unavailable: " + measurementError,
          });
        }
        break;
      }
    }
    const evidence: Evidence = {
      mode: c.mode,
      catalogCount: catalog.entries.length,
      searchSetting: SETTINGS[c.mode] ?? "(unset)",
      searchCalls,
      completed,
      context,
      catalogBytes: Buffer.byteLength(JSON.stringify(catalog.entries)),
      alwaysLoaded: catalog.entries
        .filter((e) => e.alwaysLoad)
        .map((e) => e.name),
      target: catalog.target,
      ...(measurementError ? { measurementError } : {}),
    };
    emit({ type: "evidence", ...evidence });
  } finally {
    release();
    run.close();
    await rm(root, { recursive: true, force: true });
  }
}
