// Academy Tutor: a standalone learning app built with the Pi SDK.
// The model teaches and assesses; our code selects, records and schedules.
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import {
  createAgentSession,
  DefaultResourceLoader,
  defineTool,
  getAgentDir,
  SessionManager,
} from "@earendil-works/pi-coding-agent";

// Read the latest saved attempt for each concept.
const history = "attempts.jsonl";
const latest = new Map();
if (existsSync(history)) {
  for (const line of readFileSync(history, "utf8").split("\n")) {
    if (!line.trim()) continue;
    const attempt = JSON.parse(line);
    latest.set(attempt.concept, attempt);
  }
}
const cards = JSON.parse(readFileSync("cards.json", "utf8"));

// Select due concepts for recall, then unseen concepts for learning.
const due = [];
const unseen = [];
for (const card of cards) {
  const previous = latest.get(card.id);
  console.log(card.id, previous ? previous.dueAt : "new");
  if (!previous) {
    unseen.push({ ...card, mode: "learn" });
  } else {
    const date = Date.parse(previous.dueAt);
    if (!Number.isFinite(date)) {
      throw new Error("Invalid review date in attempts.jsonl.");
    }
    if (date <= Date.now()) {
      due.push({ ...card, mode: "review", previous });
    }
  }
}
let queue = [...due, ...unseen];

// End the application when there is nothing to practise.
if (!queue.length) {
  console.log("No concepts are due and none are new.");
  process.exit(0);
}
// Describe the assessment fields that Pi validates before running the tool.
const recordAttempt = defineTool({
  name: "record_attempt",
  label: "Record practice",
  description:
    "Record one assessed answer. Judge correctness against the course. Set assisted to true if teaching or hints preceded this answer in the attempt. Evidence summarizes the answer and any help. Do not record skips or unassessed answers.",
  parameters: {
    type: "object",
    additionalProperties: false,
    properties: {
      concept: { type: "string" },
      correctness: {
        type: "string",
        enum: ["correct", "partial", "incorrect"],
      },
      assisted: { type: "boolean" },
      evidence: { type: "string", minLength: 1 },
    },
    required: ["concept", "correctness", "assisted", "evidence"],
  },
  async execute(id, attempt) {
    if (!queue.some((card) => card.id === attempt.concept))
      throw new Error("Record only a remaining selected concept.");

    // Schedule 3 days after independent success; otherwise 1 day.
    const days = attempt.correctness === "correct" && !attempt.assisted ? 3 : 1;
    const reviewedAt = new Date();
    const dueAt = new Date(reviewedAt.getTime() + days * 86400000);
    const saved = {
      ...attempt,
      reviewedAt: reviewedAt.toISOString(),
      dueAt: dueAt.toISOString(),
    };

    // Append this attempt without overwriting earlier attempts.
    appendFileSync(history, JSON.stringify(saved) + "\n");

    // Remove the completed concept from this session's remaining queue.
    queue = queue.filter((card) => card.id !== attempt.concept);
    const result = { saved, remaining: queue.map((card) => card.id) };
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      details: result,
    };
  },
});
// Load our tutor instructions without discovering unrelated Pi resources.
const loader = new DefaultResourceLoader({
  cwd: process.cwd(),
  agentDir: getAgentDir(),
  noExtensions: true,
  noSkills: true,
  noPromptTemplates: true,
  noThemes: true,
  noContextFiles: true,
  systemPrompt:
    "You are an Agenteer Academy tutor. Help the learner understand and remember course concepts.",
});
await loader.reload();

// Connect our recording tool and choose what the model may call.
const { session } = await createAgentSession({
  resourceLoader: loader,
  customTools: [recordAttempt],
  tools: ["read", "record_attempt"],
  sessionManager: SessionManager.inMemory(),
});
// Display completed assistant replies, excluding reasoning and tool payloads.
session.subscribe((event) => {
  // Show the model/tool loop that Pi runs inside session.prompt.
  if (event.type === "turn_start") console.log("\n[Pi] Model turn started");
  if (event.type === "tool_execution_start")
    console.log("[Pi] Running tool:", event.toolName);
  if (event.type === "tool_execution_end")
    console.log("[Pi] Tool completed:", event.isError ? "error" : "success");
  if (event.type !== "message_end" || event.message.role !== "assistant")
    return;
  for (const block of event.message.content) {
    if (block.type === "text") console.log("\n" + block.text);
  }
  if (event.message.errorMessage) console.error(event.message.errorMessage);
});

let input;
try {
  console.log(`Academy Tutor — ${session.model.id}. Type /quit to exit.`);
  await session.prompt(`Practise the selected Academy concepts, one question at a time.
For mode learn: explain briefly, then ask; this is assisted practice.
For mode review: ask before explaining. Mark assisted only if help preceded this answer in this attempt.
Assess against the provided answer; teach directly and offer source links when useful or requested.
After assessing, call record_attempt with the concept id, correctness, assistance and evidence.
Work in listed order and use the tool's remaining concepts. Skip without recording if asked; stop when all are completed or skipped, or when I ask.
Selected concepts: ${JSON.stringify(queue)}`);

  // Our loop accepts human input; Pi runs model/tool turns inside session.prompt.
  if (queue.length) {
    input = createInterface({ input: process.stdin, output: process.stdout });
    process.stdout.write("\nYou: ");
    for await (const answer of input) {
      if (answer.trim() === "/quit") break;
      if (!answer.trim()) continue;
      await session.prompt(answer);
      if (!queue.length) break;
      process.stdout.write("\nYou: ");
    }
  }
} finally {
  input?.close();
  session.dispose();
}
