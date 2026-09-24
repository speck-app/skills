# Extracting the app's design language

The prototype has to look like the app. This is the one thing to take from the repo: the design,
never the data.

Signal varies a lot between repos. One documents its gradient stops and accent in a design note;
another has fifty hex literals in a companion web page; a native app can have none at all, only an
asset catalogue. Work the cascade until something answers, and stop at the first source that gives
you a palette.

## The cascade

1. **Written design notes.** A README, `docs/`, `design/`, an agent instructions file. Grep for
   `color|colour|accent|font|radius|gradient|theme|design`. When these exist they are exact.
2. **An existing web surface.** Any `.html` or `.css` in the repo: a companion site, a handoff, an
   extension popup. The highest-value source, since it is already the medium. Lift palette, type
   scale, spacing and component shapes wholesale.
3. **Design mockups.** `design/`, `mockups/`, `screens/`. Take layout, palette and copy freely. The
   names in them may be real people (mockups are where a designer reaches for family), so treat
   person names as something to ask about.
4. **Colour literals in source.**
   ```bash
   grep -rhoE 'Color\(hex: *"[0-9a-fA-F]{6}"\)|#[0-9a-fA-F]{3,8}|rgba?\([^)]*\)' . \
     --include='*.swift' --include='*.kt' --include='*.css' --include='*.js' --include='*.ts' \
     --include='*.tsx' --include='*.html' --include='*.dart' | sort | uniq -c | sort -rn | head -30
   ```
   Frequency approximates importance: the most repeated value is usually the background or the
   accent.
5. **Asset catalogues** (Apple): `Assets.xcassets/**/Contents.json`, components as floats 0 to 1.
   Multiply by 255 and round. Check for a dark appearance.
6. **System defaults.** If the app overrides nothing, it looks like stock SwiftUI, stock Material,
   stock web. That is the design; reproduce the platform's defaults rather than inventing a look.
7. **Nothing at all.** Choose a palette that suits the domain, build it well, and say in your
   summary that you chose it.

## Also worth extracting

Type (face, weights, tabular numerals for anything that counts). Shape (radii, border weights,
strokes or fills). Density (row heights, padding rhythm). Motion (usually little; match that).
Dark or light, and whether both.

## Per-platform idiom

Match the idiom, not the chrome.

- **Mobile**: safe-area rhythm, a tab bar if the app has one, sheets that rise, 44 px targets.
- **Desktop**: denser rows, real tables with headers, sidebars, toolbars, hover, keyboard focus.
- **Browser extension**: a popup is small; build it at its true size.
- **Web**: responsive, and it survives a phone width.
- **CLI, bot**: a terminal or a chat as the stand-in, monospace where the real thing is.

## Sanity check

Put the prototype next to whatever real reference exists. Someone who uses the app should recognise
it at once. If they would recognise it because of the content rather than the design, you took the
wrong thing.
