// 曲线模块离线验证
// 从 next_upper_computer.html 里抽出「烘焙曲线」模块，在 Node 里用假 canvas 跑通
// 记录（去重、节点、计时）与绘制（网格、曲线、节点竖线、空状态）全路径。
// 运行：node tests/curve_module_test.mjs

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const htmlPath = new URL('../next_upper_computer.html', import.meta.url);
const html = readFileSync(htmlPath, 'utf8');

const begin = html.indexOf('// ===================== 烘焙曲线 =====================');
const end = html.indexOf('function bindActions() {', begin);
assert.ok(begin > 0 && end > begin, '未找到曲线模块边界');
const moduleSource = html.slice(begin, end);

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

function buildHarness() {
  const calls = [];
  const alerts = [];
  const ctx = new Proxy(
    {},
    {
      get(target, prop) {
        if (prop === 'measureText') return () => ({ width: 24 });
        if (typeof prop !== 'string') return undefined;
        if (!(prop in target)) {
          target[prop] = (...args) => {
            calls.push(prop + '(' + args.map((value) => (typeof value === 'number' ? value.toFixed(1) : String(value))).join('|') + ')');
          };
        }
        return target[prop];
      },
      set(target, prop, value) {
        target[prop] = value;
        return true;
      },
    },
  );

  const canvas = {
    width: 0,
    height: 0,
    getContext: () => ctx,
    getBoundingClientRect: () => ({ width: 640, height: 300, top: 0, left: 0 }),
    classList: { add() {}, remove() {} },
    setPointerCapture() {},
    releasePointerCapture() {},
  };

  const els = {
    roastCurveCanvas: canvas,
    curveTimeMinInput: { value: '' },
    curveTimeMaxInput: { value: '' },
    curveAgtronMinInput: { value: '' },
    curveAgtronMaxInput: { value: '' },
    curveRateMinInput: { value: '' },
    curveRateMaxInput: { value: '' },
    curveAgtronStepInput: { value: '' },
    curveRateStepInput: { value: '' },
    curveTimeStepInput: { value: '' },
    curveRangeReadout: { textContent: '' },
    curveTimeMaxError: { textContent: '', hidden: true },
    curveTimeStepError: { textContent: '', hidden: true },
    curveAgtronMaxError: { textContent: '', hidden: true },
    curveRateMaxError: { textContent: '', hidden: true },
    curveAgtronStepError: { textContent: '', hidden: true },
    curveRateStepError: { textContent: '', hidden: true },
  };

  let now = 0;
  let pending = null;
  let rafId = 0;
  const requestFrame = (callback) => {
    pending = callback;
    rafId += 1;
    return rafId;
  };

  const api = new Function(
    'els',
    't',
    'tpl',
    'performance',
    'window',
    'requestAnimationFrame',
    'alert',
    'currentLang',
    moduleSource +
      '\nreturn { roastCurve, curveParseSeconds, curveRecordLiveFrame, curveRecordNodes, curveReset, drawRoastCurve,' +
      ' curveNiceCeil, curveAxisStep, curveTimeStep, curveFormatClock, curveFormatAxis, curveStepDecimals,' +
      ' curveAutoTimeWindow, curveComputeAgtronSpan, curveComputeRateSpan, curveResolveView, curveZoomWindow,' +
      ' curvePanWindow, curveResetView, curveApplyRangeInputs, curveUpdateReadout,' +
      ' curveFormatTimeLabel, curveFormatTimeValue, curveCollectExportData, curveBuildExportText, CURVE_DATA_COLUMNS,' +
      ' curveNearestSampleIndex, curveHoverValue, drawCurveHover, curveUpdateHover, CURVE_EXPORT_FORMATS,' +
      ' onCurveWheel, onCurvePointerDown, onCurvePointerMove, onCurvePointerUp };',
  )(
    els,
    (value) => String(value ?? ''),
    (template, params = {}) => String(template).replace(/\{(\w+)\}/g, (_, key) => String(params[key] ?? '')),
    { now: () => now },
    { devicePixelRatio: 1, addEventListener() {}, ResizeObserver: undefined, requestAnimationFrame: requestFrame },
    requestFrame,
    (value) => alerts.push(String(value)),
    'zh',
  );

  return {
    api,
    calls,
    els,
    alerts,
    setNow(value) {
      now = value;
    },
    flush() {
      const callback = pending;
      pending = null;
      if (callback) callback();
    },
  };
}

const h = buildHarness();

