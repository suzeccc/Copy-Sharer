import { promises as fs } from "node:fs";
import path from "node:path";

const roots = [
  { dir: "src", extensions: new Set([".ts", ".vue"]) },
  { dir: "src-tauri/src", extensions: new Set([".rs"]) },
];
const localeDir = "locales";
const hanPattern = /[\u3400-\u9fff]+/gu;
const translateMissing = process.argv.includes("--translate");

async function listFiles(root, extensions) {
  const entries = await fs.readdir(root, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listFiles(fullPath, extensions));
    } else if (extensions.has(path.extname(entry.name))) {
      files.push(fullPath);
    }
  }
  return files;
}

async function readJson(filePath) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return {};
    throw error;
  }
}

async function googleTranslate(text) {
  const url = new URL("https://translate.googleapis.com/translate_a/single");
  url.searchParams.set("client", "gtx");
  url.searchParams.set("sl", "zh-CN");
  url.searchParams.set("tl", "en");
  url.searchParams.set("dt", "t");
  url.searchParams.set("q", text);
  const response = await fetch(url, {
    headers: { "User-Agent": "CopyShare-i18n-catalog/1.0" },
  });
  if (!response.ok) {
    throw new Error(`Translation request failed (${response.status}) for ${text}`);
  }
  const payload = await response.json();
  return payload[0].map((part) => part[0]).join("").trim();
}

async function mapWithConcurrency(values, concurrency, mapper) {
  const results = new Array(values.length);
  let cursor = 0;
  async function worker() {
    while (cursor < values.length) {
      const index = cursor++;
      results[index] = await mapper(values[index], index);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
  return results;
}

const phrases = new Set();
for (const { dir, extensions } of roots) {
  for (const file of await listFiles(dir, extensions)) {
    const content = await fs.readFile(file, "utf8");
    for (const match of content.matchAll(hanPattern)) {
      phrases.add(match[0]);
    }
  }
}

await fs.mkdir(localeDir, { recursive: true });
const englishPath = path.join(localeDir, "en-US.json");
const previousEnglish = await readJson(englishPath);
const sortedPhrases = [...phrases].sort((left, right) => left.localeCompare(right, "zh-CN"));
const english = {};
const missing = sortedPhrases.filter((phrase) => !previousEnglish[phrase]);

if (translateMissing && missing.length) {
  const translated = await mapWithConcurrency(missing, 4, async (phrase, index) => {
    if ((index + 1) % 25 === 0 || index === missing.length - 1) {
      process.stdout.write(`Translated ${index + 1}/${missing.length}\n`);
    }
    return googleTranslate(phrase);
  });
  missing.forEach((phrase, index) => {
    previousEnglish[phrase] = translated[index];
  });
}

for (const phrase of sortedPhrases) {
  english[phrase] = previousEnglish[phrase] ?? phrase;
}

const chinese = Object.fromEntries(sortedPhrases.map((phrase) => [phrase, phrase]));
await Promise.all([
  fs.writeFile(path.join(localeDir, "zh-CN.json"), `${JSON.stringify(chinese, null, 2)}\n`),
  fs.writeFile(englishPath, `${JSON.stringify(english, null, 2)}\n`),
]);

process.stdout.write(
  `Catalog contains ${sortedPhrases.length} phrases; ${translateMissing ? 0 : missing.length} English translations still missing.\n`,
);
