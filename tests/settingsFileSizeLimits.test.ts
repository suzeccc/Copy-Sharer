import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const settings = readFileSync("src/pages/Settings.vue", "utf8");
const transfer = readFileSync("src-tauri/src/file_transfer.rs", "utf8");
const configType = readFileSync("src/types/config.ts", "utf8");
const configStore = readFileSync("src/stores/config.ts", "utf8");

// Legacy fields stay serialized so existing config files remain compatible.
assert.match(configType, /maxSendFileSizeMib: number/);
assert.match(configType, /maxReceiveFileSizeMib: number/);
assert.match(configStore, /maxSendFileSizeMib:\s*3072/);
assert.match(configStore, /maxReceiveFileSizeMib:\s*3072/);

assert.match(settings, /data-file-transfer-limit-summary/);
assert.match(settings, /无论一个还是多个文件，每次发送或接收最多 10 GiB/);
assert.match(settings, /最高 10 GiB/);
assert.doesNotMatch(settings, /FileSizeLimitSlider/);
assert.doesNotMatch(settings, /v-model="draft\.maxSendFileSizeMib"/);
assert.doesNotMatch(settings, /v-model="draft\.maxReceiveFileSizeMib"/);

assert.match(transfer, /MAX_TRANSFER_TOTAL_SIZE:\s*u64\s*=\s*10\s*\*\s*1024\s*\*\s*1024\s*\*\s*1024/);
assert.match(transfer, /transfer total size cannot exceed 10 GiB/);
assert.doesNotMatch(transfer, /MAX_SINGLE_FILE_SIZE/);
assert.doesNotMatch(transfer, /validate_configured_single_file_limit/);
assert.doesNotMatch(transfer, /config\.max_send_file_size_mib/);
assert.doesNotMatch(transfer, /config\.max_receive_file_size_mib/);
