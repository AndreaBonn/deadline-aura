#!/bin/bash
# Maintainer postrm. Replaces electron-builder's default after-remove template,
# so it must drop the launcher symlink it would have removed, plus the autostart
# entry. User data under ~/.config and ~/.local/share is intentionally kept.
set -e

rm -f /usr/bin/deadlineaura
rm -f /etc/xdg/autostart/deadlineaura.desktop

# This script runs as root via dpkg/apt, never as the invoking user, so it
# must not touch files under any user's home directory (including the
# Claude Code statusline capture copy below): it has no reliable way to know
# which home(s) to touch, and doing so would require privileges and paths
# this script should not assume.
echo "Note: if the Claude Code statusline capture is installed, it remains"
echo "in ~/.local/share/deadlineaura/bin and keeps forwarding to the"
echo "original statusline. To remove it, use Settings -> \"Remove capture\""
echo "before uninstalling, or run"
echo "~/.local/share/deadlineaura/bin/claude-capture.py uninstall."
echo "Nota: se la cattura della statusline di Claude Code è installata,"
echo "resta in ~/.local/share/deadlineaura/bin e continua a inoltrare alla"
echo "statusline originale. Per rimuoverla usa Impostazioni -> \"Rimuovi"
echo "cattura\" prima di disinstallare, oppure esegui"
echo "~/.local/share/deadlineaura/bin/claude-capture.py uninstall."

exit 0
