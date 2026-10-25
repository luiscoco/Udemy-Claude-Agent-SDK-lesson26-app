import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import type { CatalogEntry, HandlerCall, Mode } from "./protocol.js";

// Classroom records: actual handler data, not a production Slack/Jira/GitHub service.
export const LESSON = {
  lesson: 26,
  title: "Tool search at scale",
  marker: "SEARCH-26",
  topic: "Deferred tool loading, discovery and context measurement",
};
const CATEGORIES = ["courses", "support", "operations"] as const;
export function createCatalog(mode: Mode, record: (call: HandlerCall) => void) {
  const entries: CatalogEntry[] = [];
  const rich = mode === "discovery";
  const target = rich ? "search_course_notes" : "query_course_notes";
  const servers = Object.fromEntries(
    CATEGORIES.map((server) => {
      const definitions = [];
      for (let index = 0; index < 30; index++) {
        const primary = server === "courses" && index === 0;
        const critical = server === "operations" && index === 0;
        const name = primary
          ? target
          : critical
            ? "catalog_status"
            : `lookup_${server}_record_${String(index).padStart(2, "0")}`;
        const description = primary
          ? rich
            ? "Search course lesson notes by keyword, lesson number or topic. Find lesson 26 about tool search at scale, deferred tool loading, SDK context usage and catalog discovery. Read-only classroom teaching records."
            : "Query classroom lesson notes by lesson number. Returns the matching teaching record."
          : critical
            ? "Read the classroom catalog health status and total tool count. Read-only critical diagnostic."
            : `Read classroom ${server} record ${index}. This is a local training fixture, not a production service. Look up the numeric record identifier and return the stored record category, index and marker. Use this specific record endpoint only when the user asks for this exact ${server} index ${index}. It does not search lesson notes, send messages, edit files or access external accounts. Optional filters describe the classroom record fields; omitted fields use the local dataset defaults. The returned record identifies its source explicitly so students can distinguish tool execution from a generated answer. An unknown record is reported as missing rather than fabricated. No credentials are required for these local read-only handlers.`;
        const extras = {
          alwaysLoad: critical && mode === "always-load",
          ...(primary && rich
            ? {
                searchHint: "Search course notes by lesson, keywords and topic",
              }
            : {}),
        };
        entries.push({ server, name, description, ...extras });
        const schema: z.ZodRawShape = primary
          ? {
              lesson: z
                .number()
                .int()
                .min(1)
                .max(60)
                .describe("Course lesson number"),
              keyword: z.string().max(100).optional(),
            }
          : {
              recordId: z
                .number()
                .int()
                .optional()
                .describe("Archive record index; unrelated to lesson numbers"),
            };
        definitions.push(
          tool(
            name,
            description,
            schema,
            async (input) => {
              const output = primary
                ? input.lesson === undefined || input.lesson === 26
                  ? LESSON
                  : { found: false, lesson: input.lesson }
                : critical
                  ? { status: "healthy", tools: 90, marker: "CATALOG-26" }
                  : { category: server, index, marker: `${server}-${index}` };
              record({ name: `mcp__${server}__${name}`, input, output });
              return {
                content: [
                  { type: "text" as const, text: JSON.stringify(output) },
                ],
              };
            },
            extras,
          ),
        );
      }
      return [
        server,
        createSdkMcpServer({
          name: server,
          version: "1.0.0",
          tools: definitions,
        }),
      ];
    }),
  );
  return { servers, entries, target: `mcp__courses__${target}` };
}
