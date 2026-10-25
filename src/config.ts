import type { Mode, RunConfig } from "./protocol.js";
export const MODES: Mode[] = [
  "default",
  "search-on",
  "search-off",
  "auto",
  "auto-five",
  "discovery",
  "always-load",
];
export const SETTINGS: Record<Mode, string | undefined> = {
  default: undefined,
  "search-on": "true",
  "search-off": "false",
  auto: "auto",
  "auto-five": "auto:5",
  discovery: "true",
  "always-load": "true",
};
export function validateConfig(value: unknown): RunConfig {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    !MODES.includes((value as RunConfig).mode)
  )
    throw new Error("Choose a listed tool-search experiment.");
  return { mode: (value as RunConfig).mode };
}
export function searchEnvironment(
  mode: Mode,
  inherited: NodeJS.ProcessEnv = process.env,
) {
  const env = { ...inherited };
  delete env.ENABLE_TOOL_SEARCH;
  if (SETTINGS[mode] !== undefined) env.ENABLE_TOOL_SEARCH = SETTINGS[mode];
  return env;
}
export function hostAllows(name: string) {
  return (
    name === "ToolSearch" || /^mcp__(courses|support|operations)__/.test(name)
  );
}
