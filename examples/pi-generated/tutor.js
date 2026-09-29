const fs = require("node:fs");
const path = require("node:path");

const CARDS_FILE = "cards.json";
const ATTEMPTS_FILE = "attempts.jsonl";
const DAY_MS = 24 * 60 * 60 * 1000;

let practice = null;

const RecordAttemptParams = {
	type: "object",
	additionalProperties: false,
	properties: {
		concept: {
			type: "string",
			description: "The card id/concept just assessed.",
		},
		correctness: {
			type: "string",
			enum: ["correct", "partial", "incorrect"],
			description: "Assessment result for the learner's answer.",
		},
		assisted: {
			type: "boolean",
			description: "True if the learner received assistance before answering or was in learning mode.",
		},
		evidence: {
			type: "string",
			minLength: 1,
			description: "Nonempty note explaining the observed answer or skip/assessment basis.",
		},
	},
	required: ["concept", "correctness", "assisted", "evidence"],
};

function projectPath(ctx, file) {
	return path.join(ctx.cwd, file);
}

function readCards(ctx) {
	const fullPath = projectPath(ctx, CARDS_FILE);
	const cards = JSON.parse(fs.readFileSync(fullPath, "utf8"));
	if (!Array.isArray(cards)) throw new Error(`${CARDS_FILE} must contain an array`);
	for (const card of cards) {
		if (!card || typeof card.id !== "string" || typeof card.question !== "string" || typeof card.answer !== "string") {
			throw new Error(`${CARDS_FILE} contains a card without id, question, or answer`);
		}
	}
	return cards;
}

function readCurrentAttempts(ctx, validIds) {
	const latest = new Map();
	const fullPath = projectPath(ctx, ATTEMPTS_FILE);
	if (!fs.existsSync(fullPath)) return latest;

	const lines = fs.readFileSync(fullPath, "utf8").split(/\r?\n/);
	for (const line of lines) {
		if (!line.trim()) continue;
		try {
			const record = JSON.parse(line);
			if (record && validIds.has(record.concept)) latest.set(record.concept, record);
		} catch {
			// Leave old malformed lines untouched, but do not let them drive scheduling.
		}
	}
	return latest;
}

function selectCards(cards, latest, now) {
	const due = [];
	const unseen = [];

	for (const card of cards) {
		const current = latest.get(card.id);
		if (!current) {
			unseen.push({ card, mode: "learning" });
			continue;
		}

		const dueAt = new Date(current.dueAt).getTime();
		if (Number.isFinite(dueAt) && dueAt <= now.getTime()) {
			due.push({ card, mode: "review" });
		}
	}

	return [...due, ...unseen];
}

function compactCard(item) {
	return {
		id: item.card.id,
		mode: item.mode,
		question: item.card.question,
		answer: item.card.answer,
		sources: item.card.sources || [],
	};
}

function startPrompt(items) {
	const counts = items.reduce(
		(acc, item) => {
			acc[item.mode] += 1;
			return acc;
		},
		{ review: 0, learning: 0 },
	);

	return `Start an Academy Tutor practice session.

Session queue, in required order:
${JSON.stringify(items.map(compactCard), null, 2)}

Tutor instructions:
- Teach these cards one at a time, in the given order. Review-mode cards come first; learning-mode cards follow.
- For a learning-mode card, briefly explain the concept, then ask exactly one question. Treat the resulting assessment as assisted unless the learner independently demonstrates the answer before help.
- For a review-mode card, ask the question before explaining.
- Assess the learner against the card answer, not outside knowledge. Mark correctness as correct, partial, or incorrect.
- If sources are useful, offer the listed published source links after assessment or when asked.
- If the learner skips a card, do not call record_attempt for that card; move on if another card remains.
- If the learner asks to stop, stop without recording unassessed cards.
- After each real assessment, call record_attempt with the card id, correctness, assisted boolean, and nonempty evidence. Never record the same card twice.
- After record_attempt returns, continue to the next remaining concept id. When none remain, finish with a brief summary.

This session has ${counts.review} review card(s) and ${counts.learning} learning card(s). Begin now with the first card.`;
}

function restoreTools(pi) {
	if (practice && Array.isArray(practice.previousTools)) {
		pi.setActiveTools(practice.previousTools);
	}
}

module.exports = function academyTutor(pi) {
	pi.registerTool({
		name: "record_attempt",
		label: "record attempt",
		description:
			"Record the learner's assessed Academy Tutor answer for a concept in the active /academy session. Do not use for skips.",
		parameters: RecordAttemptParams,
		executionMode: "sequential",

		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			if (!practice || !Array.isArray(practice.remaining)) {
				throw new Error("No active /academy practice session.");
			}

			const evidence = typeof params.evidence === "string" ? params.evidence.trim() : "";
			if (!evidence) throw new Error("evidence must be nonempty");

			const concept = params.concept;
			const index = practice.remaining.indexOf(concept);
			if (index === -1) {
				throw new Error(`Concept '${concept}' is not in this session's remaining queue or was already recorded.`);
			}

			const now = new Date();
			const days = params.correctness === "correct" && params.assisted === false ? 3 : 1;
			const record = {
				concept,
				correctness: params.correctness,
				assisted: params.assisted,
				evidence,
				reviewedAt: now.toISOString(),
				dueAt: new Date(now.getTime() + days * DAY_MS).toISOString(),
			};

			const attemptsPath = projectPath(ctx, ATTEMPTS_FILE);
			const { withFileMutationQueue } = await import("@earendil-works/pi-coding-agent");
			await withFileMutationQueue(attemptsPath, async () => {
				await fs.promises.appendFile(attemptsPath, `${JSON.stringify(record)}\n`, "utf8");
			});

			practice.remaining.splice(index, 1);
			const remaining = [...practice.remaining];
			const details = { saved: record, remaining };

			if (remaining.length === 0) {
				restoreTools(pi);
				practice = null;
			}

			return {
				content: [{ type: "text", text: `Saved attempt for ${concept}. Remaining concepts: ${remaining.join(", ") || "none"}` }],
				details,
			};
		},
	});

	pi.on("session_start", async () => {
		practice = null;
		pi.setActiveTools(pi.getActiveTools().filter((name) => name !== "record_attempt"));
	});

	pi.registerCommand("academy", {
		description: "Start Academy Tutor practice from cards.json",
		handler: async (_args, ctx) => {
			await ctx.waitForIdle();

			let cards;
			try {
				cards = readCards(ctx);
			} catch (error) {
				ctx.ui.notify(`Academy Tutor could not read ${CARDS_FILE}: ${error.message}`, "error");
				return;
			}

			const validIds = new Set(cards.map((card) => card.id));
			const latest = readCurrentAttempts(ctx, validIds);
			const selected = selectCards(cards, latest, new Date());

			if (selected.length === 0) {
				ctx.ui.notify("Academy Tutor: nothing is due and no unseen concepts remain. Come back when a review is due.", "info");
				return;
			}

			practice = {
				remaining: selected.map((item) => item.card.id),
				previousTools: pi.getActiveTools(),
			};

			pi.setActiveTools(["read", "record_attempt"]);
			pi.sendUserMessage(startPrompt(selected));
		},
	});
};
