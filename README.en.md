[简体中文](README.md) | [English](README.en.md)

<sub>LEBREW · Coffee Analysis Instruments</sub>

<h1>RoastSee NEXT Web Console</h1>

**Connect to RoastSee NEXT in your browser: live roast curves, event markers, data export. Single file, zero dependencies, nothing to install.**

[![Open the console](https://img.shields.io/badge/Open%20the%20console-loched12.github.io-6b45dd?style=for-the-badge&logo=googlechrome&logoColor=white)](https://loched12.github.io/RoastSee-NEXT-Console/?lang=en)

No download, no install, no build - it opens straight from the website.

<p>
  <img alt="Chrome / Edge" src="https://img.shields.io/badge/Chrome%20%2F%20Edge-required-4285F4?style=flat-square&logo=googlechrome&logoColor=white">
  <img alt="Web Bluetooth" src="https://img.shields.io/badge/Web%20Bluetooth-supported-6b45dd?style=flat-square">
  <img alt="Web Serial" src="https://img.shields.io/badge/Web%20Serial-supported-6b45dd?style=flat-square">
  <img alt="single file" src="https://img.shields.io/badge/single--file-HTML-292a3a?style=flat-square">
  <img alt="no build" src="https://img.shields.io/badge/build-none-success?style=flat-square">
  <img alt="license" src="https://img.shields.io/badge/license-Apache--2.0-blue?style=flat-square">
</p>

<img src="assets/next-device.webp" width="100%" alt="RoastSee NEXT roast analyser" />

## What it is

A browser-based console for the RoastSee NEXT. It talks to the instrument over Web Bluetooth or Web Serial,
draws Agtron, stable Agtron, Agtron ROR and audio level as live roast curves, marks Yellow / First Crack /
Second Crack / Drop as vertical lines, and exports a whole roast as CSV / JSON / ZIP.

No backend, no installer, no build step: **all of the code lives in a single HTML file**, so edit-and-refresh is the whole workflow.

## Interface

| Chinese | English |
|---|---|
| ![中文界面](screenshots/console-zh.webp) | ![English UI](screenshots/console-en.webp) |

## Features

- **Two links at once**: Bluetooth BLE (Notify) and UART0 serial can be used separately or together; both feed one unified event table.
- **Roast curves**
  - Four series: current Agtron, stable Agtron, Agtron ROR and audio level.
  - Yellow / First Crack / Second Crack / Drop are drawn automatically as vertical markers.
  - Wheel to zoom, drag to pan, double-click to reset, and **hover to read values** (the four readings at the point under the cursor).
  - Ranges and steps are configurable: time / Agtron / ROR limits and tick steps; leave a field empty for auto.
- **Export**
  - Curve images: PNG / JPEG / WebP.
  - Curve data: CSV / TSV are plain numeric tables (header + values) that MATLAB, pandas, Origin, Excel and gnuplot read directly; JSON also carries the marker data.
  - Packet list: CSV / JSON / ZIP (the ZIP holds `packets.csv`, `packets.json` and a short readme, ready to forward).
  - Event table: CSV, with second / 0.1 s / millisecond time precision.
- **Bilingual UI**: one-click switch in the top right, or open with `?lang=en`.
- **Accessibility**: visible focus rings while tabbing; validation messages appear next to the field instead of in dialogs.
- **Built-in simulator**: with no instrument at hand, "start live simulation" runs the same parsing path so you can preview curves and exports.

## Quick start

Pick whichever of the three suits you; they are equivalent.

### 1. Just double-click

Download the repo and double-click `next_upper_computer.html`. Modern Chrome treats local files as a secure
context, so both Web Bluetooth and Web Serial work (verified here on Chrome 154: `navigator.bluetooth.getAvailability()`
returns `true` and `navigator.serial.getPorts()` returns an array).

> The trade-off: permission for a local file cannot be remembered per origin, so you re-pick the device or serial port on every connect.

### 2. Local server (recommended for daily use)

Double-click `START_HTML_SERVER.cmd`. It finds a local Python, serves `http://127.0.0.1:8000` and opens the page
(if the port is taken it walks forward). `START_HTML_SERVER_EN.cmd` opens straight into the English UI.
Close the minimised `RoastSee NEXT Server` window in the taskbar to stop it.

### 3. Static hosting (like a normal website)

```bash
git clone https://github.com/Loched12/RoastSee-NEXT-Console.git
```

The whole repo is static files, so any static host works: GitHub Pages, object storage (OSS / COS), your own site.

To turn on GitHub Pages: **Settings → Pages → Source**, pick branch `main` and `/ (root)`, then open:

```text
https://loched12.github.io/RoastSee-NEXT-Console/
https://loched12.github.io/RoastSee-NEXT-Console/?lang=en
```

> Note: `github.io` is unreliable from mainland China. For production use, prefer your own domain or domestic object storage. **The repo must be public for free Pages.**

## Browser requirements

- Desktop **Chrome / Edge**. Web Bluetooth and Web Serial are Chromium-only today; Firefox and Safari do not implement them.
- The page must run in a secure context: `file://`, `http://127.0.0.1`, `http://localhost` and `https://` all work;
  a plain-`http://` LAN address (e.g. `http://192.168.x.x`) does not.
- The first connection needs a manual grant in the browser's device or port picker.

## Hardware

RoastSee NEXT is LeBrew's roast analyser; it captures Agtron and audio data, and this console turns that data into curves you can read.

| Device UI | Mounted |
|---|---|
| ![Device screen](assets/next-display.webp) | ![Mounted](assets/next-mounted.webp) |

Website: [lebrewtech.com](https://lebrewtech.com) · Product page: [RoastSee NEXT](https://lebrewtech.com/products/roastsee-next-3)

## Repository layout

```text
.
├─ next_upper_computer.html   the app itself (single file, all logic)
├─ index.html                 static-host entry, redirects and keeps ?lang=en
├─ START_HTML_SERVER.cmd      one-click local server (Windows)
├─ START_HTML_SERVER_EN.cmd   same, straight into the English UI
├─ 使用指南.md                 full guide (Chinese)
├─ assets/                    product photos
├─ screenshots/               UI screenshots
├─ tests/                     offline Node regression tests
├─ LICENSE                    Apache-2.0
├─ NOTICE                     copyright notice
├─ README.md                  Chinese readme
└─ README.en.md               this file
```

## Development and tests

The tests need no browser: the relevant modules are lifted out of the HTML and run in Node, fully offline.

```bash
node tests/curve_module_test.mjs   # curves: recording, dedup, markers, full draw path (38 checks)
node tests/serial_route_test.mjs   # serial byte routing: AA55 frames never swallow plain text (8 checks)
node tests/contrast_scan.mjs       # colour contrast against WCAG AA (26 pairs)
```

The first two are functional regressions, the third guards visual readability.

## Protocol

Everything needed to talk to the NEXT is in this repo; skip this if you only want to use the app:

- BLE service UUID `000000BB-0000-1000-8000-00805F9B34FB`, characteristic UUID `0000BB01-0000-1000-8000-00805F9B34FB` (Notify).
- The `NEXT:` text command table: page control, start / stop roast, Agtron measurement, history read, yellow-point threshold, and more.
- The UART0 live frame layout (header `AA55`) and its parsing logic.

## License

The code is released under the **Apache License 2.0**; see [LICENSE](LICENSE) and [NOTICE](NOTICE).

Compared with MIT, Apache-2.0 adds an **express patent grant** and requires redistributors to keep the copyright and
license notices and to state changes to modified files. It **does not grant trademark rights**, so the LeBrew name and
marks may not be used to endorse or promote other products.

Product photos and brand marks in `assets/` and `screenshots/` are copyright **LeBrew** and are not covered by the
Apache-2.0 code grant; they may only be used to describe this project.
