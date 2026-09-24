# The listing

`entry.json` is the app's page on Speck apart from the files: the card, the blurb under the name,
the description beside the prototype. Seven keys, all of them the author's copy on a re-run.

```json
{
  "name": "Habit Tracker",
  "blurb": "A grid of round emoji buttons, one per habit. Gray means not done yet, tap and it lights up. No streaks and no score.",
  "description": "A habit tracker for a phone, built as one screen of circles. ...\n\n... hands a CSV of every marked day to the share sheet.\n\n## What it doesn't do\n\nNo streaks, no completion rate, no weekly score, no badges. ... Counting how many times, instead of whether, is the obvious remix.",
  "categorySlug": "health-and-fitness",
  "platformSlug": "mobile",
  "tags": ["habits", "health", "routine"],
  "testedWith": "Codex, Sep 2026"
}
```

- **`name`**: up to 60 characters. The repo's name unless that is a codename.
- **`blurb`**: up to 160 characters, plain text, one or two sentences. The card and the search
  result. Say what it is and the one thing it does differently.
- **`description`**: markdown, up to 10,000 characters, and nowhere near it. Two paragraphs on what
  it does and the one thing it does differently, then `## What it doesn't do`, whose last line is
  the obvious remix. Second or third person by default. If the author gave a reason they built it,
  one or two sentences of it belong in the first paragraph, in their words. Nothing about
  motivation they did not say. No recap of the spec: people will play with the prototype and skim
  the prompt.
- **`categorySlug`**, **`platformSlug`**: one each from `node scripts/publish.mjs lookups`. The
  lists change; never carry them in your head.
- **`tags`**: up to ten, lowercase. What a visitor would search for: the subject (recipes,
  invoicing) and the app's one idea (pass-and-play, one-line-a-day). Not the platform (the listing
  shows it), not mechanics (keyboard, drag-and-drop, undo), not near-universal properties (offline,
  csv), not words lifted from the spec. None at all is fine.
- **`testedWith`**: the tool and month the author last built it with, "Codex, Sep 2026", or `null`.
  Ask; do not guess from the agent you are running in.

Write it the way you would describe the app to someone across a table. Real numbers off the screen,
the button's actual label. No design-essay register ("the constraint it is built around", "the
clever part is"), which reads as considered once and as a template by the eighth app. → `style.md`
