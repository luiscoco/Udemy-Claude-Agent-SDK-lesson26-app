# Claude Agent SDK · Lesson 26 · Tool search at scale

Five linked student pages, large text, actual SDK experiments and coloured code in all thirteen UML steps.

## What you will learn

- Understand the context trade-off: A large catalog can consume context and complicate selection. Search defers schemas and discovers relevant tools, at the cost of a search round-trip. This app uses 90 real local handlers across three SDK MCP servers.
- Compare five environment settings: Run unset, true, false, auto and auto:5. The TypeScript env object spreads inherited variables and removes an inherited search override for the unset experiment. A requested value is configuration, not proof of actual activation.
- Observe discovery and actual execution: Inspect real ToolSearch requests, native tool results and completed handler calls. A tool listed at initialization is not proof that its full schema occupied the prompt or that it executed.
- Measure context with the real SDK: After each result, keep the streaming query open and call getContextUsage with detail full. Compare totalTokens and category kind used versus deferred. Catalog bytes are not tokens; post-result measurements include different conversation messages.
- Improve names and descriptions: The discovery experiment replaces query_course_notes with search_course_notes, adds detailed keywords and a searchHint. Both return the same local lesson record. One successful run does not prove a statistical accuracy improvement.
- Keep a critical tool loaded: The always-load experiment pins only catalog_status with alwaysLoad true. Other schemas remain eligible for discovery. The model then calls the status tool and the appropriate course-notes tool.

## Configure and run

```powershell
git clone https://github.com/luiscoco/Udemy-Claude-Agent-SDK-lesson26-app.git
cd .\Udemy-Claude-Agent-SDK-lesson26-app
npm ci
if (!(Test-Path .env)) { Copy-Item .env.example .env }
notepad .env
npm start
```

From presentations use `cd .\agent-sdk\lesson26-tool-search`. Open http://127.0.0.1:3126 and keep the terminal running. Node.js 24+, API credit and model access are required. Windows may require Git Bash.

## Create your .env file

Preserve an existing file. Enter your own model key, then restart. Existing shell values take precedence.

```dotenv
ANTHROPIC_API_KEY=your_api_key
CLAUDE_MODEL=claude-sonnet-4-6
PORT=3126
# Windows if needed: CLAUDE_CODE_GIT_BASH_PATH=C:/Program Files/Git/bin/bash.exe

```

No GitHub token or Managed Agents IDs are required. Secrets, dependencies and teaching media stay outside Git.

## Run the experiments

### Compare search on and off

Run Search on and Search off. Inspect actual native search results, completed handlers and full context measurements. The browser comparison keeps one row per run. CLI prints the same event protocol.

```powershell
npm run sample:env -- search-on
npm run sample:env -- search-off
```

### Explore default and automatic thresholds

Unset uses the installed runtime default; auto uses 10% and auto:5 uses 5%. Search may remain off below the threshold. Do not infer activation only from the requested setting.

```powershell
npm run sample:env -- default
npm run sample:env -- auto
npm run sample:env -- auto-five
```

### Improve discovery and pin one critical tool

Run Discovery, then Critical tool. Compare metadata and actual execution. Pinning status should not force every other catalog schema upfront.

```powershell
npm run sample:env -- discovery
npm run sample:env -- always-load
npm test
```

## How the app was built

### 1. Validate the experiment

The host accepts a fixed classroom mode. The browser cannot supply arbitrary server commands or a replacement catalog.

Source: `src/config.ts`, selected lines 28–28. Surrounding code omitted.

```typescript
return { mode: (value as RunConfig).mode };
```

### 2. Create ninety catalog entries

Three SDK servers each register thirty actual local tools. This bounded catalog teaches scale without claiming a 10,000-tool performance test.

Source: `src/catalog.ts`, selected lines 20–24. Surrounding code omitted.

```typescript
for (let index = 0; index < 30; index++) {
        const primary = server === "courses" && index === 0;
        const critical = server === "operations" && index === 0;
        const name = primary
          ? target
```

### 3. Describe tools for discovery

The discovery branch adds searchHint to the descriptive course-notes tool. The critical branch pins only the status tool using alwaysLoad.

Source: `src/catalog.ts`, selected lines 35–42. Surrounding code omitted.

```typescript
const extras = {
          alwaysLoad: critical && mode === "always-load",
          ...(primary && rich
            ? {
                searchHint: "Search course notes by lesson, keywords and topic",
              }
            : {}),
        };
```

### 4. Register executable handlers

Each definition has a Zod input schema and a real handler. Native results come from local classroom records, not external enterprise services.

Source: `src/catalog.ts`, selected lines 61–66. Surrounding code omitted.

```typescript
definitions.push(
          tool(
            name,
            description,
            schema,
            async (input) => {
```

### 5. Pass the search environment

Spread the inherited environment. Remove the existing override for unset, or set true, false, auto or auto:5 for the chosen experiment.

Source: `src/config.ts`, selected lines 34–37. Surrounding code omitted.

```typescript
const env = { ...inherited };
  delete env.ENABLE_TOOL_SEARCH;
  if (SETTINGS[mode] !== undefined) env.ENABLE_TOOL_SEARCH = SETTINGS[mode];
  return env;
```

