// Observe Pi's ABC loop without replacing its prompt, tools, or provider payload.
// Load with: npx pi -e ./tracer.ts
// Each session gets a unique trace folder; trace/latest points to the newest one.
// Logs contain model inputs. Keep demonstration inputs suitable for showing on screen.
import { appendFileSync, lstatSync, mkdirSync, mkdtempSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  let dir: string;
  let requestNumber = 0;
  let promptNumber = 0;
  const short = (value: unknown) => {
    const text = typeof value === "string" ? value : JSON.stringify(value) ?? String(value);
    return text.replace(/\s+/g, " ").slice(0, 180);
  };
  const note = (text: string) => appendFileSync(join(dir, "trace.log"), text + "\n");

  // Keep a readable, stable entry point without overwriting earlier sessions.
  pi.on("session_start", (_event, ctx) => {
    const root = join(ctx.cwd, "trace");
    mkdirSync(root, { recursive: true });
    dir = mkdtempSync(join(root, "run-"));
    requestNumber = promptNumber = 0;
    const latest = join(root, "latest");
    try {
      if (lstatSync(latest).isSymbolicLink()) unlinkSync(latest);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    symlinkSync(basename(dir), latest);
    note("SESSION START — observational trace; request snapshots are not network-call counts");
    ctx.ui.notify("Trace: " + join(latest, "trace.log"), "info");
  });

  // Capture Pi's prompt at this hook; the provider request below shows its serialization.
  pi.on("before_agent_start", (event, ctx) => {
    promptNumber++;
    writeFileSync(join(dir, `system-prompt-${promptNumber}.txt`), event.systemPrompt);
    note(`PROMPT ${promptNumber}: ${short(event.prompt)}`);
    note(`BRAIN: ${ctx.model?.provider}/${ctx.model?.id}; ACTIONS: ${pi.getActiveTools().join(", ")}`);
  });
  pi.on("turn_start", event => { note(`TURN ${event.turnIndex} START`); });
  pi.on("before_provider_request", event => {
    const file = `request-${++requestNumber}.json`;
    writeFileSync(join(dir, file), JSON.stringify(event.payload, null, 2));
    note(`REQUEST SNAPSHOT: ${file}`);
  });
  pi.on("tool_call", event => { note(`TOOL REQUEST: ${event.toolName} ${short(event.input)}`); });
  pi.on("tool_result", event => { note(`TOOL RESULT: ${event.toolName} ${event.isError ? "ERROR" : "OK"} ${short(event.content)}`); });
  pi.on("turn_end", event => { note(`TURN ${event.turnIndex} END: ${event.toolResults.length} tool result(s)`); });
  pi.on("agent_end", () => { note("AGENT END: this low-level run ended; continuation may follow"); });
  pi.on("agent_settled", () => { note("SETTLED: no automatic continuation pending; ready for another user message"); });
}
