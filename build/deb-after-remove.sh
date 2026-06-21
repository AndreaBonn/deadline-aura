#!/bin/bash
# Maintainer postrm. Replaces electron-builder's default after-remove template,
# so it must drop the launcher symlink it would have removed, plus the autostart
# entry. User data under ~/.config and ~/.local/share is intentionally kept.
set -e

rm -f /usr/bin/deadlineaura
rm -f /etc/xdg/autostart/deadlineaura.desktop

exit 0