check('curveParseSeconds 支持 mm:ss、h:mm:ss 与纯秒数', () => {
  assert.equal(h.api.curveParseSeconds('05:23'), 323);
  assert.equal(h.api.curveParseSeconds('1:02:03'), 3723);
  assert.equal(h.api.curveParseSeconds('123'), 123);
  assert.equal(h.api.curveParseSeconds('abc'), null);
  assert.equal(h.api.curveParseSeconds(''), null);
  assert.equal(h.api.curveParseSeconds(null), null);
});

check('坐标轴辅助函数取值正确', () => {
  assert.equal(h.api.curveNiceCeil(65), 90);
  assert.equal(h.api.curveNiceCeil(10), 30);
  assert.equal(h.api.curveTimeStep(60), 10);
  assert.equal(h.api.curveTimeStep(600), 120);
  assert.equal(h.api.curveFormatClock(323), '05:23');
  assert.equal(h.api.curveFormatClock(0), '00:00');
  assert.ok(h.api.curveAxisStep(0, 160, 4) > 0);
});

check('同一帧从两路重复送到，只记一个采样点', () => {
  h.api.curveReset();
  h.setNow(1000);
  const frame = () => ({ curveAgtron: 80, stableAgtron: 79, agtronRate: 5, voice: 20, recordNo: 1 });
  h.api.curveRecordLiveFrame(frame());
  h.api.curveRecordLiveFrame(frame());
  assert.equal(h.api.roastCurve.samples.length, 1);
});

check('固件一炉里记录序号恒定时，每一帧都要记下来', () => {
  h.api.curveReset();
  const frame = (tick) => ({
    curveAgtron: 86 - tick, stableAgtron: 85 - tick, agtronRate: 7, voice: 20, recordNo: 1,
  });
  for (let tick = 1; tick <= 5; tick += 1) {
    h.setNow(tick * 1200);
    h.api.curveRecordLiveFrame(frame(tick));
  }
  assert.equal(h.api.roastCurve.samples.length, 5);
});

check('数值一样但隔得够远的两帧不算重复', () => {
  h.api.curveReset();
  const frame = () => ({ curveAgtron: 80, stableAgtron: 79, agtronRate: 5, voice: 20, recordNo: 1 });
  h.setNow(0);
  h.api.curveRecordLiveFrame(frame());
  h.setNow(1200);
  h.api.curveRecordLiveFrame(frame());
  assert.equal(h.api.roastCurve.samples.length, 2);
});

check('横轴按本地计时推进，单位是秒', () => {
  h.setNow(0);
  h.api.curveReset();
  h.api.curveRecordLiveFrame({ curveAgtron: 80, recordNo: 1 });
  h.setNow(5000);
  h.api.curveRecordLiveFrame({ curveAgtron: 81, recordNo: 2 });
  assert.equal(h.api.roastCurve.samples[0].t, 0);
  assert.equal(h.api.roastCurve.samples[1].t, 5);
});

check('设备烘焙秒表优先于本地计时，且横轴不回退', () => {
  h.setNow(0);
  h.api.curveReset();
  h.setNow(30000);
  h.api.curveRecordLiveFrame({ curveAgtron: 80, yellowTime: 7, recordNo: 1 });
  assert.equal(h.api.roastCurve.samples[0].t, 7);
  h.api.curveRecordLiveFrame({ curveAgtron: 81, yellowTime: 3, recordNo: 2 });
  assert.equal(h.api.roastCurve.samples[1].t, 7, '横轴不应回退');
});

check('节点时间为 0 或空值时忽略', () => {
  h.api.curveReset();
  h.api.curveRecordNodes([
    { key: 'y_time', value: '0' },
    { key: 'fc_time', value: '00:00' },
    { key: 'sc_time', value: '' },
  ]);
  assert.equal(h.api.roastCurve.nodes.length, 0);
});

check('烘焙节点按设备上报时间落到曲线上，重复包不新增', () => {
  h.api.curveReset();
  const metrics = [
    { key: 'y_time', label: '黄点时间', value: '05:23' },
    { key: 'fc_time', label: '一爆时间', value: '09:10' },
    { key: 'unknown_key', label: '别的', value: '01:00' },
  ];
  h.api.curveRecordNodes(metrics);
  assert.equal(h.api.roastCurve.nodes.length, 2);
  assert.equal(h.api.roastCurve.nodes[0].seconds, 323);
  assert.equal(h.api.roastCurve.nodes[1].seconds, 550);
  h.api.curveRecordNodes(metrics);
  assert.equal(h.api.roastCurve.nodes.length, 2);
});

