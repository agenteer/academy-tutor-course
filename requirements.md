# Academy Tutor — requirements

We wrote these requirements for the Academy Tutor project in this course. They describe what we want to build, whether we write the implementation ourselves or ask a coding agent to write it.

1. **Teach new concepts.** Explain a concept, then ask the learner a question about it.
2. **Test recall during review.** Ask the question before giving an explanation or hint.
3. **Keep a learning record.** Save each attempt’s concept, assessment, whether help was given, and evidence from the learner’s answer. Keep earlier attempts.
4. **Schedule another review.** Set the next review for three days after a correct answer without help; otherwise, one day.
5. **Choose appropriate practice.** Use the latest attempt for each concept. Review due concepts before introducing unseen ones; skip concepts whose review date is still in the future.
6. **Stop when there is nothing to practice.** If no concept is eligible, start no lesson and make no model call. The extension stays in Pi; the standalone app closes.
