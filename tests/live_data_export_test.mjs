// 实时数据导出回归测试
// 目的：AA55 实时帧逐帧记录成「实时数据」，能导出 CSV / TSV / JSON，且和「事件」导出分开。
// 做法：从 next_upper_computer.html 抽出「实时数据导出」整段 + 真实的 curveDataNumber，套上 stub 直接调用。
// 运行：node tests/live_data_export_test.mjs

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const htmlPath = new URL('../next_upper_computer.html', import.meta.url);
const html = readFileSync(htmlPath, 'utf8');

const begin = html.indexOf('// ===================== 实时数据导出 =====================');
const end = html.indexOf('// ===================== 烘焙曲线 =====================', begin);
assert.ok(begin > 0 && end > begin, '未找到实时数据模块边界');
const moduleSource = html.slice(begin, end);

// 按函数名抽源码（和 serial_route_test.mjs 同一套花括号配对）
function extractFunction(source, name) {
  const head = 'function ' + name + '(';
  const start = source.indexOf(head);
  assert.ok(start >= 0, '未找到函数 ' + name);
  let i = source.indexOf('{', start);
  let depth = 0;
  let quote = null;
  for (; i < source.length; i += 1) {
    const c = source[i];
    if (quote) {
      if (c === '\\') { i += 1; continue; }
      if (c === quote) quote = null;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') { quote = c; continue; }
    if (c === '/' && source[i + 1] === '/') { const nl = source.indexOf('\n', i); i = nl < 0 ? source.length : nl; continue; }
    if (c === '{') depth += 1;
    else if (c === '}') { depth -= 1; if (depth === 0) return source.slice(start, i + 1); }
  }
  throw new Error('函数体没闭合：' + name);
}

const curveDataNumberSource = extractFunction(html, 'curveDataNumber');

const failures = [];
function check(name, fn) {
  try {
    fn();
    console.log('  PASS  ' + name);
  } catch (error) {
    failures.push(name);
    console.log('  FAIL  ' + name + '\n        ' + (error?.message || String(error)));
  }
}

class FakeBlob {
  constructor(parts, options) {
    this.text = parts.join('');
    this.type = options?.type || '';
  }
}

function buildHarness(options = {}) {
  const alerts = [];
  const downloads = [];
  let source = moduleSource;
  if (options.maxRecords) {
    source = source.replace('const LIVE_DATA_MAX_RECORDS = 20000;', `const LIVE_DATA_MAX_RECORDS = ${options.maxRecords};`);
    assert.ok(source.includes(`= ${options.maxRecords};`), '上限常量替换失败');
  }

  const api = new Function(
    't',
    'currentLang',
    'formatTimeStamp',
    'downloadBlob',
    'alert',
    'Blob',
    source +
      curveDataNumberSource +
      '\nreturn { liveData, liveDataReset, liveDataRecordFrame, liveDataCollectExportData,' +
      ' liveDataBuildExportText, exportLiveData, LIVE_DATA_COLUMNS, LIVE_DATA_MAX_RECORDS };',
  )(
    (value) => String(value ?? ''),
    'zh',
    (ts) => 'T' + ts,
    (blob, filename) => downloads.push({ blob, filename }),
    (message) => alerts.push(String(message)),
    FakeBlob,
  );

  return { api, alerts, downloads };
}

function frame(overrides = {}) {
  return {
    curveAgtron: 86.1234,
    voice: 42.6,
    agtronRate: -0.753,
    stableAgtron: 85.5,
    distance: 180,
    yellowTime: 63.4,
    yellowFlag: 1,
    recordNo: 101,
    ...overrides,
  };
}

// ---- 记录 ----
check('记录：一帧一条，字段按列顺序落库', () => {
  const h = buildHarness();
  const { api } = h;
  api.liveDataRecordFrame(frame(), 63.44);
  assert.equal(api.liveData.records.length, 1);
  const data = api.liveDataCollectExportData();
  assert.deepEqual(data.columns, api.LIVE_DATA_COLUMNS);
  assert.equal(data.records.length, 1);
  assert.deepEqual(data.records[0].slice(1), [63.4, 86.123, 85.5, -0.753, 43, 180, 63, 1, 101]);
});

check('记录：相邻重复记录序号被去重，序号变化后继续记录', () => {
  const h = buildHarness();
  const { api } = h;
  api.liveDataRecordFrame(frame({ recordNo: 7 }), 1);
  api.liveDataRecordFrame(frame({ recordNo: 7 }), 1);
  api.liveDataRecordFrame(frame({ recordNo: 8 }), 2);
  assert.equal(api.liveData.records.length, 2);
});

check('记录：序号为 0（设备没给序号）时不做去重', () => {
  const h = buildHarness();
  const { api } = h;
  api.liveDataRecordFrame(frame({ recordNo: 0 }), 1);
  api.liveDataRecordFrame(frame({ recordNo: 0 }), 2);
  assert.equal(api.liveData.records.length, 2);
});

check('记录：超过上限丢最旧的，保留最新', () => {
  const h = buildHarness({ maxRecords: 3 });
  const { api } = h;
  assert.equal(api.LIVE_DATA_MAX_RECORDS, 3);
  for (let i = 1; i <= 5; i += 1) api.liveDataRecordFrame(frame({ recordNo: i }), i);
  const kept = api.liveData.records.map((row) => row.recordNo);
  assert.deepEqual(kept, [3, 4, 5]);
});

check('记录：没解析出值的位置留空，不写 0', () => {
  const h = buildHarness();
  const { api } = h;
  api.liveDataRecordFrame(frame({ curveAgtron: NaN, stableAgtron: NaN, agtronRate: NaN, voice: NaN, distance: NaN }), 1);
  const row = api.liveDataCollectExportData().records[0];
  assert.ok(row.slice(2, 6).every((value) => Number.isNaN(value)));
  assert.ok(Number.isNaN(row[6]));
});

check('清空：liveDataReset 清掉全部记录', () => {
  const h = buildHarness();
  const { api } = h;
  api.liveDataRecordFrame(frame(), 1);
  api.liveDataReset();
  assert.equal(api.liveData.records.length, 0);
});

// ---- 导出 ----
check('导出 CSV：表头是列名，一行一帧', () => {
  const h = buildHarness();
  const { api } = h;
  api.liveDataRecordFrame(frame(), 63.44);
  api.liveDataRecordFrame(frame({ recordNo: 102, curveAgtron: 87 }), 64.44);
  const lines = api.liveDataBuildExportText('csv').split('\r\n');
  assert.equal(lines.length, 3);
  assert.equal(lines[0], api.LIVE_DATA_COLUMNS.join(','));
  assert.equal(lines[1].split(',')[1], '63.4');
  assert.equal(lines[2].split(',')[1], '64.4');
  assert.ok(lines[1].startsWith('T'), 'time 列在第一位');
  assert.ok(!lines[1].includes('undefined'));
});

check('导出 TSV：制表符分隔，列结构与 CSV 一致', () => {
  const h = buildHarness();
  const { api } = h;
  api.liveDataRecordFrame(frame(), 63.44);
  const lines = api.liveDataBuildExportText('tsv').split('\r\n');
  assert.equal(lines[0], api.LIVE_DATA_COLUMNS.join('\t'));
  assert.equal(lines[1].split('\t').length, api.LIVE_DATA_COLUMNS.length);
  assert.ok(!lines[1].includes(','));
});

check('导出 JSON：带列名、记录与来源信息，取不到的值是 null', () => {
  const h = buildHarness();
  const { api } = h;
  api.liveDataRecordFrame(frame({ curveAgtron: NaN }), 10);
  const parsed = JSON.parse(api.liveDataBuildExportText('json'));
  assert.equal(parsed.kind, 'live-data');
  assert.equal(parsed.language, 'zh');
  assert.equal(parsed.timeUnit, 's');
  assert.deepEqual(parsed.columns, api.LIVE_DATA_COLUMNS);
  assert.equal(parsed.records.length, 1);
  assert.equal(parsed.records[0][2], null);
  assert.equal(parsed.records[0][9], 101);
});

check('导出按钮：文件名带格式后缀且内容与格式匹配', () => {
  const h = buildHarness();
  const { api, downloads } = h;
  api.liveDataRecordFrame(frame(), 1);
  api.exportLiveData('tsv');
  assert.equal(downloads.length, 1);
  assert.match(downloads[0].filename, /^next-live-[0-9TZ.\-]+\.tsv$/);
  assert.equal(downloads[0].blob.type, 'text/tab-separated-values;charset=utf-8');
  assert.ok(downloads[0].blob.text.startsWith(api.LIVE_DATA_COLUMNS.join('\t')));
});

check('导出按钮：未知格式退回 CSV', () => {
  const h = buildHarness();
  const { api, downloads } = h;
  api.liveDataRecordFrame(frame(), 1);
  api.exportLiveData('xlsx');
  assert.match(downloads[0].filename, /\.csv$/);
});

check('导出按钮：没有实时数据时只提示，不下载', () => {
  const h = buildHarness();
  const { api, alerts, downloads } = h;
  api.exportLiveData('csv');
  assert.equal(downloads.length, 0);
  assert.deepEqual(alerts, ['还没有实时数据可以导出']);
});

// ---- 页面入口 ----
check('页面入口：事件导出与实时数据导出并存，下拉可选 CSV / TSV / JSON', () => {
  assert.ok(html.includes('<button id="exportBtn" class="ghost">导出事件</button>'), '事件导出按钮');
  assert.ok(html.includes('<button id="exportLiveBtn" class="ghost export-live-btn" type="button">导出实时数据</button>'), '实时数据导出按钮');
  assert.ok(html.includes('<select id="exportLiveFormat"'), '格式下拉框');
  // 下拉框与按钮是一个分体控件（共用一个圆角边框），且下拉框按深色头部着色
  assert.ok(html.includes('<label class="export-format" for="exportLiveFormat">'), '格式控件与按钮成组');
  assert.ok(html.includes('header select option {'), '下拉候选项在深色头部里改成白底深字');
  assert.ok(html.includes("els.exportLiveBtn.addEventListener('click'"), '按钮已接线');
  assert.ok(html.includes('liveDataReset();'), '清空日志会清实时数据');
  assert.ok(html.includes("'导出实时数据': 'Export Live Data'"), '英文界面有对应文案');
});

console.log('');
if (failures.length) {
  console.log('实时数据导出验证失败 ' + failures.length + ' 项：' + failures.join(' / '));
  process.exit(1);
}
console.log('实时数据导出验证全部通过');
