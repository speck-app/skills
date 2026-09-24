# Speck skills

Skills for [Speck](https://speck.app), a community of app specs. An app on Speck is a prompt someone
can build from, a runnable single-file prototype, and a screenshot. These skills make one from the
app's own repo.

| Skill | What it does |
| --- | --- |
| [`speck-publish`](skills/speck-publish/) | Reads the repo, writes the prompt and the prototype, shoots the screenshot, and publishes a draft to Speck for you to check |

## Install

One line, whichever agent you use:

    npx skills add speck-app/skills

That puts the skill where Claude Code, Codex and Cursor look for it. Claude Code can also install it
as a plugin:

    /plugin marketplace add speck-app/skills
    /plugin install speck-publish@speck

You will need a token from [API tokens](https://speck.app/settings#tokens) in your Speck settings.
Put it in `SPECK_TOKEN`, or in `~/.config/speck/token` with mode 0600. Never in the app's repo.

Then, from inside the app's repo: "publish this to Speck".

## What it produces

A tracked `.speck/` folder at the repo root: `entry.json`, `prompt.md`, `prototype.html`,
`screenshot.png`, and `app.json`, written once the draft exists and before the uploads. You edit the
first two by hand between runs; a re-run revises them rather than starting over. See
[the skill](skills/speck-publish/SKILL.md).

## The scripts

Four, under `skills/speck-publish/scripts/`, Node 20 or later, nothing to install:

| Script | Job |
| --- | --- |
| `check.mjs` | Loads the prototype headless; fails on a console error or horizontal overflow at 320 px |
| `shoot.mjs` | Renders the prototype to a 1600x1000 PNG, framed as a device for mobile, tablet and extension apps |
| `datacheck.mjs` | Lists contact-shaped strings outside the reserved example shapes as failures, and person names and money as questions to ask the author |
| `publish.mjs` | `lookups`, `whoami`, `build`, `publish`: the client for Speck's API |

`check.mjs` and `shoot.mjs` need a Chrome, Chromium, Brave or Edge on the machine and say where they
looked when they find none. They write their temp files to the system temp directory and remove them
when they finish.

## Testing a change

    node --test

`SPECK_URL=http://localhost:3000` points `publish.mjs` at a local Speck. Plain http is refused for
any host but this machine.

The scripts have tests. The prose does not, and the way to test it is the way it was written: run
"publish this to Speck" on a real app repo with the skill uninstalled, write down what the agent
got wrong, write the guidance against those failures, and run again with the skill on. Guidance
written by guessing what an agent will do reads well and does not bind.

## Licence

MIT.