check('curveReset 清空采样与节点并重新计时', () => {
  h.setNow(90000);
  h.api.curveRecordLiveFrame({ curveAgtron: 80, recordNo: 9 });
  assert.ok(h.api.roastCurve.samples.length > 0);
  h.api.curveReset();
  assert.equal(h.api.roastCurve.samples.length, 0);
  assert.equal(h.api.roastCurve.nodes.length, 0);
});

check('有数据时绘制会画出曲线与最新点', () => {
  h.api.curveReset();
  h.calls.length = 0;
  h.setNow(0);
  for (let index = 1; index <= 20; index += 1) {
    h.setNow(index * 1000);
    h.api.curveRecordLiveFrame({
      curveAgtron: 86 - index * 0.7,
      stableAgtron: 85 - index * 0.7,
      agtronRate: 7 - index * 0.2,
      voice: 20 + index,
      recordNo: index,
    });
  }
  h.api.curveRecordNodes([{ key: 'y_time', label: '黄点时间', value: '00:10' }]);
  h.flush();
  const drew = (name) => h.calls.some((call) => call.startsWith(name + '('));
  assert.ok(drew('lineTo'), '未画曲线线段');
  assert.ok(drew('arc'), '未画最新点');
  assert.ok(drew('fillRect'), '未画音频柱');
  assert.ok(drew('fillText'), '未画刻度或标签');
  assert.ok(h.calls.some((call) => call.startsWith('fillText(') && call.includes('黄点')), '未画节点竖线标注');
});

check('NaN 采样点不会抛异常', () => {
  h.api.curveReset();
  h.setNow(0);
  h.api.curveRecordLiveFrame({ curveAgtron: NaN, stableAgtron: NaN, agtronRate: NaN, voice: NaN, recordNo: 1 });
  h.setNow(1000);
  h.api.curveRecordLiveFrame({ curveAgtron: 80, stableAgtron: 79, agtronRate: 5, voice: 20, recordNo: 2 });
  h.flush();
  assert.ok(true);
});

check('无数据时画空状态提示', () => {
  h.api.curveReset();
  h.calls.length = 0;
  h.flush();
  assert.ok(
    h.calls.some((call) => call.includes('等待实时数据')),
    '未画空状态提示',
  );
});

// ---- 缩放 / 平移 / 自定义量程 ----

function seed(h, at, agtron, rate) {
  h.api.curveRecordLiveFrame({ curveAgtron: agtron, stableAgtron: agtron, agtronRate: rate, voice: 20, recordNo: at, yellowTime: at });
}

check('缩放：以锚点为中心，跨度受上下限约束', () => {
  const half = h.api.curveZoomWindow(0, 600, 300, 0.5);
  assert.equal(Math.round(half.min), 150, '锚点居中时左端应到一半');
  assert.equal(Math.round(half.max), 450, '锚点居中时右端应到一半');
  const leftEdge = h.api.curveZoomWindow(0, 600, 0, 0.5);
  assert.equal(leftEdge.min, 0, '锚点在左端时左端保持 0');
  assert.equal(Math.round(leftEdge.max), 300);
  const tooNarrow = h.api.curveZoomWindow(0, 600, 300, 0.0001);
  assert.equal(tooNarrow.max - tooNarrow.min, 20, '跨度不应小于 20 秒');
  const tooWide = h.api.curveZoomWindow(0, 600, 300, 1000);
  assert.equal(tooWide.max - tooWide.min, 7200, '跨度不应大于 7200 秒');
});

check('平移：时间窗不会跑到 0 之前', () => {
  const back = h.api.curvePanWindow(100, 200, -500);
  assert.equal(back.min, 0);
  assert.equal(back.max, 100, '平移到边界时跨度保持不变');
  const forward = h.api.curvePanWindow(100, 200, 30);
  assert.equal(forward.min, 130);
  assert.equal(forward.max, 230);
});

check('自定义量程覆盖自动量程，恢复自动后清空', () => {
  h.api.curveReset();
  h.setNow(0);
  for (let index = 1; index <= 10; index += 1) {
    h.setNow(index * 1000);
    seed(h, index, 80 + index, 5);
  }
  h.api.curveResetView();
  const auto = h.api.curveResolveView(h.api.roastCurve.samples);
  assert.ok(auto.agtronMax - auto.agtronMin >= 40, '自动量程至少 40 宽');

  h.api.roastCurve.view.agtronMin = 10;
  h.api.roastCurve.view.agtronMax = 20;
  h.api.roastCurve.view.rateMin = -1;
  h.api.roastCurve.view.rateMax = 1;
  const custom = h.api.curveResolveView(h.api.roastCurve.samples);
  assert.deepEqual(
    [custom.agtronMin, custom.agtronMax, custom.rateMin, custom.rateMax],
    [10, 20, -1, 1],
    '自定义量程应原样生效',
  );

  h.api.curveResetView();
  assert.deepEqual(
    [h.api.roastCurve.view.agtronMin, h.api.roastCurve.view.agtronMax, h.api.roastCurve.view.rateMin, h.api.roastCurve.view.rateMax],
    [null, null, null, null],
    '恢复自动应清空自定义值',
  );
});

