#!/bin/bash
# 直接以英文界面启动本地服务器（macOS）。
# 真正的逻辑都在 START_HTML_SERVER.command 里，这里只是带上 en 参数。
exec "$(dirname "$0")/START_HTML_SERVER.command" en
