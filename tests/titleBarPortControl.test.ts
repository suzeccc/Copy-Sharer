import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const titleBar = readFileSync("src/components/layout/TitleBar.vue", "utf8");

assert.match(titleBar, /data-titlebar-port/);
assert.match(titleBar, /data-titlebar-port-editor/);
assert.match(titleBar, /<ConnectionBadge[\s\S]*data-titlebar-port-editor/);
assert.match(titleBar, /loader-circle\.js/);
assert.match(titleBar, /w-\[108px\]/);
assert.doesNotMatch(titleBar, /ethernet-port\.js|pencil\.js/);
assert.match(titleBar, /:aria-label="`监听端口/);
assert.match(titleBar, /:aria-busy="portSaving"/);
assert.match(titleBar, /cursor-pointer/);
assert.match(titleBar, /v-model\.number="portDraft"/);
assert.match(titleBar, /min="1"/);
assert.match(titleBar, /max="65535"/);
assert.match(titleBar, /const wasRunning = statusStore\.status\.running/);
assert.match(titleBar, /await statusStore\.stop\(\)/);
assert.match(titleBar, /await configStore\.save\(\{/);
assert.match(titleBar, /if \(wasRunning\) \{[\s\S]*await statusStore\.start\(\)/);
assert.match(titleBar, /@keydown\.esc\.prevent="cancelPortEdit"/);
