import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const readme = readFileSync("README.md", "utf8");
const readmeEnglish = readFileSync("README_EN.md", "utf8");

test("README exposes current release platforms and download entry", () => {
  assert.match(readme, /img\.shields\.io\/github\/v\/release\/suzeccc\/CopyShare/);
  assert.match(readme, /github\.com\/suzeccc\/CopyShare\/releases\/latest/);
  assert.doesNotMatch(readme, /v3\.0\.0/);
  for (const label of [
    "Windows x64",
    "Windows ARM64",
    "macOS Apple Silicon",
    "macOS Intel",
    "Linux",
  ]) assert.match(readme, new RegExp(label));
});

test("README describes the complete user-facing feature set", () => {
  for (const feature of [
    "断点续传",
    "10 GiB",
    "全局快捷键",
    "网络诊断",
    "修复防火墙",
    "视频预览",
    "桌面浮窗",
    "常用片段",
    "收藏夹",
    "网格",
    "列表",
    "图片转文字",
    "Apple Vision",
    "Tesseract",
    "二维码",
    "重复同步内容",
    "桌面通知",
    "缓存管理",
    "托盘",
    "检查更新",
  ]) assert.match(readme, new RegExp(feature));
});

test("README states privacy boundaries and keeps valid screenshots", () => {
  assert.match(readme, /翻译文本会发送到.*翻译服务/);
  assert.match(readme, /剪贴板.*不会上传.*CopyShare.*云端/);
  for (const image of ["1.png", "2.png", "3.png", "4.png", "6.png"]) {
    assert.equal(existsSync(`docs/images/${image}`), true, image);
    assert.match(readme, new RegExp(`docs/images/${image.replace(".", "\\.")}`));
  }
});

test("Chinese and English READMEs are complete and symmetrically linked", () => {
  assert.match(readme, /href="\.\/README_EN\.md">English<\/a>/);
  assert.match(readmeEnglish, /href="\.\/README\.md">简体中文<\/a>/);

  for (const feature of [
    "resumable",
    "10 GiB",
    "global shortcuts",
    "Network diagnostics",
    "Repair firewall",
    "video previews",
    "floating panel",
    "snippets",
    "library",
    "Apple Vision",
    "Tesseract",
    "QR",
    "desktop notifications",
    "cache management",
    "tray",
  ]) assert.match(readmeEnglish, new RegExp(feature, "i"));

  const headingLevels = (content: string) =>
    [...content.matchAll(/^(#{1,6})\s/gm)].map((match) => match[1].length);
  assert.deepEqual(headingLevels(readmeEnglish), headingLevels(readme));

  for (const image of ["1.png", "2.png", "3.png", "4.png", "6.png"]) {
    assert.match(readmeEnglish, new RegExp(`docs/images/${image.replace(".", "\\.")}`));
  }
});
