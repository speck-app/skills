# The prompt

`prompt.md` is what Speck exists to give away. Someone hands it to their coding agent on a machine
with no access to this repo and gets a working app that is recognisably the same idea. It is also
edited by hand afterwards, so it reads like a person wrote it.

It travels on its own. The site's build flow tells the agent to fetch the prototype, how closely to
match it, and what kind of mock it is for the app's platform, so **the prompt never introduces the
prototype**. A paragraph doing that would repeat the site or contradict the fidelity the builder
chose.

On a re-run, revise, do not regenerate. → SKILL.md, "Re-runs revise, they do not regenerate".

## Shape

First person, opening "Build me a ...". An opening paragraph that works alone, then the sections
below, in this order. About 600 words all in, one paragraph or bullet per line. Past 900, cut.

**No hard wraps.** A paragraph is one line however long, and so is a bullet. The site shows the
prompt in a column narrower than eighty characters, on the app page and in the edit box, and a
file wrapped at eighty wraps a second time there, mid-sentence. `datacheck.mjs` fails a wrapped
file.

```markdown
Build me a <plain description> as a <platform class>. <Three to six sentences: what it is, the one idea that makes it this version and not the generic one, and what the first screen shows.>

## Ask me first

<At most three questions, a sentence or two each: the question, the options, and the one to pick on "you choose". Only about things the builder may not have or want (an account, a paid service, a server, a permission), where data lives, or a real tradeoff. Never framework or styling. Leave the section out if there is nothing to ask.>

## What I want

<The screens and the one idea, in four or five short paragraphs, each opening with the screen's name in bold. Top to bottom, what is on each and why.>

## What it is not

<About five bullets. This section does more work than any feature list.>

## Rules that matter

<The opinions a builder would not guess. One tap, not two. Nothing refused when sorting does the job. The data model as one bullet: tables and fields. Storage as what it guarantees. The empty state as one line. Accessibility as one line.>

## How it should feel

<Two or three sentences: the mood, the density, what one colour is for. No hexes; the prototype's palette is the builder's to keep or change.>
```

## The rules

- **Name a platform class, not an operating system.** "A native mobile app", "a desktop app". The
  builder picks the OS. OS specifics only as examples: "the Contacts framework on iOS, the Contacts
  Provider on Android".
- **Ask for storage by what it guarantees**, then one sentence naming the obvious engine: "one local
  file in the app's own data directory, no network. SQLite is the obvious choice; use the platform's
  standard local store if it has one." Give the data model as tables and fields. An app that needs
  no storage says so.
- **A web app states its data guarantee instead**: who can see what, what is public, what survives.
  Sign-in and hosting are "Ask me first" questions.
- **Nothing is refused when sorting can do the job.** A deal with no next step is not blocked; it
  sorts to the top and says so. A rule the list enforces by order needs no error state.
- **The real app starts empty**, always, with a one-line empty state saying what to press. Only the
  prototype carries invented data. Seeded examples are work the builder has to clean out.
- **An alternative is offered only inside "Ask me first".** Speck's build flow reads the whole prompt
  and turns questions into click-to-answer choices, so "a plain text file is a fair alternative" in a
  storage rule comes back as a question about file formats. Outside that section the spec names no
  vendor and reads correctly whichever option is picked.
- **A choice that has to be seen is made during the build**, not before it: "stop, show me two or
  three rendered designs, and build the one I pick."
- **What goes first when cutting**: anything a sensible builder decides the same way unprompted
  (how long an undo bar stays, how a CSV quotes a comma), anything the prototype already shows,
  refusals nobody would think to build, and a keyboard map written as prose.

## What must not be in it

- File paths, module names, class names or schema DDL from the real app. It describes behaviour.
- Any real data, real amount or personal detail. Sample tables are as public as everything else.
- Credentials, project refs, bucket names, endpoints. Ever.
- Migration history, internal architecture decisions, the name of the framework it was built in.
- A licence header. The site's licence covers every prompt.

## Voice

First person, specific, with views. "Logging is one tap with no confirm step, because an app that
takes six taps is an app I stop using by Thursday", not "the application shall provide efficient
logging". Short paragraphs; a human is going to edit this. → `style.md`

## An example, in full

Thirty-two lines and about 620 words, for a phone app, each paragraph and bullet on one line. Note what it does not say:
nothing about the prototype, no hex values, no framework, no file layout.

```markdown
Build me a habit tracker as a native mobile app, and make the whole of it one screen of round buttons. One button per habit, an emoji I chose inside the circle and the habit's name under it. A habit I have not done today is gray. I tap it and it lights up. So the day starts as a screen of gray circles and ends as a screen full of color, and that is the only feedback there is: no streaks, no scores, no percentages, nothing that turns a missed Tuesday into a number.

## What I want

**Today.** The date at the top, then the grid, three circles to a row, in the order I put them in. Tapping one marks the habit done for today and lights it up. Tapping it again undoes that. There is no save, no confirmation and no undo bar, because the tap is the undo. Nothing else lives on this screen.

**Adding and editing.** The last cell of the grid is a circle with a plus in it. It opens a short form: the name, the emoji picked with the system emoji keyboard, Save. Pressing and holding a habit opens the same form filled in, with Delete at the bottom. Delete says how many marked days go with the habit and asks once.

**Progress.** The second tab is the list of habits. Tapping one opens that habit on its own, a month at a time, with arrows for the month before and after: a calendar where the days I did it are filled in. Tapping an earlier day marks or unmarks it there too. With no habits yet the tab says so and sends me to Today.

**Export.** A button at the bottom of the list writes a CSV of everything and hands it to the system share sheet: `date,habit`, one row per day I marked something, oldest first. Until something is marked the button is grayed out.

## What it is not

- No streaks, no completion rate, no weekly score, no badges.
- No goals or targets: a habit is done or it is not, never three of five times.
- No reminders, no notifications and no widgets.
- No accounts, no sync, no backup service, and no network permission asked for.
- No notes, no photos, no mood, no time of day, and no settings screen.

## Rules that matter

- A native mobile app for whichever platform it is built for, with the two tabs in that platform's own tab bar and the CSV going out through its share sheet.
- Storage is one local file in the app's own data directory. SQLite is the obvious choice; use the platform's standard local store if it has one. Two tables. `habits`: id, name, emoji, position, created. `marks`: habit id and `day` as a local date, one row per day a habit was done, unique on the pair.
- The day is the phone's local date, re-read whenever the app comes to the front, so a tap at five past midnight lands on the new day.
- A habit with no name is the one thing Save refuses. Two with the same name are both fine.
- It starts empty: one plus circle and one line, "No habits yet. Press + to add one."
- Accessibility: the circles follow the system text size, each reads as its name and whether it is done today, and press-and-hold is offered as a screen reader action.

## How it should feel

Like light switches by the door. Big targets a thumb hits without aiming, one color doing the done state and nothing else using it, and a screen that fills with color as the day goes on.
```