check('自动量程只统计可见区间，缩放后跟着动', () => {
  h.api.curveReset();
  h.setNow(0);
  for (let index = 1; index <= 6; index += 1) {
    h.setNow(index * 1000);
    seed(h, index, 100, 8);
  }
  for (let index = 7; index <= 12; index += 1) {
    h.setNow(index * 1000);
    seed(h, index, 60, 2);
  }
  h.api.curveResetView();
  h.api.roastCurve.view.timeMin = 0;
  h.api.roastCurve.view.timeMax = 6;
  const early = h.api.curveResolveView(h.api.roastCurve.samples);
  h.api.roastCurve.view.timeMin = 7;
  h.api.roastCurve.view.timeMax = 12;
  const late = h.api.curveResolveView(h.api.roastCurve.samples);
  assert.ok(early.agtronMin > late.agtronMin, '只看可见区间时前段量程应高于后段');
  assert.ok(early.rateMax > late.rateMax, 'ROR 量程同理');
});

check('拖动：横向平移时间，且不会锁死数值量程', () => {
  h.api.curveResetView();
  h.api.roastCurve.lastPlot = {
    left: 48, top: 16, width: 500, height: 300,
    timeMin: 100, timeMax: 200, agtronMin: 0, agtronMax: 100, rateMin: -5, rateMax: 5,
  };
  const swallow = { preventDefault() {} };
  h.api.onCurvePointerDown({ pointerId: 1, button: 0, clientX: 300, clientY: 200, ...swallow });
  h.api.onCurvePointerMove({ pointerId: 1, clientX: 400, clientY: 200, ...swallow });
  assert.equal(h.api.roastCurve.view.timeMin, 80, '右移 1/5 画布宽度应回到更早的时间');
  assert.equal(h.api.roastCurve.view.timeMax, 180);
  assert.equal(h.api.roastCurve.view.agtronMin, null, '纯横向拖动不应写入 Agtron 量程');
  assert.equal(h.api.roastCurve.view.rateMin, null, '纯横向拖动不应写入 ROR 量程');
  h.api.onCurvePointerUp({ pointerId: 1 });
  assert.equal(h.api.roastCurve.drag, null, '抬手后应结束拖动');
});

check('拖动：纵向拖动把数值量程切成自定义并按比例平移', () => {
  h.api.curveResetView();
  h.api.roastCurve.lastPlot = {
    left: 48, top: 16, width: 500, height: 300,
    timeMin: 0, timeMax: 600, agtronMin: 0, agtronMax: 100, rateMin: -10, rateMax: 10,
  };
  const swallow = { preventDefault() {} };
  h.api.onCurvePointerDown({ pointerId: 2, button: 0, clientX: 300, clientY: 100, ...swallow });
  h.api.onCurvePointerMove({ pointerId: 2, clientX: 300, clientY: 130, ...swallow });
  assert.equal(Math.round(h.api.roastCurve.view.agtronMin), 10, '下移 1/10 高度应整体上移 10');
  assert.equal(Math.round(h.api.roastCurve.view.agtronMax), 110);
  assert.equal(Math.round(h.api.roastCurve.view.rateMin), -8);
  assert.equal(Math.round(h.api.roastCurve.view.rateMax), 12);
  h.api.onCurvePointerUp({ pointerId: 2 });
});

