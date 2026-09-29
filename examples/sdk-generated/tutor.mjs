#!/usr/bin/env node

// Academy Tutor: a small standalone terminal app built with the Pi SDK.
// Run from this folder with: node tutor.mjs

import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { join } from "node:path";
import {
  createAgentSession,
  DefaultResourceLoader,
  getAgentDir,
  SessionManager,
} from "@earendil-works/pi-coding-agent";

const cwd = process.cwd();
const attemptsPath = join(cwd, "attempts.jsonl");
const cardsPath = join(cwd, "cards.json");

// Define what the model must report about an answer.
const attemptSchema = {
  type: "object",
  properties: {
    concept: { type: "string" },
    correctness: { type: "string", enum: ["correct", "partial", "incorrect"] },
    assisted: { type: "boolean" },
    evidence: { type: "string", minLength: 1 },
  },
  required: ["concept", "correctness", "assisted", "evidence"],
  additionalProperties: false,
};

// Hold the concepts eligible for this practice session.
let queue = loadPracticeQueue();

function loadPracticeQueue() {
  // Load the last recorded attempt per concept into memory.
  const latest = new Map();
  if (existsSync(attemptsPath)) {
    for (const line of readFileSync(attemptsPath, "utf8").split("\n")) {
      if (!line.trim()) continue;
      const attempt = JSON.parse(line);
      latest.set(attempt.concept, attempt);
    }
  }

  const cards = JSON.parse(readFileSync(cardsPath, "utf8"));

  // Select due concepts for recall, then unseen concepts for learning.
  // Leave concepts with future review dates out of this session.
  const due = [];
  const unseen = [];
  for (const card of cards) {
    const previous = latest.get(card.id);
    if (!previous) {
      unseen.push({ ...card, mode: "learn" });
    } else {
      const dueAt = Date.parse(previous.dueAt);
      if (!Number.isFinite(dueAt)) {
        throw new Error("Invalid review date in attempts.jsonl.");
      }
      if (dueAt <= Date.now()) due.push({ ...card, mode: "review", previous });
    }
  }
  return [...due, ...unseen];
}

function makeTutorExtension() {
  return (pi) => {
    // Make attempt recording available as a model-callable tool.
    pi.registerTool({
      name: "record_attempt",
      label: "Record practice",
      description:
        "Record one assessed answer. Judge correctness against the course. Set assisted to true if teaching or hints preceded this answer in the attempt. Evidence summarizes the answer and any help. Do not record skips or unassessed answers.",
      parameters: attemptSchema,
      async execute(_id, attempt, _signal, _onUpdate, ctx) {
        // Accept only concepts still eligible in this practice session.
        if (!queue.some((card) => card.id === attempt.concept)) {
          throw new Error("Record only a remaining concept selected for this practice session.");
        }

        // Schedule 3 days after a correct answer without help; otherwise 1 day.
        const days = attempt.correctness === "correct" && !attempt.assisted ? 3 : 1;
        const reviewedAt = new Date();
        const dueAt = new Date(reviewedAt.getTime() + days * 24 * 60 * 60 * 1000);

        const record = {
          ...attempt,
          reviewedAt: reviewedAt.toISOString(),
          dueAt: dueAt.toISOString(),
        };

        // Keep earlier attempts by appending this record to the history file.
        appendFileSync(join(ctx.cwd, "attempts.jsonl"), JSON.stringify(record) + "\n");

        // Remove the saved concept and tell the model what remains.
        queue = queue.filter((card) => card.id !== attempt.concept);
        const result = { saved: record, remaining: queue.map((card) => card.id) };
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          details: result,
        };
      },
    });
  };
}

function startPrompt() {
  return `Practise the selected Academy concepts, one question at a time.
For mode learn: explain briefly, then ask; this is assisted practice.
For mode review: ask before explaining. Mark assisted only if help preceded this answer in this attempt.
Assess against the provided answer; teach directly and offer source links when useful or requested.
After assessing, call record_attempt with the concept id, correctness, assistance and evidence.
Work in listed order and use the tool's remaining concepts. Skip without recording if asked; stop when all are completed or skipped, or when I ask.
Selected concepts: ${JSON.stringify(queue)}`;
}

function attachEventPrinter(session) {
  let assistantOpen = false;
  return session.subscribe((event) => {
    switch (event.type) {
      case "agent_start":
        console.log("\n[model] started");
        break;
      case "message_update":
        if (event.assistantMessageEvent.type === "text_delta") {
          assistantOpen = true;
          output.write(event.assistantMessageEvent.delta);
        }
        break;
      case "tool_execution_start":
        if (assistantOpen) output.write("\n");
        assistantOpen = false;
        console.log(`[tool] ${event.toolName} started`);
        break;
      case "tool_execution_end":
        console.log(`[tool] ${event.toolName} finished`);
        break;
      case "agent_settled":
        if (assistantOpen) output.write("\n");
        assistantOpen = false;
        console.log("[model] settled");
        break;
    }
  });
}

async function main() {
  if (!queue.length) {
    console.log("No concepts are due and none are new.");
    return;
  }

  const resourceLoader = new DefaultResourceLoader({
    cwd,
    agentDir: getAgentDir(),
    extensionFactories: [makeTutorExtension()],
  });
  await resourceLoader.reload();

  const { session } = await createAgentSession({
    cwd,
    resourceLoader,
    sessionManager: SessionManager.inMemory(cwd),
    tools: ["read", "record_attempt"],
  });

  const rl = createInterface({ input, output });
  const unsubscribe = attachEventPrinter(session);

  process.once("SIGINT", async () => {
    console.log("\nQuitting.");
    await session.abort().catch(() => {});
    rl.close();
    unsubscribe();
    session.dispose();
    process.exit(130);
  });

  try {
    console.log(`Academy Tutor started with ${queue.length} concept(s). Type /quit to exit.\n`);
    await session.prompt(startPrompt());

    while (queue.length) {
      const answer = (await rl.question("\nyou> ")).trim();
      if (["/quit", "quit", "exit", "/exit"].includes(answer.toLowerCase())) break;
      if (!answer) continue;
      await session.prompt(answer);
    }

    if (!queue.length) console.log("All selected concepts are complete.");
  } finally {
    rl.close();
    unsubscribe();
    session.dispose();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
