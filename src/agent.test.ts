import { test } from "node:test";
import assert from "node:assert/strict";
import { searchEnvironment, validateConfig, hostAllows } from "./config.js";
import { createCatalog, LESSON } from "./catalog.js";
test("unset removes inherited search override, explicit modes preserve other variables", () => {
  assert.equal(
    searchEnvironment("default", { ENABLE_TOOL_SEARCH: "false", PATH: "safe" })
      .ENABLE_TOOL_SEARCH,
    undefined,
  );
  assert.equal(
    searchEnvironment("auto-five", { PATH: "safe" }).ENABLE_TOOL_SEARCH,
    "auto:5",
  );
  assert.equal(searchEnvironment("search-on", { PATH: "safe" }).PATH, "safe");
});
test("catalog has ninety unique tools; discovery and pin change only intended metadata", () => {
  const normal = createCatalog("search-on", () => {}),
    rich = createCatalog("discovery", () => {}),
    pin = createCatalog("always-load", () => {});
  assert.equal(normal.entries.length, 90);
  assert.equal(
    new Set(normal.entries.map((e) => e.server + "_" + e.name)).size,
    90,
  );
  assert.match(rich.target, /search_course_notes$/);
  assert.equal(rich.entries.filter((e) => e.searchHint).length, 1);
  assert.deepEqual(
    pin.entries.filter((e) => e.alwaysLoad).map((e) => e.name),
    ["catalog_status"],
  );
  assert.equal(LESSON.marker, "SEARCH-26");
});
test("requests cannot supply an arbitrary tool catalog or mode", () => {
  assert.throws(() => validateConfig({ mode: "shell" }));
  assert.equal(hostAllows("Bash"), false);
  assert.equal(hostAllows("mcp__untrusted__write"), false);
  assert.equal(hostAllows("ToolSearch"), true);
});