check('自定义量程：校验失败不写入，合法则写入并刷新读数', () => {
  h.api.curveResetView();
  h.els.curveTimeMinInput.value = '';
  h.els.curveTimeMaxInput.value = '';
  h.els.curveAgtronMinInput.value = '';
  h.els.curveAgtronMaxInput.value = '';
  h.els.curveRateMinInput.value = '';
  h.els.curveRateMaxInput.value = '';

  h.els.curveAgtronMinInput.value = '50';
  h.els.curveAgtronMaxInput.value = '20';
  h.alerts.length = 0;
  h.api.curveApplyRangeInputs();
  assert.equal(h.alerts.length, 0, '校验失败不该再弹 alert');
  assert.equal(h.els.curveAgtronMaxError.hidden, false, '上限小于下限要在输入框下方提示');
  assert.equal(h.api.roastCurve.view.agtronMin, null, '校验失败不应写入');

  h.els.curveAgtronMinInput.value = '50';
  h.els.curveAgtronMaxInput.value = '120';
  h.els.curveRateMinInput.value = '-2';
  h.els.curveRateMaxInput.value = '6';
  h.alerts.length = 0;
  h.api.curveApplyRangeInputs();
  assert.equal(h.alerts.length, 0, '合法量程不应该提示');
  assert.equal(h.api.roastCurve.view.agtronMin, 50);
  assert.equal(h.api.roastCurve.view.agtronMax, 120);
  assert.equal(h.api.roastCurve.view.rateMin, -2);
  assert.equal(h.api.roastCurve.view.rateMax, 6);
  assert.ok(h.els.curveRangeReadout.textContent.includes('Agtron'), '读数行应显示当前量程');
});

check('缩放后重绘使用新窗口：窗口外的节点不画竖线', () => {
  h.api.curveReset();
  h.setNow(0);
  for (let index = 1; index <= 12; index += 1) {
    h.setNow(index * 1000);
    seed(h, index, 80 - index, 5);
  }
  h.api.curveRecordNodes([{ key: 'y_time', label: '黄点', value: '00:03' }]);
  h.api.roastCurve.view.timeMin = 8;
  h.api.roastCurve.view.timeMax = 12;
  h.calls.length = 0;
  h.flush();
  const drewNode = h.calls.some((call) => call.startsWith('fillText(') && call.includes('黄点'));
  assert.equal(drewNode, false, '窗口外的节点不应被画出来');
  h.api.curveResetView();
  h.calls.length = 0;
  h.flush();
  assert.ok(h.calls.some((call) => call.startsWith('fillText(') && call.includes('黄点')), '恢复自动后节点应重新出现');
});

// ---- 刻度精度（步长）----

