export type Mode =
  | "default"
  | "search-on"
  | "search-off"
  | "auto"
  | "auto-five"
  | "discovery"
  | "always-load";
export interface RunConfig {
  mode: Mode;
}
export interface CatalogEntry {
  server: string;
  name: string;
  description: string;
  searchHint?: string;
  alwaysLoad: boolean;
}
export interface HandlerCall {
  name: string;
  input: unknown;
  output: unknown;
}
export interface Evidence {
  mode: Mode;
  catalogCount: number;
  searchSetting: string;
  searchCalls: string[];
  completed: string[];
  context: unknown;
  catalogBytes: number;
  alwaysLoaded: string[];
  target: string;
  measurementError?: string;
}
export type LabEvent =
  | { type: "options"; config: RunConfig; options: unknown }
  | { type: "configuration"; files: { name: string; contents: string }[] }
  | { type: "catalog"; entries: CatalogEntry[] }
  | {
      type: "initialized";
      model: string;
      sessionId: string;
      tools: string[];
      servers: unknown;
    }
  | { type: "message"; sdkType: string; summary: string }
  | { type: "tool"; name: string; args: unknown }
  | { type: "native-result"; name: string; content: unknown }
  | { type: "handler"; call: HandlerCall }
  | { type: "context"; usage: unknown }
  | { type: "answer"; text: string }
  | { type: "result"; status: string; text: string; costUsd: number }
  | ({ type: "evidence" } & Evidence)
  | { type: "error" | "notice"; text: string };
