import { renderMarkdown } from "./markdown.js";
const $ = (id) => document.getElementById(id);
const button = $("run"), rows = [];
const json = (id, value) => {
    $(id).textContent = JSON.stringify(value, null, 2);
    window.Prism?.highlightElement($(id));
};
let catalog = [];
const native = [];
const history = [];
function receive(e) {
    rows.push(e);
    if (e.type === "configuration") {
        const select = $("configuration-file");
        select.replaceChildren();
        e.files.forEach((file, i) => {
            const option = document.createElement("option");
            option.value = String(i);
            option.textContent = file.name;
            select.append(option);
        });
        const show = () => {
            $("configuration-content").textContent =
                e.files[Number(select.value)].contents;
            window.Prism?.highlightElement($("configuration-content"));
        };
        select.onchange = show;
        show();
    }
    if (e.type === "catalog") {
        catalog = e.entries;
        json("catalog", catalog);
    }
    if (e.type === "options")
        json("options", e.options);
    if (e.type === "initialized") {
        $("session").textContent = e.sessionId;
        json("discovery", { tools: e.tools, servers: e.servers });
    }
    if (e.type === "native-result") {
        native.push(e);
        json("native", native);
    }
    if (e.type === "context")
        json("context", e.usage);
    if (e.type === "answer")
        renderMarkdown($("answer"), e.text);
    if (e.type === "result") {
        $("status").textContent = e.status;
        $("cost").textContent = "$" + e.costUsd.toFixed(5);
        renderMarkdown($("answer"), e.text);
    }
    if (e.type === "evidence") {
        json("evidence", e);
        history.push(e);
        const usage = e.context;
        const tr = document.createElement("tr");
        for (const value of [
            e.mode,
            e.catalogCount,
            e.searchCalls.length,
            usage?.totalTokens ?? "unavailable",
            usage?.categories
                ?.filter((r) => r.kind === "deferred")
                .reduce((sum, r) => sum + r.tokens, 0) ?? "—",
            e.completed.join(", "),
        ]) {
            const td = document.createElement("td");
            td.textContent = String(value);
            tr.append(td);
        }
        $("history").append(tr);
        const on = history.find((r) => r.mode === "search-on"), off = history.find((r) => r.mode === "search-off");
        if (on && off) {
            const a = on.context?.totalTokens, b = off.context?.totalTokens;
            $("comparison").textContent =
                Number.isFinite(a) && Number.isFinite(b)
                    ? `Measured post-result context: on ${a.toLocaleString()} tokens; ` +
                        `off ${b.toLocaleString()} tokens. Difference ${Math.abs(b - a).toLocaleString()}. ` +
                        "Fresh sessions share the catalog and task; generated messages differ. " +
                        "This is one observation, not a guaranteed saving."
                    : "One measurement was unavailable; compare the evidence before retrying.";
        }
    }
    if (e.type === "error" || e.type === "notice")
        $("notice").textContent = e.text;
    if (e.type === "error")
        $("status").textContent = "Could not finish";
    if (["message", "tool", "handler", "native-result", "result", "error"].includes(e.type)) {
        const li = document.createElement("li");
        li.textContent = JSON.stringify(e);
        $("events").append(li);
    }
}
button.onclick = async () => {
    button.disabled = true;
    native.length = 0;
    $("answer").replaceChildren();
    $("events").replaceChildren();
    $("notice").textContent = "";
    $("status").textContent = "Running…";
    for (const id of [
        "options",
        "discovery",
        "native",
        "evidence",
        "context",
        "catalog",
    ])
        json(id, {});
    $("session").textContent = "—";
    $("cost").textContent = "—";
    const config = {
        mode: $("mode").value,
    };
    try {
        const response = await fetch("/api/run", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(config),
        });
        if (!response.ok)
            throw new Error(await response.text());
        const reader = response.body.getReader(), decoder = new TextDecoder();
        let pending = "";
        while (true) {
            const { done, value } = await reader.read();
            pending += decoder.decode(value, { stream: !done });
            const lines = pending.split("\n");
            pending = lines.pop();
            for (const line of lines)
                if (line.trim())
                    receive(JSON.parse(line));
            if (done)
                break;
        }
        if ($("status").textContent === "Running…")
            $("status").textContent = "No final result";
    }
    catch (error) {
        $("status").textContent = "Could not finish";
        $("notice").textContent =
            error instanceof Error ? error.message : "Request failed";
    }
    finally {
        button.disabled = false;
    }
};
$("download").onclick = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(rows, null, 2)], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "lesson26-observations.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
};
fetch("/api/config")
    .then((r) => r.json())
    .then((c) => {
    $("configuration").textContent =
        `Model: ${c.model} · SDK ${c.typescriptVersion} · 90 local read-only tools · ${c.ready ? "API key configured" : "Configure your .env first"}`;
    button.disabled = !c.ready;
    $("mode").value = c.defaults.mode;
})
    .catch(() => {
    $("configuration").textContent =
        "Could not reach the server. See How to run.";
});
