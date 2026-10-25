import { runAgent, validateConfig } from "./agent.js";
const config = validateConfig({ mode: process.argv[2] || "search-on" });
await runAgent(config, (e) => console.log(JSON.stringify(e)));
