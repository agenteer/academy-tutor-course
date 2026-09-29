# Academy Tutor — AI agent harness course

Build a small tutor agent while learning how its harness works. Inspect Pi’s model/tool loop, build a Pi extension, generate an SDK application, then explore adaptation and background execution with Prime Agent.

Here you’ll find the starting files, complete examples, setup commands and tests for the course. The [tutor requirements](requirements.md) describe what we are building.

Read the [written course](https://agenteer.com/resources/build-your-own-ai-agent-harness/) for the concepts and step-by-step explanation. Watch the [hands-on video course](https://youtu.be/bYkJFfQANzc) for the live build and troubleshooting.

The demonstration uses macOS, Node.js 24, Pi 0.87.1 and Prime Agent 0.9.6. Both Pi and Prime are pinned to those versions for the course. Use any editor. LazyVim and Nix are optional, and you need your own supported model connection.

## Get the files

On the course repository’s GitHub page, choose **Code → Download ZIP** and extract it, or use **Code** to copy the repository’s clone URL and clone it. These are alternatives; cloning does not require unzipping. A GitHub ZIP may include a branch suffix in its folder name.

For the demonstrated paths, name the downloaded folder `academy-tutor-course` and place it in `projects` inside your home folder. If you choose another location, use your own path. Preserve an existing course folder containing your work.

```text
academy-tutor-course/
  README.md
  requirements.md
  starter/
    cards.json
    tracer.ts
  reference/
    tutor.js
    tutor.mjs
  comparison/
    generation-prompt.md
    behavior-checks.mjs
  examples/
    examples.md
    pi-generated/tutor.js
    sdk-generated/tutor.mjs
    prime-tutor/index.ts
```

There is no prebuilt `academy-tutor` project in this download. You create it during the course; npm creates its package files and installs its dependencies.

## Prerequisites

| You need | Installation help |
| --- | --- |
| Node.js 24, including npm and npx | [Node.js downloads](https://nodejs.org/en/download) |
| A terminal and an editor | Use your existing tools; LazyVim is optional |
| A supported model connection | [Pi providers and models](https://github.com/earendil-works/pi/blob/v0.87.1/packages/coding-agent/docs/models.md#choose-a-connection) |
| uv, for the Prime section | [Astral’s uv installation guide](https://docs.astral.sh/uv/getting-started/installation/) |

Optional Mac setup route: [the Nix setup video](https://youtu.be/V6F_JJnnKLI), [written walkthrough](https://agenteer.com/learn/tutorials/mac-setup-agentic-engineering/) and [configuration](https://github.com/agenteer/dotfiles). You do not need to replace a working environment. jq is optional; you can ask the coding agent to read and explain the saved files.

At your shell, run these lines separately:

```sh
cd ~/projects/academy-tutor-course
pwd
ls
node --version
npm --version
```

Expect the resource folders above and version numbers. If a tool is not found, install it using the relevant link, reopen the terminal and retry.

## Create the project and install Pi

From the course root, run one line at a time. If `academy-tutor` already exists, preserve it and use a fresh course copy for a new run. Stop if `mkdir` fails; do not continue to the copy command.

```sh
mkdir academy-tutor
cp starter/cards.json starter/tracer.ts academy-tutor/
cd academy-tutor
npm init -y
npm install --save-exact @earendil-works/pi-coding-agent@0.87.1
npx pi --version
npx pi
```

`npm init -y` creates project metadata with default answers. The next command installs Pi locally at an exact version so the later SDK app can import it. Expect `0.87.1` before launching. Pi’s [official site](https://pi.dev/) also documents a global installation for everyday use.

Inside Pi, `/login` connects a provider and `/model` selects a model. A local package installation does not reset user authentication, settings or extensions in `~/.pi/agent`. Do not display credentials. `!!npx pi --version` checks the project executable from Pi’s input without adding the output to model context; a single `!` includes the output.

## Run the complete Pi examples

After installing Pi and connecting a model above, you can run the supplied examples directly. Exit Pi with `/quit` first. These commands create separate folders inside `academy-tutor`, using its installed dependencies and keeping each example’s learning history separate from your own implementation.

Run each line separately. If either `mkdir` reports that the folder already exists, stop before copying: use the existing example or choose a new folder name.

**Extension:**

```sh
cd ~/projects/academy-tutor-course
mkdir academy-tutor/reference-extension
cp reference/tutor.js starter/cards.json academy-tutor/reference-extension/
cd academy-tutor/reference-extension
npx pi -e tutor.js
```

Enter `/academy` inside Pi to begin. Use `/quit` to leave Pi.

To check this reference extension, return to the parent project where Pi is installed:

```sh
cd ~/projects/academy-tutor-course/academy-tutor
node ../comparison/behavior-checks.mjs reference-extension/tutor.js
```

The checker uses temporary course data and writes `behavior-results.json` in `academy-tutor`.

**SDK application:**

```sh
cd ~/projects/academy-tutor-course
mkdir academy-tutor/reference-sdk
cp reference/tutor.mjs starter/cards.json academy-tutor/reference-sdk/
cd academy-tutor/reference-sdk
node tutor.mjs
```

Practice starts when the app launches. Type `/quit` at its `You:` prompt to exit. Both examples create `attempts.jsonl` in their own working folder after an answer is assessed.

## Optional: Vim editing in Pi

Find [pi-vim](https://pi.dev/packages/pi-vim) in [Pi’s package catalog](https://pi.dev/packages). Exit Pi with `/quit`, then run these commands from your tutor project:

```sh
npx pi install npm:pi-vim
npx pi list
npx pi --continue
```

The package is added to your Pi user configuration. Restarting loads it; `--continue` returns to your last conversation. In Pi’s input box, Escape switches to Normal mode and lowercase `i` switches to Insert mode. You can follow the course without this extension.

## Install Prime when you reach that section

Check `uv --version` first; use the installation link above if it is missing. Use [Prime’s official installer](https://github.com/PrimeIntellect-ai/prime-agent#install) with the course version:

```sh
curl --proto '=https' --proto-redir '=https' -fsSL https://app.primeintellect.ai/prime-agent/install.sh | PRIME_AGENT_VERSION=0.9.6 sh
prime-agent --version
```

`PRIME_AGENT_VERSION=0.9.6` selects the release for the installer process; it does not permanently set a shell variable. Expect `0.9.6` before continuing. The installer supports this setting in its [official source](https://github.com/PrimeIntellect-ai/prime-agent/blob/v0.9.6/install.sh).

## Find the files for each part of the course

Paths in this table are relative to the downloaded course root. “Created” means produced during your own run, not included in the download.

| Activity | Files to use or inspect |
| --- | --- |
| Prepare tools and editor | This setup reference |
| Install and try ordinary Pi | `starter/cards.json` — the material we ask Pi to teach |
| Launch the observer | `starter/tracer.ts`, copied into your project |
| Inspect model requests | Created `academy-tutor/trace/latest/trace.log` and `request-*.json` |
| Connect source to trace | `academy-tutor/tracer.ts` alongside its `trace/latest/trace.log` |
| Build and run the extension | [reference/tutor.js](reference/tutor.js), [tutor requirements](requirements.md) |
| Ask Pi to generate and compare | [generation brief](comparison/generation-prompt.md), [extension checker](comparison/behavior-checks.mjs); created sibling `academy-tutor-generated` |
| Read the reference, generate and use the SDK app | [reference/tutor.mjs](reference/tutor.mjs); created `academy-tutor/sdk-app` and its `review-demo` |
| Install Prime Agent | [Official installer](https://github.com/PrimeIntellect-ai/prime-agent#install); verify the installed version |
| Port and run the tutor | Created `academy-tutor/.prime/agent/extensions/prime-tutor/index.ts`, with its own cards and history; keep `record_attempt` with Prime’s `ipython` tool |
| Save feedback and inspect later context | Prime’s saved teaching instructions and the context sent in a new session |
| Inspect automatic refinement | Created `adaptation-demo` beside `academy-tutor`; remove the temporary project interval afterward |
| Observe scheduled, detached execution | Created `scheduled-review` beside `academy-tutor`, with test data and its own named background agent |

The `reference` folder contains the complete extension and SDK app. The [additional course implementations](examples/examples.md) contain the alternative Pi extension, SDK app and Prime adaptation, with run instructions and differences to inspect. Both groups were developed with AI. If you get stuck building your version, you can use these examples to continue.

Your generated extension may use a different layout. For the Prime layout above, start Prime from `academy-tutor`; it discovers the extension under `.prime/agent/extensions`. After creating or changing it, use `/reload`, then `/academy`.

## Command reference

These are shell commands. Run them from the project containing the relevant file. Leave Pi with `/quit` first. In Prime, wait for the response to finish, clear the input, and press Ctrl+D to return to the shell. This detaches the interface and leaves its worker running; `prime-agent list` shows workers, and `prime-agent stop <agent>` stops the one you identify by its listed name or ID.

| Purpose | Directory | Shell command |
| --- | --- | --- |
| Coding assistant | `academy-tutor` or `academy-tutor-generated` | `npx pi` |
| Trace ordinary Pi | `academy-tutor` | `npx pi -e tracer.ts` |
| Run a tutor extension | Either tutor project containing `tutor.js` | `npx pi -e tutor.js` |
| Check the extension | Either tutor project, with local Pi installed | `node ../comparison/behavior-checks.mjs tutor.js` |
| Run the generated SDK app | `academy-tutor/sdk-app` | `node tutor.mjs` |
| Run its one-card review copy | `academy-tutor/sdk-app/review-demo` | `node tutor.mjs` |
| Run the recorded Prime tutor | `academy-tutor` | `prime-agent` |

Inside a tutor extension, `/academy` starts practice. The SDK app starts practice on launch. The extension checker uses test data, makes no model calls and saves its results in `behavior-results.json`.

The supplied checker loads a Pi extension; it does not run an SDK application. For the SDK comparison, ask the coding agent to adapt the checks to test the same applicable [requirements](requirements.md) against both the reference and generated apps, using temporary data and no model calls. Include syntax, empty-course, future-only review and invalid-date checks. Ask it to explain a test and show the actual results. Then use the tutor yourself to try new learning and due review; the program checks do not assess the quality of its teaching.

Inside Prime, `/system-prompt` shows its instructions, `/refine` reviews experience and updates saved guidance, and `/new` starts a fresh conversation. The course walks through these features and shows how to inspect the changes.

## Source documentation

- [Pi extensions](https://github.com/earendil-works/pi/blob/v0.87.1/packages/coding-agent/docs/extensions.md) — tracer hooks, commands and custom tools.
- [Pi SDK](https://github.com/earendil-works/pi/blob/v0.87.1/packages/coding-agent/docs/sdk.md) — embedding Pi in an application. Matching docs are also installed under `node_modules/@earendil-works/pi-coding-agent/docs/`.
- [Prime Agent](https://github.com/PrimeIntellect-ai/prime-agent) — installation and documentation for Prime’s tools and features.
- [Agenteer Academy](https://agenteer.com/learn/) — concepts behind the eight supplied cards; each card includes its specific sources.

## Your generated files

Traces can include full prompts and tool content. Keep histories, traces, credentials and local agent state private. The included `.gitignore` excludes the course’s working folders and common generated files. Inspect anything you explicitly choose to share.

## License

The code and accompanying repository documentation are available under the [MIT license](LICENSE). The separately published course video and website article retain their own rights.

Part of [Agenteer Academy](https://agenteer.com/learn/).
