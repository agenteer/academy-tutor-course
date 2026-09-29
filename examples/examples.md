# Additional course implementations

These files preserve the alternative Pi extension, SDK app and Prime adaptation developed during the course. The reference implementations were also developed with AI. Compare their design choices and behavior against the [tutor requirements](../requirements.md).

| Example | What to look at |
| --- | --- |
| [Pi extension](pi-generated/tutor.js) | Restores the prior active tools when practice finishes. It skips malformed history lines and concepts with invalid due dates; the reference reports errors instead. |
| [SDK application](sdk-generated/tutor.mjs) | Registers `record_attempt` through an inline extension factory and streams responses. It loads the default Pi resources, which can include your existing customization. |
| [Prime extension](prime-tutor/index.ts) | Uses `ipython` with `record_attempt`. Course data and learning history live beside `index.ts`. Prime supplies refinement and background scheduling. |

## Run an example

First complete the parent README’s Pi installation and model connection. The following folders are separate from the projects you create during the build. Run each line separately; if a folder already exists, choose a new name before copying so you preserve its files.

For the additional Pi extension:

```sh
cd ~/projects/academy-tutor-course/academy-tutor
mkdir pi-example
cp ../examples/pi-generated/tutor.js ../starter/cards.json pi-example/
cd pi-example
npx pi -e tutor.js
```

Enter `/academy` to start. After leaving Pi with `/quit`, check the extension from its parent project, where Pi is installed:

```sh
cd ..
node ../comparison/behavior-checks.mjs pi-example/tutor.js
```

For the additional SDK app, from the course’s Pi project:

```sh
cd ~/projects/academy-tutor-course/academy-tutor
mkdir sdk-example
cp ../examples/sdk-generated/tutor.mjs ../starter/cards.json sdk-example/
cd sdk-example
node tutor.mjs
```

Practice starts on launch. Enter `/quit` at the app’s prompt to exit.

For Prime, first follow the parent README’s Prime installation and connect your model. Use a separate project:

```sh
cd ~/projects/academy-tutor-course
mkdir prime-example
cd prime-example
mkdir -p .prime/agent/extensions/prime-tutor
cp ../examples/prime-tutor/index.ts ../starter/cards.json .prime/agent/extensions/prime-tutor/
prime-agent
```

Prime discovers the extension when launched from `prime-example`. Enter `/academy`. Its history is created at `.prime/agent/extensions/prime-tutor/attempts.jsonl` after a saved attempt. If you change the extension while Prime is open, use `/reload` before restarting practice.

## What the checks establish

The additional Pi extension passes the seven contract checks; the separate invalid-date probe reports a difference because it omits the affected concept. The SDK’s empty-course, future-only and invalid-date cases pass without calling a model. These checks exercise program behavior. Use the tutor yourself to judge its explanations and assessments. The supplied extension checker does not load the SDK or Prime extension.
