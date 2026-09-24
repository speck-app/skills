---
name: speck-publish
description: Use when publishing an app to Speck from its own repo, or updating a listing already there. "publish this to speck", "put this on speck", "make the speck entry", "update the speck listing", "republish to speck". Produces a prompt, a prototype, a screenshot and a listing in .speck/ and uploads them as a draft.
---

# Publishing an app to Speck

## What this does

Speck publishes apps by giving away **the spec, not the code**. Each app there is a prompt someone
can build from, a runnable single-file prototype, and a screenshot. This skill makes those from the
repo you are in and uploads them as a draft. The person then opens the draft, checks the prototype
renders, and presses Publish themselves. You never publish.

The prototype's job is to show the app. You cannot embed a real phone or desktop app in a web
page, so get as close as the medium allows: the real screens, the real layout, the real controls,
the real labels. Someone who uses the app should recognise it at once.

**The app's interface is not a secret. Its data is.** That is the whole line. Everything about how
the app looks and reads belongs in the prototype. What must never appear is anything out of a
running system.

## Copy the interface, freely

Reproduce these, because being timid here produces a generic mockup that shows nothing:

- Screen layouts, navigation, tab structure, sheet behaviour.
- Button labels, section headers, empty states, error messages, microcopy. The app's own strings,
  whatever they are; that is its voice.
- Palette, type, spacing, radii, density, motion.
- The rules and behaviour, modelled so the prototype works.
- Feature names, view names, the app's vocabulary.

## Never use data from production

**No exceptions.** Never read from, query, export or copy out of a live database, a backup, a dump,
an export, a synced device, an analytics dashboard, a real account, or a screenshot with live
records in it. Not to "get realistic values", not to "check the shape", not sampled, not
anonymised. Anonymising production data is handling production data.

If a file looks like one of those (`dump.sql`, `*-export.csv`, `backup/`, `prod-*`, a `.sqlite`
with rows in it), its schema is fine to read and its rows are not.

Three more rules with no exceptions:

- **No personally identifiable information.** No real names, emails, phone numbers, addresses,
  precise locations, health readings, or anything that identifies a person. If the app has a people
  concept and those people might be the author's family or contacts, ask (below).
- **Contact details are invented, in reserved shapes only**: addresses at `example.com`, `.test` or
  `.invalid`, phone numbers in the 555-01xx block, no street addresses or coordinates.
- **Money is invented.** An expense app has amounts in it, so invent round, obviously illustrative
  figures in whatever currency the app uses. Never a real amount, even an old one.

## When you cannot tell, ask

Plenty of apps hold nothing personal: a caffeine log is drinks and milligrams. Treating one as if it
did makes the prototype vaguer for no gain. **Do not manufacture concern.**

Seed and fixture data is usually invented already. Sometimes it is not. You cannot tell by looking,
and guessing is wrong in both directions. So when you cannot tell, **stop and ask the author**, once,
with everything batched, the candidates and where they came from:

> The seed data has five venue names and three first names. Are those invented placeholders I can
> keep, or real people I should replace? Everything else I am reproducing is interface copy.

Add to the same question anything else only they know: what tool they build with (`testedWith`),
and why they built it, if you want a sentence of that in the description.

`scripts/datacheck.mjs` scans the finished files for contact-shaped strings outside the reserved
shapes (a failure) and lists person names and amounts as questions. It prompts your judgment; it is
not a gate.

## The output

A tracked `.speck/` folder at the repo root:

```
.speck/
  entry.json        the listing: name, blurb, description, categorySlug, platformSlug, tags, testedWith
  prompt.md         the spec someone builds from → references/prompt.md
  prototype.html    one file, no dependencies, no network, state in memory → references/prototype.md
  screenshot.png    1600x1000, from scripts/shoot.mjs
  app.json          written by scripts/publish.mjs once the draft exists and again after the uploads; what makes a re-run an update, and what says when the repo last matched Speck
```

