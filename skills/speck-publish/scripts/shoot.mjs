#!/usr/bin/env node
// shoot.mjs: render the prototype to the card, always 1600x1000.
//
//   node shoot.mjs <prototype.html> <out.png> [--w N] [--entry path/to/entry.json]
//
// The picture is a render of the prototype on purpose: the card always matches what a visitor sees
// when they click through. What is chosen is the WINDOW. A 1600 px window at 1x makes a 420 px app a
// strip in an empty field; so the window is as wide as the app wants and the pixel density makes up
// the rest: 640 wide at 2.5x and 1120 wide at 1.43x both land on 1600. The prototype says which with
// <meta name="speck:shot-width" content="640">; 1120 without it; --w overrides both.
//
// A mobile, tablet or browser-extension app (platformSlug in entry.json, found beside the prototype
// unless --entry says otherwise) ignores the width. It is rendered as the device at its own size
// inside a frame page: a dark grey field, rounded corners, scaled to the field's height. That is how
// the site frames it, without drawing a bezel, and it needs no image library: the frame is HTML.
//
// Anything marked data-proto-chrome is hidden for the shot. Temp files go in the system temp
// directory and are removed afterwards.
import { readFileSync, writeFileSync, rmSync, existsSync, mkdirSync, mkdtempSync, statSync } from "node:fs";
import { dirname, resolve, join } from "node:path";
import { tmpdir } from "node:os";
import { findChrome, noChrome, runChrome, ChromeError, fileUrl, HIDE_CHROME, injectHead } from "./browser.mjs";

const OUT = { width: 1600, height: 1000 };
const DEFAULT_WIDTH = 1120;
const FIELD = "#3a3a38";
const FRAMED = {
  mobile: { width: 390, height: 844, radius: 36 },
  tablet: { width: 1024, height: 768, radius: 28 },
  "browser-extension": { width: 420, height: 525, radius: 14 },
};

const args = process.argv.slice(2);
const flag = (name) => { const i = args.indexOf(name); return i === -1 ? undefined : args[i + 1]; };
const positional = args.filter((a, i) => !a.startsWith("--") && !args[i - 1]?.startsWith("--"));
const [input, output] = positional;
const USAGE = "usage: node shoot.mjs <prototype.html> <out.png> [--w N] [--entry entry.json]";
if (args.includes("-h") || args.includes("--help")) { console.log(USAGE); process.exit(0); }
if (!input || !output) { console.error(USAGE); process.exit(2); }
const file = resolve(input);
const out = resolve(output);
if (!existsSync(file)) { console.error(`no such file: ${file}`); process.exit(2); }

const entryPath = flag("--entry") ? resolve(flag("--entry")) : join(dirname(file), "entry.json");
let platform;
if (existsSync(entryPath)) {
  try {
    platform = JSON.parse(readFileSync(entryPath, "utf8")).platformSlug;
  } catch (e) {
    console.error(`${entryPath} is not JSON: ${e.message}`);
    process.exit(2);
  }
} else if (!flag("--entry")) {
  console.log("No entry.json beside the prototype and no --entry, so shooting it as a 16:10 panel.");
}
const framed = FRAMED[platform];

const src = readFileSync(file, "utf8");
let width = DEFAULT_WIDTH;
if (!framed) {
  const declared = src.match(/<meta\s+name="speck:shot-width"\s+content="(\d+)"/i)?.[1];
  width = Number(flag("--w") ?? declared ?? DEFAULT_WIDTH);
  if (Number.isNaN(width)) { console.error("shot width must be a number"); process.exit(2); }
  if (!Number.isInteger(width) || width < 320 || width > OUT.width || width % 16 !== 0) {
    console.error(`shot width ${width} must be a multiple of 16 between 320 and ${OUT.width}`);
    process.exit(2);
  }
}

const chrome = findChrome();
if (!chrome) noChrome();
mkdirSync(dirname(out), { recursive: true });

const work = mkdtempSync(join(tmpdir(), "speck-shoot-"));
const temp = join(work, "prototype.html");
const frame = join(work, "frame.html");

let failed;
try {
  writeFileSync(temp, injectHead(src, HIDE_CHROME));
  if (framed) {
    // The device fills the field's height less a margin; the width follows from its proportions.
    // will-change:transform gives .device its own compositor layer. Without it, when the scaled
    // iframe holds a page with layers of its own (an element with will-change or a transform),
    // Chrome applies the rounded-corner clip to the root surface and leaves the pixels outside the
    // two right-hand corners transparent: 736 of them on one real prototype, none on the left.
    const ph = OUT.height - 60;
    const scale = ph / framed.height;
    const pw = Math.round(framed.width * scale);
    writeFileSync(frame, `<!doctype html><html><head><meta charset="utf-8"><style>
      html,body{margin:0;width:${OUT.width}px;height:${OUT.height}px;background:${FIELD};overflow:hidden}
      .device{position:absolute;left:${Math.round((OUT.width - pw) / 2)}px;top:${Math.round((OUT.height - ph) / 2)}px;width:${pw}px;height:${ph}px;border-radius:${Math.round(framed.radius * scale)}px;overflow:hidden;background:#fff;will-change:transform}
      iframe{border:0;width:${framed.width}px;height:${framed.height}px;transform:scale(${scale});transform-origin:0 0}
    </style></head><body><div class="device"><iframe src="${fileUrl(temp)}"></iframe></div></body></html>`);
    runChrome(chrome, [`--window-size=${OUT.width},${OUT.height}`, "--force-device-scale-factor=1", "--virtual-time-budget=6000", `--screenshot=${out}`, fileUrl(frame)]);
    console.log(`${framed.width}x${framed.height} device on a ${OUT.width}x${OUT.height} field -> ${out}`);
  } else {
    const height = Math.round((width * OUT.height) / OUT.width);
    runChrome(chrome, [`--window-size=${width},${height}`, `--force-device-scale-factor=${OUT.width / width}`, "--virtual-time-budget=6000", `--screenshot=${out}`, fileUrl(temp)]);
    console.log(`${width}x${height} window -> ${out} ${OUT.width}x${OUT.height}`);
  }
} catch (e) {
  if (!(e instanceof ChromeError)) throw e;
  failed = e;
} finally {
  rmSync(work, { recursive: true, force: true });
}

if (failed) { console.error(failed.message); process.exit(1); }
if (!existsSync(out)) { console.error("Chrome ran but wrote no file."); process.exit(1); }
console.log(`${Math.round(statSync(out).size / 1024)} KB. Open it: the interesting part of the first screen should be at the top.`);