### 6. Give category guidance

Append category guidance to the Claude Code preset. This describes available capabilities without embedding every tool schema in the student prompt.

Source: `src/agent.ts`, selected lines 107–112. Surrounding code omitted.

```typescript
systemPrompt: {
      type: "preset",
      preset: "claude_code",
      append: CATEGORY_GUIDANCE,
    },
    hooks: {
```

### 7. Apply host tool boundaries

The PreToolUse hook records actual search calls and permits only ToolSearch and the local classroom catalog. Search changes discovery, not permission boundaries.

Source: `src/agent.ts`, selected lines 117–126. Surrounding code omitted.

```typescript
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
```

### 8. Start one real SDK query

An async input generator keeps the query alive after its first response so the host can request context usage before closing it.

Source: `src/agent.ts`, selected lines 185–188. Surrounding code omitted.

```typescript
const run = query({ prompt: input(), options });
  let status = "no_result",
    text = "",
    costUsd = 0,
```

### 9. Observe search and tool use

Record actual tool-use names and inputs. ToolSearch appearance is observed evidence; the configured environment value alone is not.

Source: `src/agent.ts`, selected lines 212–215. Surrounding code omitted.

```typescript
if (block.type === "tool_use") {
            names.set(block.id, block.name);
            emit({ type: "tool", name: block.name, args: block.input });
          }
```

### 10. Execute the matched handler

The matched local handler records its execution and returns actual JSON content with the SEARCH-26 marker for the course record.

Source: `src/catalog.ts`, selected lines 74–80. Surrounding code omitted.

```typescript
record({ name: `mcp__${server}__${name}`, input, output });
              return {
                content: [
                  { type: "text" as const, text: JSON.stringify(output) },
                ],
              };
            },
```

### 11. Measure actual context usage

Request the full SDK measurement while the Query is still running. Used and deferred categories have different meanings; the result is not a billing total.

Source: `src/agent.ts`, selected lines 240–242. Surrounding code omitted.

```typescript
context = await run.getContextUsage({ detail: "full" });
          emit({ type: "context", usage: context });
        } catch (error) {
```

### 12. Preserve evidence and close

Store the configured setting, catalog size, search calls, completed handlers and measured context. Release input and close the query after observation.

Source: `src/agent.ts`, selected lines 254–265. Surrounding code omitted.

```typescript
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
```

### 13. Render and compare measurements

Format actual Markdown and compare fresh-session context snapshots. Conversation messages differ between runs, so this is an observation rather than a controlled benchmark.

Source: `src/client.ts`, selected lines 74–83. Surrounding code omitted.

```typescript
if (on && off) {
      const a = (on.context as any)?.totalTokens,
        b = (off.context as any)?.totalTokens;
      $("comparison").textContent =
        Number.isFinite(a) && Number.isFinite(b)
          ? `Measured post-result context: on ${a.toLocaleString()} tokens; ` +
            `off ${b.toLocaleString()} tokens. Difference ${Math.abs(b - a).toLocaleString()}. ` +
            "Fresh sessions share the catalog and task; generated messages differ. " +
            "This is one observation, not a guaranteed saving."
          : "One measurement was unavailable; compare the evidence before retrying.";
```

## Reference topics and limits

- Classroom scope: All 90 tools are real local read-only handlers. No Slack, Jira, GitHub or production database integration is implied. Search, model calls and context measurements use the actual Agent SDK.
- Measure honestly: getContextUsage detail full counts context categories. Compare categories by kind and id, not English names alone. Deferred schemas are out of window. JSON catalog bytes are not tokens. Post-result totals include different generated messages and discovery calls.
- Auto thresholds: The requested value auto:5 does not guarantee a search call. Below its context-percentage threshold, upfront loading is expected. Counts, schemas, model context, deployment support and organizational settings affect behavior.
- Discovery experiment: Only the course-notes tool name, description and searchHint improve. The returned record remains the same. One successful query is illustrative; it cannot establish a statistically significant accuracy gain.
- Version-aware support: The supplied slides describe older gateway defaults and 4.5-generation support. Current official docs say gateways default on with newer Claude Code versions and document a broader supported-model set. Installed package behavior and actual events take precedence. Microsoft Foundry deployments and policy restrictions may still force fallback.
- Documented limits: Official docs describe up to 10,000 tools and up to five matches per search by default. This application registers 90 tools and records returned references; it does not benchmark the limit or claim every search returns exactly five.
- Always-loaded critical tool: Only catalog_status is marked alwaysLoad true. It stays eligible for immediate use. Other tools remain deferred when search is active; authorization still applies.
- Cost and privacy: Live model queries and full context counts may incur API usage. Each experiment has an SDK budget threshold of $0.65, which is not a prepaid cap. Only the configured model credential is needed; secrets and all teaching media remain excluded from Git.

## References

- [Official SDK tool-search documentation](https://code.claude.com/docs/en/agent-sdk/tool-search)
- [TypeScript SDK reference](https://code.claude.com/docs/en/agent-sdk/typescript)

Regenerate student pages with `python scripts/build-pages.py`. Run `npm test` for offline configuration and startup checks.
