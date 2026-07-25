import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";

const tauri = readFileSync("src/lib/tauri.ts", "utf8");
const ocr = readFileSync("src-tauri/src/ocr.rs", "utf8");
const errors = readFileSync("src-tauri/src/error.rs", "utf8");
const commands = readFileSync("src-tauri/src/commands.rs", "utf8");
const libRs = readFileSync("src-tauri/src/lib.rs", "utf8");
const cargo = readFileSync("src-tauri/Cargo.toml", "utf8");
const linuxConfig = readFileSync("src-tauri/tauri.linux.conf.json", "utf8");
const release = readFileSync(".github/workflows/release.yml", "utf8");

assert.match(tauri, /import type \{ OcrResponse \} from "@\/types\/ocr"/);
assert.match(tauri, /export function recognizeClipboardImage\(\): Promise<OcrResponse>/);
assert.match(tauri, /invoke<OcrResponse>\("recognize_clipboard_image"\)/);

assert.match(errors, /Ocr\(String\)/);
assert.match(commands, /pub async fn recognize_clipboard_image/);
assert.match(commands, /clipboard::read_clipboard_image_base64/);
assert.match(commands, /spawn_blocking/);
assert.match(libRs, /mod ocr;/);
assert.match(libRs, /commands::recognize_clipboard_image/);

assert.match(ocr, /cfg\(target_os = "windows"\)/);
assert.match(ocr, /OcrEngine::TryCreateFromUserProfileLanguages/);
assert.match(ocr, /BitmapDecoder::CreateAsync/);
assert.match(ocr, /cfg\(target_os = "macos"\)/);
assert.match(ocr, /VNRecognizeTextRequest::new/);
assert.match(ocr, /VNImageRequestHandler::initWithData_options/);
assert.match(ocr, /cfg\(target_os = "linux"\)/);
assert.match(ocr, /LepTess::new\(Some\(tessdata_dir\), "chi_sim\+eng"\)/);
assert.match(commands, /BaseDirectory::Resource/);

for (const feature of [
  "Media_Ocr",
  "Graphics_Imaging",
  "Storage_Streams",
  "Globalization",
  "Win32_System_Com",
]) {
  assert.match(cargo, new RegExp(`"${feature}"`));
}

for (const dependency of ["objc2-vision", "leptess"]) {
  assert.match(cargo, new RegExp(dependency));
}

assert.match(linuxConfig, /"resources\/tessdata\/": "tessdata\/"/);
assert.match(linuxConfig, /"libtesseract5"/);
assert.match(linuxConfig, /"liblept5"/);
assert.match(release, /libleptonica-dev/);
assert.match(release, /libtesseract-dev/);

for (const [path, size, sha256] of [
  [
    "src-tauri/resources/tessdata/eng.traineddata",
    4_113_088,
    "7d4322bd2a7749724879683fc3912cb542f19906c83bcc1a52132556427170b2",
  ],
  [
    "src-tauri/resources/tessdata/chi_sim.traineddata",
    2_469_156,
    "a5fcb6f0db1e1d6d8522f39db4e848f05984669172e584e8d76b6b3141e1f730",
  ],
] as const) {
  assert.equal(statSync(path).size, size);
  assert.equal(createHash("sha256").update(readFileSync(path)).digest("hex"), sha256);
}
