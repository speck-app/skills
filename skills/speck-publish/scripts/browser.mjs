// Finding and running a Chrome for check.mjs and shoot.mjs. No package: the person already has a
// browser, and an npm install for a screenshot is the thing this skill avoids.
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { pathToFileURL } from "node:url";

const LOCALAPPDATA = process.env.LOCALAPPDATA;

export const CANDIDATES = [
  process.env.SPECK_CHROME,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/usr/bin/microsoft-edge",
  "/usr/bin/brave-browser",
  "/snap/bin/chromium",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  LOCALAPPDATA && `${LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
].filter(Boolean);

export function findChrome() {
  return CANDIDATES.find((p) => existsSync(p)) ?? null;
}

export function noChrome() {
  console.error("No Chrome, Chromium, Brave or Edge found. Looked in:\n  " + CANDIDATES.join("\n  ") + "\nSet SPECK_CHROME to the binary to use another.");
  process.exit(2);
}

export const fileUrl = (path) => pathToFileURL(path).href;

// A Chrome that hung or crashed, as one sentence. Callers catch it after their temp files are gone
// and print the message; anything else is a bug and is rethrown.
export class ChromeError extends Error {}

const TIMEOUT_MS = 60000;

// Runs headless with the flags every call needs and returns stdout. --allow-file-access-from-files
// is what lets the frame page shoot.mjs writes embed the prototype from file://.
export function runChrome(chrome, args) {
  try {
    return execFileSync(chrome, [
      "--headless=new", "--disable-gpu", "--hide-scrollbars", "--no-first-run", "--no-default-browser-check",
      "--allow-file-access-from-files", "--disable-extensions", ...args,
    ], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 64 * 1024 * 1024, timeout: TIMEOUT_MS });
  } catch (e) {
    if (e.code === "ETIMEDOUT") throw new ChromeError(`The prototype did not finish loading in ${TIMEOUT_MS / 1000} seconds, so Chrome was stopped.`);
    const first = String(e.stderr ?? "").split("\n").map((l) => l.trim()).find(Boolean);
    throw new ChromeError(first ? `Chrome failed: "${first}"` : `Chrome failed (${e.code ?? `exit ${e.status}`}) and printed nothing.`);
  }
}

// The style that keeps a persona bar out of every shot and every check.
export const HIDE_CHROME = "<style>[data-proto-chrome]{display:none !important}</style>";

export function injectHead(html, snippet) {
  if (html.includes("</head>")) return html.replace("</head>", `${snippet}</head>`);
  // No head to land in. If there is a doctype, the snippet goes after it, not before: putting
  // anything ahead of the doctype line pushes the page into quirks mode.
  const doctype = html.match(/^\s*<!doctype[^>]*>/i)?.[0];
  return doctype ? html.slice(0, doctype.length) + snippet + html.slice(doctype.length) : snippet + html;
}
