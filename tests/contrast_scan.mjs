// 配色对比度检查（WCAG AA）
// 扫 CSS 里"同一条规则同时给了背景色和文字色"的组合，逐个算对比度并判分。
// token 直接从 :root 解析，避免脚本自带一份颜色表之后跟页面脱节（旧版就是因此静默漏测了新颜色）。
// 运行：node tests/contrast_scan.mjs

import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../next_upper_computer.html', import.meta.url), 'utf8');
const style = html.match(/<style>([\s\S]*?)<\/style>/)[1];

const rootBlock = /:root\s*\{([\s\S]*?)\}/.exec(style);
if (!rootBlock) throw new Error('未找到 :root 变量块');
const tokens = {};
for (const [, name, value] of rootBlock[1].matchAll(/--([a-z0-9-]+)\s*:\s*([^;]+);/gi)) tokens[name] = value.trim();

const resolve = (value) => {
  let s = String(value).trim();
  const varMatch = /^var\(\s*--([a-z0-9-]+)\s*(?:,\s*([^)]+))?\)$/i.exec(s);
  if (varMatch) s = String(tokens[varMatch[1]] ?? varMatch[2] ?? '').trim();
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(s);
  if (!hex) return null;
  let x = hex[1];
  if (x.length === 3) x = x.split('').map((c) => c + c).join('');
  return '#' + x.toLowerCase();
};
const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const lin = (c) => { const v = c / 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
const lum = (h) => { const [r, g, b] = rgb(h).map(lin); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };

const rows = [];
const skipped = new Set();
for (const [, selRaw, body] of style.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
  const bgM = /background(?:-color)?:\s*([^;]+);/.exec(body);
  const fgM = /(?:^|[;\s])color:\s*([^;]+);/.exec(body);
  if (!bgM || !fgM) continue;
  const bg = resolve(bgM[1]);
  const fg = resolve(fgM[1]);
  if (!bg || !fg) { skipped.add((!bg ? bgM[1] : fgM[1]).trim()); continue; }
  const sel = selRaw.trim().split('\n').pop().trim();
  const fsM = /font-size:\s*([\d.]+)px/.exec(body);
  const fwM = /font-weight:\s*(\d+)/.exec(body);
  const size = fsM ? parseFloat(fsM[1]) : 0;
  const weight = fwM ? parseInt(fwM[1], 10) : 400;
  const need = size >= 24 || (size >= 18.66 && weight >= 700) ? 3 : 4.5;
  const r = ratio(fg, bg);
  rows.push({ sel, fg, bg, size, weight, r, need, ok: r + 1e-9 >= need });
}
rows.sort((a, b) => a.r - b.r);
for (const x of rows) {
  console.log(`${x.ok ? 'PASS' : 'FAIL'}  ${x.r.toFixed(2).padStart(5)}:1  need ${x.need}  ${(x.size || '?').toString().padStart(4)}px/${x.weight}  ${x.sel}  (${x.fg} on ${x.bg})`);
}
const failures = rows.filter((x) => !x.ok);
console.log(`\npairs checked: ${rows.length}  failures: ${failures.length}`);
if (skipped.size) console.log('skipped (无法解析的颜色，未参与判分): ' + [...skipped].join(' / '));
process.exit(failures.length ? 1 : 0);