# The prototype

One self-contained `.html` file. No build step, no dependencies, no network requests, no analytics.
It runs by opening the file, and it runs inside a sandboxed iframe on the site, where storage APIs
throw and network calls are blocked. Speck's house rules are the sandbox's rules, written down.

**No URL in the file points off-site.** Speck refuses the upload otherwise, naming the line. Every
link goes to `#` or to a screen inside the prototype. Nothing loads from a CDN: no `<script src>`,
no Google Fonts `<link>`, no image or CSS `url()` from another host. Inline what the prototype
needs (a system font stack, an SVG, a `data:` image), since the sandbox would block the request
anyway. No `<meta http-equiv="refresh">`, and no `location = "https://…"` or `window.open(…)` to
another site. URLs as plain text are fine: in a comment, in sample data, in the license header of
an inlined library.

## What it is

A working, clickable model of the app that a stranger can explore in ninety seconds and come away
knowing what the app is. A demo, not a port.

## How much to build

However many screens it takes to show the app. There is no target number. The test for any screen:
does it show something the others do not? A different kind of information, layout or state, build
it. The same layout with different content, do not.

**Lists render at a length that looks used.** Five rows read as a stub where the real app shows
thirty. Use the length: a name long enough to wrap, one with no image, one overdue, one mid-action.

**Detail screens share content.** Tapping any row can land on the same few detail payloads, chosen
to cover the shapes the detail view takes. The visitor is learning what the view is, not which
record they hit.

**States**: build the interesting ones (empty, error, over-limit, mid-flight, the one weird case the
app exists for) and skip permutations that teach nothing.

File size follows this. A one-screen app lands near 20 KB; a multi-tab app with sheets and a long
list lands past 50 KB, and that is right.

## Move through it the way the app does

Nothing appears inside the app that a user of the real app would not see. No sample-data note, no
demo banner, no reset button, no extra tab. Refresh is the reset. A comment in the source says the
data is invented; the interface does not.

Move between screens with the app's own tab bar, rows, back buttons and sheets. If a screen is
reachable in the app, it is reachable here by the same route.

**The one exception: a persona bar.** An app that looks different to different people (a family
board, a noticeboard with an owner) may carry a thin strip outside the app: `<div
data-proto-chrome>Viewing as: <button>Parent</button> <button>Kid</button></div>`. Persona or
account state only, never navigation or a reset, visually apart from the app. The screenshot script
hides it.

## The app's proportions

**Never widen an app to fill the frame, and never draw a window, bezel or title bar around it.**

- A phone app is a phone-width column (390 px) centred on the app's own full-bleed background:
  `body { background: var(--paper) } .screen { max-width: 390px; margin-inline: auto }`.
- A utility window is a 420 px column the same way.
- A tablet app fills a 4:3 panel; a desktop app fills a 16:10 panel.
- A browser extension is its popup at its true size, commonly 360 to 420 px wide.
- A web app uses its real breakpoints and is responsive the way the app is.
- A CLI or a bot is a browser stand-in: a terminal or a chat, at the width that suits it.

The site frames a mobile, tablet or extension prototype as a device and shows the rest in a 16:10
panel. The screenshot script does the same, reading `platformSlug` from `entry.json`. For a web,
desktop, CLI or bot app that wants a narrower window than 1120 px, say so in the head:

```html
<meta name="speck:shot-width" content="640">
```

640 suits a utility window or a bot's chat, 960 a terminal, 1120 (the default) the 16:10 panel.

## Palette

Every prototype has its own colour, and it lives in one place. The first rule in the style sheet is
a `:root` block of named tokens: `--paper`, `--ink`, `--muted`, `--accent`, and where the app has
them `--accent-2` and `--field`. Every colour in the file is drawn from them, the same tokens are
redefined under `prefers-color-scheme: dark`, and a comment above the block says the palette is one
choice and what it is. One accent with a job; a second only where a second job exists. The prompt
never names a colour value: the prototype's palette is the builder's to keep or change, and the
tokens are how.

## The content

**The interface: reproduce it.** Labels, headers, button text, empty states, error messages, the
app's own vocabulary.

**The records: invent them.** Same shape and edge cases as the real thing, different content.

- Never from production. Schema yes, rows no. → SKILL.md
- Money: invented, round, obviously illustrative, in the currency the real app uses.
- People: if they might be the author's family or contacts, ask before using or replacing.
- Contact details are invented and use reserved shapes only: addresses at `example.com`, `.test`
  or `.invalid`, phone numbers in the 555-01xx block, no street addresses or coordinates.
- Dates are offsets from today, never calendar literals, built from local date parts or at noon so
  a timezone cannot shift a day. Pin any clock the interface depends on.
- No autofocus on load: it scrolls the page the prototype is embedded in.
- Where the real app calls the OS (contacts, clipboard, a file dialog, notifications), fake it
  inline and say so in a comment.

## State is in memory, refresh resets

All state in a plain JS object for the life of the page. No `localStorage`, no `sessionStorage`,
no cookies, no `IndexedDB`, no network. The sandbox throws on all of them. Every visitor arrives at
the version you designed.

## Fidelity checklist

- Palette, type, radii, density and dark or light match what the repo says.
- Interactions feel like the platform: sheets rise, rows highlight, toggles snap.
- Real behaviour: buttons do the thing, totals recompute, screens change.
- No device chrome.
- No off-site URL in an `href`, `src`, CSS `url()` or navigation: links go to `#`.
- 44 px minimum targets, visible `:focus-visible`, `prefers-reduced-motion` honoured, labels on
  icon-only controls, no horizontal scroll at 320 px.

## Before you call it done

```bash
node <skill>/scripts/check.mjs .speck/prototype.html
```

fails on a console error or on horizontal overflow at 320 px. Then drive it yourself in a browser:
every view by the app's own navigation, the primary action, a reload back to the seeded state, zero
console errors. The script is the floor.
