// Academy Tutor: a Pi extension for learning and reviewing course concepts.
// Pi runs the model/tool loop; the model teaches and assesses answers.
// /academy selects context and tools, then starts the conversation.
// record_attempt checks assessment inputs, schedules review and appends history.
// Flow: /academy -> teach or review -> record_attempt -> continue or stop.
// Course: cards.json. History: attempts.jsonl, created on first save.
// Run from the course folder: pi -e tutor.js; then enter /academy.

import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Type } from "typebox";
import { StringEnum } from "@earendil-works/pi-ai";

// Define what the model must report about an answer.
const attemptSchema = Type.Object(
  {
    concept: Type.String(),
    correctness: StringEnum(["correct", "partial", "incorrect"]),
    assisted: Type.Boolean(),
    evidence: Type.String({ minLength: 1 }),
  },
  { additionalProperties: false },
);

export default function (pi) {
  // Hold the concepts eligible for this practice session.
  let queue = [];
  // Make attempt recording available as a model-callable tool.
  pi.registerTool({
    name: "record_attempt",
    label: "Record practice",
    description:
      "Record one assessed answer. Judge correctness against the course. Set assisted to true if teaching or hints preceded this answer in the attempt. Evidence summarizes the answer and any help. Do not record skips or unassessed answers.",
    parameters: attemptSchema,
    async execute(id, attempt, signal, onUpdate, ctx) {
      // Accept only concepts still eligible in this practice session.
      if (!queue.some((card) => card.id === attempt.concept)) {
        throw new Error(
          "Record only a remaining concept selected by /academy.",
        );
      }
      // Schedule 3 days after a correct answer without help; otherwise 1 day.
      const days =
        attempt.correctness === "correct" && !attempt.assisted ? 3 : 1;
      const reviewedAt = new Date();
      const dueAt = new Date(reviewedAt.getTime() + days * 24 * 60 * 60 * 1000);

      const record = {
        ...attempt,
        reviewedAt: reviewedAt.toISOString(),
        dueAt: dueAt.toISOString(),
      };
      // Keep earlier attempts by appending this record to the history file.
      appendFileSync(
        join(ctx.cwd, "attempts.jsonl"),
        JSON.stringify(record) + "\n",
      );
      // Remove the saved concept and tell the model what remains.
      queue = queue.filter((card) => card.id !== attempt.concept);
      const result = { saved: record, remaining: queue.map((card) => card.id) };
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        details: result,
      };
    },
  });
  // Add /academy as the entry point for a practice session.
  pi.registerCommand("academy", {
    description: "Start an Academy practice session",
    handler: async (args, ctx) => {
      queue = [];
      // Load the last recorded attempt per concept into memory.
      const file = join(ctx.cwd, "attempts.jsonl");
      const latest = new Map();
      if (existsSync(file)) {
        for (const line of readFileSync(file, "utf8").split("\n")) {
          if (!line.trim()) continue;
          const attempt = JSON.parse(line);
          latest.set(attempt.concept, attempt);
        }
      }
      const cards = JSON.parse(
        readFileSync(join(ctx.cwd, "cards.json"), "utf8"),
      );
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
          if (!Number.isFinite(dueAt))
            throw new Error("Invalid review date in attempts.jsonl.");
          if (dueAt <= Date.now())
            due.push({ ...card, mode: "review", previous });
        }
      }
      queue = [...due, ...unseen];
      // Expose only read and record_attempt to the model.
      pi.setActiveTools(["read", "record_attempt"]);
      // End here if there is nothing to practise.
      if (!queue.length) {
        ctx.ui.notify("No concepts are due and none are new.", "info");
        return;
      }
      // Give the model the selected cards and instructions for each mode.
      pi.sendUserMessage(`Practise the selected Academy concepts, one question at a time.
For mode learn: explain briefly, then ask; this is assisted practice.
For mode review: ask before explaining. Mark assisted only if help preceded this answer in this attempt.
Assess against the provided answer; teach directly and offer source links when useful or requested.
After assessing, call record_attempt with the concept id, correctness, assistance and evidence.
Work in listed order and use the tool's remaining concepts. Skip without recording if asked; stop when all are completed or skipped, or when I ask.
Selected concepts: ${JSON.stringify(queue)}`);
    },
  });
}