**Leave the folder tracked.** Do not add `.speck/` to `.gitignore` and do not suggest it. The
author edits `entry.json` and `prompt.md` by hand between runs, and on the site too, and a tracked
folder is what makes a re-run's changes, and a pull's, show up in `git diff` rather than land
silently.

Only those files are read by the site. Keep the prototype one file.

## Re-runs revise, they do not regenerate

When `.speck/` already exists, **pull first, then read every file in it** and treat its prose as
the draft you are revising. The author has almost certainly edited the words, in the repo or on
the site, and those edits are the point. `node <skill>/scripts/publish.mjs pull` brings the
listing, the prompt and the prototype down from Speck when they were changed there since the last
run, and says so; `publish` refuses to run until that has happened, so an edit made in the browser
is never uploaded over. After a pull, `git diff .speck` is the list of what was edited on the site.

**Author-owned copy, carried across verbatim** unless one of the cases below applies:

- every field in `entry.json`
- the prompt's prose: the opening paragraph, "Ask me first", "What I want", "What it is not",
  "Rules that matter", "How it should feel", and any section the author has visibly rewritten

**Two triggers license a rewrite:**

1. **The app's behaviour materially changed** and the text is now wrong: a screen that no longer
   exists, a rule that was inverted, a feature that shipped. Fix the part that became false. Do not
   restyle the sentences around it.
2. **The template changed**: `references/prompt.md` now requires a section the file lacks, or the
   file has a section the template dropped. Add or remove that section, nothing else. A section
   missing from an older file is not a template change unless the template now requires it.

A third case: a value the site now refuses (a category or platform slug gone from `lookups`, a
field over its limit), or a change the author asks for in this session. Change that value only,
and name it in the summary.

"I would have phrased it differently" is none of these. Regenerated freely: `prototype.html` and
`screenshot.png`; they are derived from the interface and rebuilding them is usually why you were
run. A prototype that a pull just changed was hand-edited on the site: carry those edits into the
rebuild, or ask before losing them. If the author hand-edited the prototype in the repo, say so in
the summary, because the rebuild loses it.

A re-run on an app that is already published updates its listing and replaces its files in place,
live, because the API's update and upload calls work on published apps too. "You never publish" is
about the first publish, not this step. Tell the person before you run publish that the app is live
and this run changes it, and say again in the closing summary that the live app changed.

**Say what you touched.** The closing summary names every field and section you changed and which
case above justified it, and says the rest was left alone.

## Never invent the author's reasons

The description may carry a sentence on why they built it. You can read their code; you cannot read
why they started. Everything about motivation comes from the author: a README, an earlier run's
text, or an answer in this session. Invented motivation reads well, which is the problem: a
spreadsheet that kept breaking, six apps tried and abandoned, used every day since. All plausible,
all fiction under their name. With nothing from them, say nothing about why.

## The token

`scripts/publish.mjs` reads `SPECK_TOKEN`, then `~/.config/speck/token`. With neither it prints the
settings URL and exits 2. Tell the person to mint a token under API tokens in their Speck settings
and put it in that file, mode 0600. Never write the token anywhere in the repo, never print it, and
never ask them to paste it into this conversation. Never read or print the token file either:
`whoami` is the check. If the person pastes a token into the conversation anyway, do not repeat it,
and tell them to revoke it and mint a new one.

## Script paths

The scripts sit in `scripts/` next to this file. Every command below runs with the app's own repo
as the working directory, so a path like `.speck/prototype.html` is relative to the app, while the
script itself is relative to wherever the skill was installed. `<skill>` in a command below stands
for that install location, the speck-publish skill's own directory, not the app's.

## Workflow

1. **Check the token**: `node <skill>/scripts/publish.mjs whoami`. It prints the username the draft
   will go under, or exits 2 with what to do.
2. **Pull, then read what is there.** If `.speck/app.json` exists, run
   `node <skill>/scripts/publish.mjs pull`: it fetches what was edited on Speck since the last run,
   or says the repo is up to date. It refuses over uncommitted changes in `.speck/`; commit them
   first. Then read all of `.speck/` before writing anything. → Re-runs revise, they do not
   regenerate.
