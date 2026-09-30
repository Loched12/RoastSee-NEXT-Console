#!/bin/bash
# RoastSee NEXT 网页上位机 —— macOS 一键启动本地服务器
# 双击本文件即可。若提示「无法打开，因为来自身份不明的开发者」：
#   右键点本文件 → 打开 → 仍要打开；或在「终端」里执行 chmod +x "START_HTML_SERVER.command"

cd "$(dirname "$0")" || exit 1

QUERY=""
if [ "$1" = "en" ]; then
  QUERY="?lang=en"
fi

PORT=8000
while lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; do
  PORT=$((PORT + 1))
  if [ "$PORT" -gt 8050 ]; then
    echo "8000-8050 端口都被占用了，先关掉占用端口的程序再试。"
    read -n 1 -s -r -p "按任意键关闭…"
    exit 1
  fi
done

if ! command -v python3 >/dev/null 2>&1; then
  echo "没有找到 python3，起不了本地服务器。两个办法任选："
  echo
  echo "  1) 直接双击 next_upper_computer.html —— Chrome 把本地文件也当安全环境，蓝牙和串口都能用；"
  echo "  2) 装 Xcode 命令行工具（自带 python3）：在「终端」里执行  xcode-select --install"
  echo
  read -n 1 -s -r -p "按任意键关闭…"
  exit 1
fi

python3 -m http.server "$PORT" --bind 127.0.0.1 >/dev/null 2>&1 &
SERVER_PID=$!
trap 'kill "$SERVER_PID" 2>/dev/null' EXIT INT TERM

sleep 1
URL="http://127.0.0.1:$PORT/next_upper_computer.html$QUERY"
open "$URL"

echo "RoastSee NEXT 上位机已启动：$URL"
echo "请用桌面版 Chrome 或 Edge 打开（Safari 不支持 Web Bluetooth 与 Web Serial）。"
echo
echo "关掉这个窗口、或按 Control-C，就会停掉本地服务器。"

wait "$SERVER_PID"