function countAgtronTicks(h) {
  return h.calls.filter((call) => /^fillText\([^|]*\|40\.0\|/.test(call)).length;
}

// 时间轴的标签画在 plotBottom + 8 = 280 这一行，用它把时间刻度数出来
function countTimeTicks(h) {
  return h.calls.filter((call) => /^fillText\([^|]*\|[\d.]+\|280\.0\)$/.test(call)).length;
}

function countTimeGridLines(h) {
  return h.calls.filter((call) => /^lineTo\([\d.-]+\|272\.0\)$/.test(call)).length;
}

check('刻度精度：小数位由步长决定', () => {
  assert.equal(h.api.curveStepDecimals(null), 0);
  assert.equal(h.api.curveStepDecimals(10), 0);
  assert.equal(h.api.curveStepDecimals(2.5), 1);
  assert.equal(h.api.curveStepDecimals(0.25), 2);
  assert.equal(h.api.curveFormatAxis(80, 10), '80');
  assert.equal(h.api.curveFormatAxis(82.5, 2.5), '82.5');
  assert.equal(h.api.curveFormatAxis(0.25, 0.25), '0.25');
});

check('刻度精度：自定义步长改变纵轴刻度密度', () => {
  h.api.curveReset();
  h.setNow(0);
  for (let index = 1; index <= 10; index += 1) {
    h.setNow(index * 1000);
    seed(h, index, 90 - index * 0.5, 5);
  }
  h.api.curveResetView();
  h.api.roastCurve.view.agtronMin = 60;
  h.api.roastCurve.view.agtronMax = 100;

  h.api.roastCurve.view.stepAgtron = 20;
  h.calls.length = 0;
  h.api.drawRoastCurve();
  const coarse = countAgtronTicks(h);

  h.api.roastCurve.view.stepAgtron = 5;
  h.calls.length = 0;
  h.api.drawRoastCurve();
  const dense = countAgtronTicks(h);

  assert.equal(coarse, 3, '步长 20 在 60-100 上应只有 3 条刻度');
  assert.equal(dense, 9, '步长 5 在 60-100 上应有 9 条刻度');
});

check('刻度精度：步长必须大于 0，非法值不写入', () => {
  h.api.curveResetView();
  for (const key of ['curveTimeMinInput', 'curveTimeMaxInput', 'curveAgtronMinInput', 'curveAgtronMaxInput', 'curveRateMinInput', 'curveRateMaxInput']) {
    h.els[key].value = '';
  }
  h.els.curveRateStepInput.value = '';

  h.els.curveAgtronStepInput.value = '0';
  h.alerts.length = 0;
  h.api.curveApplyRangeInputs();
  assert.equal(h.alerts.length, 0, '不再用 alert');
  assert.equal(h.els.curveAgtronStepError.hidden, false, '步长 0 应在输入框下方提示');
  assert.equal(h.api.roastCurve.view.stepAgtron, null, '非法步长不应写入');

  h.els.curveAgtronStepInput.value = '5';
  h.alerts.length = 0;
  h.api.curveApplyRangeInputs();
  assert.equal(h.alerts.length, 0);
  assert.equal(h.api.roastCurve.view.stepAgtron, 5);
});

// ---- 光标读数 / 导出格式 ----

check('光标读数：取时间上最近的采样点', () => {
  const samples = [{ t: 0 }, { t: 5 }, { t: 10 }];
  assert.equal(h.api.curveNearestSampleIndex(samples, 0), 0);
  assert.equal(h.api.curveNearestSampleIndex(samples, 2), 0, '2 秒离 0 秒更近');
  assert.equal(h.api.curveNearestSampleIndex(samples, 3), 1, '3 秒离 5 秒更近');
  assert.equal(h.api.curveNearestSampleIndex(samples, 99), 2, '超出末尾时取最后一条');
});

check('光标读数：数值按固定小数位显示，取不到值显示 --', () => {
  assert.equal(h.api.curveHoverValue(73.44, 1), '73.4');
  assert.equal(h.api.curveHoverValue(4.678, 2), '4.68');
  assert.equal(h.api.curveHoverValue(NaN, 1), '--');
  assert.equal(h.api.curveHoverValue(undefined, 0), '--');
});

check('光标读数：读数框显示光标所指那条采样点的值', () => {
  h.api.curveReset();
  h.setNow(0);
  seed(h, 1, 80, 5);
  seed(h, 2, 78, 4);
  h.api.drawRoastCurve();
  const plot = h.api.roastCurve.lastPlot;
  assert.ok(plot && plot.width > 0, '未拿到绘图区范围');

  // 把光标停在第二条采样点（t = 2 秒）上
  const x = plot.left + ((2 - plot.timeMin) / (plot.timeMax - plot.timeMin)) * plot.width;
  h.api.roastCurve.hover = { x, y: plot.top + 12 };
  h.calls.length = 0;
  h.api.drawRoastCurve();

  const wrote = (needle) => h.calls.some((call) => call.startsWith('fillText(') && call.includes(needle));
  assert.ok(wrote('00:02'), '读数框未显示该点时间');
  assert.ok(wrote('78.0'), '读数框未显示该点 Agtron');
  assert.ok(wrote('4.00'), '读数框未显示该点 ROR');
  assert.ok(h.calls.some((call) => call.startsWith('arc(')), '未在该点上画标记');

  h.api.roastCurve.hover = null;
  h.calls.length = 0;
  h.api.drawRoastCurve();
  assert.ok(!wrote('4.00'), '光标移开后不应再画读数框');
});

check('光标读数：指针只在绘图区内才记录位置', () => {
  h.api.curveReset();
  h.setNow(0);
  seed(h, 1, 80, 5);
  h.api.drawRoastCurve();
  const plot = h.api.roastCurve.lastPlot;

  h.api.curveUpdateHover({ clientX: plot.left + 20, clientY: plot.top + 20 });
  assert.ok(h.api.roastCurve.hover, '绘图区内应记录光标位置');

  h.api.curveUpdateHover({ clientX: 2, clientY: 2 });
  assert.equal(h.api.roastCurve.hover, null, '绘图区外应清掉光标位置');
});

check('导出格式：PNG / JPEG / WebP 的参数正确', () => {
  const formats = h.api.CURVE_EXPORT_FORMATS;
  assert.equal(formats.png.mime, 'image/png');
  assert.equal(formats.png.ext, 'png');
  assert.equal(formats.png.quality, undefined, 'PNG 是无损格式，不应传质量参数');
  assert.equal(formats.jpeg.mime, 'image/jpeg');
  assert.equal(formats.jpeg.ext, 'jpg');
  assert.ok(formats.jpeg.quality > 0 && formats.jpeg.quality <= 1, 'JPEG 质量应在 0-1');
  assert.equal(formats.webp.mime, 'image/webp');
  assert.equal(formats.webp.ext, 'webp');
});

// ---- 时间轴刻度精度 ----

check('时间精度：时间刻度步长候选覆盖到细粒度', () => {
  assert.equal(h.api.curveTimeStep(20, 5), 5, '20 秒窗口应能给到 5 秒刻度');
  assert.equal(h.api.curveTimeStep(60, 5), 15, '60 秒窗口应能给到 15 秒刻度');
  assert.equal(h.api.curveTimeStep(600, 5), 120, '10 分钟窗口仍是 120 秒刻度');
});

check('时间精度：步长小于 1 秒时刻度标签补小数位', () => {
  assert.equal(h.api.curveFormatTimeLabel(323, 30), '05:23');
  assert.equal(h.api.curveFormatTimeLabel(5.5, 0.5), '00:05.5');
  assert.equal(h.api.curveFormatTimeLabel(65.5, 0.5), '01:05.5');
  assert.equal(h.api.curveFormatTimeLabel(5.25, 0.25), '00:05.25');
  assert.equal(h.api.curveFormatTimeLabel(60, 0.5), '01:00.0');
});

check('时间精度：读数只在真的有小数秒时才带小数', () => {
  assert.equal(h.api.curveFormatTimeValue(323), '05:23');
  assert.equal(h.api.curveFormatTimeValue(2), '00:02');
  assert.equal(h.api.curveFormatTimeValue(2.4), '00:02.4');
  assert.equal(h.api.curveFormatTimeValue(62.5), '01:02.5');
  assert.equal(h.api.curveFormatTimeValue(5.25), '00:05.25', '0.01 秒精度也要能显示');
  assert.equal(h.api.curveFormatTimeValue(59.999), '01:00', '临近 60 秒不能显示成 00:60');
});

check('时间精度：自定义时间步长写进 view 并改变刻度密度', () => {
  h.api.curveReset();
  h.setNow(0);
  for (let index = 1; index <= 10; index += 1) {
    h.setNow(index * 1000);
    seed(h, index, 90 - index * 0.5, 5);
  }
  h.api.curveResetView();
  for (const key of ['curveTimeMinInput', 'curveTimeMaxInput', 'curveAgtronMinInput', 'curveAgtronMaxInput', 'curveRateMinInput', 'curveRateMaxInput', 'curveAgtronStepInput', 'curveRateStepInput', 'curveTimeStepInput']) {
    h.els[key].value = '';
  }
  h.els.curveTimeMinInput.value = '0';
  h.els.curveTimeMaxInput.value = '60';
  h.els.curveTimeStepInput.value = '10';
  h.alerts.length = 0;
  h.api.curveApplyRangeInputs();
  assert.equal(h.alerts.length, 0);
  assert.equal(h.api.roastCurve.view.stepTime, 10);
  h.calls.length = 0;
  h.api.drawRoastCurve();
  const coarse = countTimeGridLines(h);

  h.els.curveTimeStepInput.value = '2.5';
  h.api.curveApplyRangeInputs();
  h.calls.length = 0;
  h.api.drawRoastCurve();
  const dense = countTimeGridLines(h);

  assert.equal(coarse, 7, '0-60 秒、步长 10 应有 7 条刻度');
  assert.equal(dense, 25, '0-60 秒、步长 2.5 应有 25 条刻度');

  h.els.curveTimeStepInput.value = '0.25';
  h.api.curveApplyRangeInputs();
  assert.equal(h.api.roastCurve.view.stepTime, 0.25);
  assert.equal(h.els.curveTimeStepInput.value, '0.25', '细步长写回输入框不能被四舍五入成 0.3');
});

check('时间精度：细步长时标签自动隔几个显示，网格线仍按步长画', () => {
  h.api.curveReset();
  for (let index = 1; index <= 10; index += 1) {
    h.setNow(index * 1000);
    seed(h, index, 90 - index * 0.5, 5);
  }
  h.els.curveTimeMinInput.value = '0';
  h.els.curveTimeMaxInput.value = '60';
  h.els.curveTimeStepInput.value = '0.5';
  h.api.curveApplyRangeInputs();
  h.calls.length = 0;
  h.api.drawRoastCurve();
  const grid = countTimeGridLines(h);
  const labels = countTimeTicks(h);
  assert.equal(grid, 121, '0-60 秒、步长 0.5 应有 121 条时间网格线');
  assert.ok(labels < grid, '标签放不下时应少于网格线');
  assert.ok(labels >= 5, '标签不能被全部挤掉');
});

check('时间精度：时间步长必须大于 0', () => {
  h.els.curveTimeStepInput.value = '0';
  h.alerts.length = 0;
  h.api.curveApplyRangeInputs();
  assert.equal(h.alerts.length, 0, '不再用 alert');
  assert.equal(h.els.curveTimeStepError.hidden, false, '步长 0 要拒绝并在输入框下方提示');
  h.els.curveTimeStepInput.value = '';
});

check('表单校验：提示内联在字段下方，改回合法值就收起', () => {
  h.els.curveTimeMinInput.value = '0';
  h.els.curveTimeMaxInput.value = '5';
  h.els.curveTimeStepInput.value = '';
  h.alerts.length = 0;
  h.api.curveApplyRangeInputs();
  assert.equal(h.alerts.length, 0, '不再用 alert');
  assert.equal(h.els.curveTimeMaxError.hidden, false, '时间跨度过小要提示');
  assert.ok(h.els.curveTimeMaxError.textContent.includes('20'), '提示里要写清最小跨度');

  h.els.curveTimeMaxInput.value = '60';
  h.api.curveApplyRangeInputs();
  assert.equal(h.els.curveTimeMaxError.hidden, true, '合法后收起提示');
  assert.equal(h.els.curveTimeMaxError.textContent, '');
  assert.equal(h.api.roastCurve.view.timeMax, 60, '合法值要写进 view');
});
// ---- 数据导出 ----

function seedExportSamples(h) {
  h.api.curveReset();
  h.setNow(0);
  seed(h, 1, 80, 5);
  seed(h, 2, 78, 4);
  h.api.curveRecordLiveFrame({ curveAgtron: NaN, stableAgtron: NaN, agtronRate: NaN, voice: 0, recordNo: 3, yellowTime: 9 });
}

check('数据导出：CSV 是纯数值表，缺数据留空', () => {
  seedExportSamples(h);
  const lines = h.api.curveBuildExportText('csv').split('\r\n');
  assert.equal(lines[0], 'time_s,curve_agtron,stable_agtron,agtron_ror,audio_level', '表头应是坐标名');
  assert.equal(lines.length, 4, '表头 + 3 行数据');
  assert.equal(lines[1], '1,80,80,5,20');
  assert.equal(lines[2], '2,78,78,4,20');
  assert.equal(lines[3], '9,,,,0', '缺数据的单元格留空');
});

check('数据导出：TSV 用制表符，列结构与 CSV 一致', () => {
  seedExportSamples(h);
  const lines = h.api.curveBuildExportText('tsv').split('\r\n');
  assert.equal(lines[0], 'time_s\tcurve_agtron\tstable_agtron\tagtron_ror\taudio_level');
  assert.equal(lines[1], '1\t80\t80\t5\t20');
});

check('数据导出：JSON 带节点，缺数据是 null', () => {
  seedExportSamples(h);
  h.api.curveRecordNodes([{ key: 'y_time', label: '黄点', value: '00:20' }]);
  const parsed = JSON.parse(h.api.curveBuildExportText('json'));
  assert.deepEqual(parsed.columns, ['time_s', 'curve_agtron', 'stable_agtron', 'agtron_ror', 'audio_level']);
  assert.equal(parsed.timeUnit, 's');
  assert.equal(parsed.samples.length, 3);
  assert.deepEqual(parsed.samples[0], [1, 80, 80, 5, 20]);
  assert.equal(parsed.samples[2][1], null, '缺数据在 JSON 里应是 null');
  assert.equal(parsed.nodes.length, 1);
  assert.equal(parsed.nodes[0].key, 'y_time');
  assert.equal(parsed.nodes[0].time_s, 20);
  assert.equal(parsed.nodes[0].clock, '00:20');
});

// ---- 图表全屏 ----
check('全屏按钮：入口、样式、接线与中英文文案都在', () => {
  assert.ok(html.includes('<button id="curveFullscreenBtn" class="ghost" type="button">全屏</button>'), '工具栏里有全屏按钮');
  assert.ok(html.includes('<section class="card curve-card" id="curveCard">'), '曲线卡片有 id 可作全屏元素');
  assert.ok(html.includes('.curve-card:fullscreen {'), '全屏时曲线卡片铺满整屏');
  assert.ok(html.includes('.curve-card:fullscreen .curve-canvas-wrap {'), '全屏时画布撑满剩余高度');
  assert.ok(html.includes('document.fullscreenElement === els.curveCard'), '全屏判断认的是整张卡片');
  assert.ok(html.includes("els.curveFullscreenBtn?.addEventListener('click', toggleCurveFullscreen)"), '按钮已接线');
  assert.ok(html.includes("'全屏': 'Fullscreen'") && html.includes("'退出全屏': 'Exit Fullscreen'"), '英文界面有对应文案');
});

if (failures.length) {
  console.log('\n失败 ' + failures.length + ' 项：' + failures.join('、'));
  process.exit(1);
}
console.log('\n曲线模块验证全部通过');
