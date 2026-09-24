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
// Anything marked data-proto-chrome is hidden for the shot.
import { readFileSync, writeFileSync, rmSync, existsSync, mkdirSync, statSync } from "node:fs";
import { dirname, resolve, join } from "node:path";
import { findChrome, noChrome, runChrome, HIDE_CHROME, injectHead } from "./browser.mjs";

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
if (!input || !output || args.includes("-h") || args.includes("--help")) {
  console.error("usage: node shoot.mjs <prototype.html> <out.png> [--w N] [--entry entry.json]");
  process.exit(2);
}
const file = resolve(input);
const out = resolve(output);
if (!existsSync(file)) { console.error(`no such file: ${file}`); process.exit(2); }

const entryPath = flag("--entry") ? resolve(flag("--entry")) : join(dirname(file), "entry.json");
const platform = existsSync(entryPath) ? JSON.parse(readFileSync(entryPath, "utf8")).platformSlug : undefined;
const framed = FRAMED[platform];

const src = readFileSync(file, "utf8");
let width = DEFAULT_WIDTH;
if (!framed) {
  const declared = src.match(/<meta\s+name="speck:shot-width"\s+content="(\d+)"/i)?.[1];
  width = Number(flag("--w") ?? declared ?? DEFAULT_WIDTH);
  if (!Number.isInteger(width) || width < 320 || width > OUT.width || width % 16 !== 0) {
    console.error(`shot width ${width} must be a multiple of 16 between 320 and ${OUT.width}`);
    process.exit(2);
  }
}

const chrome = findChrome();
if (!chrome) noChrome();
mkdirSync(dirname(out), { recursive: true });

const temp = join(dirname(file), `.shoot-${process.pid}.html`);
const frame = join(dirname(file), `.frame-${process.pid}.html`);
writeFileSync(temp, injectHead(src, HIDE_CHROME));

try {
  if (framed) {
    // The device fills the field's height less a margin; the width follows from its proportions.
    const ph = OUT.height - 60;
    const scale = ph / framed.height;
    const pw = Math.round(framed.width * scale);
    writeFileSync(frame, `<!doctype html><html><head><meta charset="utf-8"><style>
      html,body{margin:0;width:${OUT.width}px;height:${OUT.height}px;background:${FIELD};overflow:hidden}
      .device{position:absolute;left:${Math.round((OUT.width - pw) / 2)}px;top:${Math.round((OUT.height - ph) / 2)}px;width:${pw}px;height:${ph}px;border-radius:${Math.round(framed.radius * scale)}px;overflow:hidden;background:#fff}
      iframe{border:0;width:${framed.width}px;height:${framed.height}px;transform:scale(${scale});transform-origin:0 0}
    </style></head><body><div class="device"><iframe src="file://${temp}"></iframe></div></body></html>`);
    runChrome(chrome, [`--window-size=${OUT.width},${OUT.height}`, "--force-device-scale-factor=1", "--virtual-time-budget=6000", `--screenshot=${out}`, `file://${frame}`]);
    console.log(`${framed.width}x${framed.height} device on a ${OUT.width}x${OUT.height} field -> ${out}`);
  } else {
    const height = Math.round((width * OUT.height) / OUT.width);
    runChrome(chrome, [`--window-size=${width},${height}`, `--force-device-scale-factor=${OUT.width / width}`, "--virtual-time-budget=6000", `--screenshot=${out}`, `file://${temp}`]);
    console.log(`${width}x${height} window -> ${out} ${OUT.width}x${OUT.height}`);
  }
} finally {
  rmSync(temp, { force: true });
  rmSync(frame, { force: true });
}

if (!existsSync(out)) { console.error("Chrome ran but wrote no file."); process.exit(1); }
console.log(`${Math.round(statSync(out).size / 1024)} KB. Open it: the interesting part of the first screen should be at the top.`);
