// 串口字节路由回归测试
// 目的：验证 AA55 实时帧解析器不会吞掉纯文本（EVT）数据。
// 做法：从 next_upper_computer.html 里按函数名抽出真正的实现，套上 stub 后直接调用。
// 运行：node tests/serial_route_test.mjs

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const htmlPath = new URL('../next_upper_computer.html', import.meta.url);
const html = readFileSync(htmlPath, 'utf8');

// ---- 按函数名抽源码（花括号配对，跳过字符串/注释）----
function extractFunction(source, name) {
  const head = 'function ' + name + '(';
  const start = source.indexOf(head);
  assert.ok(start >= 0, '未找到函数 ' + name);
  let i = source.indexOf('{', start);
  assert.ok(i > 0, '未找到函数体 ' + name);
  let depth = 0;
  let quote = null;
  for (; i < source.length; i += 1) {
    const c = source[i];
    const prev = source[i - 1];
    if (quote) {
      if (c === '\\') { i += 1; continue; }
      if (c === quote) quote = null;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') { quote = c; continue; }
    if (c === '/' && source[i + 1] === '/') { const nl = source.indexOf('\n', i); i = nl < 0 ? source.length : nl; continue; }
    if (c === '/' && source[i + 1] === '*') { const e = source.indexOf('*/', i); i = e < 0 ? source.length : e + 1; continue; }
    if (c === '{') depth += 1;
    else if (c === '}') { depth -= 1; if (depth === 0) return source.slice(start, i + 1); }
    void prev;
  }
  throw new Error('函数体没闭合：' + name);
}

const wanted = [
  'bytesToHex', 'trimTrailingZeros', 'isLikelyAsciiLine', 'concatBytes', 'findFrameHead',
  'looksLikePartialFrame',
  'isAsciiTextByte',
  'calcCrc16Modbus', 'parseRoastingLiveFrame', 'getBinaryBuffer', 'setBinaryBuffer',
  'drainRoastingLiveFrames', 'handleIncomingBytes', 'isAgtronDataText',
];
const source = wanted.map((name) => extractFunction(html, name)).join('\n\n');

// ---- stub ----
const receivedText = [];
const packets = [];
const logs = [];
const stubPreamble = `
let bleBinaryBuffer = new Uint8Array(0);
let serialBinaryBuffer = new Uint8Array(0);
const els = { bleLog: [], serialLog: [] };
const textDecoder = new TextDecoder();
function appendLog(target, message) { logs.push(message); }
function tpl(template, params) { return template.replace(/\\{(\\w+)\\}/g, (_, key) => String(params[key])); }
function t(value) { return value; }
function addDataPacket(transport, info) { packets.push({ transport, info }); }
function buildRoastingLivePacketInfo(frame, parsed) { return { frameLength: frame.length, parsed }; }
function curveRecordLiveFrame(parsed) { packets.push({ curve: parsed }); }
function parseIncomingText(transport, text, rawHex) { receivedText.push({ transport, text, rawHex }); }
function addDataPacketText() {}
`;
const factory = new Function(
  'receivedText, packets, logs',
  stubPreamble + '\n' + source + '\nreturn { handleIncomingBytes, drainRoastingLiveFrames, calcCrc16Modbus, getBinaryBuffer };',
);
const api = factory(receivedText, packets, logs);

// ---- 构造一帧合法的 27 字节实时帧 ----
function buildFrame(recordNo) {
  const payload = new Uint8Array(20);
  const view = new DataView(payload.buffer);
  view.setFloat32(0, 12.5, true);          // curve_agtron
  view.setUint8(4, 7);                      // voice
  view.setFloat32(5, 1.25, true);           // agtron_rate
  view.setFloat32(9, 11.5, true);           // stable
  view.setUint16(13, 1234, true);           // distance
  view.setUint16(15, 300, true);            // time_yellow
  view.setUint8(17, 1);                     // flag_yellow
  view.setUint16(18, recordNo, true);       // cnt_record
  const body = new Uint8Array(1 + 20);
  body[0] = 20;
  body.set(payload, 1);
  const crc = api.calcCrc16Modbus(body);
  const frame = new Uint8Array(27);
  frame[0] = 0xAA; frame[1] = 0x55; frame[2] = 20;
  frame.set(payload, 3);
  frame[23] = crc & 0xFF;
  frame[24] = (crc >> 8) & 0xFF;
  frame[25] = 0x53;
  frame[26] = 0x42;
  return frame;
}

const failures = [];
function check(name, fn) {
  try { fn(); console.log('  PASS  ' + name); }
  catch (error) { failures.push(name); console.log('  FAIL  ' + name + '\n        ' + (error?.message || String(error))); }
}

console.log('串口字节路由回归测试（' + htmlPath.pathname.split('/').pop() + '）');

check('整帧一次到达：解析成功且不落到文本路径', () => {
  receivedText.length = 0; packets.length = 0;
  const frame = buildFrame(11);
  api.handleIncomingBytes('UART0', frame);
  assert.equal(packets.filter((p) => p.curve).length, 1, '应记录 1 个实时帧');
  assert.equal(receivedText.length, 0, '不该走文本路径');
});

check('整帧拆成 1+26 字节：仍能解析出 1 帧', () => {
  receivedText.length = 0; packets.length = 0;
  const frame = buildFrame(12);
  api.handleIncomingBytes('UART0', frame.slice(0, 1));
  api.handleIncomingBytes('UART0', frame.slice(1));
  assert.equal(packets.filter((p) => p.curve).length, 1, '拆包后仍应解析出 1 帧');
});

check('文本 1：一次到达的 EVT 行必须完整传给文本解析', () => {
  receivedText.length = 0; packets.length = 0;
  const line = 'EVT:9,SYSTEM,PHYSICAL_KEY,SHORT_PRESS\r\n';
  api.handleIncomingBytes('UART0', new TextEncoder().encode(line));
  const joined = receivedText.map((r) => r.text).join('');
  assert.equal(joined, line, '文本被改动或丢失：' + JSON.stringify(joined));
});

check('文本 2：EVT 行被拆成 3 字节小块时也必须完整传给文本解析', () => {
  receivedText.length = 0; packets.length = 0;
  const line = 'EVT:10,TOUCH,PAGE_ENTER_ROASTING_LIVE\r\n';
  const bytes = new TextEncoder().encode(line);
  for (let i = 0; i < bytes.length; i += 3) {
    api.handleIncomingBytes('UART0', bytes.slice(i, Math.min(i + 3, bytes.length)));
  }
  const joined = receivedText.map((r) => r.text).join('');
  assert.equal(joined, line, '短块拼装后文本丢失/破损：' + JSON.stringify(joined));
});

check('文本 3：I (...) 日志行逐字节到达也不能丢', () => {
  receivedText.length = 0; packets.length = 0;
  const line = 'I (10200) setting_task: Battery charge is full \r\n';
  const bytes = new TextEncoder().encode(line);
  for (let i = 0; i < bytes.length; i += 1) {
    api.handleIncomingBytes('UART0', bytes.slice(i, i + 1));
  }
  const joined = receivedText.map((r) => r.text).join('');
  assert.equal(joined, line, '逐字节时文本丢失：' + JSON.stringify(joined));
});

check('文本 4：文本 + 实时帧 + 文本 混在同一块，两边都不能丢', () => {
  receivedText.length = 0; packets.length = 0;
  const beforeText = 'EVT:20,SYSTEM,ROASTING_START\r\n';
  const afterText = 'EVT:22,SYSTEM,ROASTING_STOP\r\n';
  const before = new TextEncoder().encode(beforeText);
  const after = new TextEncoder().encode(afterText);
  const frame = buildFrame(21);
  const chunk = new Uint8Array(before.length + frame.length + after.length);
  chunk.set(before, 0);
  chunk.set(frame, before.length);
  chunk.set(after, before.length + frame.length);
  api.handleIncomingBytes('UART0', chunk);
  assert.equal(packets.filter((p) => p.curve).length, 1, '应解析出 1 个实时帧');
  const joined = receivedText.map((r) => r.text).join('');
  assert.equal(joined, beforeText + afterText, '帧前后的文本不完整：' + JSON.stringify(joined));
});

check('文本 5：前面跟二进制噪声时，文本行仍要完整', () => {
  receivedText.length = 0; packets.length = 0;
  const noise = new Uint8Array([0x00, 0xFF, 0xFE, 0x01]);
  const text = 'EVT:30,SYSTEM,COMMAND_OK\r\n';
  const textBytes = new TextEncoder().encode(text);
  const chunk = new Uint8Array(noise.length + textBytes.length);
  chunk.set(noise, 0);
  chunk.set(textBytes, noise.length);
  api.handleIncomingBytes('UART0', chunk);
  const joined = receivedText.map((r) => r.text).join('');
  assert.equal(joined, text, '噪声把文本行带丢了：' + JSON.stringify(joined));
});

check('帧 4：同一块里两个连续整帧都要解析出来', () => {
  receivedText.length = 0; packets.length = 0;
  const first = buildFrame(41);
  const second = buildFrame(42);
  const chunk = new Uint8Array(first.length + second.length);
  chunk.set(first, 0);
  chunk.set(second, first.length);
  api.handleIncomingBytes('UART0', chunk);
  const curveNos = packets.filter((p) => p.curve).map((p) => p.curve.recordNo);
  assert.deepEqual(curveNos, [41, 42], '两帧未按序解析：' + JSON.stringify(curveNos));
});

console.log(failures.length === 0 ? '\n全部通过' : '\n失败 ' + failures.length + ' 项：' + failures.join(' / '));
process.exit(failures.length === 0 ? 0 : 1);