3. **Identify the app**: its platform and its category, both from the lists
   `node <skill>/scripts/publish.mjs lookups` prints. The lists change; never carry them in your
   head. The platform sets the prototype's proportions and the prompt's wording.
4. **Extract the design language** from the repo. → `references/design-extraction.md`
5. **Inventory the views and assemble the content.** Reproduce the interface, invent the records.
   → `references/prototype.md`. Anything that might be a real person, amount or contact detail goes
   into the one batched question, now, before you build around it.
6. **Build the prototype**, then run `node <skill>/scripts/check.mjs .speck/prototype.html` and fix
   what it reports. Then open it in whatever browser you have and drive it: every screen by the
   app's own navigation, the main action, a reload back to the seeded state. The script cannot
   click; you can.
7. **Write or revise the prompt.** → `references/prompt.md`
8. **Write or revise `entry.json`.** → `references/entry.md`. `platformSlug` has to be right before
   the shoot step: the screenshot script frames a mobile, tablet or extension app as a device.
9. **Shoot**: `node <skill>/scripts/shoot.mjs .speck/prototype.html .speck/screenshot.png`. Look at
   the PNG. The interesting part of the first screen must be in the top of it.
10. **Datacheck**: `node <skill>/scripts/datacheck.mjs .speck`. It scans the finished files for
    contact-shaped strings outside the reserved shapes, a failure to fix, and lists person names
    and amounts as questions. Anything it raises that the batched question in step 5 did not
    already cover is a follow-up question to the author now; asking it here is not a breach of "ask
    once". Entries that are the app's own interface copy need no question.
11. **Check the copy you wrote or revised this run** against `references/style.md`: the blurb, the
    description, the prompt. Copy carried over verbatim from the author needs no re-check.
12. **Publish**: `node <skill>/scripts/publish.mjs publish`. It creates the app or updates it,
    writes `app.json` as soon as the draft exists, uploads the files, and prints the draft URL.
    If the person built this from an app on Speck and wants it listed as a remix, `--remix-of`
    writes something public, so ask before running it: what they built it with, and whether they
    want a one-line note. Tell them the "built with" line appears on the source app straight away,
    before the draft exists, because a remix on Speck is what a build becomes. The id is the eight
    characters after `/a/` in that app's URL. Then add `--remix-of <id> --tool "<what they built
    with>"` and, if they gave one, `--note "<one line>"`.
13. **Say what you did.** The draft URL on its own line at the end, with "open it, check the
    prototype, press Publish". Above it: what you reproduced and what you invented, and on a re-run
    every piece of copy you changed and which case justified it. Say which screens you drove and
    how; if you had no browser, say so plainly and tell the author to click through before pressing
    Publish.

## Common mistakes

- **Inventing in-app controls.** Nothing inside the app's interface that a real user would not see:
  no demo banner, no sample-data note, no reset button, no fake account switcher. Refresh is the
  reset. The one exception is a persona bar outside the app marked `data-proto-chrome`.
- **Sanding off the app's personality.** Placeholder labels and lorem copy fail the one job.
- **Drawing device chrome.** No bezels, notches, status bars or browser toolbars. The prototype is
  the app's screen, full bleed. The site frames it.
- **Widening a phone app to fill the frame.** A phone app is a phone-width column on the app's own
  full-bleed background. See `references/prototype.md`.
- **Truncating lists, or hand-authoring every detail screen.** Lists at a length that looks used;
  detail screens shared across rows.
- **Writing an implementation plan as the prompt.** The prompt describes behaviour and rules, not
  the repo's files, frameworks or schema DDL.
- **A prompt that introduces the prototype.** The site does that when someone builds. Do not.
- **Hard-wrapping the prompt.** One paragraph per line, one bullet per line. The site shows it in
  a column narrower than eighty characters, and a wrapped file wraps twice.
- **Skipping the drive.** A prototype that throws on click ships broken under the author's name.
- **Regenerating copy the author edited.** Read first, revise narrowly, say what changed.
- **Putting the token anywhere but the two places it lives.**
