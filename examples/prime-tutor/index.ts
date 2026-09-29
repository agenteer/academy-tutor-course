// Academy Tutor: Prime Agent project-local extension.
//
// Prime Agent auto-discovers this folder from:
//   .prime/agent/extensions/prime-tutor/index.ts
//
// Use /reload after edits, then run /academy.
// This extension owns its own course and history files in this folder:
//   cards.json       copied course deck
//   attempts.jsonl   created on the first saved attempt
//
// It does not read or write the original tutor files or existing learning histories.

import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { StringEnum } from "@earendil-works/pi-ai";
import { Type } from "typebox";

interface Card {
  id: string;
  question: string;
  answer: string;
  sources?: string[];
}

interface Attempt {
  concept: string;
  correctness: "correct" | "partial" | "incorrect";
  assisted: boolean;
  evidence: string;
  reviewedAt?: string;
  dueAt?: string;
}

type QueuedCard = Card & {
  mode: "learn" | "review";
  previous?: Attempt;
};

const extensionDir = dirname(fileURLToPath(import.meta.url));
const cardsPath = join(extensionDir, "cards.json");
const attemptsPath = join(extensionDir, "attempts.jsonl");

const AttemptParams = Type.Object(
  {
    concept: Type.String({
      description: "The id of the selected card being assessed.",
    }),
    correctness: StringEnum(["correct", "partial", "incorrect"] as const),
    assisted: Type.Boolean({
      description:
        "True if teaching, hints, or the answer were given before this answer in the current attempt.",
    }),
    evidence: Type.String({
      minLength: 1,
      description: "Brief evidence for the assessment.",
    }),
  },
  { additionalProperties: false },
);

function notify(ctx: ExtensionCommandContext, message: string, level: "info" | "warning" | "error" = "info") {
  if (ctx.hasUI) ctx.ui.notify(message, level);
}

function loadCards(): Card[] {
  if (!existsSync(cardsPath)) {
    throw new Error(`Missing Academy Tutor course file: ${cardsPath}`);
  }

  const cards = JSON.parse(readFileSync(cardsPath, "utf8"));
  if (!Array.isArray(cards)) {
    throw new Error(`${cardsPath} must contain an array of cards.`);
  }

  for (const card of cards) {
    if (!card?.id || !card?.question || !card?.answer) {
      throw new Error("Each card must include id, question, and answer.");
    }
  }

  return cards;
}

function loadLatestAttempts(): Map<string, Attempt> {
  const latest = new Map<string, Attempt>();
  if (!existsSync(attemptsPath)) return latest;

  const lines = readFileSync(attemptsPath, "utf8").split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (!line) continue;

    try {
      const attempt = JSON.parse(line) as Attempt;
      latest.set(attempt.concept, attempt);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Invalid JSON in ${attemptsPath} on line ${index + 1}: ${message}`);
    }
  }

  return latest;
}

function selectQueue(cards: Card[], latest: Map<string, Attempt>): QueuedCard[] {
  const due: QueuedCard[] = [];
  const unseen: QueuedCard[] = [];

  for (const card of cards) {
    const previous = latest.get(card.id);
    if (!previous) {
      unseen.push({ ...card, mode: "learn" });
      continue;
    }

    const dueAt = Date.parse(previous.dueAt ?? "");
    if (!Number.isFinite(dueAt)) {
      throw new Error(`Invalid review date for ${card.id} in ${attemptsPath}.`);
    }

    if (dueAt <= Date.now()) {
      due.push({ ...card, mode: "review", previous });
    }
  }

  return [...due, ...unseen];
}

export default function academyTutor(pi: ExtensionAPI) {
  let queue: QueuedCard[] = [];

  pi.registerTool({
    name: "record_attempt",
    label: "Record Academy practice",
    description:
      "Record one assessed Academy Tutor answer. Judge correctness against the selected card. Set assisted to true if teaching, hints, or the answer preceded this answer in the current attempt. Do not record skips or unassessed answers.",
    promptSnippet: "record_attempt: save an Academy Tutor assessment for one selected concept.",
    promptGuidelines: [
      "Use record_attempt only after assessing a learner answer against the selected Academy Tutor card.",
      "Use the exact selected card id as concept.",
      "Do not call record_attempt for skipped concepts or unassessed answers.",
    ],
    parameters: AttemptParams,
    executionMode: "sequential",
    async execute(_toolCallId, attempt) {
      if (!queue.some((card) => card.id === attempt.concept)) {
        throw new Error("Record only a remaining concept selected by /academy.");
      }

      const days = attempt.correctness === "correct" && !attempt.assisted ? 3 : 1;
      const reviewedAt = new Date();
      const dueAt = new Date(reviewedAt.getTime() + days * 24 * 60 * 60 * 1000);

      const record: Attempt = {
        ...attempt,
        reviewedAt: reviewedAt.toISOString(),
        dueAt: dueAt.toISOString(),
      };

      appendFileSync(attemptsPath, `${JSON.stringify(record)}\n`);
      queue = queue.filter((card) => card.id !== attempt.concept);

      const result = {
        saved: record,
        historyFile: attemptsPath,
        remaining: queue.map((card) => card.id),
      };

      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        details: result,
      };
    },
  });

  pi.registerCommand("academy", {
    description: "Start an Academy Tutor practice session",
    handler: async (_args, ctx) => {
      if (!ctx.isIdle()) {
        notify(ctx, "Wait until Prime Agent is idle, then run /academy again.", "warning");
        return;
      }

      const cards = loadCards();
      const latest = loadLatestAttempts();
      queue = selectQueue(cards, latest);

      pi.setActiveTools(["ipython", "record_attempt"]);

      if (!queue.length) {
        notify(ctx, "No Academy Tutor concepts are due and none are new.");
        return;
      }

      notify(ctx, `Academy Tutor selected ${queue.length} concept(s). History: ${attemptsPath}`);

      pi.sendUserMessage(`Practise the selected Academy Tutor concepts, one question at a time.
For mode learn: explain briefly, then ask; this is assisted practice.
For mode review: ask before explaining. Mark assisted only if help preceded this answer in this attempt.
Assess against the provided answer; teach directly and offer source links when useful or requested.
After assessing, call record_attempt with the concept id, correctness, assistance and evidence.
Work in listed order and use the tool's remaining concepts. Skip without recording if asked; stop when all are completed or skipped, or when I ask.
This Prime Agent extension stores its learning history at ${attemptsPath}.
Selected concepts: ${JSON.stringify(queue)}`);
    },
  });
}
